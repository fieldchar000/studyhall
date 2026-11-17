// The Brain: everything you've saved as stars in four galaxies. Scroll up from Home and they fold
// into a see-through brain. Ask it things in plain words; hover a star to see what it is, click to
// look, double-click to open. Lives at the top of Home (pages/Home.tsx), sharing its sky.

import { useCallback, useEffect, useMemo, useState } from 'react'
import type { Material } from '@shared/types'
import { KIND_LABEL, type BNode, type Brain } from '@/lib/brain'
import { ask, EXAMPLES, type Answer } from '@/lib/brainAsk'
import { CAT_INFO, type Cat, type GalaxyScene } from '@/lib/galaxy/scene'
import { examGaps, fadingStars, hiddenLinks } from '@/lib/galaxy/stars'
import { navigate } from '@/lib/nav'
import { setMode, useMode } from '@/lib/profile'
import { openTask } from '@/lib/tasks'
import { MaterialViewer, openMaterial } from '@/components/MaterialViewer'
import { Icon } from '@/components/ui'

type Fn = 'fading' | 'gaps' | 'links' | 'time' | null

const FNS: { id: Exclude<Fn, null>; label: string; icon: string }[] = [
  { id: 'fading', label: 'Fading stars', icon: 'star' },
  { id: 'gaps', label: 'Exam gaps', icon: 'target' },
  { id: 'links', label: 'Hidden links', icon: 'link' },
  { id: 'time', label: 'Time-lapse', icon: 'focus' }
]

