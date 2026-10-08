// Hand-made 16×16 pixel sprites for Pixel Quest, drawn onto canvases.
// Each sprite is rows of palette keys; '.' is transparent.
//   k outline · s skin · e eye · h hair/hat · o outfit · O outfit shade · a accent
//   w metal/bone · W metal shade · b wood · g element colour · G element shade · x highlight
//   r red · y yellow

import { ELEMENTS, HERO, type EnemyKind, type HeroClass, type Element } from '@shared/game'

export type Sprite = string[]

export const HERO_SPRITES: Record<HeroClass, Sprite> = {
  knight: [
    '.......aa.......',
    '......kaak......',
    '.....kwwwwk.....',
    '....kwwwwwwk....',
    '...kwwwwwwwwk...',
    '...kwkkkkkkwk...',
    '...kwksseseck.k.',
    '...kwksssssk.kwk',
    '....kkkkkkkk.kwk',
    '..kkkkooooak.kwk',
    '.kwWWkoaaook.kwk',
    '.kwWWkoooosskkwk',
    '.kwWWkooOok.kbbk',
    '..kkk.kOkOk..kk.',
    '......kOkOk.....',
    '.....kkk.kkk....'
  ],
  archer: [
    '................',
    '.....kkkkkk.....',
    '....khhhhhhk....',
    '...khhhhhhhhk.k.',
    '...khhkkkkkhkkbk',
    '...khksssssk.kbk',
    '...khkssesek.kxb',
    '...khkssssskk.xb',
    '....kkkkkkkk..xb',
    '....kaooooak..xb',
    '...kooaaoookkkxb',
    '...ksooooooss.xb',
    '....kooOook..kbk',
    '....kOkkkOk..kb.',
    '....kOk.kOk..k..',
    '...kkk..kkk.....'
  ],
  mage: [
    '.......k........',
    '......khk.......',
    '......khhk....k.',
    '.....khhhk...kgk',
    '....khhhhhk.kgxgk',
    '...khhhhhhhk.kgk.',
    '..kaaaaaaaaak.b..',
    '...kssssssk...b..',
    '...ksssesek...b..',
    '....kssssk....b..',
    '...kooooook..sb..',
    '..kooaoooook.kb..',
    '..koooaooooskb...',
    '..koooooooook.b..',
    '..kOOOOOOOOk..b..',
    '...kkkkkkkk.......'
  ],
  rogue: [
    '................',
    '.....kkkkkk.....',
    '....khhhhhhk....',
    '...khhhhhhhhk...',
    '...khhhhhhhhhk..',
    '...khkkkkkkkhk..',
    '...kkssseseskk..',
    '...kaaaaaaaaak..',
    '....kaaaaaak....',
    '....kooooook..k.',
    '...koooaooook.kw',
    '..kskoooooksskwk',
    '...k.kooOok..kk.',
    '.....kOkkOk.....',
    '.....kOk.kOk....',
    '....kkk..kkk....'
  ],
  cleric: [
    '................',
    '.....kkkkkk..kk.',
    '....khhhhhhk.kyk',
    '...khhhhhhhhkkyk',
    '...khssssshhkkyk',
    '...khssesesk.kbk',
    '...khsssssk..kbk',
    '....kkssssk..kbk',
    '...kkaookkk..kbk',
    '..kooooaooook.bk',
    '..kooaaaoooossb.',
    '..kooooaoooook.b',
    '..koooooooook..b',
    '..kOOOOOOOOOk..b',
    '...kOOOOOOOk...b',
    '....kkkkkkk.....'
  ]
}

