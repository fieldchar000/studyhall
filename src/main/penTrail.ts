// The pen (hold Ctrl+Alt while talking, or Ctrl+Alt+B to mark and then type): Studyhall follows the cursor itself and
// turns it into strokes, the way Roamies' Windows pen helper does (its ink.rs), so it never depends on Nova's
// see-through layer receiving mouse events. A stroke is drawn while the left mouse button is held, so the mouse can
// move between marks without drawing; a stroke that comes back round to itself "snaps shut" (a circle). Every stroke
// you draw is kept until the marks are sent or cancelled; undo takes the last one away.
// Pure: points and button changes in, pen events out (bauer.ts feeds it and sends the events to the layer).

export type Pt = { x: number; y: number }
export type PenEvent =
  | { ev: 'start'; x: number; y: number }
  | { ev: 'pt'; x: number; y: number }
  | { ev: 'snap'; from: number }
  | { ev: 'drop' }
  | { ev: 'undo' }
  | { ev: 'fade'; after: number }
export type Rect = { x: number; y: number; width: number; height: number }

const CLOSE_PX = 18 // back within this of an earlier point: the loop is closed
const MIN_LOOP_PX = 160 // a loop must be at least this long (a wobble isn't a circle)
const MIN_SIDE = 26 // and at least this big each way
const MOVE_PX = 2 // smaller moves are jitter

const dist = (a: Pt, b: Pt): number => Math.hypot(a.x - b.x, a.y - b.y)
export const boxOf = (pts: Pt[]): Rect => {
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
  private down = false
  /** Every stroke drawn, in order (a closed one ends where it closed). */
  strokes: Pt[][] = []

  /** The left button went down (start drawing) or up (that stroke ends, and stays). */
  button(down: boolean, p: Pt): PenEvent[] {
    this.down = down
    if (down) {
      this.cur = [p]
      this.last = p
      this.strokes.push(this.cur)
      return [{ ev: 'start', x: p.x, y: p.y }]
    }
    this.cur = null
    return []
  }

  /** The cursor now (global points). Draws only while the button is held. */
  feed(p: Pt): PenEvent[] {
    if (!this.down || !this.cur) {
      this.last = p
      return []
    }
    if (this.last && dist(p, this.last) < MOVE_PX) return []
    this.last = p
    this.cur.push(p)
    const out: PenEvent[] = [{ ev: 'pt', x: p.x, y: p.y }]
    // Back round to an earlier point of this stroke: it's a circle, if the loop from there is big enough.
    const pts = this.cur
    const n = pts.length - 1
    for (let i = 0; i < n - 6; i++) {
      if (dist(p, pts[i]) > CLOSE_PX) continue
      let len = 0
      for (let j = i + 1; j <= n; j++) len += dist(pts[j - 1], pts[j])
      if (len < MIN_LOOP_PX) continue
      const box = boxOf(pts.slice(i))
      if (box.width < MIN_SIDE || box.height < MIN_SIDE) continue
      // The loop is the stroke (what came before it, the run-up, goes); the button may still be down, but this
      // stroke is finished.
      this.strokes[this.strokes.length - 1] = pts.slice(i)
      out.push({ ev: 'snap', from: i })
      this.cur = null
      this.down = false
      break
    }
    return out
  }

  /** Take the last mark away. */
  undo(): PenEvent[] {
    if (!this.strokes.length) return []
    this.strokes.pop()
    this.cur = null
    return [{ ev: 'undo' }]
  }

  /** The strokes that count (not a stray tap of a single point). */
  marks(): Pt[][] {
    return this.strokes.filter((s) => s.length > 1)
  }

  /** The area the marks are about (global points), with room around them (and above an underline, for the words
   *  it's under); null when nothing was drawn. */
  area(): Rect | null {
    const ms = this.marks()
    if (!ms.length) return null
    const b = boxOf(ms.flat())
    const pad = 24
    const flat = b.height < 30 // an underline or a line: the words are above it
    return { x: b.x - pad, y: b.y - pad - (flat ? 40 : 0), width: b.width + pad * 2, height: b.height + pad * 2 + (flat ? 40 : 0) }
  }

  /** The pen goes away: the marks fade. */
  end(): { events: PenEvent[]; area: Rect | null; strokes: Pt[][] } {
    this.cur = null
    this.down = false
    return { events: [{ ev: 'fade', after: 0.9 }], area: this.area(), strokes: this.marks() }
  }
}
