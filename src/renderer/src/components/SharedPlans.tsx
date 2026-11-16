// Partner → Plans: share the plans board with your partner's Studyhall account, so you both
// see and edit the same list of date ideas and plans (each of you shares yours; the board
// shows both).

import { useEffect, useState } from 'react'
import type { Friend, ShareRow } from '@shared/cloud'
import { api } from '@/lib/data'
import { useCloud } from '@/lib/cloud'
import { navigate } from '@/lib/nav'
import { Icon } from './ui'

export interface BoardSharing {
  myId: string | null
  incoming: ShareRow[] // partners who share their board with me
  outgoing: ShareRow[] // who I share mine with
}

/** Who shares a plans board with whom (empty when signed out). */
export function useBoardSharing(): [BoardSharing, () => void] {
  const cloud = useCloud()
  const [state, setState] = useState<BoardSharing>({ myId: null, incoming: [], outgoing: [] })
  const [tick, setTick] = useState(0)
  const uid = cloud?.signedIn ? cloud.userId : null
  useEffect(() => {
    if (!uid) {
      setState({ myId: null, incoming: [], outgoing: [] })
      return
    }
    let live = true
    void Promise.all([api.cloud.sharedWithMe().catch(() => []), api.cloud.sharesFor('plans', uid).catch(() => [])]).then(([inc, out]) => {
      if (live) setState({ myId: uid, incoming: inc.filter((r) => r.resource_type === 'plans'), outgoing: out })
    })
    const off = api.cloud.onEvent((t) => t === 'shares' && setTick((n) => n + 1))
    return () => {
      live = false
      off()
    }
  }, [uid, tick])
  return [state, () => setTick((n) => n + 1)]
}

export function SharedBoardCard({ sharing, refresh, partnerName }: { sharing: BoardSharing; refresh: () => void; partnerName: string }): React.JSX.Element {
  const cloud = useCloud()
  const [friends, setFriends] = useState<Friend[] | null>(null)
  const [pick, setPick] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  useEffect(() => {
    if (cloud?.signedIn) void api.cloud.friends().then(setFriends).catch(() => setFriends([]))
  }, [cloud?.signedIn])

  if (!cloud?.configured) return <></>
  if (!cloud.signedIn)
    return (
      <div className="card flex items-center gap-3 p-4 text-sm">
        <Icon name="users" />
        <span className="flex-1">Plan together: sign in, add {partnerName} as a friend, and you can both see and edit this board.</span>
        <button className="btn" onClick={() => navigate({ name: 'settings' })}>
          Sign in
        </button>
      </div>
    )

  const sharedWith = sharing.outgoing
  const from = sharing.incoming
  const notBack = from.filter((r) => !sharedWith.some((o) => o.shared_with === r.owner_id))
  const share = async (userId: string): Promise<void> => {
    setBusy(true)
    setErr('')
    try {
      await api.cloud.share('plans', sharing.myId!, userId, 'edit')
      refresh()
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="card flex flex-col gap-2 p-4 text-sm">
      <div className="flex items-center gap-2">
        <Icon name="users" />
        <h3 className="flex-1 font-medium">Planning together</h3>
      </div>
      {notBack.map((r) => (
        <div key={r.id} className="flex flex-wrap items-center gap-2 rounded-lg bg-accent-soft px-3 py-2">
          <span className="flex-1">💛 {r.owner_name ?? 'Your partner'} shared their plans with you. Share yours back so you both see everything.</span>
          <button className="btn-primary" disabled={busy} onClick={() => void share(r.owner_id)}>
            Share mine back
          </button>
        </div>
      ))}
      {sharedWith.length > 0 ? (
        <ul className="flex flex-col gap-1">
          {sharedWith.map((s) => (
            <li key={s.id} className="flex items-center gap-2">
              <span className="text-ok">✓</span>
              <span className="flex-1">
                Shared with <strong>{s.with_name ?? 'your partner'}</strong> — they can add dates and tick plans off.
                {from.some((r) => r.owner_id === s.shared_with) ? ' They share theirs with you too.' : ' Waiting for them to share theirs back.'}
              </span>
              <button
                className="btn-ghost text-xs text-muted hover:text-danger"
                onClick={() =>
                  void api.cloud
                    .unshare(s.id)
                    .then(refresh)
                    .catch((e: unknown) => setErr(String(e)))
                }
              >
                Stop sharing
              </button>
            </li>
          ))}
        </ul>
      ) : friends && friends.length === 0 ? (
        <p className="text-muted">
          Add {partnerName} as a friend first (Friends → invite link), then share this board with them.{' '}
          <button className="text-accent underline" onClick={() => navigate({ name: 'friends' })}>
            Open Friends
          </button>
        </p>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-muted">Share this board with</span>
          <select className="field-boxed w-auto" value={pick} onChange={(e) => setPick(e.target.value)}>
            <option value="">choose a friend…</option>
            {(friends ?? []).map((f) => (
              <option key={f.user_id} value={f.user_id}>
                {f.display_name || f.username}
              </option>
            ))}
          </select>
          <button className="btn" disabled={!pick || busy} onClick={() => void share(pick)}>
            Share
          </button>
        </div>
      )}
      {err && <p className="text-xs text-danger">{err}</p>}
    </div>
  )
}
