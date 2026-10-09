// Current Study/Work mode (stored on the profile, so it will sync later).

import type { Mode, Profile } from '@shared/types'
import { api, notifyChanged, track, useLive } from './data'

export function useProfile(): Profile | undefined {
  return useLive(['profiles'], () => api.profile.get(), []).data
}

const ALL_MODES: Mode[] = ['study', 'work', 'life', 'dev']

export function enabledModes(p: { enabled_modes?: string } | undefined): Mode[] {
  try {
    const m = (JSON.parse(p?.enabled_modes ?? '') as Mode[]).filter((x) => ALL_MODES.includes(x))
    if (m.length) return ALL_MODES.filter((x) => m.includes(x))
  } catch {
    /* not loaded yet / old data */
  }
  return ['study', 'life']
}

/** The categories (Study / Work / Life) chosen in Settings. */
export function useEnabledModes(): Mode[] {
  return enabledModes(useProfile())
}

/** Defaults to study until the profile has loaded; never a category that's switched off. */
export function useMode(): Mode {
  const p = useProfile()
  const on = enabledModes(p)
  const m = p?.mode ?? 'study'
  return on.includes(m) ? m : on[0]
}

export async function setEnabledModes(modes: Mode[], current: Mode): Promise<void> {
  if (!modes.length) return
  await track(api.profile.update({ enabled_modes: JSON.stringify(modes), ...(modes.includes(current) ? {} : { mode: modes[0] }) }))
  notifyChanged('*')
}

export async function setMode(mode: Mode): Promise<void> {
  await track(api.profile.update({ mode }))
  notifyChanged('*')
}
