// Servers: Discord-style spaces for friends. Text channels with history and unread badges,
// study rooms (shared Pomodoro + video call), roles, expiring invites. No DMs/threads/voice.

import { useEffect, useMemo, useRef, useState } from 'react'
import type { ChannelInfo, ChatMessage, ServerDetail, SharedTimer } from '@shared/cloud'
import { Icon, Modal } from '@/components/ui'
import { api, notifyChanged, useLive } from '@/lib/data'
import { copy, useCloud } from '@/lib/cloud'
import { navigate } from '@/lib/nav'
import { SignInFirst } from './Friends'

const errText = (e: unknown): string => String(e instanceof Error ? e.message : e).replace(/^Error invoking remote method '[^']+': (Error: )?/, '')

export function ServersPage({ serverId, channelId }: { serverId?: string; channelId?: string }): React.JSX.Element {
  const c = useCloud()
  const { data: list } = useLive(['cloud:server_members', 'cloud:messages', 'cloud:channels'], () => (c?.signedIn ? api.cloud.servers() : Promise.resolve([])), [c?.signedIn])
  if (!c) return <div />
  if (!c.signedIn) return <SignInFirst what="Servers" />
  const current = serverId ?? list?.[0]?.id
  return (
    <div className="flex h-full">
      <ServerList servers={list ?? []} current={current} />
      {current ? <ServerView key={current} serverId={current} channelId={channelId} /> : <EmptyServers />}
    </div>
  )
}

function EmptyServers(): React.JSX.Element {
  return (
    <div className="m-auto max-w-sm p-8 text-center text-sm text-muted">
      <div className="mb-2 text-4xl">🏫</div>
      Create a server for your study group, or join one with an invite code (left).
    </div>
  )
}

function ServerList({ servers, current }: { servers: { id: string; name: string; unread: number }[]; current?: string }): React.JSX.Element {
  const [name, setName] = useState('')
  const [code, setCode] = useState('')
  const [err, setErr] = useState('')
  const createServer = async (): Promise<void> => {
    const id = await api.cloud.createServer(name || 'Study group')
    setName('')
    notifyChanged('cloud:server_members')
    navigate({ name: 'servers', serverId: id })
  }
  const join = async (): Promise<void> => {
    setErr('')
    try {
      const r = await api.cloud.redeem(code)
      setCode('')
      notifyChanged('cloud:server_members')
      if (r.server_id) navigate({ name: 'servers', serverId: r.server_id })
    } catch (e) {
      setErr(errText(e))
    }
  }
  return (
    <aside className="flex w-56 shrink-0 flex-col gap-1 border-r border-line p-3">
      <h1 className="mb-2 px-1 text-lg font-semibold">Servers</h1>
      {servers.map((s) => (
        <button
          key={s.id}
          onClick={() => navigate({ name: 'servers', serverId: s.id })}
          className={`flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm ${s.id === current ? 'bg-accent-soft font-medium text-accent' : 'hover:bg-line/50'}`}
        >
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-line/70 text-xs font-bold">{s.name.slice(0, 2).toUpperCase()}</span>
          <span className="flex-1 truncate">{s.name}</span>
          {s.unread > 0 && <span className="rounded-full bg-accent px-1.5 text-[10px] font-semibold text-white">{s.unread}</span>}
        </button>
      ))}
      <div className="mt-auto flex flex-col gap-2 border-t border-line pt-3">
        <input className="field-boxed text-sm" placeholder="New server name" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && void createServer()} />
        <button className="btn justify-center" onClick={() => void createServer()}>
          <Icon name="plus" /> Create server
        </button>
        <input className="field-boxed font-mono text-sm uppercase" placeholder="Invite code" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} />
        <button className="btn justify-center" disabled={code.length < 6} onClick={() => void join()}>
          Join with code
        </button>
        {err && <div className="text-xs text-danger">{err}</div>}
      </div>
    </aside>
  )
}

