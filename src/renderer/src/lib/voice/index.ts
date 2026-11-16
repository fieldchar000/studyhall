// "Brief Bauer" from anywhere in the app (sidebar mic, phone top bar, Settings).

import { api } from '@/lib/data'
import { navigate } from '@/lib/nav'
import { isPhoneApp } from '@/lib/platform'

/** Start a voice briefing now. On the PC the Bauer panel opens; on the phone, the overlay. */
export async function startBrief(): Promise<void> {
  if (isPhoneApp()) {
    window.dispatchEvent(new Event('studyhall:brief'))
    return
  }
  const st = await api.voice.status()
  if (st.installed) await api.voice.brief()
  else navigate({ name: 'settings' }) // the one-time download lives there
}
