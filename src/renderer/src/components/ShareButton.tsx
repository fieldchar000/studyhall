// Share a module (read-only) or a note (view or edit) with a friend.

import { useState } from 'react'
import { api, useLive } from '@/lib/data'
import { useCloud } from '@/lib/cloud'
import { Icon, Modal } from './ui'

const errText = (e: unknown): string => String(e instanceof Error ? e.message : e).replace(/^Error invoking remote method '[^']+': (Error: )?/, '')

export function ShareButton({ type, id, ownerId }: { type: 'module' | 'note'; id: string; ownerId: string }): React.JSX.Element | null {
  const c = useCloud()
  const [open, setOpen] = useState(false)
  if (!c?.signedIn || ownerId !== c.userId) return null
  return (
    <>
      <button className="btn-ghost" title={`Share this ${type} with a friend`} onClick={() => setOpen(true)}>
        <Icon name="clients" /> Share
      </button>
      {open && <ShareDialog type={type} id={id} onClose={() => setOpen(false)} />}
    </>
  )
}

function ShareDialog({ type, id, onClose }: { type: 'module' | 'note'; id: string; onClose: () => void }): React.JSX.Element {
  const { data: friends } = useLive([], () => api.cloud.friends(), [])
  const { data: shares, reload } = useLive(['cloud:shares'], () => api.cloud.sharesFor(type, id), [type, id])
  const [who, setWho] = useState('')
  const [perm, setPerm] = useState<'view' | 'edit'>('view')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const sharedIds = new Set(shares?.map((s) => s.shared_with))
  const available = friends?.filter((f) => !sharedIds.has(f.user_id)) ?? []

  const share = async (): Promise<void> => {
    setErr('')
    setBusy(true)
    try {
      await api.cloud.share(type, id, who, perm)
      setWho('')
      reload()
    } catch (e) {
      setErr(errText(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal title={`Share ${type}`} onClose={onClose}>
      <div className="flex flex-col gap-3 text-sm">
        <p className="text-muted">
          {type === 'module'
            ? 'Your friend gets a read-only copy of this module: its weeks, assessments, notes and any files you switched to “Sync file”. It updates as you edit.'
            : 'Your friend sees this note in their Notes. With “can edit” you can both change it (the latest edit wins).'}
        </p>
        {friends?.length === 0 ? (
          <div className="text-muted">You can only share with friends — invite someone from the Friends page first.</div>
        ) : (
          <div className="flex gap-2">
            <select className="field-boxed flex-1" value={who} onChange={(e) => setWho(e.target.value)}>
              <option value="">Choose a friend…</option>
              {available.map((f) => (
                <option key={f.user_id} value={f.user_id}>
                  {f.display_name} (@{f.username})
                </option>
              ))}
            </select>
            {type === 'note' && (
              <select className="field-boxed w-auto" value={perm} onChange={(e) => setPerm(e.target.value as 'view' | 'edit')}>
                <option value="view">can view</option>
                <option value="edit">can edit</option>
              </select>
            )}
            <button className="btn-primary" disabled={!who || busy} onClick={() => void share()}>
              {busy ? 'Sharing…' : 'Share'}
            </button>
          </div>
        )}
        {err && <div className="text-danger">{err}</div>}
        {!!shares?.length && (
          <div className="flex flex-col gap-1 border-t border-line pt-3">
            <div className="text-xs text-muted">Shared with</div>
            {shares.map((s) => (
              <div key={s.id} className="flex items-center gap-2">
                <span className="flex-1">{s.with_name}</span>
                <span className="text-xs text-muted">{s.permission === 'edit' ? 'can edit' : 'can view'}</span>
                <button className="btn-ghost px-1 text-xs hover:text-danger" onClick={() => void api.cloud.unshare(s.id).then(reload)}>
                  Stop sharing
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </Modal>
  )
}

/** "Shared by Alice · view only" banner for things that aren't yours. */
export function SharedBanner({ ownerId, kind, resourceId }: { ownerId: string; kind: 'module' | 'note'; resourceId?: string }): React.JSX.Element | null {
  const c = useCloud()
  const { data } = useLive(['cloud:shares'], () => (c?.signedIn ? api.cloud.sharedWithMe() : Promise.resolve([])), [c?.signedIn])
  if (!c?.signedIn || ownerId === c.userId) return null
  const s = data?.find((x) => x.resource_id === resourceId) ?? data?.find((x) => x.owner_id === ownerId)
  return (
    <div className="rounded-lg bg-accent-soft px-3 py-2 text-sm text-accent">
      Shared with you by <b>{s?.owner_name ?? 'a friend'}</b>
      {kind === 'module' || s?.permission !== 'edit' ? ' · view only — changes you make here won’t be saved' : ' · you can edit'}
    </div>
  )
}
