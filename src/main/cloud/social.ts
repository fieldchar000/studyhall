// Friends, invites, sharing, servers/channels/messages, shared timers, presence, live updates.
// Every call runs as the signed-in user; Row Level Security in the database decides what's allowed.

import type { RealtimeChannel } from '@supabase/supabase-js'
import type {
  ChannelInfo,
  ChatMessage,
  Friend,
  InviteCheck,
  InviteRow,
  LeaderRow,
  MemberInfo,
  Role,
  ServerDetail,
  ServerSummary,
  SharedTimer,
  ShareRow,
  TimerAction
} from '@shared/cloud'
import { create, get, getDb, getProfileId } from '../db'
import { reward } from '../game'
import * as timer from '../timer'
import { currentUserId } from './account'
import { isNetworkError, supabase } from './client'
import { pruneUnshared, requestSync, resetCursors } from './sync'

/** Throw Supabase errors with a readable message. */
async function run<T>(p: PromiseLike<{ data: T; error: { message: string } | null }>): Promise<T> {
  const { data, error } = await p
  if (error) throw new Error(error.message)
  return data
}

const me = (): string => {
  const id = currentUserId()
  if (!id) throw new Error('Sign in first (Settings → Account).')
  return id
}

export const inviteLink = (code: string): string => `studyhall://invite/${code}`

// ---------- names (cached) ----------

const names = new Map<string, { display_name: string; username: string }>()
async function loadNames(ids: (string | null)[]): Promise<void> {
  const missing = [...new Set(ids.filter((x): x is string => !!x && !names.has(x)))]
  if (!missing.length) return
  const rows = await run(supabase().from('user_directory').select('id, display_name, username').in('id', missing))
  for (const r of rows ?? []) names.set(r.id, { display_name: r.display_name, username: r.username })
}
const nameOf = (id: string | null): string => (id ? (names.get(id)?.display_name ?? 'Someone') : 'Deleted user')

// ---------- invites & friends ----------

export const checkInvite = async (code: string): Promise<InviteCheck> =>
  (await run(supabase().rpc('check_invite', { p_code: code.trim().toUpperCase() }))) as InviteCheck

export async function createInvite(opts: { kind: 'friend' | 'server'; serverId?: string; maxUses?: number; expiresDays?: number }): Promise<{ code: string; link: string }> {
  me()
  const code = (await run(
    supabase().rpc('create_invite', {
      p_kind: opts.kind,
      p_server: opts.serverId ?? null,
      p_max_uses: opts.maxUses ?? 1,
      p_expires_days: opts.expiresDays ?? 7
    })
  )) as string
  return { code, link: inviteLink(code) }
}

export async function myInvites(): Promise<InviteRow[]> {
  me()
  return (await run(supabase().from('invites').select('code, kind, server_id, max_uses, use_count, expires_at, revoked_at, created_at').order('created_at', { ascending: false }).limit(50))) as InviteRow[]
}

export async function revokeInvite(code: string): Promise<void> {
  await run(supabase().from('invites').update({ revoked_at: new Date().toISOString() }).eq('code', code))
}

export async function redeem(code: string): Promise<{ kind: 'friend' | 'server'; server_id: string | null }> {
  me()
  return (await run(supabase().rpc('redeem_invite', { p_code: code }))) as { kind: 'friend' | 'server'; server_id: string | null }
}

export async function friends(): Promise<Friend[]> {
  me()
  return (await run(supabase().rpc('friends_overview'))) as Friend[]
}

export async function removeFriend(userId: string): Promise<void> {
  const uid = me()
  const [a, b] = uid < userId ? [uid, userId] : [userId, uid]
  await run(supabase().from('friendships').delete().eq('user_a', a).eq('user_b', b))
}

export async function leaderboard(sinceIso: string): Promise<LeaderRow[]> {
  me()
  return (await run(supabase().rpc('leaderboard', { p_since: sinceIso }))) as LeaderRow[]
}

