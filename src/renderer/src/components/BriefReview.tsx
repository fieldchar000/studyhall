// The "is this right?" list after a voice briefing: one row per change, each with a tick box.
// Titles can be retyped; nothing happens until the user presses Apply.

import { describe, editableText, withText, type BriefAction } from '@/lib/brief'

export function BriefReview({ actions, onChange, currency = '' }: { actions: BriefAction[]; onChange: (a: BriefAction[]) => void; currency?: string }): React.JSX.Element {
  const set = (key: string, next: BriefAction): void => onChange(actions.map((a) => (a.key === key ? next : a)))
  if (!actions.length) return <p className="py-3 text-sm text-muted">Nothing to change — try saying it another way, or edit the words above.</p>
  return (
    <ul className="flex flex-col gap-1.5">
      {actions.map((a) => {
        const d = describe(a, currency)
        const text = editableText(a)
        return (
          <li key={a.key} className={`flex items-start gap-2.5 rounded-lg border px-2.5 py-2 transition-colors ${a.on ? 'border-line bg-panel' : 'border-transparent bg-transparent opacity-60'}`}>
            <input type="checkbox" className="mt-1 size-4 shrink-0 accent-[var(--color-accent)]" checked={a.on} onChange={(e) => set(a.key, { ...a, on: e.target.checked })} aria-label={`${d.verb}: ${d.text}`} />
            <span className="mt-0.5 w-5 shrink-0 text-center text-base leading-5" aria-hidden>
              {d.icon}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline gap-2">
                <span className="label-caps shrink-0 text-[10px] text-muted">{d.verb}</span>
                {d.detail && <span className="truncate text-[11px] text-muted">{d.detail}</span>}
              </div>
              {text !== null ? (
                <input
                  className="w-full truncate rounded bg-transparent text-[14px] leading-6 outline-none focus:bg-canvas focus:px-1"
                  value={text}
                  onChange={(e) => set(a.key, withText(a, e.target.value))}
                  aria-label="Edit"
                />
              ) : (
                <div className="truncate text-[14px] leading-6">{d.text}</div>
              )}
              {a.warn && <div className="text-[11px] text-amber-500">{a.warn}</div>}
            </div>
          </li>
        )
      })}
    </ul>
  )
}