export const ENEMY_SPRITES: Record<EnemyKind, Sprite> = {
  slime: [
    '................',
    '................',
    '................',
    '................',
    '................',
    '......kkkk......',
    '....kkggggkk....',
    '...kgxxggggGk...',
    '..kgxggggggggk..',
    '..kggekggekggk..',
    '.kgggekggekgggk.',
    '.kggggggggggGGk.',
    '.kggggrrrrgGGGk.',
    '.kGGgggggggGGGk.',
    '..kGGGGGGGGGGk..',
    '...kkkkkkkkkk...'
  ],
  shroom: [
    '................',
    '................',
    '.....kkkkkk.....',
    '...kkgggxxgkk...',
    '..kgxxggggggGk..',
    '.kgggggxxgggGGk.',
    '.kgxxgggggxxgGk.',
    '.kGGgggggggGGGk.',
    '..kkkkkkkkkkkk..',
    '....kwwwwwwk....',
    '....kwekwekk....',
    '....kwwwwwwk....',
    '....kwwrrwwk....',
    '...kwwwwwwwwk...',
    '...kWWWWWWWWk...',
    '...kkkkkkkkkk...'
  ],
  crab: [
    '................',
    '................',
    '................',
    '..kk........kk..',
    '.kgxk......kgxk.',
    '.kggk.k..k.kggk.',
    '..kgk.e..e.kgk..',
    '..kgkkk..kkkgk..',
    '...kgggggggggk..',
    '..kggxxggggggGk.',
    '.kgggggggggggGGk',
    '.kGgggggggggGGGk',
    '..kGGGGGGGGGGGk.',
    '..kk.kk..kk.kk..',
    '.k...k....k...k.',
    '................'
  ],
  bat: [
    '................',
    '................',
    '................',
    '................',
    '..k..........k..',
    '.kgk..k..k..kgk.',
    '.kggk.kkkk.kggk.',
    'kgggGkggggkGgggk',
    'kgGGGgrggrgGGGgk',
    'kgk.kggggggk.kgk',
    '.k..kgwggwgk..k.',
    '.....kggggk.....',
    '......kkkk......',
    '................',
    '................',
    '................'
  ],
  imp: [
    '................',
    '..k.........k...',
    '.kyk.kkkkk.kyk..',
    '.kyykgggggkyyk..',
    '..kkgggggggkk...',
    '...kgykgykggk...',
    '...kgggggggGk...',
    '...kgkwwwkgGk...',
    '....kgggggGk....',
    '..kkgggggggGkk..',
    '.kgkggxgggGGkgk.',
    '.kk.kggggGGk.kk.',
    '....kggkkgGk....',
    '....kgk..kGk..k.',
    '...kkk..kkk..kgk',
    '..............k.'
  ],
  golem: [
    '................',
    '.....kkkkkk.....',
    '....kGggggGk....',
    '....kgykgykk....',
    '....kGggggGk....',
    '..kkkkkkkkkkkk..',
    '.kGgggxgggggGGk.',
    'kGgggggggggggGGk',
    'kggkgggggggkgggk',
    'kggkggxggggkGggk',
    'kGGkgggggggkGGGk',
    '.kk.kGGGGGGk.kk.',
    '....kggkkggk....',
    '...kGggk.kgGk...',
    '...kGGGk.kGGk...',
    '...kkkkk.kkkk...'
  ],
  wisp: [
    '................',
    '.......kk.......',
    '......kgxk......',
    '.....kgxxgk.....',
    '....kgxxxxgk....',
    '...kgxxxxxxgk...',
    '..kgxxexxexxgk..',
    '..kgxxexxexxgk..',
    '..kggxxxxxxggk..',
    '...kggxxxxggk...',
    '....kggxxggk....',
    '.....kggggk.....',
    '......kGGk......',
    '.......kk.......',
    '.......g........',
    '........g.......'
  ],
  skeleton: [
    '................',
    '.....kkkkkk.....',
    '....kwwwwwwk....',
    '...kwwwwwwwwk...',
    '...kwkkwwkkwk...',
    '...kwkgwwkgwk...',
    '...kwwwkkwwwk...',
    '....kwkwkwkk....',
    '.....kkkkkk.....',
    '...kkwkwwkwkk...',
    '..kwk.kwwk.kwk..',
    '..kwkkwkkwkkwk..',
    '...k.kwwwwk.k...',
    '.....kwkkwk.....',
    '.....kwk.kwk....',
    '....kkk..kkk....'
  ],
  ghost: [
    '................',
    '.....kkkkkk.....',
    '....kxxxxxxk....',
    '...kxxxxxxxgk...',
    '..kxxkkxxkkxgk..',
    '..kxxkgxxkgxgk..',
    '..kxxxxxxxxxgk..',
    '..kxxxxkkxxxgk..',
    '..kxxxxkkxxggk..',
    '..kxxxxxxxxggk..',
    '..kgxxxxxxgGGk..',
    '..kggxxxxggGGk..',
    '..kGggggggGGGk..',
    '..kGkGGkGGkGk...',
    '..kk.kk.kk.kk...',
    '................'
  ]
}

