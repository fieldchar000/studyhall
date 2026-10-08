// The one Supabase client, living in the main process (the UI never talks to the
// network directly). The login session is stored encrypted with Windows DPAPI.

import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { safeStorage } from 'electron'
import { deleteSetting, getSetting, setSetting } from '../db'
import project from './project.json'

/** Usernames become fake addresses on a reserved domain that can never receive mail. */
export const EMAIL_DOMAIN = 'users.studyhall.invalid'
export const usernameToEmail = (u: string): string => `${u.trim().toLowerCase()}@${EMAIL_DOMAIN}`

const secureStorage = {
  getItem(key: string): string | null {
    const v = getSetting<string>(`auth:${key}`)
    if (!v) return null
    try {
      return safeStorage.isEncryptionAvailable() ? safeStorage.decryptString(Buffer.from(v, 'base64')) : v
    } catch {
      return null
    }
  },
  setItem(key: string, value: string): void {
    setSetting(`auth:${key}`, safeStorage.isEncryptionAvailable() ? safeStorage.encryptString(value).toString('base64') : value)
  },
  removeItem(key: string): void {
    deleteSetting(`auth:${key}`)
  }
}

let client: SupabaseClient | null = null

/** Created lazily (safeStorage only works after the app is ready). */
export function supabase(): SupabaseClient {
  client ??= createClient(project.url, project.publishableKey, {
    auth: { storage: secureStorage, storageKey: 'studyhall', persistSession: true, autoRefreshToken: true, detectSessionInUrl: false }
  })
  return client
}

export const cloudConfigured = (): boolean => !!project.url && !!project.publishableKey

/** True for "couldn't reach the server" errors (offline), as opposed to real errors. */
export function isNetworkError(e: unknown): boolean {
  const msg = String((e as { message?: string })?.message ?? e).toLowerCase()
  return msg.includes('fetch failed') || msg.includes('network') || msg.includes('enotfound') || msg.includes('timed out') || msg.includes('econn')
}
