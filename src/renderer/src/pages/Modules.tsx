import { useState } from 'react'
import type { Assessment, Module } from '@shared/types'
import { Icon, PALETTE } from '@/components/ui'
import { api, db, useLive } from '@/lib/data'
import { fmtPct, summarize } from '@/lib/grades'
import { navigate } from '@/lib/nav'
import { useProfile } from '@/lib/profile'

interface ModuleCardData {
  module: Module
  weeks: number
  notes: number
  worksheets: number
  average: number | null
  next: Assessment | null
}

const daysTo = (iso: string): number => Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000)

export function ModulesPage(): React.JSX.Element {
  const profile = useProfile()
  const [showArchived, setShowArchived] = useState(false)

  // Load modules plus a few counts for each card.
  const { data } = useLive(
    ['modules', 'weeks', 'materials', 'assessments', 'notes'],
    async (): Promise<ModuleCardData[]> => {
      const [modules, weeks, materials, assessments, notes] = await Promise.all([
        api.list('modules', {}, 'sort'),
        api.list('weeks'),
        api.list('materials'),
        api.list('assessments'),
        api.list('notes', { mode: 'study' })
      ])
      const now = new Date().toISOString()
      return modules.map((m) => {
        const files = [...materials.filter((x) => x.module_id === m.id), ...notes.filter((x) => x.module_id === m.id)]
        const mine = assessments.filter((a) => a.module_id === m.id)
        return {
          module: m,
          weeks: weeks.filter((w) => w.module_id === m.id).length,
          notes: files.filter((f) => f.category !== 'worksheet').length,
          worksheets: files.filter((f) => f.category === 'worksheet').length,
          average: summarize(mine, m.target_grade).average,
          next: mine.filter((a) => a.due_at && a.due_at > now).sort((a, b) => a.due_at!.localeCompare(b.due_at!))[0] ?? null
        }
      })
    },
    []
  )

  const visible = data?.filter((d) => showArchived || !d.module.archived) ?? []
  const archivedCount = data?.filter((d) => d.module.archived).length ?? 0

  const addModule = async (): Promise<void> => {
    const count = data?.length ?? 0
    const m = await db.create('modules', {
      name: 'New module',
      color: PALETTE[count % PALETTE.length],
      sort: count
    })
    navigate({ name: 'module', id: m.id })
  }

  return (
    <div className="mx-auto max-w-6xl px-8 py-7">
      <header className="mb-6 flex flex-wrap items-end gap-3">
        <div className="mr-auto">
          <div className="label-caps">Study</div>
          <h1 className="text-3xl">Modules</h1>
          <p className="mt-0.5 text-sm text-muted">Each course with its weeks, notes, worksheets and assessments.</p>
        </div>
        {archivedCount > 0 && (
          <label className="flex items-center gap-1.5 text-sm text-muted">
            <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
            Show archived ({archivedCount})
          </label>
        )}
        <button className="btn" onClick={() => navigate({ name: 'materials' })}>
          <Icon name="materials" /> Materials
        </button>
        <button className="btn-primary" onClick={addModule}>
          <Icon name="plus" /> New module
        </button>
      </header>

      {data && visible.length === 0 && (
        <div className="card flex flex-col items-center gap-3 p-10 text-center">
          <Icon name="modules" size={36} className="text-brass" />
          <h2 className="text-xl">Add your first module</h2>
          <p className="max-w-md text-sm text-muted">Create one for each course you’re taking — then add weeks, drop in notes and worksheets, and track assessments.</p>
          <button className="btn-primary" onClick={addModule}>
            New module
          </button>
        </div>
      )}

      <div className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-4">
        {visible.map(({ module: m, weeks, notes, worksheets, average, next }) => (
          <button key={m.id} onClick={() => navigate({ name: 'module', id: m.id })} className={`card flex flex-col overflow-hidden text-left ${m.archived ? 'opacity-60' : ''}`}>
            <div className="h-1" style={{ background: m.color }} />
            <div className="flex flex-1 flex-col p-5">
              <div className="flex items-center gap-2">
                <span className="label-caps">{m.code || 'No code'}</span>
                {profile && m.owner_id !== profile.id && <span className="chip">Shared with you</span>}
              </div>
              <div className="font-display mt-1 line-clamp-2 text-[21px] leading-tight font-semibold">{m.name}</div>
              <div className="mt-4 grid grid-cols-4 gap-2 border-t border-line/70 pt-3 text-center">
                {(
                  [
                    [weeks, 'weeks'],
                    [notes, 'notes'],
                    [worksheets, 'sheets'],
                    [fmtPct(average, 0), 'avg']
                  ] as [number | string, string][]
                ).map(([v, l]) => (
                  <div key={l}>
                    <div className="font-display text-lg leading-none font-semibold tabular-nums">{v}</div>
                    <div className="mt-0.5 text-[10px] tracking-wide text-muted uppercase">{l}</div>
                  </div>
                ))}
              </div>
              {next && (
                <div className="mt-3 flex items-center gap-1.5 rounded-md bg-canvas/70 px-2 py-1.5 text-xs">
                  <Icon name="flag" size={13} className="text-brass" />
                  <span className="min-w-0 flex-1 truncate">{next.title}</span>
                  <span className="text-muted">{daysTo(next.due_at!) <= 0 ? 'today' : `in ${daysTo(next.due_at!)}d`}</span>
                </div>
              )}
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}
