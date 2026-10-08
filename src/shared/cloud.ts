// Types for cloud features (account, sync, friends, servers). Shared by main + UI.

export type SyncState = 'off' | 'syncing' | 'synced' | 'offline' | 'error'

export interface CloudStatus {
  configured: boolean
  signedIn: boolean
  userId: string | null
  username: string | null
  displayName: string | null
  isAdmin: boolean
  sync: SyncState
  pending: number // local changes not yet uploaded
  lastSyncAt: string | null
  error: string | null
}

export interface InviteCheck {
  valid: boolean
  kind?: 'friend' | 'server'
  inviter?: string | null
  server?: string | null
}

export interface InviteRow {
  code: string
  kind: 'friend' | 'server'
  server_id: string | null
  max_uses: number
  use_count: number
  expires_at: string | null
  revoked_at: string | null
  created_at: string
}

export interface Friend {
  user_id: string
  username: string
  display_name: string
  status: 'online' | 'focusing' | 'break' | 'offline'
  focus_ends_at: string | null
  last_seen: string | null
}

export interface LeaderRow {
  user_id: string
  display_name: string
  minutes: number
  is_me: boolean
}

export interface ShareRow {
  id: string
  resource_type: 'module' | 'note'
  resource_id: string
  owner_id: string
  shared_with: string
  permission: 'view' | 'edit'
  owner_name?: string
  with_name?: string
}

export type Role = 'owner' | 'mod' | 'member'

export interface ServerSummary {
  id: string
  name: string
  role: Role
  unread: number
}

export interface ChannelInfo {
  id: string
  server_id: string
  name: string
  kind: 'text' | 'study_room'
  sort: number
  unread: number
  muted: boolean
}

export interface MemberInfo {
  user_id: string
  display_name: string
  username: string
  role: Role
}

export interface ServerDetail {
  id: string
  name: string
  owner_id: string
  role: Role
  channels: ChannelInfo[]
  members: MemberInfo[]
}

export interface ChatMessage {
  id: string
  channel_id: string
  author_id: string | null
  author_name: string
  body: string
  created_at: string
  deleted_at: string | null
}

export interface SharedTimer {
  channel_id: string
  phase: 'focus' | 'break'
  running: boolean
  ends_at: string | null
  remaining_ms: number
  focus_min: number
  break_min: number
  updated_at: string
}

export type TimerAction = 'start' | 'pause' | 'reset' | 'skip' | 'advance'

export interface DeepLink {
  kind: 'invite'
  code: string
}

export interface CloudApi {
  status(): Promise<CloudStatus>
  onStatus(cb: (s: CloudStatus) => void): () => void
  signUp(p: { username: string; password: string; displayName: string; inviteCode: string }): Promise<CloudStatus>
  signIn(username: string, password: string): Promise<CloudStatus>
  signOut(): Promise<void>
  changePassword(current: string, next: string): Promise<void>
  /** Admin only: returns a temporary password to give to that person. */
  adminResetPassword(username: string): Promise<string>
  setDisplayName(name: string): Promise<void>
  syncNow(): Promise<void>
  checkInvite(code: string): Promise<InviteCheck>
  createInvite(opts: { kind: 'friend' | 'server'; serverId?: string; maxUses?: number; expiresDays?: number }): Promise<{ code: string; link: string }>
  myInvites(): Promise<InviteRow[]>
  revokeInvite(code: string): Promise<void>
  redeem(code: string): Promise<{ kind: 'friend' | 'server'; server_id: string | null }>
  friends(): Promise<Friend[]>
  removeFriend(userId: string): Promise<void>
  leaderboard(sinceIso: string): Promise<LeaderRow[]>
  sharesFor(type: 'module' | 'note', id: string): Promise<ShareRow[]>
  share(type: 'module' | 'note', id: string, userId: string, permission: 'view' | 'edit'): Promise<void>
  unshare(shareId: string): Promise<void>
  sharedWithMe(): Promise<ShareRow[]>
  servers(): Promise<ServerSummary[]>
  server(id: string): Promise<ServerDetail | null>
  createServer(name: string): Promise<string>
  renameServer(id: string, name: string): Promise<void>
  deleteServer(id: string): Promise<void>
  leaveServer(id: string): Promise<void>
  kick(serverId: string, userId: string): Promise<void>
  setRole(serverId: string, userId: string, role: 'mod' | 'member'): Promise<void>
  createChannel(serverId: string, name: string, kind: 'text' | 'study_room'): Promise<void>
  renameChannel(id: string, name: string): Promise<void>
  deleteChannel(id: string): Promise<void>
  messages(channelId: string, before?: string): Promise<ChatMessage[]>
  send(channelId: string, body: string): Promise<void>
  deleteMessage(id: string): Promise<void>
  markRead(channelId: string): Promise<void>
  setMuted(channelId: string, muted: boolean): Promise<void>
  sharedTimer(channelId: string): Promise<SharedTimer>
  timerAction(channelId: string, action: TimerAction, settings?: { focus_min?: number; break_min?: number }): Promise<SharedTimer>
  recordSharedFocus(minutes: number): Promise<void>
  joinRoom(channelId: string, title: string): Promise<{ ok: boolean; count: number }>
  roomParticipants(channelId: string): Promise<{ user_id: string; display_name: string }[]>
  storageUsed(): Promise<number>
  /** A cloud table changed (Realtime) — reload whatever shows it. */
  onEvent(cb: (table: string) => void): () => void
  onDeepLink(cb: (link: DeepLink) => void): () => void
}
