// UI side of cloud features: live account/sync status and "something changed" events.

import { useSyncExternalStore } from 'react'
import type { CloudStatus, DeepLink } from '@shared/cloud'
import { api, notifyChanged } from './data'

let status: CloudStatus | null = null
const listeners = new Set<() => void>()
const set = (s: CloudStatus): void => {
  status = s
  listeners.forEach((l) => l())
}
void api.cloud.status().then(set)
api.cloud.onStatus(set)

/** Live updates from the cloud: reload anything listening to "cloud:<table>". */
api.cloud.onEvent((table) => notifyChanged(`cloud:${table}`))

export function useCloud(): CloudStatus | null {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => status
  )
}

// A studyhall://invite/CODE link opened the app.
let pendingInvite: string | null = null
const inviteListeners = new Set<() => void>()
api.cloud.onDeepLink((link: DeepLink) => {
  pendingInvite = link.code
  inviteListeners.forEach((l) => l())
})
export function usePendingInvite(): [string | null, () => void] {
  const code = useSyncExternalStore(
    (l) => {
      inviteListeners.add(l)
      return () => inviteListeners.delete(l)
    },
    () => pendingInvite
  )
  return [
    code,
    () => {
      pendingInvite = null
      inviteListeners.forEach((l) => l())
    }
  ]
}

export async function copy(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text)
  } catch {
    /* clipboard blocked: the text is visible to copy by hand */
  }
}

export const timeAgo = (iso: string | null): string => {
  if (!iso) return 'never'
  const s = Math.round((Date.now() - Date.parse(iso)) / 1000)
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.round(s / 60)} min ago`
  if (s < 86400) return `${Math.round(s / 3600)} h ago`
  return new Date(iso).toLocaleDateString()
}
