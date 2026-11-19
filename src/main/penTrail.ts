// The talk-keys pen, the way Roamies does it on Windows (its voice helper's ink.rs, rewritten here): while the talk
// keys are held, Studyhall follows the cursor itself and turns its trail into strokes. A stroke that comes back round
// to itself "snaps shut" round something (that's what you meant); a line that stops without closing fades. Nothing
// here depends on Nova's see-through layer receiving mouse events, so it works whatever window is in front.
// Pure: points in, pen events out (bauer.ts feeds it the cursor and sends the events to the layer).

export type Pt = { x: number; y: number }
export type PenEvent = { ev: 'start'; x: number; y: number } | { ev: 'pt'; x: number; y: number } | { ev: 'snap'; from: number } | { ev: 'drop' } | { ev: 'fade'; after: number }
export type Rect = { x: number; y: number; width: number; height: number }

const CLOSE_PX = 18 // back within this of an earlier point: the loop is closed
const MIN_LOOP_PX = 160 // a loop must be at least this long (a wobble, or the mouse settling as you start, isn't a circle)
const MIN_SIDE = 26 // and at least this big each way
const REST_MS = 700 // a line that stops this long without closing is dropped (it fades)
const MOVE_PX = 2 // smaller moves are jitter

const dist = (a: Pt, b: Pt): number => Math.hypot(a.x - b.x, a.y - b.y)
const boxOf = (pts: Pt[]): Rect => {
  let x0 = Infinity
  let y0 = Infinity
  let x1 = -Infinity
  let y1 = -Infinity
  for (const p of pts) {
    x0 = Math.min(x0, p.x)
    y0 = Math.min(y0, p.y)
    x1 = Math.max(x1, p.x)
    y1 = Math.max(y1, p.y)
  }
  return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 }
}

export class PenTrail {
  private cur: Pt[] | null = null
  private last: Pt | null = null
  private still = 0
  /** Loops that snapped shut, and every stroke drawn (for an underline when nothing was circled). */
  loops: Rect[] = []
  strokes: Pt[][] = []

  /** The cursor now (global points), dt ms since the last call. Returns what to draw. */
  feed(p: Pt, dt: number): PenEvent[] {
    const out: PenEvent[] = []
    if (this.last && dist(p, this.last) < MOVE_PX) {
      this.still += dt
      if (this.cur && this.still >= REST_MS) {
        out.push({ ev: 'drop' })
        this.cur = null
      }
      return out
    }
    this.still = 0
    this.last = p
    if (!this.cur) {
      this.cur = [p]
      this.strokes.push(this.cur)
      out.push({ ev: 'start', x: p.x, y: p.y })
      return out
    }
    this.cur.push(p)
    out.push({ ev: 'pt', x: p.x, y: p.y })
    // Back round to an earlier point of this stroke: closed, if the loop from there is big enough.
    const pts = this.cur
    const n = pts.length - 1
    for (let i = 0; i < n - 6; i++) {
      if (dist(p, pts[i]) > CLOSE_PX) continue
      let len = 0
      for (let j = i + 1; j <= n; j++) len += dist(pts[j - 1], pts[j])
      if (len < MIN_LOOP_PX) continue
      const box = boxOf(pts.slice(i))
      if (box.width < MIN_SIDE || box.height < MIN_SIDE) continue
      this.loops.push(box)
      out.push({ ev: 'snap', from: i })
      this.cur = null
      break
    }
    return out
  }

  /** The keys were let go: everything fades. The area meant (global points): the circled loops, else what was drawn
   *  (an underline or an arrow), else null. */
  end(): { events: PenEvent[]; area: Rect | null } {
    this.cur = null
    const events: PenEvent[] = [{ ev: 'fade', after: 0.9 }]
    if (this.loops.length) return { events, area: union(this.loops) }
    const drawn = this.strokes.filter((s) => s.length > 3)
    if (!drawn.length) return { events, area: null }
    const b = boxOf(drawn.flat())
    if (b.width + b.height < 30) return { events, area: null }
    // An underline: the area above it too (the words it's under).
    const pad = 24
    return { events, area: { x: b.x - pad, y: b.y - Math.max(pad, 40), width: b.width + pad * 2, height: b.height + Math.max(pad, 40) + pad } }
  }
}

function union(rs: Rect[]): Rect {
  const x0 = Math.min(...rs.map((r) => r.x))
  const y0 = Math.min(...rs.map((r) => r.y))
  const x1 = Math.max(...rs.map((r) => r.x + r.width))
  const y1 = Math.max(...rs.map((r) => r.y + r.height))
  return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 }
}