function ServerView({ serverId, channelId }: { serverId: string; channelId?: string }): React.JSX.Element {
  const { data: server } = useLive(['cloud:channels', 'cloud:server_members', 'cloud:messages'], () => api.cloud.server(serverId), [serverId])
  const [showMembers, setShowMembers] = useState(true)
  const [settings, setSettings] = useState(false)
  if (server === undefined) return <div className="flex-1" />
  if (server === null) return <div className="m-auto text-sm text-muted">You're no longer in this server.</div>
  const channel = server.channels.find((c) => c.id === channelId) ?? server.channels[0]
  const canManage = server.role === 'owner' || server.role === 'mod'

  return (
    <>
      <aside className="flex w-56 shrink-0 flex-col border-r border-line bg-sidebar">
        <div className="flex items-center gap-1 border-b border-line px-3 py-3">
          <span className="flex-1 truncate font-semibold">{server.name}</span>
          <button className="btn-ghost px-1" title="Server settings & invites" onClick={() => setSettings(true)}>
            <Icon name="settings" />
          </button>
        </div>
        <ChannelList server={server} current={channel?.id} canManage={canManage} />
      </aside>
      <section className="flex min-w-0 flex-1 flex-col">
        {channel ? (
          <ChannelView key={channel.id} server={server} channel={channel} onToggleMembers={() => setShowMembers((s) => !s)} />
        ) : (
          <div className="m-auto text-sm text-muted">No channels yet.</div>
        )}
      </section>
      {showMembers && <Members server={server} />}
      {settings && <ServerSettings server={server} onClose={() => setSettings(false)} />}
    </>
  )
}

function ChannelList({ server, current, canManage }: { server: ServerDetail; current?: string; canManage: boolean }): React.JSX.Element {
  const [adding, setAdding] = useState<null | 'text' | 'study_room'>(null)
  const [name, setName] = useState('')
  const add = async (): Promise<void> => {
    if (!adding || !name.trim()) return
    await api.cloud.createChannel(server.id, name, adding)
    setName('')
    setAdding(null)
    notifyChanged('cloud:channels')
  }
  const section = (kind: ChannelInfo['kind'], title: string): React.JSX.Element => (
    <div className="mb-3">
      <div className="flex items-center px-2 pb-1 text-[11px] font-semibold tracking-wide text-muted uppercase">
        <span className="flex-1">{title}</span>
        {canManage && (
          <button title="Add channel" onClick={() => setAdding(kind)}>
            <Icon name="plus" size={13} />
          </button>
        )}
      </div>
      {server.channels
        .filter((c) => c.kind === kind)
        .map((c) => (
          <button
            key={c.id}
            onClick={() => navigate({ name: 'servers', serverId: server.id, channelId: c.id })}
            className={`flex w-full items-center gap-1.5 rounded-md px-2 py-1 text-left text-sm ${c.id === current ? 'bg-line/70 font-medium' : c.unread && !c.muted ? 'font-semibold' : 'text-muted hover:bg-line/40'}`}
          >
            <span className="w-4 text-center opacity-60">{c.kind === 'text' ? '#' : '🎥'}</span>
            <span className={`flex-1 truncate ${c.muted ? 'opacity-50' : ''}`}>{c.name}</span>
            {c.unread > 0 && !c.muted && <span className="rounded-full bg-accent px-1.5 text-[10px] font-semibold text-white">{c.unread}</span>}
          </button>
        ))}
      {adding === kind && (
        <input
          autoFocus
          className="field-boxed mt-1 text-sm"
          placeholder="channel-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => setAdding(null)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void add()
            if (e.key === 'Escape') setAdding(null)
          }}
        />
      )}
    </div>
  )
  return (
    <nav className="flex-1 overflow-auto p-2">
      {section('text', 'Text channels')}
      {section('study_room', 'Study rooms')}
    </nav>
  )
}