export function BrainSection({
  brain,
  scene,
  catCounts,
  reading,
  onRebuild,
  initialQ,
  active,
  onGoHome
}: {
  brain: Brain | null
  scene: GalaxyScene | null
  catCounts: Record<Cat, number>
  reading: { done: number; total: number } | null
  onRebuild: () => void
  initialQ?: string
  active: boolean
  onGoHome: () => void
}): React.JSX.Element {
  const [query, setQuery] = useState(initialQ ?? '')
  const [answer, setAnswer] = useState<Answer | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [fn, setFn] = useState<Fn>(null)
  const [spread, setSpread] = useState(false)
  const [timeT, setTimeT] = useState(1)
  const [playing, setPlaying] = useState(false)
  const [viewing, setViewing] = useState<Material | null>(null)
  const mode = useMode()

  useEffect(() => {
    if (initialQ != null) setQuery(initialQ)
  }, [initialQ])

  // Answer as you type (a moment after you stop).
  useEffect(() => {
    if (!brain) return
    const t = setTimeout(() => setAnswer(query.trim() ? ask(brain, query) : null), 220)
    return () => clearTimeout(t)
  }, [query, brain])

  const open = useCallback(
    (n: BNode) => {
      const o = n.open
      if (!o) return
      if ('material' in o) openMaterial(o.material, setViewing)
      else if ('task' in o) openTask(o.task)
      else {
        navigate(o.route)
        if (o.mode && o.mode !== mode) void setMode(o.mode)
      }
    },
    [mode]
  )

  const fading = useMemo(() => (brain && fn === 'fading' ? fadingStars(brain) : []), [brain, fn])
  const gaps = useMemo(() => (brain && fn === 'gaps' ? examGaps(brain) : []), [brain, fn])
  const hidden = useMemo(() => (brain && fn === 'links' ? hiddenLinks(brain) : []), [brain, fn])
  const examples = useMemo(() => (brain ? EXAMPLES(brain) : []), [brain])

  // What lights up in the sky
  const hi = useMemo(() => {
    const s = new Set<string>()
    answer?.focus.forEach((id) => s.add(id))
    if (fn === 'fading') fading.forEach((n) => s.add(n.id))
    if (fn === 'gaps')
      gaps.forEach((g) => {
        s.add(g.exam.id)
        s.add(g.module.id)
        g.weeks.forEach((w) => s.add(w.id))
      })
    if (fn === 'links')
      hidden.forEach((h) => {
        s.add(h.a.id)
        s.add(h.b.id)
      })
    if (selected && brain) {
      s.add(selected)
      brain.adj.get(selected)?.forEach((id) => s.add(id))
    }
    return s
  }, [answer, fn, fading, gaps, hidden, selected, brain])

  const formed = !spread || !!query.trim() || !!selected || fn === 'fading' || fn === 'gaps' || fn === 'links'
  useEffect(() => {
    scene?.set({ hi: hi.size ? hi : null, focus: selected, brain: formed, timeT: fn === 'time' ? timeT : 1, dashed: fn === 'links' ? hidden.map((h) => [h.a.id, h.b.id]) : [] })
  }, [scene, hi, selected, formed, fn, timeT, hidden])

  useEffect(() => {
    if (!scene || !brain) return
    scene.onSelect = (id) => setSelected(id)
    scene.onOpen = (id) => {
      const n = brain.nodes.get(id)
      if (n) open(n)
    }
  }, [scene, brain, open])

  // Time-lapse playback
  useEffect(() => {
    if (!playing) return
    const t = setInterval(() => setTimeT((x) => (x >= 1 ? (setPlaying(false), 1) : Math.min(1, x + 0.008))), 50)
    return () => clearInterval(t)
  }, [playing])

  const pickFn = (f: Exclude<Fn, null>): void => {
    const next = fn === f ? null : f
    setFn(next)
    setSelected(null)
    if (next === 'time') {
      setTimeT(0)
      setPlaying(true)
    } else setPlaying(false)
  }

  // Escape clears everything
  useEffect(() => {
    if (!active) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape' && !document.querySelector('[data-modal]')) {
        setQuery('')
        setSelected(null)
        setFn(null)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [active])

  const sel = selected && brain ? (brain.nodes.get(selected) ?? null) : null
  const week = Math.max(1, Math.round(timeT * 12))

  return (
    <div className="relative flex h-full flex-col items-center px-4 pt-5">
      <div className="flex w-full max-w-2xl flex-col items-center gap-3 text-center">
        <div className="label-caps text-muted">Your second brain</div>
        <h2 className="font-display text-3xl leading-tight font-semibold">{formed ? 'Your galaxies formed a brain' : 'Four galaxies, one brain'}</h2>
        <label data-ui className="relative w-full">
          <Icon name="search" size={17} className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-muted" />
          <input
            id="brain-q"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setFn(null)
              setSelected(null)
            }}
            placeholder="Search or ask: “what does Alex like?”, “when is my exam?”, “elasticity”"
            className="space-search w-full py-3 pr-4 pl-11 text-[15px]"
          />
        </label>
        <div data-ui className="flex flex-wrap justify-center gap-2">
          {FNS.map((f) => (
            <button key={f.id} className={`space-chip ${fn === f.id ? 'on' : ''}`} onClick={() => pickFn(f.id)}>
              <Icon name={f.icon as never} size={14} /> {f.label}
            </button>
          ))}
          <button className="space-chip border-dashed" onClick={() => (formed ? (setSpread(true), setQuery(''), setFn(null), setSelected(null)) : setSpread(false))}>
            {formed ? 'Spread into galaxies' : 'Form the brain'}
          </button>
        </div>
      </div>

      {/* Left: answer, or the chosen view */}
      <div data-ui className="pointer-events-none absolute top-56 left-4 flex max-h-[calc(100%-18rem)] w-[360px] max-w-[calc(100%-2rem)] flex-col gap-3 max-lg:top-auto max-lg:bottom-16 max-lg:max-h-[38%]">
        {answer && answer.title && (
          <Card>
            <div className="flex items-start gap-2 border-b border-line px-4 pt-3 pb-2.5">
              <div className="min-w-0 flex-1">
                <div className="label-caps">Brain says</div>
                <div className="font-display text-lg leading-snug font-semibold">{answer.title}</div>
              </div>
              <button className="btn-ghost px-1.5" onClick={() => setQuery('')} title="Clear">
                <Icon name="x" size={14} />
              </button>
            </div>
            <div className="min-h-0 overflow-auto px-2 py-2">
              {answer.lines.length === 0 ? (
                <p className="px-2 py-1.5 text-sm text-muted">{answer.empty ?? 'Nothing found.'}</p>
              ) : (
                answer.lines.map((l, i) => (
                  <button
                    key={i}
                    disabled={!l.node}
                    onClick={() => l.node && setSelected(l.node)}
                    className={`flex w-full flex-col items-start rounded-md px-2 py-1.5 text-left ${l.node ? 'hover:bg-line/40' : ''} ${selected && l.node === selected ? 'bg-accent-soft' : ''}`}
                  >
                    <span className="text-[13.5px] leading-snug">{l.text}</span>
                    {l.sub && <span className="mt-0.5 text-[11px] text-muted">{l.sub}</span>}
                  </button>
                ))
              )}
              {answer.hint && <p className="px-2 pt-1 text-[11px] text-muted">{answer.hint}</p>}
            </div>
          </Card>
        )}
        {!query && fn === 'fading' && (
          <Card title="Fading stars" heading={fading.length ? `${fading.length} things you haven’t looked at in a while` : 'Nothing is fading'}>
            {fading.map((n) => (
              <Row key={n.id} node={n} right={n.date ? ago(n.date) : ''} onClick={() => setSelected(n.id)} />
            ))}
            {fading.length > 0 && (
              <button className="btn-primary mx-2 mt-2 mb-1 justify-center" onClick={() => navigate({ name: 'recall' })}>
                Quiz me on them
              </button>
            )}
          </Card>
        )}
        {!query && fn === 'gaps' && (
          <Card title="Exam gaps" heading={gaps.length ? 'Weeks with nothing saved before your next exams' : 'No gaps before your next exams'}>
            {gaps.length === 0 && <p className="px-2 pb-2 text-[12.5px] text-muted">Every week of a module with an exam in the next 45 days has notes or files. Nice.</p>}
            {gaps.map((g) => (
              <div key={g.exam.id} className="px-2 pb-2">
                <button className="text-left text-[13px] font-semibold hover:text-accent" onClick={() => setSelected(g.exam.id)}>
                  {g.exam.label} · in {g.daysLeft} day{g.daysLeft === 1 ? '' : 's'}
                </button>
                <div className="text-[11px] text-muted">{g.module.label}</div>
                <div className="mt-1 flex flex-wrap gap-1">
                  {g.weeks.map((w) => (
                    <button key={w.id} className="rounded-full border border-dashed border-line px-2 py-0.5 text-[11.5px] hover:bg-line/40" onClick={() => open(w)} title={w.sub}>
                      {w.label}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </Card>
        )}
        {!query && fn === 'links' && (
          <Card title="Hidden links" heading={hidden.length ? 'Things that belong together' : 'No hidden links yet'}>
            {hidden.length === 0 && <p className="px-2 pb-2 text-[12.5px] text-muted">When two notes or files share ideas but aren’t linked, they show up here.</p>}
            {hidden.map((h) => (
              <div key={h.a.id + h.b.id} className="mx-2 mb-2 rounded-lg border border-line px-3 py-2">
                <button className="block text-left text-[13px] font-semibold hover:text-accent" onClick={() => setSelected(h.a.id)}>
                  {h.a.label}
                </button>
                <button className="block text-left text-[13px] font-semibold hover:text-accent" onClick={() => setSelected(h.b.id)}>
                  ↔ {h.b.label}
                </button>
                <div className="mt-0.5 text-[11px] text-muted">both cover {h.via.slice(0, 3).join(', ')}</div>
              </div>
            ))}
          </Card>
        )}
        {!query && fn === 'time' && (
          <Card title="Time-lapse" heading={timeT >= 1 ? 'Everything, up to today' : `Growing… ${Math.round(timeT * 100)}%`}>
            <div className="px-2 pb-2">
              <input type="range" min={0} max={100} value={Math.round(timeT * 100)} onChange={(e) => (setPlaying(false), setTimeT(Number(e.target.value) / 100))} className="w-full" aria-label="How far through" />
              <div className="mt-1 flex items-center justify-between text-[11px] text-muted">
                <span>Your first things</span>
                <span>Step {week} of 12</span>
                <span>Today</span>
              </div>
              <button className="btn-primary mt-2 w-full justify-center" onClick={() => (timeT >= 1 && setTimeT(0), setPlaying((p) => !p))}>
                {playing ? 'Pause' : 'Play'}
              </button>
            </div>
          </Card>
        )}
        {!query && !fn && !sel && brain && (
          <Card title="Try asking">
            <div className="flex flex-wrap gap-1.5 px-2 pb-1">
              {examples.map((e) => (
                <button key={e} className="space-chip text-[12px]" onClick={() => setQuery(e)}>
                  {e}
                </button>
              ))}
            </div>
            <p className="px-2 pt-2 pb-1 text-[11.5px] leading-relaxed text-muted">
              Each part of the brain holds one kind of thing. Drag sideways to turn it. To link things on purpose, type <span className="font-mono text-ink">[[Name]]</span> in any note.
            </p>
          </Card>
        )}
      </div>

      {sel && brain && (
        <div data-ui>
          <NodePanel brain={brain} node={sel} onSelect={setSelected} onOpen={open} onClose={() => setSelected(null)} />
        </div>
      )}

      {/* Legend */}
      <div data-ui className="absolute bottom-4 left-4 flex flex-col gap-1 text-[12px] text-muted max-lg:hidden">
        {(Object.keys(CAT_INFO) as Cat[]).map((c) => (
          <div key={c} className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full" style={{ background: CAT_INFO[c].hex, boxShadow: `0 0 8px ${CAT_INFO[c].hex}` }} />
            {CAT_INFO[c].label} · {catCounts[c]}
          </div>
        ))}
        <div className="mt-1 flex items-center gap-2">
          {reading ? (
            <span>
              Reading your files… {reading.done}/{reading.total}
            </span>
          ) : null}
          <button className="btn-ghost -ml-2 px-1.5 text-[11px]" onClick={onRebuild} title="Rebuild with your latest changes">
            <Icon name="refresh" size={12} /> Refresh
          </button>
        </div>
      </div>

      <button data-ui className="space-chip absolute bottom-4 left-1/2 -translate-x-1/2" onClick={onGoHome}>
        <Icon name="chevron" size={14} className="rotate-90" /> Back to your week
      </button>
      {viewing && <MaterialViewer material={viewing} onClose={() => setViewing(null)} />}
    </div>
  )
}

const ago = (d: string): string => {
  const n = Math.round((Date.now() - Date.parse(d.length === 10 ? d + 'T00:00' : d)) / 86400000)
  return n < 1 ? 'today' : `${n}d`
}

function Card({ title, heading, children }: { title?: string; heading?: string; children: React.ReactNode }): React.JSX.Element {
  return (
    <div className="card pointer-events-auto flex min-h-0 flex-col overflow-hidden">
      {title && (
        <div className="px-4 pt-3 pb-2">
          <div className="label-caps">{title}</div>
          {heading && <div className="font-display text-lg leading-snug font-semibold">{heading}</div>}
        </div>
      )}
      <div className="min-h-0 overflow-auto px-2 pb-2">{children}</div>
    </div>
  )
}

function Row({ node, right, onClick }: { node: BNode; right?: string; onClick: () => void }): React.JSX.Element {
  return (
    <button onClick={onClick} className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] hover:bg-line/40">
      <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: node.color }} />
      <span className="min-w-0 flex-1 truncate">{node.label}</span>
      {right && <span className="shrink-0 text-[11px] text-muted tabular-nums">{right}</span>}
    </button>
  )
}

// ---------- The selected star ----------

function NodePanel({ brain, node, onSelect, onOpen, onClose }: { brain: Brain; node: BNode; onSelect: (id: string) => void; onOpen: (n: BNode) => void; onClose: () => void }): React.JSX.Element {
  const neighbours = [...(brain.adj.get(node.id) ?? [])].map((id) => brain.nodes.get(id)!).filter(Boolean)
  const groups = new Map<string, BNode[]>()
  for (const n of neighbours.sort((a, b) => b.degree - a.degree)) groups.set(KIND_LABEL[n.kind], [...(groups.get(KIND_LABEL[n.kind]) ?? []), n])
  const text = (brain.docText.get(node.id) ?? '').replace(/\s+/g, ' ').trim()
  // Why things are linked: the other notes and files that share this one's ideas, most telling first.
  const ideaIds = neighbours
    .filter((n) => n.kind === 'idea')
    .sort((a, b) => Number(b.label.includes(' ')) - Number(a.label.includes(' ')) || a.degree - b.degree)
    .map((n) => n.id)
  const shared = new Map<string, string[]>()
  if (node.kind !== 'idea') {
    for (const iid of ideaIds) {
      for (const other of brain.adj.get(iid) ?? []) {
        if (other === node.id || brain.nodes.get(other)?.kind === 'idea') continue
        shared.set(other, [...(shared.get(other) ?? []), brain.nodes.get(iid)!.label])
      }
    }
  }
  const related = [...shared]
    .filter(([, via]) => via.length >= 2)
    .sort((a, b) => b[1].length - a[1].length)
    .slice(0, 8)
  const ideaByLabel = new Map(neighbours.filter((n) => n.kind === 'idea').map((n) => [n.label.toLowerCase(), n.id]))
  const preview = node.kind === 'fact' ? '' : text.slice(node.label.length, node.label.length + 320).trim()
  return (
    <aside className="card absolute top-56 right-4 flex max-h-[calc(100%-16rem)] w-[320px] flex-col overflow-hidden max-lg:top-auto max-lg:bottom-16 max-lg:max-h-[45%]">
      <div className="flex items-start gap-2.5 border-b border-line px-4 pt-3 pb-3">
        <span className="mt-1.5 h-3 w-3 shrink-0 rounded-full" style={{ background: node.color }} />
        <div className="min-w-0 flex-1">
          <div className="label-caps">{KIND_LABEL[node.kind]}</div>
          <div className="font-display text-lg leading-snug font-semibold break-words">{node.label}</div>
          {node.sub && <div className="text-xs text-muted">{node.sub}</div>}
        </div>
        <button className="btn-ghost px-1.5" onClick={onClose} title="Close">
          <Icon name="x" size={14} />
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-auto px-4 py-3">
        {preview && <p className="mb-3 text-[12.5px] leading-relaxed text-muted">{preview}…</p>}
        {node.open && (
          <button className="btn-primary mb-3 w-full justify-center" onClick={() => onOpen(node)}>
            <Icon name="external" size={14} /> Open
          </button>
        )}
        {node.keys && node.keys.length > 0 && (
          <div className="mb-3">
            <div className="label-caps mb-1">Mostly about</div>
            <div className="flex flex-wrap gap-1">
              {node.keys.map((k) => {
                const id = ideaByLabel.get(k.toLowerCase())
                return (
                  <button
                    key={k}
                    disabled={!id}
                    onClick={() => id && onSelect(id)}
                    className={`rounded-full border border-line px-2 py-0.5 text-[11.5px] ${id ? 'hover:bg-line/40' : 'cursor-default text-muted'}`}
                    title={id ? 'Show everything about this' : 'Only in this one so far'}
                  >
                    {k}
                  </button>
                )
              })}
            </div>
          </div>
        )}
        {related.length > 0 && (
          <div className="mb-3">
            <div className="label-caps mb-1">Shares the most with</div>
            {related.map(([id, via]) => {
              const n = brain.nodes.get(id)!
              return (
                <button key={id} onClick={() => onSelect(id)} className="flex w-full flex-col rounded-md px-1.5 py-1 text-left hover:bg-line/40">
                  <span className="flex items-center gap-2 text-[13px]">
                    <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: n.color }} />
                    <span className="truncate">{n.label}</span>
                  </span>
                  <span className="truncate pl-4 text-[11px] text-muted">
                    both cover {via.slice(0, 3).join(', ')}
                    {via.length > 3 ? ` +${via.length - 3}` : ''}
                  </span>
                </button>
              )
            })}
          </div>
        )}
        {groups.size === 0 && <p className="text-sm text-muted">Not linked to anything yet. Mention it in a note, or type [[{node.label}]] somewhere.</p>}
        {[...groups].map(([label, list]) => (
          <div key={label} className="mb-3">
            <div className="label-caps mb-1">
              {label} · {list.length}
            </div>
            {list.slice(0, 14).map((n) => (
              <button key={n.id} onClick={() => onSelect(n.id)} className="flex w-full items-center gap-2 rounded-md px-1.5 py-1 text-left text-[13px] hover:bg-line/40">
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: n.color }} />
                <span className="truncate">{n.label}</span>
              </button>
            ))}
            {list.length > 14 && <div className="px-1.5 text-[11px] text-muted">+{list.length - 14} more</div>}
          </div>
        ))}
      </div>
    </aside>
  )
}
