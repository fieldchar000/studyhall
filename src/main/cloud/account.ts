// Account: sign up (invite code required), sign in, sign out, and linking this PC's
// existing local data to the account the first time you sign in.

import { randomBytes } from 'node:crypto'
import { SYNC_TABLES } from '@shared/sync'
import type { CloudStatus } from '@shared/cloud'
import { getDb, getProfileId, getSetting, now, setProfileId, setSetting } from '../db'
import { cloudConfigured, isNetworkError, supabase, usernameToEmail } from './client'
import { EPOCH, resetCursors, startSync, stopSync, syncInfo } from './sync'

interface Identity {
  userId: string
  username: string
  displayName: string
  isAdmin: boolean
}

let identity: Identity | null = null
let listeners: (() => void)[] = []
export const onAccountChange = (fn: () => void): void => void listeners.push(fn)
const changed = (): void => listeners.forEach((l) => l())

export const currentUserId = (): string | null => identity?.userId ?? null

export function cloudStatus(): CloudStatus {
  return {
    configured: cloudConfigured(),
    signedIn: !!identity,
    userId: identity?.userId ?? null,
    username: identity?.username ?? null,
    displayName: identity?.displayName ?? null,
    isAdmin: identity?.isAdmin ?? false,
    ...(identity ? syncInfo() : { sync: 'off' as const, pending: 0, lastSyncAt: null, error: null })
  }
}

const USERNAME = /^[a-z0-9_]{3,20}$/

function friendlyAuthError(msg: string): string {
  const m = msg.toLowerCase()
  if (m.includes('invalid login credentials')) return 'Wrong username or password.'
  if (m.includes('database error saving new user')) return 'Sign-up was refused — check the invite code and username.'
  if (m.includes('already registered')) return 'That username is taken.'
  if (m.includes('password')) return msg
  return msg
}

export async function signUp(p: { username: string; password: string; displayName: string; inviteCode: string }): Promise<CloudStatus> {
  const username = p.username.trim().toLowerCase()
  if (!USERNAME.test(username)) throw new Error('Username: 3–20 lowercase letters, numbers or _')
  if (p.password.length < 8) throw new Error('Password: at least 8 characters')
  const code = p.inviteCode.trim().toUpperCase()
  // Friendly checks first (the database enforces the same rules regardless).
  const [{ data: free }, { data: inv }] = await Promise.all([
    supabase().rpc('username_available', { p_username: username }),
    supabase().rpc('check_invite', { p_code: code })
  ])
  if (!inv?.valid) throw new Error('That invite code is invalid, expired or used up.')
  if (!free) throw new Error('That username is taken.')
  // Created by a database function (checks the invite code), then a normal password sign-in.
  const created = await supabase().rpc('signup_with_invite', {
    p_username: username,
    p_password: p.password,
    p_display_name: p.displayName.trim() || username,
    p_code: code
  })
  if (created.error) throw new Error(friendlyAuthError(created.error.message))
  return signIn(username, p.password)
}

export async function signIn(username: string, password: string): Promise<CloudStatus> {
  const { data, error } = await supabase().auth.signInWithPassword({ email: usernameToEmail(username), password })
  if (error) throw new Error(friendlyAuthError(error.message))
  await afterSignIn(data.user.id)
  return cloudStatus()
}

export async function signOut(): Promise<void> {
  stopSync()
  identity = null
  await supabase().auth.signOut({ scope: 'local' }).catch(() => {})
  changed()
}

/** On launch: resume the saved session (works offline too — sync just waits). */
export async function restoreSession(): Promise<void> {
  if (!cloudConfigured()) return
  const { data } = await supabase().auth.getSession()
  const user = data.session?.user
  if (!user) return
  const cached = getSetting<Identity>('cloud_identity')
  identity = cached?.userId === user.id ? cached : { userId: user.id, username: '', displayName: '', isAdmin: false }
  changed()
  startSync(user.id)
  void refreshIdentity()
}

async function refreshIdentity(): Promise<void> {
  if (!identity) return
  try {
    const { data } = await supabase().from('user_directory').select('username, display_name, is_admin').eq('id', identity.userId).single()
    if (data) {
      identity = { userId: identity.userId, username: data.username, displayName: data.display_name, isAdmin: data.is_admin }
      setSetting('cloud_identity', identity)
      changed()
    }
  } catch (e) {
    if (!isNetworkError(e)) throw e
  }
}

/** Change your own password (checks the current one first). */
export async function changePassword(current: string, next: string): Promise<void> {
  if (!identity) throw new Error('Not signed in')
  if (next.length < 8) throw new Error('New password: at least 8 characters')
  const check = await supabase().auth.signInWithPassword({ email: usernameToEmail(identity.username), password: current })
  if (check.error) throw new Error('Current password is wrong.')
  const { error } = await supabase().auth.updateUser({ password: next })
  if (error) throw new Error(error.message)
}

/** Admin only: give someone a temporary password (returned once, to pass on to them). */
export async function adminResetPassword(username: string): Promise<string> {
  const temp = randomBytes(9).toString('base64url') // 12 characters
  const { error } = await supabase().rpc('admin_set_password', { p_username: username, p_password: temp })
  if (error) throw new Error(error.message)
  return temp
}

export async function setDisplayName(name: string): Promise<void> {
  if (!identity) return
  const { error } = await supabase().from('user_directory').update({ display_name: name.trim().slice(0, 40) }).eq('id', identity.userId)
  if (error) throw error
  await refreshIdentity()
}

async function afterSignIn(userId: string): Promise<void> {
  // One PC = one account, so two people's data never mix.
  const linked = getSetting<string>('cloud_user_id')
  if (linked && linked !== userId) {
    await supabase().auth.signOut({ scope: 'local' })
    throw new Error('This PC is already linked to a different Studyhall account. Sign in with that one.')
  }
  if (!linked) {
    adoptLocalData(userId)
    setSetting('cloud_user_id', userId)
  }
  identity = { userId, username: '', displayName: '', isAdmin: false }
  await refreshIdentity()
  changed()
  startSync(userId)
}

/** First sign-in on this PC: everything created so far becomes owned by the account and is uploaded. */
function adoptLocalData(userId: string): void {
  const old = getProfileId()
  const db = getDb()
  db.exec('PRAGMA foreign_keys = OFF')
  try {
    db.exec('BEGIN')
    for (const t of SYNC_TABLES) db.prepare(`UPDATE ${t} SET owner_id = ? WHERE owner_id = ?`).run(userId, old)
    // The local profile starts "oldest" so an existing cloud profile (from another PC) wins.
    db.prepare('UPDATE profiles SET id = ?, owner_id = ?, updated_at = ? WHERE id = ?').run(userId, userId, EPOCH, old)
    db.exec('DELETE FROM sync_outbox')
    const t0 = now()
    for (const t of SYNC_TABLES) {
      if (t === 'profiles') continue
      db.prepare(`INSERT OR REPLACE INTO sync_outbox (table_name, row_id, queued_at) SELECT ?, id, ? FROM ${t} WHERE owner_id = ?`).run(t, t0, userId)
    }
    db.exec('COMMIT')
  } catch (e) {
    db.exec('ROLLBACK')
    throw e
  } finally {
    db.exec('PRAGMA foreign_keys = ON')
  }
  setProfileId(userId)
  resetCursors()
}
