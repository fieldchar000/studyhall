// Video rooms on the phone: the same free Jitsi room, opened in the browser or the Jitsi app.
// Our seat (for the 6-person cap) is kept for up to two hours, then freed.

import { openOutside } from '../shims/electron'

const open = new Map<string, ReturnType<typeof setInterval>>()

export const isVideoContents = (): boolean => false

export function openVideoRoom(opts: { channelId: string; roomKey: string; title: string; displayName: string; onClosed: () => void; heartbeat: () => void }): void {
  const name = encodeURIComponent(JSON.stringify(opts.displayName))
  const hash = [`userInfo.displayName=${name}`, 'config.prejoinConfig.enabled=true', 'config.startWithAudioMuted=true', 'config.startWithVideoMuted=true', `config.subject=${encodeURIComponent(JSON.stringify(opts.title))}`].join('&')
  openOutside(`https://meet.jit.si/Studyhall-${opts.roomKey}#${hash}`)
  if (open.has(opts.channelId)) return
  const beat = setInterval(opts.heartbeat, 30_000)
  open.set(opts.channelId, beat)
  setTimeout(
    () => {
      clearInterval(beat)
      open.delete(opts.channelId)
      opts.onClosed()
    },
    2 * 60 * 60 * 1000
  )
}

export function closeAllVideoRooms(): void {
  for (const b of open.values()) clearInterval(b)
  open.clear()
}
