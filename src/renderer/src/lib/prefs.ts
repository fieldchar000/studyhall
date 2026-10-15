// This device's preferences (never synced): read anywhere, refreshed when they change.

import type { Prefs } from '@shared/types'
import { api, notifyChanged, track, useLive } from './data'

export function usePrefs(): Prefs | undefined {
  return useLive(['prefs'], () => api.prefs.get(), []).data
}

export async function setPrefs(patch: Partial<Prefs>): Promise<void> {
  await track(api.prefs.set(patch))
  notifyChanged('prefs')
}
