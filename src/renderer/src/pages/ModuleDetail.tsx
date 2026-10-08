import { useState } from 'react'
import type { Module } from '@shared/types'
import { AutoNumber, AutoText } from '@/components/AutoField'
import { Board } from '@/components/Board'
import { newNote } from './Notes'
import { SharedBanner, ShareButton } from '@/components/ShareButton'
import { ColorPicker, Icon } from '@/components/ui'
import { api, db, useLive } from '@/lib/data'
import { navigate } from '@/lib/nav'
import { AssessmentsTab } from './module/AssessmentsTab'
import { WeeksTab } from './module/WeeksTab'

/** Notes linked to this module, newest first. */
function ModuleNotes({ moduleId }: { moduleId: string }): React.JSX.Element {
  const { data } = useLive(
    ['notes', 'weeks'],
    async () => {
      const [notes, weeks] = await Promise.all([api.list('notes', { module_id: moduleId }, 'updated_at'), api.list('weeks', { module_id: moduleId })])
      return notes.reverse().map((n) => ({ note: n, week: weeks.find((w) => w.id === n.week_id) }))
    },
    [moduleId]
  )
  return (
    <div className="flex flex-col gap-3">
      <div>
        <button className="btn" onClick={() => void newNote({ mode: 'study', module_id: moduleId })}>
          <Icon name="plus" /> New note
        </button>
      </div>
      {data?.length === 0 && <div className="card p-8 text-center text-muted">No notes for this module yet. Each week also has a “Notes” button.</div>}
      <div className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-3">
        {data?.map(({ note, week }) => (
          <button key={note.id} className="card p-4 text-left hover:shadow-md" onClick={() => navigate({ name: 'notes', id: note.id })}>
            <div className="truncate font-medium">{note.title}</div>
            <div className="mt-0.5 text-xs text-muted">{week ? `Week ${week.number}${week.title ? ` · ${week.title}` : ''}` : 'Whole module'}</div>
            <div className="mt-2 line-clamp-3 text-xs text-muted">{note.plain_text || 'Empty note'}</div>
          </button>
        ))}
      </div>
    </div>
  )
}

export function ModuleDetailPage({ id, tab: initialTab }: { id: string; tab?: 'weeks' | 'assessments' | 'tasks' | 'notes' }): React.JSX.Element {
  const [tab, setTab] = useState(initialTab ?? 'weeks')
  const [showColors, setShowColors] = useState(false)
  const { data: module } = useLive(['modules'], () => api.get('modules', id), [id])

  if (module === undefined) return <div />
  if (module === null) {
    return (
      <div className="p-8 text-muted">
        This module was deleted.{' '}
        <button className="text-accent underline" onClick={() => navigate({ name: 'modules' })}>
          Back to modules
        </button>
      </div>
    )
  }

  const save = (patch: Partial<Module>): Promise<unknown> => db.update('modules', id, patch)

  const remove = async (): Promise<void> => {
    if (!confirm(`Delete "${module.name}" with all its weeks, materials and assessments?`)) return
    await db.remove('modules', id)
    navigate({ name: 'modules' })
  }

  return (
    <div className="mx-auto max-w-5xl p-8">
      <button className="btn-ghost mb-3 -ml-2" onClick={() => navigate({ name: 'modules' })}>
        <Icon name="back" /> Modules
      </button>

      <div className="mb-3">
        <SharedBanner ownerId={module.owner_id} kind="module" resourceId={module.id} />
      </div>
      {/* Header: everything here autosaves */}
      <div className="card mb-6 overflow-hidden">
        <div className="h-2" style={{ background: module.color }} />
        <div className="flex flex-col gap-3 p-5">
          <div className="flex items-start gap-3">
            <div className="relative">
              <button
                className="mt-2 h-6 w-6 rounded-full border border-line"
                style={{ background: module.color }}
                title="Change colour"
                onClick={() => setShowColors((s) => !s)}
              />
              {showColors && (
                <div className="card absolute top-10 left-0 z-10 w-60 p-3 shadow-lg">
                  <ColorPicker
                    value={module.color}
                    onChange={(c) => {
                      void save({ color: c })
                      setShowColors(false)
                    }}
                  />
                </div>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <AutoText
                value={module.code}
                onSave={(v) => save({ code: v })}
                placeholder="Module code (e.g. CS101)"
                className="field text-xs font-medium tracking-wide text-muted uppercase"
              />
              <AutoText
                value={module.name}
                onSave={(v) => save({ name: v || 'Untitled module' })}
                placeholder="Module name"
                className="field text-2xl font-semibold tracking-tight"
              />
            </div>
            <ShareButton type="module" id={module.id} ownerId={module.owner_id} />
            <button className="btn-ghost" onClick={() => save({ archived: module.archived ? 0 : 1 })}>
              {module.archived ? 'Unarchive' : 'Archive'}
            </button>
            <button className="btn-ghost hover:text-danger" onClick={remove} title="Delete module">
              <Icon name="trash" />
            </button>
          </div>
          <div className="grid grid-cols-3 gap-4 pl-9 text-sm">
            <label className="flex flex-col gap-1">
              <span className="text-xs text-muted">Term</span>
              <AutoText value={module.term} onSave={(v) => save({ term: v })} placeholder="e.g. Autumn 2026" className="field-boxed" />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs text-muted">Credits</span>
              <AutoNumber value={module.credits} onSave={(v) => save({ credits: v })} placeholder="e.g. 15" className="field-boxed" min={0} />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs text-muted">Target grade (%)</span>
              <AutoNumber
                value={module.target_grade}
                onSave={(v) => save({ target_grade: v })}
                placeholder="e.g. 70"
                className="field-boxed"
                min={0}
                max={100}
              />
            </label>
          </div>
        </div>
      </div>

      <div className="mb-4 flex gap-1 border-b border-line">
        {(
          [
            ['weeks', 'Weeks & materials'],
            ['assessments', 'Assessments'],
            ['tasks', 'Tasks'],
            ['notes', 'Notes']
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`-mb-px border-b-2 px-3 py-2 text-sm ${
              tab === key ? 'border-accent font-medium text-ink' : 'border-transparent text-muted hover:text-ink'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'weeks' && <WeeksTab moduleId={id} />}
      {tab === 'assessments' && <AssessmentsTab module={module} />}
      {tab === 'tasks' && <Board filter={{ module_id: id }} />}
      {tab === 'notes' && <ModuleNotes moduleId={id} />}
    </div>
  )
}
