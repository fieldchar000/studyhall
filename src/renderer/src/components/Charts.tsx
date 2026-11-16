// Small, dependency-free SVG charts (Trends, Weekly review). Thin 2px lines, a crosshair +
// tooltip on hover, a legend for 2+ series with direct end labels, recessive grid. Colours
// come from the validated --chart-* tokens in index.css.

import { useRef, useState } from 'react'

export interface Series {
  name: string
  color: string // CSS colour, e.g. 'var(--chart-1)'
  values: (number | null)[] // one per x label; null = no data (the line breaks)
  format?: (v: number) => string
  raw?: (number | null)[] // each day's own value, drawn as faint dots under a smoothed line
}

const W = 640

function useHover(n: number, padL: number, plotW: number): [number | null, (e: React.PointerEvent<SVGSVGElement>) => void, () => void, React.RefObject<SVGSVGElement | null>] {
  const ref = useRef<SVGSVGElement | null>(null)
  const [i, setI] = useState<number | null>(null)
  const move = (e: React.PointerEvent<SVGSVGElement>): void => {
    const box = ref.current?.getBoundingClientRect()
    if (!box || n === 0) return
    const x = ((e.clientX - box.left) / box.width) * W
    const step = n > 1 ? plotW / (n - 1) : 0
    setI(Math.max(0, Math.min(n - 1, step ? Math.round((x - padL) / step) : 0)))
  }
  return [i, move, () => setI(null), ref]
}

function Tooltip({ x, title, rows }: { x: number; title: string; rows: { color: string; name: string; value: string }[] }): React.JSX.Element {
  const left = `${(x / W) * 100}%`
  const flip = x > W * 0.62
  return (
    <div
      className="pointer-events-none absolute top-1 z-10 rounded-md border border-line bg-panel px-2.5 py-1.5 text-xs shadow-lg"
      style={flip ? { right: `calc(100% - ${left} + 10px)` } : { left: `calc(${left} + 10px)` }}
    >
      <div className="mb-0.5 font-medium">{title}</div>
      {rows.map((r) => (
        <div key={r.name} className="flex items-center gap-1.5">
          <span className="inline-block h-2 w-2 rounded-full" style={{ background: r.color }} />
          <span className="text-muted">{r.name}</span>
          <span className="ml-auto pl-3 tabular-nums">{r.value}</span>
        </div>
      ))}
    </div>
  )
}

