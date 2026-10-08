// Friends: invite-only (no search, no public profiles), who's studying now,
// opt-in leaderboard, and what friends shared with you.

import { useEffect, useState } from 'react'
import type { Friend } from '@shared/cloud'
import { Icon } from '@/components/ui'
import { api, notifyChanged, track, useLive } from '@/lib/data'
import { copy, timeAgo, useCloud } from '@/lib/cloud'
import { navigate } from '@/lib/nav'
import { useProfile } from '@/lib/profile'

export function SignInFirst({ what }: { what: string }): React.JSX.Element {
  return (
    <div className="mx-auto max-w-md p-10 text-center">
      <div className="mb-2 text-4xl">👋</div>
      <h1 className="mb-1 text-lg font-semibold">Sign in to use {what}</h1>
      <p className="mb-4 text-sm text-muted">Friends and Servers need a (free, invite-only) account. Everything else works without one.</p>
      <button className="btn-primary" onClick={() => navigate({ name: 'settings' })}>
        Go to Settings → Account
      </button>
    </div>
  )
}

const STATUS: Record<Friend['status'], { label: string; dot: string }> = {
  focusing: { label: 'Focusing', dot: 'bg-danger' },
  break: { label: 'On a break', dot: 'bg-ok' },
  online: { label: 'Online', dot: 'bg-ok' },
  offline: { label: 'Offline', dot: 'bg-line' }
}

export function FriendsPage(): React.JSX.Element {
  const c = useCloud()
  if (!c) return <div />
  if (!c.signedIn) return <SignInFirst what="Friends" />
  return (
    <div className="mx-auto grid max-w-5xl grid-cols-[1fr_320px] gap-5 p-8">
      <div className="flex flex-col gap-5">
        <h1 className="text-2xl font-semibold tracking-tight">Friends</h1>
        <FriendList />
        <SharedWithMe />
      </div>
      <div className="flex flex-col gap-5">
        <InviteCard />
        <Leaderboard />
      </div>
    </div>
  )
}

function FriendList(): React.JSX.Element {
  const { data, reload } = useLive(['cloud:friendships', 'cloud:presence'], () => api.cloud.friends(), [])
  // Presence goes stale on its own after 3 minutes; refresh the view now and then.
  useEffect(() => {
    const t = setInterval(reload, 60_000)
    return () => clearInterval(t)
  }, [reload])
  const studying = data?.filter((f) => f.status === 'focusing') ?? []
  return (
    <>
      {studying.length > 0 && (
        <section className="card p-4">
          <h2 className="mb-2 text-sm font-semibold">🔥 Studying now</h2>
          <div className="flex flex-wrap gap-2">
            {studying.map((f) => (
              <span key={f.user_id} className="rounded-full bg-danger/10 px-3 py-1 text-sm text-danger">
                {f.display_name}
                {f.focus_ends_at && ` · ${Math.max(0, Math.round((Date.parse(f.focus_ends_at) - Date.now()) / 60000))} min left`}
              </span>
            ))}
          </div>
        </section>
      )}
      <section className="card divide-y divide-line">
        {data?.length === 0 && <div className="p-6 text-center text-sm text-muted">No friends yet. Send someone an invite link →</div>}
        {data?.map((f) => (
          <div key={f.user_id} className="group flex items-center gap-3 px-4 py-3">
            <span className="relative flex h-9 w-9 items-center justify-center rounded-full bg-accent-soft font-semibold text-accent">
              {f.display_name.slice(0, 1).toUpperCase()}
              <span className={`absolute -right-0.5 -bottom-0.5 h-3 w-3 rounded-full border-2 border-panel ${STATUS[f.status].dot}`} />
            </span>
            <div className="min-w-0 flex-1">
              <div className="font-medium">{f.display_name}</div>
              <div className="text-xs text-muted">
                @{f.username} · {STATUS[f.status].label}
                {f.status === 'offline' && f.last_seen && ` · seen ${timeAgo(f.last_seen)}`}
              </div>
            </div>
            <button
              className="btn-ghost opacity-0 group-hover:opacity-100 hover:text-danger"
              onClick={() => confirm(`Remove ${f.display_name} as a friend? Anything you shared with each other stops being shared.`) && void api.cloud.removeFriend(f.user_id).then(reload)}
            >
              Remove
            </button>
          </div>
        ))}
      </section>
    </>
  )
}

