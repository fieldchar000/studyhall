// Settings → Account & sync: sign in / create account (invite code) / status / sign out.

import { useEffect, useState } from 'react'
import { api, notifyChanged, useLive } from '@/lib/data'
import { timeAgo, useCloud, usePendingInvite } from '@/lib/cloud'
import { navigate } from '@/lib/nav'
import { formatBytes } from '@/lib/dates'
import { Icon } from './ui'

export function AccountCard(): React.JSX.Element {
  const c = useCloud()
  if (!c) return <div className="card mb-4 h-40" />
  return <section className="card mb-4 p-5">{c.signedIn ? <SignedIn /> : <SignedOut />}</section>
}

function SignedOut(): React.JSX.Element {
  const [invite, clearInvite] = usePendingInvite()
  const [tab, setTab] = useState<'in' | 'up'>(invite ? 'up' : 'in')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [code, setCode] = useState(invite ?? '')
  const [inviteInfo, setInviteInfo] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (invite) {
      setTab('up')
      setCode(invite)
      clearInvite()
    }
  }, [invite]) // eslint-disable-line react-hooks/exhaustive-deps

  // Show who invited you as soon as a code is entered.
  useEffect(() => {
    if (code.trim().length < 6) return setInviteInfo(null)
    const t = setTimeout(() => {
      void api.cloud
        .checkInvite(code)
        .then((i) =>
          setInviteInfo(i.valid ? (i.kind === 'server' ? `Invite to the server “${i.server}”` : i.inviter ? `Invite from ${i.inviter}` : 'Valid invite') : '✗ Invalid or used-up code')
        )
        .catch(() => setInviteInfo(null))
    }, 400)
    return () => clearTimeout(t)
  }, [code])

  const submit = async (): Promise<void> => {
    setError('')
    setBusy(true)
    try {
      if (tab === 'in') await api.cloud.signIn(username, password)
      else await api.cloud.signUp({ username, password, displayName, inviteCode: code })
      notifyChanged('*')
    } catch (e) {
      setError(e instanceof Error ? e.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '') : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div>
        <h2 className="font-semibold">Account &amp; sync</h2>
        <p className="text-sm text-muted">
          Optional. Sign in to back up and sync across your PCs, and to use Friends and Servers. Everything keeps working offline either way.
        </p>
      </div>
      <div className="inline-flex gap-1 self-start rounded-lg bg-line/50 p-1">
        {(
          [
            ['in', 'Sign in'],
            ['up', 'Create account']
          ] as const
        ).map(([k, label]) => (
          <button key={k} onClick={() => setTab(k)} className={`rounded-md px-4 py-1 text-sm ${tab === k ? 'bg-panel font-medium shadow-sm' : 'text-muted'}`}>
            {label}
          </button>
        ))}
      </div>
      <form
        className="grid max-w-md gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          void submit()
        }}
      >
        {tab === 'up' && (
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-xs text-muted">Invite code (from a friend's invite link)</span>
            <input className="field-boxed font-mono uppercase" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="e.g. 3F9A0C7B21" />
            {inviteInfo && <span className={`text-xs ${inviteInfo.startsWith('✗') ? 'text-danger' : 'text-ok'}`}>{inviteInfo}</span>}
          </label>
        )}
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-xs text-muted">Username {tab === 'up' && '(3–20 lowercase letters, numbers or _)'}</span>
          <input className="field-boxed" value={username} onChange={(e) => setUsername(e.target.value.toLowerCase())} autoComplete="username" />
        </label>
        {tab === 'up' && (
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-xs text-muted">Display name (what friends see)</span>
            <input className="field-boxed" value={displayName} onChange={(e) => setDisplayName(e.target.value)} maxLength={40} />
          </label>
        )}
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-xs text-muted">Password {tab === 'up' && '(8+ characters)'}</span>
          <input className="field-boxed" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={tab === 'up' ? 'new-password' : 'current-password'} />
        </label>
        {error && <div className="text-sm text-danger">{error}</div>}
        <button className="btn-primary mt-1 justify-center" disabled={busy || !username || !password || (tab === 'up' && !code)}>
          {busy ? 'Please wait…' : tab === 'in' ? 'Sign in' : 'Create account'}
        </button>
        <p className="text-xs text-muted">
          No email needed. There's no "forgot password" (no emails are ever sent) — keep your password in a password manager.
          {tab === 'up' && " The first time you sign in, this PC's existing data is uploaded to your account."}
        </p>
      </form>
    </div>
  )
}