function ChannelView({ server, channel, onToggleMembers }: { server: ServerDetail; channel: ChannelInfo; onToggleMembers: () => void }): React.JSX.Element {
  const canManage = server.role === 'owner' || server.role === 'mod'
  return (
    <>
      <header className="flex items-center gap-2 border-b border-line px-4 py-2.5">
        <span className="text-muted">{channel.kind === 'text' ? '#' : '🎥'}</span>
        <span className="font-semibold">{channel.name}</span>
        <div className="flex-1" />
        <button
          className={`btn-ghost ${channel.muted ? 'text-amber-600' : ''}`}
          title={channel.muted ? 'Unmute channel' : 'Mute channel (no unread badge)'}
          onClick={() => void api.cloud.setMuted(channel.id, !channel.muted).then(() => notifyChanged('cloud:channels'))}
        >
          {channel.muted ? '🔕 Muted' : '🔔'}
        </button>
        {canManage && (
          <button
            className="btn-ghost hover:text-danger"
            title="Delete channel"
            onClick={() => confirm(`Delete #${channel.name} and all its messages?`) && void api.cloud.deleteChannel(channel.id).then(() => notifyChanged('cloud:channels'))}
          >
            <Icon name="trash" />
          </button>
        )}
        <button className="btn-ghost" title="Show/hide members" onClick={onToggleMembers}>
          <Icon name="clients" />
        </button>
      </header>
      {channel.kind === 'study_room' && <StudyRoom server={server} channel={channel} />}
      <Chat channel={channel} canModerate={canManage} />
    </>
  )
}

function Chat({ channel, canModerate }: { channel: ChannelInfo; canModerate: boolean }): React.JSX.Element {
  const c = useCloud()
  const [older, setOlder] = useState<ChatMessage[]>([])
  const [noMore, setNoMore] = useState(false)
  const [text, setText] = useState('')
  const listRef = useRef<HTMLDivElement>(null)
  const { data: latest } = useLive(['cloud:messages'], () => api.cloud.messages(channel.id), [channel.id])

  const all = useMemo(() => {
    const map = new Map<string, ChatMessage>()
    for (const m of [...older, ...(latest ?? [])]) map.set(m.id, m)
    return [...map.values()].sort((a, b) => a.created_at.localeCompare(b.created_at))
  }, [older, latest])

  // New messages: scroll down and mark the channel read.
  useEffect(() => {
    const el = listRef.current
    if (el) el.scrollTop = el.scrollHeight
    void api.cloud.markRead(channel.id).then(() => notifyChanged('cloud:server_members'))
  }, [latest, channel.id])

  const loadOlder = async (): Promise<void> => {
    const first = all[0]
    if (!first) return
    const more = await api.cloud.messages(channel.id, first.created_at)
    if (more.length < 50) setNoMore(true)
    setOlder((o) => [...more, ...o])
  }

  const send = async (): Promise<void> => {
    const body = text.trim()
    if (!body) return
    setText('')
    await api.cloud.send(channel.id, body)
    notifyChanged('cloud:messages')
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div ref={listRef} className="min-h-0 flex-1 overflow-auto px-4 py-3">
        {all.length >= 50 && !noMore && (
          <button className="btn-ghost mx-auto mb-2 block" onClick={() => void loadOlder()}>
            Load older messages
          </button>
        )}
        {latest && all.length === 0 && <div className="mt-10 text-center text-sm text-muted">No messages yet — say hi 👋</div>}
        {all.map((m, i) => {
          const prev = all[i - 1]
          const grouped = prev && prev.author_id === m.author_id && Date.parse(m.created_at) - Date.parse(prev.created_at) < 5 * 60_000
          const mine = m.author_id === c?.userId
          return (
            <div key={m.id} className={`group flex gap-3 ${grouped ? 'mt-0.5' : 'mt-3'}`}>
              <div className="w-8 shrink-0">
                {!grouped && (
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-accent-soft text-sm font-semibold text-accent">{m.author_name.slice(0, 1).toUpperCase()}</span>
                )}
              </div>
              <div className="min-w-0 flex-1">
                {!grouped && (
                  <div className="flex items-baseline gap-2">
                    <span className="text-sm font-semibold">{m.author_name}</span>
                    <span className="text-[11px] text-muted">{new Date(m.created_at).toLocaleString(undefined, { weekday: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                  </div>
                )}
                <div className={`text-sm break-words whitespace-pre-wrap ${m.deleted_at ? 'text-muted italic' : ''}`}>{m.deleted_at ? 'Message deleted' : m.body}</div>
              </div>
              {!m.deleted_at && (mine || canModerate) && (
                <button className="btn-ghost h-6 self-start px-1 opacity-0 group-hover:opacity-100 hover:text-danger" title="Delete message" onClick={() => void api.cloud.deleteMessage(m.id).then(() => notifyChanged('cloud:messages'))}>
                  <Icon name="trash" size={13} />
                </button>
              )}
            </div>
          )
        })}
      </div>
      <div className="border-t border-line p-3">
        <textarea
          className="field-boxed resize-none"
          rows={2}
          placeholder={`Message #${channel.name} (Enter to send, Shift+Enter for a new line)`}
          value={text}
          maxLength={4000}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              void send()
            }
          }}
        />
      </div>
    </div>
  )
}