/** Lines on one shared scale (never two y-axes). */
export function LineChart({ labels, series, min, max, ticks, height = 180, tooltipTitle }: { labels: string[]; series: Series[]; min: number; max: number; ticks: number[]; height?: number; tooltipTitle?: (i: number) => string }): React.JSX.Element {
  const padL = 26
  const padR = series.length > 1 ? 64 : 12
  const padT = 10
  const padB = 22
  const plotW = W - padL - padR
  const plotH = height - padT - padB
  const n = labels.length
  const x = (i: number): number => padL + (n > 1 ? (i * plotW) / (n - 1) : plotW / 2)
  const y = (v: number): number => padT + plotH - ((v - min) / (max - min)) * plotH
  const [hover, move, leave, ref] = useHover(n, padL, plotW)
  const path = (vals: (number | null)[]): string => {
    let d = ''
    let pen = false
    vals.forEach((v, i) => {
      if (v == null) {
        pen = false
        return
      }
      d += `${pen ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`
      pen = true
    })
    return d
  }
  const lastIdx = (vals: (number | null)[]): number => {
    for (let i = vals.length - 1; i >= 0; i--) if (vals[i] != null) return i
    return -1
  }
  const every = Math.max(1, Math.ceil(n / 6))
  return (
    <div className="relative">
      {series.length > 1 && (
        <div className="mb-1 flex flex-wrap gap-3 text-xs text-muted">
          {series.map((s) => (
            <span key={s.name} className="flex items-center gap-1.5">
              <span className="inline-block h-0.5 w-4 rounded" style={{ background: s.color }} />
              {s.name}
            </span>
          ))}
        </div>
      )}
      <svg ref={ref} viewBox={`0 0 ${W} ${height}`} className="w-full touch-none" role="img" aria-label={series.map((s) => s.name).join(' and ')} onPointerMove={move} onPointerLeave={leave}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={padL} x2={W - padR} y1={y(t)} y2={y(t)} stroke="var(--color-line)" strokeWidth={1} />
            <text x={padL - 6} y={y(t) + 3.5} textAnchor="end" fontSize={10} fill="var(--color-muted)">
              {t}
            </text>
          </g>
        ))}
        {labels.map((l, i) =>
          i % every === 0 || i === n - 1 ? (
            <text key={i} x={x(i)} y={height - 6} textAnchor={i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle'} fontSize={10} fill="var(--color-muted)">
              {l}
            </text>
          ) : null
        )}
        {series.map((s) => (
          <g key={s.name}>
            <path d={path(s.values)} fill="none" stroke={s.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
            {s.raw?.map((v, i) => (v != null ? <circle key={`r${i}`} cx={x(i)} cy={y(v)} r={2.5} fill={s.color} opacity={0.45} /> : null))}
            {/* single points (no neighbours) still show */}
            {s.values.map((v, i) => (v != null && s.values[i - 1] == null && s.values[i + 1] == null ? <circle key={i} cx={x(i)} cy={y(v)} r={2.5} fill={s.color} /> : null))}
            {series.length > 1 && lastIdx(s.values) >= 0 && (
              <text x={x(lastIdx(s.values)) + 6} y={y(s.values[lastIdx(s.values)]!) + 3.5} fontSize={10} fill="var(--color-ink)">
                {s.name}
              </text>
            )}
          </g>
        ))}
        {hover != null && (
          <g>
            <line x1={x(hover)} x2={x(hover)} y1={padT} y2={padT + plotH} stroke="var(--color-muted)" strokeWidth={1} strokeDasharray="3 3" />
            {series.map((s) => (s.values[hover] != null ? <circle key={s.name} cx={x(hover)} cy={y(s.values[hover]!)} r={4.5} fill={s.color} stroke="var(--color-panel)" strokeWidth={2} /> : null))}
          </g>
        )}
      </svg>
      {hover != null && (
        <Tooltip
          x={x(hover)}
          title={tooltipTitle ? tooltipTitle(hover) : labels[hover]}
          rows={series.map((s) => {
            const f = s.format ?? ((v: number) => v.toFixed(1))
            const day = s.raw ? s.raw[hover] : s.values[hover]
            const avg = s.raw && s.values[hover] != null ? ` (7-day ${s.values[hover]!.toFixed(1)})` : ''
            return { color: s.color, name: s.name, value: day == null ? (avg ? `—${avg}` : '—') : `${f(day)}${avg}` }
          })}
        />
      )}
    </div>
  )
}

