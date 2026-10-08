// Spotify: saved playlists/albums with Spotify's embed player.
// Standard Electron has no Widevine DRM, so the in-app player plays 30-second
// previews; "Open in Spotify" plays the full thing in the Spotify desktop app.

import { useState } from 'react'
import { spotifyEmbedUrl, spotifyParts } from '@shared/links'
import type { SpotifyLink } from '@shared/types'
import { api, notifyChanged, track, useLive } from '@/lib/data'
import { Icon } from './ui'

const CURRENT_KEY = 'spotify.current' // remembered per device (just a convenience)
const readCurrent = (): string | null => {
  try {
    return localStorage.getItem(CURRENT_KEY)
  } catch {
    return null
  }
}

export function SpotifyPanel({ tall = false }: { tall?: boolean }): React.JSX.Element {
  const { data: prefs } = useLive(['prefs'], () => api.prefs.get(), [])
  const [current, setCurrent] = useState<string | null>(readCurrent)
  const [adding, setAdding] = useState(false)
  const [link, setLink] = useState('')
  const [error, setError] = useState('')
  const links = prefs?.spotifyLinks ?? []
  const selected = links.find((l) => l.url === current) ?? links[0]

  const choose = (url: string): void => {
    setCurrent(url)
    try {
      localStorage.setItem(CURRENT_KEY, url)
    } catch {
      /* storage unavailable: fine */
    }
  }
  const saveLinks = async (next: SpotifyLink[]): Promise<void> => {
    await track(api.prefs.set({ spotifyLinks: next }))
    notifyChanged('prefs')
  }
  const add = async (): Promise<void> => {
    if (!spotifyParts(link)) return setError('Paste a Spotify share link (open.spotify.com/…)')
    setError('')
    const info = await api.embed.lookup(link)
    const entry: SpotifyLink = { url: link.trim(), title: info?.title || 'Spotify', thumbnail_url: info?.thumbnail_url ?? null }
    await saveLinks([...links.filter((l) => l.url !== entry.url), entry])
    choose(entry.url)
    setLink('')
    setAdding(false)
  }

  return (
    <section className="card overflow-hidden">
      <div className="flex items-center gap-2 px-4 pt-3 pb-2">
        <svg width="16" height="16" viewBox="0 0 24 24" className="shrink-0 text-[#1db954]" fill="currentColor" aria-hidden>
          <circle cx="12" cy="12" r="11" />
          <path d="M7 9.5c3.5-1 7.5-.6 10.5 1M7.5 12.8c3-.8 6-.4 8.5 1M8 15.8c2.4-.6 4.6-.3 6.6.8" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" fill="none" />
        </svg>
        {links.length > 1 ? (
          <select className="field min-w-0 flex-1 text-sm font-semibold" value={selected?.url} onChange={(e) => choose(e.target.value)}>
            {links.map((l) => (
              <option key={l.url} value={l.url}>
                {l.title}
              </option>
            ))}
          </select>
        ) : (
          <h2 className="min-w-0 flex-1 truncate text-sm font-semibold">{selected?.title ?? 'Music'}</h2>
        )}
        <button className="btn-ghost px-1" title="Add a playlist/album" onClick={() => setAdding((a) => !a)}>
          <Icon name="plus" />
        </button>
        {selected && (
          <button className="btn-ghost px-1 hover:text-danger" title="Remove from list" onClick={() => void saveLinks(links.filter((l) => l.url !== selected.url))}>
            <Icon name="trash" size={14} />
          </button>
        )}
      </div>

      {adding && (
        <div className="flex flex-col gap-1.5 px-4 pb-3">
          <input
            autoFocus
            className="field-boxed text-sm"
            placeholder="Paste a Spotify playlist/album/track link"
            value={link}
            onChange={(e) => setLink(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void add()}
          />
          {error && <span className="text-xs text-danger">{error}</span>}
          <span className="text-[11px] text-muted">In Spotify: ⋯ → Share → Copy link.</span>
        </div>
      )}

      {selected ? (
        <>
          <iframe
            key={selected.url}
            title={selected.title}
            src={spotifyEmbedUrl(selected.url) ?? undefined}
            className="w-full border-0"
            style={{ height: tall ? 352 : 152 }}
            allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
            loading="lazy"
          />
          <div className="flex items-center gap-2 px-4 py-2.5">
            <button className="btn" onClick={() => void api.embed.openSpotify(selected.url)}>
              <Icon name="external" /> Open in Spotify
            </button>
            <span className="text-[11px] leading-tight text-muted">Player here = 30s previews. Full tracks play in the Spotify app.</span>
          </div>
        </>
      ) : (
        !adding && (
          <button className="w-full px-4 pb-4 text-left text-xs text-muted" onClick={() => setAdding(true)}>
            Add a study playlist: paste a Spotify link with +.
          </button>
        )
      )}
    </section>
  )
}