/** Crown drawn over bosses. */
export const CROWN: Sprite = ['y.y.y', 'yyyyy', 'yryry']

const OUTLINE = '#1b1424'

export function heroPalette(id: string): Record<string, string> {
  const h = HERO[id]
  const el = ELEMENTS[h.el]
  return {
    k: OUTLINE,
    s: h.pal.s,
    e: '#1b1424',
    h: h.pal.h,
    o: h.pal.o,
    O: h.pal.O,
    a: h.pal.a,
    w: '#e5e7eb',
    W: '#9ca3af',
    b: '#8b5a2b',
    g: el.color,
    G: el.dark,
    x: '#ffffff',
    r: '#ef4444',
    y: '#fde047',
    c: h.pal.O
  }
}

export function enemyPalette(el: Element): Record<string, string> {
  const e = ELEMENTS[el]
  return {
    k: OUTLINE,
    g: e.color,
    G: e.dark,
    x: el === 'dark' ? '#ede9fe' : '#ffffff',
    e: '#1b1424',
    r: '#dc2626',
    y: '#fde047',
    w: '#f5f5f4',
    W: '#a8a29e'
  }
}

/** Draw a sprite at (x, y) in sprite pixels × scale. `flash` = solid white (hit), `shadow` = solid black (locked). */
export function drawSprite(
  ctx: CanvasRenderingContext2D,
  sprite: Sprite,
  pal: Record<string, string>,
  x: number,
  y: number,
  scale = 1,
  opts: { flip?: boolean; flash?: boolean; shadow?: string; alpha?: number } = {}
): void {
  const w = 16
  if (opts.alpha !== undefined) ctx.globalAlpha = opts.alpha
  for (let r = 0; r < sprite.length; r++) {
    const row = sprite[r]
    for (let c = 0; c < row.length; c++) {
      const key = row[c]
      if (key === '.' || key === ' ') continue
      const color = opts.shadow ?? (opts.flash ? '#ffffff' : pal[key])
      if (!color) continue
      ctx.fillStyle = color
      const cx = opts.flip ? w - 1 - c : c
      ctx.fillRect(Math.round(x + cx * scale), Math.round(y + r * scale), scale, scale)
    }
  }
  if (opts.alpha !== undefined) ctx.globalAlpha = 1
}

/** A small standalone canvas with one hero on it (for cards and lists). */
export function heroCanvas(canvas: HTMLCanvasElement, id: string, scale: number, locked = false): void {
  const h = HERO[id]
  canvas.width = 16 * scale
  canvas.height = 16 * scale
  const ctx = canvas.getContext('2d')!
  ctx.imageSmoothingEnabled = false
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  drawSprite(ctx, HERO_SPRITES[h.cls], heroPalette(id), 0, 0, scale, { shadow: locked ? '#0b0712' : undefined })
}

// ---------- Zone backgrounds ----------

export interface ZoneArt {
  sky: [string, string, string]
  far: string
  near: string
  grass: string
  dirt: string
  dirtDark: string
  deco: 'tree' | 'rock' | 'crystal' | 'torch' | 'stalactite'
  stars?: boolean
}

export const ZONE_ART: Record<Element, ZoneArt> = {
  leaf: { sky: ['#7dd3fc', '#a5e3fd', '#d6f3ff'], far: '#86c5a4', near: '#4f9d6f', grass: '#4ade80', dirt: '#8b5a2b', dirtDark: '#6b4423', deco: 'tree' },
  water: { sky: ['#0b1d3a', '#12305a', '#1c4a7a'], far: '#173a63', near: '#0f2a4a', grass: '#22d3ee', dirt: '#334155', dirtDark: '#1e293b', deco: 'stalactite' },
  fire: { sky: ['#451a03', '#9a3412', '#f97316'], far: '#7c2d12', near: '#431407', grass: '#fb923c', dirt: '#44403c', dirtDark: '#292524', deco: 'rock' },
  light: { sky: ['#c4b5fd', '#ddd6fe', '#fef3c7'], far: '#a5b4fc', near: '#818cf8', grass: '#fde68a', dirt: '#e0e7ff', dirtDark: '#c7d2fe', deco: 'crystal' },
  dark: { sky: ['#0f0a1f', '#1e1336', '#2e1f4f'], far: '#2a1d47', near: '#1a1030', grass: '#8b5cf6', dirt: '#27272a', dirtDark: '#18181b', deco: 'torch', stars: true }
}
