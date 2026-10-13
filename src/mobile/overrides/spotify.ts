// Spotify on the phone: hand the link to the Spotify app (full tracks need the PC's player).

import { openOutside } from '../shims/electron'

export const isSpotifyContents = (): boolean => false

export async function openSpotifyPlayer(url?: string): Promise<{ widevine: boolean }> {
  openOutside(url && /^https:\/\/open\.spotify\.com\//.test(url) ? url : 'https://open.spotify.com/')
  return { widevine: false }
}

export function closeSpotifyPlayer(): void {}
