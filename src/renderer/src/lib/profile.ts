// Current Study/Work mode (stored on the profile, so it will sync later).

import type { Mode, Profile } from '@shared/types'
import { api, notifyChanged, track, useLive } from './data'

export function useProfile(): Profile | undefined {
  return useLive(['profiles'], () => api.profile.get(), []).data
}

/** Defaults to study until the profile has loaded. */
export function useMode(): Mode {
  return useProfile()?.mode ?? 'study'
}

export async function setMode(mode: Mode): Promise<void> {
  await track(api.profile.update({ mode }))
  notifyChanged('*')
}