// ---------- sharing ----------

let editableNotes = new Set<string>()
export const canEditSharedNote = (id: string): boolean => editableNotes.has(id)

async function withNames(rows: ShareRow[]): Promise<ShareRow[]> {
  await loadNames(rows.flatMap((r) => [r.owner_id, r.shared_with]))
  return rows.map((r) => ({ ...r, owner_name: nameOf(r.owner_id), with_name: nameOf(r.shared_with) }))
}

export async function sharesFor(type: 'module' | 'note', id: string): Promise<ShareRow[]> {
  me()
  return withNames((await run(supabase().from('shares').select('*').eq('resource_type', type).eq('resource_id', id))) as ShareRow[])
}

export async function share(type: 'module' | 'note', id: string, userId: string, permission: 'view' | 'edit'): Promise<void> {
  me()
  // Make sure the module/note itself is uploaded first (the database checks you own it).
  const { syncNow } = await import('./sync')
  await syncNow()
  await run(supabase().from('shares').insert({ resource_type: type, resource_id: id, shared_with: userId, permission: type === 'module' ? 'view' : permission }))
}

export async function unshare(shareId: string): Promise<void> {
  await run(supabase().from('shares').delete().eq('id', shareId))
}

let knownIncoming = ''
/** Things others shared with me. Also keeps local copies in step with what's still shared. */
export async function sharedWithMe(): Promise<ShareRow[]> {
  const uid = me()
  const rows = (await run(supabase().from('shares').select('*').eq('shared_with', uid))) as ShareRow[]
  editableNotes = new Set(rows.filter((r) => r.resource_type === 'note' && r.permission === 'edit').map((r) => r.resource_id))
  const key = rows.map((r) => `${r.id}:${r.permission}`).sort().join(',')
  if (key !== knownIncoming) {
    // Something new was shared (or unshared): re-download the shareable tables and drop what's gone.
    knownIncoming = key
    pruneUnshared(new Set(rows.filter((r) => r.resource_type === 'module').map((r) => r.resource_id)), new Set(rows.filter((r) => r.resource_type === 'note').map((r) => r.resource_id)))
    resetCursors(['modules', 'weeks', 'materials', 'assessments', 'notes'])
    requestSync()
  }
  return withNames(rows)
}

// ---------- servers ----------

export async function servers(): Promise<ServerSummary[]> {
  const uid = me()
  const [rows, unread] = await Promise.all([
    run(supabase().from('server_members').select('role, servers(id, name)').eq('user_id', uid)),
    run(supabase().rpc('unread_counts'))
  ])
  const counts = new Map<string, number>()
  for (const u of (unread ?? []) as { server_id: string; unread: number; muted: boolean }[]) {
    if (!u.muted) counts.set(u.server_id, (counts.get(u.server_id) ?? 0) + u.unread)
  }
  return ((rows ?? []) as unknown as { role: Role; servers: { id: string; name: string } }[])
    .filter((r) => r.servers)
    .map((r) => ({ id: r.servers.id, name: r.servers.name, role: r.role, unread: counts.get(r.servers.id) ?? 0 }))
    .sort((a, b) => a.name.localeCompare(b.name))
}

