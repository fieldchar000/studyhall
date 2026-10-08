// Parsing YouTube and Spotify share links (shared by main and UI).

function parse(url: string): URL | null {
  try {
    const u = new URL(url.trim())
    return u.protocol === 'https:' || u.protocol === 'http:' ? u : null
  } catch {
    return null
  }
}

const SPOTIFY_PATH = /^\/(?:intl-[a-z-]+\/)?(track|album|playlist|artist|episode|show)\/([A-Za-z0-9]+)/

/** { type, id } of an open.spotify.com link, or null. */
export function spotifyParts(url: string): { type: string; id: string } | null {
  const u = parse(url)
  const m = u?.hostname === 'open.spotify.com' ? SPOTIFY_PATH.exec(u.pathname) : null
  return m ? { type: m[1], id: m[2] } : null
}

export function spotifyEmbedUrl(url: string): string | null {
  const p = spotifyParts(url)
  return p ? `https://open.spotify.com/embed/${p.type}/${p.id}` : null
}

/** 11-character video id and start time from any common YouTube link format. */
export function youtubeParts(url: string): { id: string; start: number } | null {
  const u = parse(url)
  if (!u) return null
  let id: string | null = null
  if (u.hostname === 'youtu.be') id = u.pathname.slice(1)
  else if (/(^|\.)youtube\.com$/.test(u.hostname)) {
    id = u.searchParams.get('v') ?? /^\/(?:shorts|embed|live|v)\/([^/?#]+)/.exec(u.pathname)?.[1] ?? null
  }
  if (!id || !/^[A-Za-z0-9_-]{11}$/.test(id)) return null
  // t=90, t=1m30s or start=90
  const t = u.searchParams.get('t') ?? u.searchParams.get('start') ?? ''
  const m = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s?)?$/.exec(t)
  const start = m ? Number(m[1] ?? 0) * 3600 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0) : 0
  return { id, start }
}
