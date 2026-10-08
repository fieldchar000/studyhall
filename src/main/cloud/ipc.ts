// IPC for cloud features. Inputs are checked here; the database checks permissions again (RLS).

import type { IpcMainInvokeEvent } from 'electron'
import type { TimerAction } from '@shared/cloud'
import { openVideoRoom } from '../video'
import { cloudStatus, currentUserId, signIn, signOut, signUp } from './account'
import * as social from './social'
import { storageUsed, syncNow } from './sync'

type Handle = (channel: string, fn: (e: IpcMainInvokeEvent, ...args: any[]) => unknown) => void

const str = (v: unknown, max = 200): string => String(v ?? '').slice(0, max)
const ID = /^[0-9a-f-]{36}$/i
const id = (v: unknown): string => {
  const s = str(v, 40)
  if (!ID.test(s)) throw new Error('Bad id')
  return s
}
const oneOf = <T extends string>(v: unknown, options: readonly T[]): T => {
  if (!options.includes(v as T)) throw new Error('Bad value')
  return v as T
}

export function registerCloudIpc(handle: Handle): void {
  handle('cloud:status', () => cloudStatus())
  handle('cloud:signUp', (_e, p: Record<string, unknown>) =>
    signUp({ username: str(p?.username, 20), password: str(p?.password, 200), displayName: str(p?.displayName, 40), inviteCode: str(p?.inviteCode, 20) })
  )
  handle('cloud:signIn', (_e, u: string, pw: string) => signIn(str(u, 20), str(pw, 200)))
  handle('cloud:signOut', () => signOut())
  handle('cloud:syncNow', () => syncNow())
  handle('cloud:storageUsed', () => storageUsed())

  handle('cloud:checkInvite', (_e, code: string) => social.checkInvite(str(code, 20)))
  handle('cloud:createInvite', (_e, o: Record<string, unknown>) =>
    social.createInvite({
      kind: oneOf(o?.kind, ['friend', 'server'] as const),
      serverId: o?.serverId ? id(o.serverId) : undefined,
      maxUses: Number(o?.maxUses) || 1,
      expiresDays: Number(o?.expiresDays) || 7
    })
  )
  handle('cloud:myInvites', () => social.myInvites())
  handle('cloud:revokeInvite', (_e, code: string) => social.revokeInvite(str(code, 20)))
  handle('cloud:redeem', (_e, code: string) => social.redeem(str(code, 20)))

  handle('cloud:friends', () => social.friends())
  handle('cloud:removeFriend', (_e, u: string) => social.removeFriend(id(u)))
  handle('cloud:leaderboard', (_e, since: string) => social.leaderboard(str(since, 40)))

  handle('cloud:sharesFor', (_e, type: string, rid: string) => social.sharesFor(oneOf(type, ['module', 'note'] as const), id(rid)))
  handle('cloud:share', (_e, type: string, rid: string, u: string, perm: string) =>
    social.share(oneOf(type, ['module', 'note'] as const), id(rid), id(u), oneOf(perm, ['view', 'edit'] as const))
  )
  handle('cloud:unshare', (_e, sid: string) => social.unshare(id(sid)))
  handle('cloud:sharedWithMe', () => social.sharedWithMe())

  handle('cloud:servers', () => social.servers())
  handle('cloud:server', (_e, s: string) => social.server(id(s)))
  handle('cloud:createServer', (_e, name: string) => social.createServer(str(name, 60)))
  handle('cloud:renameServer', (_e, s: string, name: string) => social.renameServer(id(s), str(name, 60)))
  handle('cloud:deleteServer', (_e, s: string) => social.deleteServer(id(s)))
  handle('cloud:leaveServer', (_e, s: string) => social.leaveServer(id(s)))
  handle('cloud:kick', (_e, s: string, u: string) => social.kick(id(s), id(u)))
  handle('cloud:setRole', (_e, s: string, u: string, role: string) => social.setRole(id(s), id(u), oneOf(role, ['mod', 'member'] as const)))
  handle('cloud:createChannel', (_e, s: string, name: string, kind: string) => social.createChannel(id(s), str(name, 40), oneOf(kind, ['text', 'study_room'] as const)))
  handle('cloud:renameChannel', (_e, c: string, name: string) => social.renameChannel(id(c), str(name, 40)))
  handle('cloud:deleteChannel', (_e, c: string) => social.deleteChannel(id(c)))

  handle('cloud:messages', (_e, c: string, before?: string) => social.messages(id(c), before ? str(before, 40) : undefined))
  handle('cloud:send', (_e, c: string, body: string) => social.send(id(c), str(body, 4000)))
  handle('cloud:deleteMessage', (_e, m: string) => social.deleteMessage(id(m)))
  handle('cloud:markRead', (_e, c: string) => social.markRead(id(c)))
  handle('cloud:setMuted', (_e, c: string, muted: boolean) => social.setMuted(id(c), !!muted))

  handle('cloud:sharedTimer', (_e, c: string) => social.sharedTimer(id(c)))
  handle('cloud:timerAction', (_e, c: string, action: string, s?: Record<string, unknown>) => {
    const settings: { focus_min?: number; break_min?: number } = {}
    if (s?.focus_min) settings.focus_min = Math.min(180, Math.max(1, Math.round(Number(s.focus_min))))
    if (s?.break_min) settings.break_min = Math.min(60, Math.max(1, Math.round(Number(s.break_min))))
    return social.timerAction(id(c), oneOf(action, ['start', 'pause', 'reset', 'skip', 'advance'] as const) as TimerAction, s ? settings : undefined)
  })
  handle('cloud:recordSharedFocus', (_e, minutes: number) => social.recordSharedFocus(Number(minutes) || 0))

  handle('cloud:joinRoom', async (_e, c: string, title: string) => {
    const channelId = id(c)
    const res = await social.roomJoin(channelId)
    if (res.ok && res.room_key) {
      openVideoRoom({
        channelId,
        roomKey: res.room_key,
        title: str(title, 60),
        displayName: cloudStatus().displayName || 'Studyhall user',
        heartbeat: () => void social.roomJoin(channelId).catch(() => {}),
        onClosed: () => void social.roomLeave(channelId).catch(() => {})
      })
    }
    return { ok: res.ok, count: res.count }
  })
  handle('cloud:roomParticipants', (_e, c: string) => social.roomParticipants(id(c)))
  handle('cloud:me', () => currentUserId())
}