function InviteCard(): React.JSX.Element {
  const [invite, setInvite] = useState<{ code: string; link: string } | null>(null)
  const [uses, setUses] = useState(1)
  const [code, setCode] = useState('')
  const [msg, setMsg] = useState('')
  const make = async (): Promise<void> => setInvite(await track(api.cloud.createInvite({ kind: 'friend', maxUses: uses, expiresDays: 7 })))
  const redeem = async (): Promise<void> => {
    setMsg('')
    try {
      await api.cloud.redeem(code)
      setMsg('✓ You are now friends')
      setCode('')
      notifyChanged('cloud:friendships')
    } catch (e) {
      setMsg(String(e instanceof Error ? e.message : e).replace(/^Error invoking remote method '[^']+': (Error: )?/, ''))
    }
  }
  return (
    <section className="card flex flex-col gap-3 p-4">
      <h2 className="text-sm font-semibold">Invite a friend</h2>
      <p className="text-xs text-muted">
        Friends join by invite only. The link signs them up (if they're new) and makes you friends. It expires in 7 days.
      </p>
      <div className="flex items-center gap-2 text-sm">
        <span className="text-muted">Can be used</span>
        <select className="field-boxed w-auto" value={uses} onChange={(e) => setUses(Number(e.target.value))}>
          {[1, 3, 5, 10].map((n) => (
            <option key={n} value={n}>
              {n === 1 ? 'once' : `${n} times`}
            </option>
          ))}
        </select>
        <button className="btn-primary ml-auto" onClick={() => void make()}>
          Create
        </button>
      </div>
      {invite && (
        <div className="flex flex-col gap-1.5 rounded-lg bg-canvas p-3">
          <div className="text-xs text-muted">Send them this (both work):</div>
          <div className="flex items-center gap-2">
            <code className="flex-1 truncate text-xs">{invite.link}</code>
            <button className="btn-ghost px-1.5" title="Copy link" onClick={() => void copy(invite.link)}>
              Copy
            </button>
          </div>
          <div className="flex items-center gap-2">
            <code className="flex-1 text-lg font-semibold tracking-widest">{invite.code}</code>
            <button className="btn-ghost px-1.5" title="Copy code" onClick={() => void copy(invite.code)}>
              Copy
            </button>
          </div>
          <div className="text-[11px] text-muted">
            The link opens Studyhall directly once they've installed it. Some chat apps don't make studyhall:// links clickable — then they paste the code.
          </div>
        </div>
      )}
      <div className="mt-1 border-t border-line pt-3">
        <div className="mb-1.5 text-xs text-muted">Got a code from a friend?</div>
        <div className="flex gap-2">
          <input className="field-boxed font-mono uppercase" placeholder="CODE" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} />
          <button className="btn" disabled={code.length < 6} onClick={() => void redeem()}>
            Add
          </button>
        </div>
        {msg && <div className={`mt-1 text-xs ${msg.startsWith('✓') ? 'text-ok' : 'text-danger'}`}>{msg}</div>}
      </div>
    </section>
  )
}

function Leaderboard(): React.JSX.Element {
  const profile = useProfile()
  const since = (() => {
    const d = new Date()
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7)) // Monday
    d.setHours(0, 0, 0, 0)
    return d.toISOString()
  })()
  const optedIn = !!profile?.leaderboard_opt_in
  const { data } = useLive(['cloud:presence', 'focus_sessions', 'profiles'], () => (optedIn ? api.cloud.leaderboard(since) : Promise.resolve([])), [optedIn, since])
  const toggle = async (on: boolean): Promise<void> => {
    await track(api.profile.update({ leaderboard_opt_in: on ? 1 : 0 }))
    notifyChanged('profiles')
    await api.cloud.syncNow()
    notifyChanged('profiles')
  }
  return (
    <section className="card p-4">
      <h2 className="mb-1 text-sm font-semibold">This week's study hours</h2>
      <label className="mb-3 flex items-start gap-2 text-xs text-muted">
        <input type="checkbox" className="mt-0.5" checked={optedIn} onChange={(e) => void toggle(e.target.checked)} />
        Show my total to friends who also opt in. Only weekly totals are shared, never individual sessions. Off by default.
      </label>
      {optedIn && (
        <ol className="flex flex-col gap-1.5 text-sm">
          {data?.map((r, i) => (
            <li key={r.user_id} className={`flex items-center gap-2 ${r.is_me ? 'font-semibold' : ''}`}>
              <span className="w-5 text-right text-muted">{i + 1}.</span>
              <span className="flex-1 truncate">
                {r.display_name}
                {r.is_me && ' (you)'}
              </span>
              <span className="tabular-nums">
                {Math.floor(r.minutes / 60)}h {r.minutes % 60}m
              </span>
            </li>
          ))}
          {data?.length === 1 && <li className="text-xs text-muted">Friends appear here once they opt in too.</li>}
        </ol>
      )}
    </section>
  )
}

function SharedWithMe(): React.JSX.Element | null {
  const { data } = useLive(['cloud:shares'], () => api.cloud.sharedWithMe(), [])
  if (!data?.length) return null
  return (
    <section className="card p-4">
      <h2 className="mb-2 text-sm font-semibold">Shared with you</h2>
      <ul className="flex flex-col gap-1.5 text-sm">
        {data.map((s) => (
          <li key={s.id}>
            <button
              className="flex w-full items-center gap-2 rounded-md px-1.5 py-1 text-left hover:bg-canvas"
              onClick={() => navigate(s.resource_type === 'module' ? { name: 'module', id: s.resource_id } : { name: 'notes', id: s.resource_id })}
            >
              <Icon name={s.resource_type === 'module' ? 'modules' : 'note'} className="text-muted" />
              <span className="flex-1">
                A {s.resource_type} from {s.owner_name}
              </span>
              <span className="text-xs text-muted">{s.permission === 'edit' ? 'can edit' : 'view only'}</span>
            </button>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-[11px] text-muted">Shared modules also appear in Modules; shared notes in Notes. They update when your friend edits them.</p>
    </section>
  )
}
