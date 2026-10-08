// Work mode: clients, each with its projects and tasks.

import { useState } from 'react'
import type { Client } from '@shared/types'
import { AutoText } from '@/components/AutoField'
import { Board } from '@/components/Board'
import { ColorPicker, Icon, PALETTE } from '@/components/ui'
import { api, db, useLive } from '@/lib/data'
import { navigate } from '@/lib/nav'
import { progressOf, ProgressBar } from './Projects'

export function ClientsPage(): React.JSX.Element {
  const { data } = useLive(
    ['clients', 'projects', 'tasks'],
    async () => {
      const [clients, projects, tasks] = await Promise.all([
        api.list('clients', { archived: 0 }, 'name'),
        api.list('projects', { mode: 'work' }),
        api.list('tasks', { mode: 'work' })
      ])
      return { clients, projects, tasks }
    },
    []
  )
  const add = async (): Promise<void> => {
    const c = await db.create('clients', { name: 'New client', color: PALETTE[(data?.clients.length ?? 0) % PALETTE.length] })
    navigate({ name: 'client', id: c.id })
  }
  return (
    <div className="mx-auto max-w-5xl p-8">
      <div className="mb-6 flex items-center">
        <h1 className="flex-1 text-2xl font-semibold tracking-tight">Clients</h1>
        <button className="btn-primary" onClick={() => void add()}>
          <Icon name="plus" /> New client
        </button>
      </div>
      {data?.clients.length === 0 && (
        <div className="card p-10 text-center text-muted">Add the people or companies you work for, then link projects and tasks to them.</div>
      )}
      <div className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-4">
        {data?.clients.map((c) => {
          const open = data.tasks.filter((t) => t.client_id === c.id && t.status !== 'done' && !t.parent_task_id).length
          const projects = data.projects.filter((p) => p.client_id === c.id && p.status !== 'done').length
          return (
            <button key={c.id} className="card overflow-hidden text-left hover:shadow-md" onClick={() => navigate({ name: 'client', id: c.id })}>
              <div className="h-1.5" style={{ background: c.color }} />
              <div className="p-4">
                <div className="truncate font-semibold">{c.name}</div>
                <div className="mt-2 flex gap-4 text-xs text-muted">
                  <span>{projects} active projects</span>
                  <span>{open} open tasks</span>
                </div>
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}

export function ClientDetailPage({ id }: { id: string }): React.JSX.Element {
  const [showColors, setShowColors] = useState(false)
  const { data } = useLive(
    ['clients', 'projects', 'tasks'],
    async () => {
      const client = await api.get('clients', id)
      if (!client) return null
      const [projects, tasks] = await Promise.all([api.list('projects', { client_id: id }, 'sort'), api.list('tasks', { mode: 'work' })])
      return { client, projects, tasks }
    },
    [id]
  )
  if (data === undefined) return <div />
  if (data === null) return <div className="p-8 text-muted">This client was deleted.</div>
  const { client: c, projects, tasks } = data
  const save = (patch: Partial<Client>): Promise<unknown> => db.update('clients', id, patch)

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-5 p-8">
      <button className="btn-ghost -mb-2 -ml-2 self-start" onClick={() => navigate({ name: 'clients' })}>
        <Icon name="back" /> Clients
      </button>
      <div className="card p-5">
        <div className="flex items-start gap-3">
          <div className="relative">
            <button className="mt-2 h-6 w-6 rounded-full border border-line" style={{ background: c.color }} onClick={() => setShowColors((s) => !s)} />
            {showColors && (
              <div className="card absolute top-10 left-0 z-10 w-60 p-3 shadow-lg">
                <ColorPicker
                  value={c.color}
                  onChange={(col) => {
                    void save({ color: col })
                    setShowColors(false)
                  }}
                />
              </div>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <AutoText value={c.name} onSave={(v) => save({ name: v || 'Client' })} className="field text-2xl font-semibold tracking-tight" />
            <AutoText multiline rows={2} value={c.notes} onSave={(v) => save({ notes: v })} placeholder="Contact details, notes…" className="field resize-none text-sm text-muted" />
          </div>
          <button className="btn-ghost" onClick={() => void save({ archived: 1 }).then(() => navigate({ name: 'clients' }))}>
            Archive
          </button>
          <button
            className="btn-ghost hover:text-danger"
            onClick={() => confirm(`Delete "${c.name}"? Its projects and tasks are kept.`) && void db.remove('clients', id).then(() => navigate({ name: 'clients' }))}
          >
            <Icon name="trash" />
          </button>
        </div>
      </div>

      {projects.length > 0 && (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-3">
          {projects.map((p) => {
            const prog = progressOf(p.id, tasks)
            return (
              <button key={p.id} className="card p-3 text-left hover:shadow-md" onClick={() => navigate({ name: 'project', id: p.id })}>
                <div className="mb-2 truncate text-sm font-medium">{p.title}</div>
                <ProgressBar pct={prog.pct} color={p.color} />
              </button>
            )
          })}
        </div>
      )}
      <Board filter={{ client_id: id }} />
    </div>
  )
}