/** Shared Pomodoro + video call for a study-room channel. */
function StudyRoom({ server, channel }: { server: ServerDetail; channel: ChannelInfo }): React.JSX.Element {
  const { data: t } = useLive(['cloud:shared_timers'], () => api.cloud.sharedTimer(channel.id), [channel.id])
  const { data: people } = useLive(['cloud:room_participants'], () => api.cloud.roomParticipants(channel.id), [channel.id])
  const [, tick] = useState(0)
  const [msg, setMsg] = useState('')
  const handled = useRef<string | null>(null)

  useEffect(() => {
    const id = setInterval(() => tick((n) => n + 1), 500)
    return () => clearInterval(id)
  }, [])

  const left = t ? (t.running && t.ends_at ? Math.max(0, Date.parse(t.ends_at) - Date.now()) : t.remaining_ms) : 0

  // When a running phase reaches 0, move it on (first client wins) and count your focus.
  useEffect(() => {
    if (!t?.running || !t.ends_at || left > 0) return
    const key = `${t.ends_at}|${t.phase}`
    if (handled.current === key) return
    handled.current = key
    if (t.phase === 'focus') void api.cloud.recordSharedFocus(t.focus_min)
    void api.cloud.timerAction(channel.id, 'advance').then(() => notifyChanged('cloud:shared_timers'))
  }, [left, t, channel.id])

  const act = (a: 'start' | 'pause' | 'reset' | 'skip', s?: Partial<SharedTimer>): void =>
    void api.cloud.timerAction(channel.id, a, s).then(() => notifyChanged('cloud:shared_timers'))

  const join = async (): Promise<void> => {
    setMsg('')
    try {
      const r = await api.cloud.joinRoom(channel.id, `${server.name} · ${channel.name}`)
      if (!r.ok) setMsg(`This room is full (${r.count} people). Studyhall keeps calls to 6.`)
      notifyChanged('cloud:room_participants')
    } catch (e) {
      setMsg(errText(e))
    }
  }

  const mm = String(Math.floor(left / 60000)).padStart(2, '0')
  const ss = String(Math.floor((left % 60000) / 1000)).padStart(2, '0')
  return (
    <div className="grid grid-cols-2 gap-4 border-b border-line bg-canvas p-4">
      <div className="card flex flex-col items-center gap-2 p-4">
        <div className="text-xs font-semibold tracking-wide text-muted uppercase">Shared timer · {t?.phase === 'break' ? 'Break' : 'Focus'}</div>
        <div className={`text-5xl font-semibold tabular-nums ${t?.phase === 'break' ? 'text-ok' : ''}`}>
          {mm}:{ss}
        </div>
        <div className="flex gap-2">
          <button className="btn-primary" onClick={() => act(t?.running ? 'pause' : 'start')}>
            <Icon name={t?.running ? 'pause' : 'play'} /> {t?.running ? 'Pause' : 'Start'}
          </button>
          <button className="btn" onClick={() => act('reset')} title="Reset">
            <Icon name="reset" />
          </button>
          <button className="btn" onClick={() => act('skip')} title="Skip to next phase">
            <Icon name="skip" />
          </button>
        </div>
        {t && !t.running && (
          <div className="flex items-center gap-2 text-xs text-muted">
            <span>Focus</span>
            <select className="field-boxed w-auto py-0.5" value={t.focus_min} onChange={(e) => act('reset', { focus_min: Number(e.target.value) })}>
              {[15, 25, 30, 45, 50, 60, 90].map((m) => (
                <option key={m}>{m}</option>
              ))}
            </select>
            <span>Break</span>
            <select className="field-boxed w-auto py-0.5" value={t.break_min} onChange={(e) => act('reset', { break_min: Number(e.target.value) })}>
              {[5, 10, 15, 20].map((m) => (
                <option key={m}>{m}</option>
              ))}
            </select>
          </div>
        )}
        <div className="text-[11px] text-muted">Everyone in this server sees the same timer. Finished focus blocks count in your stats.</div>
      </div>
      <div className="card flex flex-col gap-2 p-4">
        <div className="text-xs font-semibold tracking-wide text-muted uppercase">Video call · {people?.length ?? 0}/6</div>
        <div className="flex flex-wrap gap-1.5">
          {people?.map((p) => (
            <span key={p.user_id} className="rounded-full bg-ok/15 px-2.5 py-0.5 text-xs text-ok">
              ● {p.display_name}
            </span>
          ))}
          {people?.length === 0 && <span className="text-xs text-muted">Nobody's in the call.</span>}
        </div>
        <button className="btn-primary mt-1 self-start" onClick={() => void join()} disabled={(people?.length ?? 0) >= 6}>
          🎥 Join video call
        </button>
        {msg && <div className="text-xs text-danger">{msg}</div>}
        <p className="text-[11px] leading-snug text-muted">
          Opens a free Jitsi call in its own window. Whoever starts the call signs in once (GitHub works best) inside that window; others just join. Allow camera/mic for desktop
          apps in Windows Settings → Privacy.
        </p>
        <button className="self-start text-[11px] text-accent underline" onClick={() => window.open('https://meet.google.com/new')}>
          Use Google Meet instead
        </button>
      </div>
    </div>
  )
}

function Members({ server }: { server: ServerDetail }): React.JSX.Element {
  const c = useCloud()
  const isOwner = server.role === 'owner'
  const label = { owner: 'Owner', mod: 'Mods', member: 'Members' }
  return (
    <aside className="w-56 shrink-0 overflow-auto border-l border-line p-3">
      {(['owner', 'mod', 'member'] as const).map((role) => {
        const people = server.members.filter((m) => m.role === role)
        if (!people.length) return null
        return (
          <div key={role} className="mb-3">
            <div className="px-1 pb-1 text-[11px] font-semibold tracking-wide text-muted uppercase">
              {label[role]} — {people.length}
            </div>
            {people.map((m) => (
              <div key={m.user_id} className="group flex items-center gap-2 rounded-md px-1 py-1 text-sm hover:bg-line/40">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-accent-soft text-[11px] font-semibold text-accent">{m.display_name.slice(0, 1).toUpperCase()}</span>
                <span className="flex-1 truncate">{m.display_name}</span>
                {isOwner && m.user_id !== c?.userId && (
                  <span className="hidden gap-1 group-hover:flex">
                    <button
                      className="text-[11px] text-accent"
                      title={m.role === 'mod' ? 'Make member' : 'Make mod'}
                      onClick={() => void api.cloud.setRole(server.id, m.user_id, m.role === 'mod' ? 'member' : 'mod').then(() => notifyChanged('cloud:server_members'))}
                    >
                      {m.role === 'mod' ? '↓' : '↑ mod'}
                    </button>
                    <button
                      className="text-[11px] text-danger"
                      title="Kick from server"
                      onClick={() => confirm(`Kick ${m.display_name}?`) && void api.cloud.kick(server.id, m.user_id).then(() => notifyChanged('cloud:server_members'))}
                    >
                      kick
                    </button>
                  </span>
                )}
              </div>
            ))}
          </div>
        )
      })}
    </aside>
  )
}

function ServerSettings({ server, onClose }: { server: ServerDetail; onClose: () => void }): React.JSX.Element {
  const canManage = server.role === 'owner' || server.role === 'mod'
  const [name, setName] = useState(server.name)
  const [uses, setUses] = useState(5)
  const [days, setDays] = useState(7)
  const { data: invites, reload } = useLive([], () => api.cloud.myInvites(), [])
  const serverInvites = (invites ?? []).filter((i) => i.server_id === server.id)
  const [err, setErr] = useState('')

  return (
    <Modal title={`${server.name} — settings`} onClose={onClose}>
      <div className="flex flex-col gap-4 text-sm">
        {canManage && (
          <div className="flex gap-2">
            <input className="field-boxed" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} />
            <button className="btn" onClick={() => void api.cloud.renameServer(server.id, name).then(() => notifyChanged('cloud:server_members'))}>
              Rename
            </button>
          </div>
        )}
        {canManage && (
          <div className="flex flex-col gap-2">
            <h3 className="font-semibold">Invites</h3>
            <div className="flex items-center gap-2 text-xs">
              <span>Uses</span>
              <select className="field-boxed w-auto" value={uses} onChange={(e) => setUses(Number(e.target.value))}>
                {[1, 5, 10, 25, 50].map((n) => (
                  <option key={n}>{n}</option>
                ))}
              </select>
              <span>Expires after</span>
              <select className="field-boxed w-auto" value={days} onChange={(e) => setDays(Number(e.target.value))}>
                {[1, 3, 7, 14, 30].map((n) => (
                  <option key={n} value={n}>
                    {n} day{n > 1 ? 's' : ''}
                  </option>
                ))}
              </select>
              <button
                className="btn-primary ml-auto"
                onClick={() =>
                  void api.cloud
                    .createInvite({ kind: 'server', serverId: server.id, maxUses: uses, expiresDays: days })
                    .then(reload)
                    .catch((e) => setErr(errText(e)))
                }
              >
                Create invite
              </button>
            </div>
            {serverInvites.map((i) => {
              const dead = !!i.revoked_at || i.use_count >= i.max_uses || (i.expires_at && Date.parse(i.expires_at) < Date.now())
              return (
                <div key={i.code} className={`flex items-center gap-2 rounded-md bg-canvas px-2 py-1.5 ${dead ? 'opacity-50' : ''}`}>
                  <code className="font-semibold tracking-wider">{i.code}</code>
                  <span className="flex-1 text-xs text-muted">
                    {i.use_count}/{i.max_uses} used · {dead ? 'inactive' : `expires ${new Date(i.expires_at!).toLocaleDateString()}`}
                  </span>
                  {!dead && (
                    <>
                      <button className="btn-ghost px-1 text-xs" onClick={() => void copy(`studyhall://invite/${i.code}`)}>
                        Copy link
                      </button>
                      <button className="btn-ghost px-1 text-xs hover:text-danger" onClick={() => void api.cloud.revokeInvite(i.code).then(reload)}>
                        Revoke
                      </button>
                    </>
                  )}
                </div>
              )
            })}
            {err && <div className="text-xs text-danger">{err}</div>}
          </div>
        )}
        <div className="flex justify-end gap-2 border-t border-line pt-3">
          {server.role === 'owner' ? (
            <button
              className="btn text-danger"
              onClick={() =>
                confirm(`Delete “${server.name}” for everyone? All channels and messages are removed.`) &&
                void api.cloud.deleteServer(server.id).then(() => {
                  onClose()
                  notifyChanged('cloud:server_members')
                  navigate({ name: 'servers' })
                })
              }
            >
              Delete server
            </button>
          ) : (
            <button
              className="btn text-danger"
              onClick={() =>
                void api.cloud.leaveServer(server.id).then(() => {
                  onClose()
                  notifyChanged('cloud:server_members')
                  navigate({ name: 'servers' })
                })
              }
            >
              Leave server
            </button>
          )}
        </div>
      </div>
    </Modal>
  )
}