/** One series of bars from zero (e.g. hours slept). */
export function BarChart({ labels, values, color, max, ticks, height = 140, format = (v) => String(v), name, tooltipTitle }: { labels: string[]; values: (number | null)[]; color: string; max: number; ticks: number[]; height?: number; format?: (v: number) => string; name: string; tooltipTitle?: (i: number) => string }): React.JSX.Element {
  const padL = 26
  const padR = 12
  const padT = 8
  const padB = 22
  const plotW = W - padL - padR
  const plotH = height - padT - padB
  const n = labels.length
  const slot = plotW / Math.max(1, n)
  const bw = Math.max(1.5, slot - 2) // 2px gap between bars
  const y = (v: number): number => padT + plotH - (v / max) * plotH
  const ref = useRef<SVGSVGElement | null>(null)
  const [hover, setHover] = useState<number | null>(null)
  const every = Math.max(1, Math.ceil(n / 6))
  return (
    <div className="relative">
      <svg
        ref={ref}
        viewBox={`0 0 ${W} ${height}`}
        className="w-full touch-none"
        role="img"
        aria-label={name}
        onPointerMove={(e) => {
          const box = ref.current?.getBoundingClientRect()
          if (!box) return
          const xx = ((e.clientX - box.left) / box.width) * W
          setHover(Math.max(0, Math.min(n - 1, Math.floor((xx - padL) / slot))))
        }}
        onPointerLeave={() => setHover(null)}
      >
        {ticks.map((t) => (
          <g key={t}>
            <line x1={padL} x2={W - padR} y1={y(t)} y2={y(t)} stroke="var(--color-line)" strokeWidth={1} />
            <text x={padL - 6} y={y(t) + 3.5} textAnchor="end" fontSize={10} fill="var(--color-muted)">
              {t}
            </text>
          </g>
        ))}
        {values.map((v, i) => {
          if (v == null || v <= 0) return null
          const h = Math.max(1, padT + plotH - y(Math.min(v, max)))
          const r = Math.min(4, bw / 2, h)
          const x0 = padL + i * slot + (slot - bw) / 2
          const top = padT + plotH - h
          // rounded top, square base on the baseline
          return (
            <path
              key={i}
              d={`M${x0},${padT + plotH}V${top + r}Q${x0},${top} ${x0 + r},${top}H${x0 + bw - r}Q${x0 + bw},${top} ${x0 + bw},${top + r}V${padT + plotH}Z`}
              fill={color}
              opacity={hover == null || hover === i ? 1 : 0.55}
            />
          )
        })}
        {labels.map((l, i) =>
          i % every === 0 || i === n - 1 ? (
            <text key={i} x={padL + i * slot + slot / 2} y={height - 6} textAnchor={i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle'} fontSize={10} fill="var(--color-muted)">
              {l}
            </text>
          ) : null
        )}
      </svg>
      {hover != null && (
        <Tooltip x={padL + hover * slot + slot / 2} title={tooltipTitle ? tooltipTitle(hover) : labels[hover]} rows={[{ color, name, value: values[hover] == null ? '—' : format(values[hover]!) }]} />
      )}
    </div>
  )
}

/** Rows × columns of cells shaded 0..1 on the one-hue ramp (e.g. habits × weeks). */
export function Heatmap({ rows, cols, value, title }: { rows: { id: string; label: string }[]; cols: string[]; value: (r: number, c: number) => { share: number; text: string }; title: (r: number, c: number) => string }): React.JSX.Element {
  const [hover, setHover] = useState<{ r: number; c: number } | null>(null)
  const shade = (s: number): string => (s <= 0 ? 'var(--color-line)' : `var(--chart-seq-${Math.min(5, Math.max(1, Math.ceil(s * 5)))})`)
  return (
    <div className="relative">
      <div className="grid items-center gap-y-1" style={{ gridTemplateColumns: `minmax(90px, 150px) repeat(${cols.length}, minmax(0, 1fr))` }}>
        {rows.map((row, r) => (
          <div key={row.id} className="contents">
            <div className="truncate pr-2 text-xs">{row.label}</div>
            {cols.map((_c, c) => {
              const v = value(r, c)
              return (
                <div key={c} className="px-px" onPointerEnter={() => setHover({ r, c })} onPointerLeave={() => setHover(null)}>
                  <div className={`h-5 rounded-[3px] ${hover?.r === r && hover.c === c ? 'ring-2 ring-ink/50' : ''}`} style={{ background: shade(v.share) }} />
                </div>
              )
            })}
          </div>
        ))}
        <div />
        {cols.map((c, i) => (
          <div key={i} className="truncate pt-1 text-center text-[10px] text-muted">
            {i % Math.max(1, Math.ceil(cols.length / 6)) === 0 ? c : ''}
          </div>
        ))}
      </div>
      <div className="mt-2 flex items-center justify-end gap-1 text-[10px] text-muted">
        Less
        {[0, 0.2, 0.4, 0.6, 0.8, 1].map((s) => (
          <span key={s} className="inline-block h-3 w-3 rounded-[2px]" style={{ background: shade(s) }} />
        ))}
        More
      </div>
      {hover && (
        <div className="pointer-events-none absolute top-0 right-0 rounded-md border border-line bg-panel px-2.5 py-1.5 text-xs shadow-lg">
          <div className="font-medium">{title(hover.r, hover.c)}</div>
          <div className="text-muted">{value(hover.r, hover.c).text}</div>
        </div>
      )}
    </div>
  )
}