function SignedIn(): React.JSX.Element {
  const c = useCloud()!
  const { data: used } = useLive(['cloud:storage'], () => api.cloud.storageUsed().catch(() => null), [])
  const [busy, setBusy] = useState(false)
  const syncLabel: Record<string, string> = {
    synced: 'Up to date',
    syncing: 'Syncing…',
    offline: 'Offline — changes are saved on this PC and will upload when you are back online',
    error: 'Problem syncing',
    off: 'Off'
  }
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-start gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-full bg-accent-soft text-lg font-semibold text-accent">
          {(c.displayName || c.username || '?').slice(0, 1).toUpperCase()}
        </div>
        <div className="min-w-0 flex-1">
          <div className="font-semibold">{c.displayName}</div>
          <div className="text-sm text-muted">@{c.username}</div>
        </div>
        <button className="btn" onClick={() => navigate({ name: 'friends' })}>
          <Icon name="clients" /> Invite friends
        </button>
        <button className="btn-ghost" onClick={() => confirm('Sign out? Your data stays on this PC.') && void api.cloud.signOut()}>
          Sign out
        </button>
      </div>
      <div className="grid grid-cols-[8rem_1fr] gap-x-3 gap-y-1.5 text-sm">
        <span className="text-muted">Sync</span>
        <span className={c.sync === 'error' ? 'text-danger' : c.sync === 'offline' ? 'text-amber-600' : ''}>
          {syncLabel[c.sync]}
          {c.pending > 0 && ` · ${c.pending} change${c.pending === 1 ? '' : 's'} waiting`}
          <button className="ml-2 text-accent underline" disabled={busy} onClick={() => (setBusy(true), void api.cloud.syncNow().finally(() => setBusy(false)))}>
            Sync now
          </button>
        </span>
        <span className="text-muted">Last synced</span>
        <span>{timeAgo(c.lastSyncAt)}</span>
        {c.error && (
          <>
            <span className="text-muted">Last problem</span>
            <span className="text-danger">{c.error}</span>
          </>
        )}
        <span className="text-muted">Cloud files</span>
        <span>
          {used == null ? '—' : `${formatBytes(used)} of 1 GB (shared by everyone on this Studyhall)`}
          {used != null && used > 800 * 1024 * 1024 && <span className="ml-1 text-danger">— nearly full</span>}
        </span>
      </div>
      <p className="text-xs text-muted">
        Course files stay on this PC unless you switch on “Sync file” for a file (in a module's week). Notes, tasks and everything else sync automatically.
      </p>
      <AccountTools isAdmin={c.isAdmin} displayName={c.displayName ?? ''} />
    </div>
  )
}

const errText = (e: unknown): string => String(e instanceof Error ? e.message : e).replace(/^Error invoking remote method '[^']+': (Error: )?/, '')

/** Display name, change password, and (admin only) reset someone's password. */
function AccountTools({ isAdmin, displayName }: { isAdmin: boolean; displayName: string }): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState(displayName)
  const [cur, setCur] = useState('')
  const [next, setNext] = useState('')
  const [who, setWho] = useState('')
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [temp, setTemp] = useState<string | null>(null)
  const run = async (fn: () => Promise<unknown>, ok: string): Promise<void> => {
    setMsg(null)
    try {
      await fn()
      setMsg({ ok: true, text: ok })
    } catch (e) {
      setMsg({ ok: false, text: errText(e) })
    }
  }
  if (!open) {
    return (
      <button className="self-start text-xs text-accent underline" onClick={() => setOpen(true)}>
        Change display name or password{isAdmin && ', reset a friend’s password'}
      </button>
    )
  }
  return (
    <div className="flex flex-col gap-3 border-t border-line pt-3 text-sm">
      <div className="flex gap-2">
        <input className="field-boxed" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} placeholder="Display name" />
        <button className="btn" disabled={!name.trim()} onClick={() => void run(() => api.cloud.setDisplayName(name), 'Display name saved.')}>
          Save name
        </button>
      </div>
      <div className="flex gap-2">
        <input className="field-boxed" type="password" autoComplete="current-password" value={cur} onChange={(e) => setCur(e.target.value)} placeholder="Current password" />
        <input className="field-boxed" type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} placeholder="New password (8+)" />
        <button
          className="btn"
          disabled={!cur || next.length < 8}
          onClick={() =>
            void run(async () => {
              await api.cloud.changePassword(cur, next)
              setCur('')
              setNext('')
            }, 'Password changed.')
          }
        >
          Change
        </button>
      </div>
      {isAdmin && (
        <div className="flex flex-col gap-1.5 rounded-lg bg-canvas p-3">
          <div className="text-xs text-muted">
            <b>Admin:</b> a friend forgot their password? Set a temporary one, send it to them privately, and they change it in Settings.
          </div>
          <div className="flex gap-2">
            <input className="field-boxed" value={who} onChange={(e) => setWho(e.target.value.toLowerCase())} placeholder="their username" />
            <button
              className="btn"
              disabled={who.length < 3}
              onClick={() =>
                void run(async () => {
                  setTemp(await api.cloud.adminResetPassword(who))
                }, `Temporary password set for @${who}.`)
              }
            >
              Reset
            </button>
          </div>
          {temp && (
            <div className="text-xs">
              Temporary password (shown once): <code className="rounded bg-panel px-1.5 py-0.5 text-sm font-semibold select-all">{temp}</code>
            </div>
          )}
        </div>
      )}
      {msg && <div className={`text-xs ${msg.ok ? 'text-ok' : 'text-danger'}`}>{msg.text}</div>}
    </div>
  )
}