export async function server(id: string): Promise<ServerDetail | null> {
  const uid = me()
  const s = await run(supabase().from('servers').select('id, name, owner_id').eq('id', id).maybeSingle())
  if (!s) return null
  const [channels, members, unread] = await Promise.all([
    run(supabase().from('channels').select('id, server_id, name, kind, sort').eq('server_id', id).order('sort').order('created_at')),
    run(supabase().from('server_members').select('user_id, role').eq('server_id', id)),
    run(supabase().rpc('unread_counts'))
  ])
  const memberRows = (members ?? []) as { user_id: string; role: Role }[]
  await loadNames(memberRows.map((m) => m.user_id))
  const u = new Map(((unread ?? []) as { channel_id: string; unread: number; muted: boolean }[]).map((x) => [x.channel_id, x]))
  const roleRank: Record<Role, number> = { owner: 0, mod: 1, member: 2 }
  return {
    id: s.id,
    name: s.name,
    owner_id: s.owner_id,
    role: memberRows.find((m) => m.user_id === uid)?.role ?? 'member',
    channels: ((channels ?? []) as Omit<ChannelInfo, 'unread' | 'muted'>[]).map((c) => ({ ...c, unread: u.get(c.id)?.unread ?? 0, muted: u.get(c.id)?.muted ?? false })),
    members: memberRows
      .map<MemberInfo>((m) => ({ user_id: m.user_id, role: m.role, display_name: nameOf(m.user_id), username: names.get(m.user_id)?.username ?? '' }))
      .sort((a, b) => roleRank[a.role] - roleRank[b.role] || a.display_name.localeCompare(b.display_name))
  }
}

export async function createServer(name: string): Promise<string> {
  me()
  return (await run(supabase().rpc('create_server', { p_name: name.trim().slice(0, 60) || 'My server' }))) as string
}
export const renameServer = async (id: string, name: string): Promise<void> => void (await run(supabase().from('servers').update({ name: name.trim().slice(0, 60) }).eq('id', id)))
export const deleteServer = async (id: string): Promise<void> => void (await run(supabase().from('servers').delete().eq('id', id)))
export const leaveServer = async (id: string): Promise<void> => void (await run(supabase().from('server_members').delete().eq('server_id', id).eq('user_id', me())))
export const kick = async (serverId: string, userId: string): Promise<void> =>
  void (await run(supabase().from('server_members').delete().eq('server_id', serverId).eq('user_id', userId)))
export const setRole = async (serverId: string, userId: string, role: 'mod' | 'member'): Promise<void> =>
  void (await run(supabase().rpc('set_member_role', { p_server: serverId, p_user: userId, p_role: role })))

export const createChannel = async (serverId: string, name: string, kind: 'text' | 'study_room'): Promise<void> =>
  void (await run(supabase().from('channels').insert({ server_id: serverId, name: cleanChannel(name), kind, sort: 100 })))
export const renameChannel = async (id: string, name: string): Promise<void> => void (await run(supabase().from('channels').update({ name: cleanChannel(name) }).eq('id', id)))
export const deleteChannel = async (id: string): Promise<void> => void (await run(supabase().from('channels').delete().eq('id', id)))
const cleanChannel = (n: string): string => n.trim().toLowerCase().replace(/\s+/g, '-').slice(0, 40) || 'channel'

// ---------- messages ----------

export async function messages(channelId: string, before?: string): Promise<ChatMessage[]> {
  me()
  let q = supabase().from('messages').select('id, channel_id, author_id, body, created_at, deleted_at').eq('channel_id', channelId).order('created_at', { ascending: false }).limit(50)
  if (before) q = q.lt('created_at', before)
  const rows = ((await run(q)) ?? []) as Omit<ChatMessage, 'author_name'>[]
  await loadNames(rows.map((r) => r.author_id))
  return rows.reverse().map((r) => ({ ...r, author_name: nameOf(r.author_id) }))
}

export async function send(channelId: string, body: string): Promise<void> {
  const text = body.trim().slice(0, 4000)
  if (!text) return
  await run(supabase().from('messages').insert({ channel_id: channelId, author_id: me(), body: text }))
  await markRead(channelId)
}

export const deleteMessage = async (id: string): Promise<void> => void (await run(supabase().rpc('delete_message', { p_id: id })))

export async function markRead(channelId: string): Promise<void> {
  await run(supabase().from('channel_states').upsert({ channel_id: channelId, user_id: me(), last_read_at: new Date().toISOString() }, { onConflict: 'channel_id,user_id' }))
}
export async function setMuted(channelId: string, muted: boolean): Promise<void> {
  await run(supabase().from('channel_states').upsert({ channel_id: channelId, user_id: me(), muted }, { onConflict: 'channel_id,user_id' }))
}

