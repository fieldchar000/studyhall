import { useState } from 'react'
import type { Module } from '@shared/types'
import { Icon, PALETTE } from '@/components/ui'
import { api, db, useLive } from '@/lib/data'
import { fmtPct, summarize } from '@/lib/grades'
import { navigate } from '@/lib/nav'
import { useProfile } from '@/lib/profile'

interface ModuleCardData {
  module: Module
  weeks: number
  materials: number
  average: number | null
}

export function ModulesPage(): React.JSX.Element {
  const profile = useProfile()
  const [showArchived, setShowArchived] = useState(false)

  // Load modules plus a few counts for each card.
  const { data } = useLive(
    ['modules', 'weeks', 'materials', 'assessments'],
    async (): Promise<ModuleCardData[]> => {
      const [modules, weeks, materials, assessments] = await Promise.all([
        api.list('modules', {}, 'sort'),
        api.list('weeks'),
        api.list('materials'),
        api.list('assessments')
      ])
      return modules.map((m) => ({
        module: m,
        weeks: weeks.filter((w) => w.module_id === m.id).length,
        materials: materials.filter((x) => x.module_id === m.id).length,
        average: summarize(
          assessments.filter((a) => a.module_id === m.id),
          m.target_grade
        ).average
      }))
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
    <div className="mx-auto max-w-5xl p-8">
      <div className="mb-6 flex items-center gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Modules</h1>
        <div className="flex-1" />
        {archivedCount > 0 && (
          <label className="flex items-center gap-1.5 text-sm text-muted">
            <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
            Show archived ({archivedCount})
          </label>
        )}
        <button className="btn-primary" onClick={addModule}>
          <Icon name="plus" /> New module
        </button>
      </div>

      {data && visible.length === 0 && (
        <div className="card p-10 text-center text-muted">
          No modules yet. Create one for each course you're taking — then add weeks, materials and assessments.
        </div>
      )}

      <div className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-4">
        {visible.map(({ module: m, weeks, materials, average }) => (
          <button
            key={m.id}
            onClick={() => navigate({ name: 'module', id: m.id })}
            className={`card overflow-hidden text-left transition-shadow hover:shadow-md ${m.archived ? 'opacity-60' : ''}`}
          >
            <div className="h-1.5" style={{ background: m.color }} />
            <div className="p-4">
              <div className="flex items-center gap-2 text-xs font-medium tracking-wide text-muted uppercase">
                {m.code || 'No code'}
                {profile && m.owner_id !== profile.id && <span className="rounded bg-accent-soft px-1.5 py-0.5 text-[10px] text-accent normal-case">Shared with you</span>}
              </div>
              <div className="mt-0.5 truncate text-base font-semibold">{m.name}</div>
              <div className="mt-3 flex gap-4 text-xs text-muted">
                <span>{weeks} weeks</span>
                <span>{materials} files</span>
                <span>Avg {fmtPct(average, 0)}</span>
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}
