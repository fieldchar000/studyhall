// Inbox: everything captured with the global shortcut, waiting to become a task or note.

import { useState } from 'react'
import type { InboxItem } from '@shared/types'
import { AutoText } from '@/components/AutoField'
import { Icon } from '@/components/ui'
import { api, db, useLive } from '@/lib/data'
import { formatDateTime } from '@/lib/dates'
import { navigate } from '@/lib/nav'
import { useMode } from '@/lib/profile'
import { createTask, openTask } from '@/lib/tasks'

const SHORTCUT_LABEL: Record<string, string> = {
  'CommandOrControl+Shift+Space': 'Ctrl+Shift+Space',
  'CommandOrControl+Alt+Space': 'Ctrl+Alt+Space',
  'Alt+Shift+N': 'Alt+Shift+N'
}
export const shortcutLabel = (acc: string): string => SHORTCUT_LABEL[acc] ?? acc

export function InboxPage(): React.JSX.Element {
  const mode = useMode()
  const [text, setText] = useState('')
  const { data } = useLive(['inbox_items'], () => api.list('inbox_items', { processed_at: null }, 'created_at'), [])
  const { data: status } = useLive(['prefs'], () => api.capture.shortcutStatus(), [])
  const items = [...(data ?? [])].reverse() // newest first

  const done = (item: InboxItem, type: 'task' | 'note', id: string): Promise<unknown> =>
    db.update('inbox_items', item.id, { processed_at: new Date().toISOString(), converted_to_type: type, converted_to_id: id })

  const toTask = async (item: InboxItem): Promise<void> => {
    const t = await createTask(mode, { title: item.text.slice(0, 200), notes: item.text.length > 200 ? item.text : '' })
    await done(item, 'task', t.id)
    openTask(t.id)
  }
  const toNote = async (item: InboxItem): Promise<void> => {
    const doc = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: item.text }] }] }
    const n = await db.create('notes', {
      mode,
      kind: mode === 'work' ? 'meeting' : 'note',
      title: item.text.slice(0, 60),
      content: JSON.stringify(doc),
      plain_text: item.text
    })
    await done(item, 'note', n.id)
    navigate({ name: 'notes', id: n.id })
  }

  return (
    <div className="mx-auto max-w-3xl p-8">
      <h1 className="mb-1 text-2xl font-semibold tracking-tight">Inbox</h1>
      <p className="mb-5 text-sm text-muted">
        {status?.accelerator && status.registered ? (
          <>
            Press <kbd className="rounded border border-line bg-panel px-1.5 py-0.5 text-xs">{shortcutLabel(status.accelerator)}</kbd> anywhere in Windows to
            capture a thought without leaving what you're doing. Sort items into tasks or notes here.
          </>
        ) : status?.accelerator ? (
          <span className="text-danger">The quick-capture shortcut is being used by another app. Pick a different one in Settings.</span>
        ) : (
          'Quick capture shortcut is off (Settings). You can still add items here.'
        )}
      </p>
      <input
        className="field-boxed mb-5 text-base"
        placeholder="Capture something… (Enter)"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && text.trim()) {
            void db.create('inbox_items', { text: text.trim() })
            setText('')
          }
        }}
      />
      {data && items.length === 0 && <div className="card p-10 text-center text-muted">Inbox zero 🎉</div>}
      <ul className="flex flex-col gap-2">
        {items.map((item) => (
          <li key={item.id} className="card group flex items-start gap-3 p-3">
            <div className="min-w-0 flex-1">
              <AutoText multiline rows={1} value={item.text} onSave={(v) => db.update('inbox_items', item.id, { text: v || item.text })} className="field resize-none" />
              <div className="px-2 text-[11px] text-muted">{formatDateTime(item.created_at)}</div>
            </div>
            <button className="btn" onClick={() => void toTask(item)} title="Turn into a task">
              <Icon name="tasks" /> Task
            </button>
            <button className="btn" onClick={() => void toNote(item)} title="Turn into a note">
              <Icon name="note" /> Note
            </button>
            <button className="btn-ghost hover:text-danger" onClick={() => void db.remove('inbox_items', item.id)} title="Delete">
              <Icon name="trash" />
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