/** Title/body for a desktop notification about a new chat message (null = stay quiet). */
export async function describeMessage(row: Record<string, unknown>): Promise<{ title: string; body: string } | null> {
  const uid = currentUserId()
  if (!uid || row.author_id === uid || row.deleted_at) return null
  const channelId = String(row.channel_id)
  const [{ data: ch }, { data: state }] = await Promise.all([
    supabase().from('channels').select('name, servers(name)').eq('id', channelId).maybeSingle(),
    supabase().from('channel_states').select('muted').eq('channel_id', channelId).eq('user_id', uid).maybeSingle()
  ])
  if (!ch || state?.muted) return null
  await loadNames([String(row.author_id)])
  const server = (ch as unknown as { servers: { name: string } | null }).servers?.name ?? 'Server'
  return { title: `${nameOf(String(row.author_id))} in #${ch.name} · ${server}`, body: String(row.body ?? '').slice(0, 140) }
}

// ---------- shared Pomodoro (one per study room) ----------

function defaults(channelId: string): SharedTimer {
  return { channel_id: channelId, phase: 'focus', running: false, ends_at: null, remaining_ms: 25 * 60_000, focus_min: 25, break_min: 5, updated_at: new Date().toISOString() }
}

export async function sharedTimer(channelId: string): Promise<SharedTimer> {
  me()
  const row = await run(supabase().from('shared_timers').select('*').eq('channel_id', channelId).maybeSingle())
  return (row as SharedTimer | null) ?? defaults(channelId)
}

export async function timerAction(channelId: string, action: TimerAction, settings?: { focus_min?: number; break_min?: number }): Promise<SharedTimer> {
  const t = await sharedTimer(channelId)
  const nowMs = Date.now()
  const left = t.running && t.ends_at ? Math.max(0, Date.parse(t.ends_at) - nowMs) : t.remaining_ms
  const minutes = (phase: 'focus' | 'break', s = t): number => (phase === 'focus' ? s.focus_min : s.break_min) * 60_000
  const next: SharedTimer = { ...t, ...(settings ?? {}) }
  if (settings && !t.running) next.remaining_ms = minutes(next.phase, next)
  switch (action) {
    case 'start':
      Object.assign(next, { running: true, ends_at: new Date(nowMs + left).toISOString() })
      break
    case 'pause':
      Object.assign(next, { running: false, ends_at: null, remaining_ms: left })
      break
    case 'reset':
      Object.assign(next, { running: false, ends_at: null, remaining_ms: minutes(t.phase) })
      break
    case 'skip':
    case 'advance': {
      // 'advance' = a phase finished; only the first client to notice changes it.
      if (action === 'advance' && !(t.running && t.ends_at && Date.parse(t.ends_at) <= nowMs + 1500)) return t
      const phase = t.phase === 'focus' ? 'break' : 'focus'
      const autoRun = action === 'advance' && phase === 'break' // breaks start by themselves
      Object.assign(next, {
        phase,
        running: autoRun,
        remaining_ms: minutes(phase),
        ends_at: autoRun ? new Date(nowMs + minutes(phase)).toISOString() : null
      })
      break
    }
  }
  const row = { ...next, updated_by: me(), updated_at: new Date().toISOString() }
  return (await run(supabase().from('shared_timers').upsert(row, { onConflict: 'channel_id' }).select().single())) as SharedTimer
}

/** A shared focus block finished while you were in the room: count it like a solo session. */
export function recordSharedFocus(minutes: number): void {
  const m = Math.max(1, Math.min(180, Math.round(minutes)))
  const end = new Date()
  const start = new Date(end.getTime() - m * 60_000)
  const mode = get<{ mode: string }>('profiles', getProfileId())?.mode ?? 'study'
  create('focus_sessions', { started_at: start.toISOString(), ended_at: end.toISOString(), planned_minutes: m, focused_seconds: m * 60, completed: 1, mode })
  reward('focus', m)
}

// ---------- video rooms ----------

export async function roomJoin(channelId: string): Promise<{ ok: boolean; count: number; room_key?: string }> {
  me()
  return (await run(supabase().rpc('room_join', { p_channel: channelId }))) as { ok: boolean; count: number; room_key?: string }
}
export async function roomLeave(channelId: string): Promise<void> {
  const uid = currentUserId()
  if (uid) await supabase().from('room_participants').delete().eq('channel_id', channelId).eq('user_id', uid)
}
export async function roomParticipants(channelId: string): Promise<{ user_id: string; display_name: string }[]> {
  me()
  const since = new Date(Date.now() - 90_000).toISOString()
  const rows = ((await run(supabase().from('room_participants').select('user_id').eq('channel_id', channelId).gt('last_seen', since))) ?? []) as { user_id: string }[]
  await loadNames(rows.map((r) => r.user_id))
  return rows.map((r) => ({ user_id: r.user_id, display_name: nameOf(r.user_id) }))
}

// ---------- presence ("who's studying now") ----------

let presenceTimer: NodeJS.Timeout | undefined

export async function publishPresence(): Promise<void> {
  const uid = currentUserId()
  if (!uid) return
  const s = timer.getState()
  const status = s.running ? (s.phase === 'focus' ? 'focusing' : 'break') : 'online'
  try {
    await supabase()
      .from('presence')
      .upsert({ user_id: uid, status, focus_ends_at: s.running && s.endsAt ? new Date(s.endsAt).toISOString() : null, last_seen: new Date().toISOString() }, { onConflict: 'user_id' })
  } catch (e) {
    if (!isNetworkError(e)) throw e
  }
}

// ---------- live updates ----------

let channel: RealtimeChannel | null = null
const LIVE_TABLES = ['messages', 'presence', 'shared_timers', 'room_participants', 'server_members', 'channels', 'friendships', 'shares']

export function startLive(emit: (table: string, payload: { eventType: string; new: Record<string, unknown> }) => void): void {
  stopLive()
  void publishPresence()
  presenceTimer = setInterval(() => void publishPresence(), 60_000)
  channel = supabase().channel('studyhall-live')
  for (const table of LIVE_TABLES) {
    channel.on('postgres_changes', { event: '*', schema: 'public', table }, (payload) => {
      emit(table, payload as unknown as { eventType: string; new: Record<string, unknown> })
      if (table === 'shares') void sharedWithMe().catch(() => {})
    })
  }
  channel.subscribe()
  void sharedWithMe().catch(() => {})
}

export function stopLive(): void {
  clearInterval(presenceTimer)
  if (channel) void supabase().removeChannel(channel)
  channel = null
  editableNotes = new Set()
  knownIncoming = ''
}

/** Rows owned by someone else are read-only, except notes they shared with edit rights. */
export function guardWrite(table: string, row: { owner_id?: string; module_id?: unknown; id?: unknown } | null, kind: 'update' | 'delete' | 'create'): void {
  const uid = currentUserId()
  if (!uid || !row) return
  if (kind === 'create') {
    if (['weeks', 'materials', 'assessments'].includes(table) && typeof row.module_id === 'string') {
      const owner = (getDb().prepare('SELECT owner_id FROM modules WHERE id = ?').get(row.module_id) as { owner_id: string } | undefined)?.owner_id
      if (owner && owner !== uid) throw new Error('Shared modules are read-only.')
    }
    return
  }
  if (row.owner_id && row.owner_id !== uid) {
    if (table === 'notes' && kind === 'update' && canEditSharedNote(String(row.id))) return
    throw new Error('This was shared with you read-only.')
  }
}
