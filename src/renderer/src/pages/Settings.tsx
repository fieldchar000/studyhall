import type { Mode, Prefs } from '@shared/types'
import { Icon } from '@/components/ui'
import { api, notifyChanged, track, useLive } from '@/lib/data'
import { setMode, useMode } from '@/lib/profile'
import { shortcutLabel } from './Inbox'
import { AccountCard } from '@/components/AccountCard'

export function SettingsPage(): React.JSX.Element {
  const mode = useMode()
  const { data } = useLive([], async () => ({ path: await api.app.dataPath(), version: await api.app.version() }), [])
  const { data: prefs } = useLive(['prefs'], () => api.prefs.get(), [])
  const { data: shortcut } = useLive(['prefs'], () => api.capture.shortcutStatus(), [])
  const savePrefs = (patch: Partial<Prefs>): void => void track(api.prefs.set(patch)).then(() => notifyChanged('prefs'))

  const pref = (key: keyof Prefs, label: string, hint?: string): React.JSX.Element => (
    <label className="flex items-start gap-3 py-1.5">
      <input type="checkbox" className="mt-1" checked={!!prefs?.[key]} onChange={(e) => savePrefs({ [key]: e.target.checked })} />
      <span>
        <span className="block text-sm">{label}</span>
        {hint && <span className="block text-xs text-muted">{hint}</span>}
      </span>
    </label>
  )

  return (
    <div className="mx-auto max-w-2xl p-8">
      <h1 className="mb-6 text-2xl font-semibold tracking-tight">Settings</h1>

      <AccountCard />

      <section className="card mb-4 p-5">
        <h2 className="mb-1 font-semibold">Mode</h2>
        <p className="mb-3 text-sm text-muted">
          Study mode shows modules and assessments; Work mode shows clients. Tasks and projects are kept separately for each mode.
        </p>
        <div className="inline-flex gap-1 rounded-lg bg-line/50 p-1">
          {(['study', 'work'] as Mode[]).map((m) => (
            <button
              key={m}
              onClick={() => void setMode(m)}
              className={`rounded-md px-5 py-1.5 text-sm capitalize ${mode === m ? 'bg-panel font-medium shadow-sm' : 'text-muted'}`}
            >
              {m}
            </button>
          ))}
        </div>
      </section>

      <section className="card mb-4 p-5">
        <h2 className="mb-2 font-semibold">Tray &amp; notifications</h2>
        {pref('closeToTray', 'Keep running in the tray when I close the window', 'The focus timer and reminders keep working. Quit from the tray icon menu.')}
        {pref('launchAtLogin', 'Start Studyhall when I sign in to Windows', 'Starts quietly in the tray. Works in the installed app.')}
        {pref('notifyDeadlines', 'Remind me about deadlines', 'About 24 hours and 1 hour before tasks and assessments are due.')}
        {pref('notifyTimer', 'Notify me when a focus session or break ends')}
      </section>

      <section className="card mb-4 p-5">
        <h2 className="mb-1 font-semibold">Quick capture</h2>
        <p className="mb-3 text-sm text-muted">A keyboard shortcut that works anywhere in Windows and opens a small box; whatever you type goes to your Inbox.</p>
        <div className="flex items-center gap-3">
          <select
            className="field-boxed w-auto"
            value={prefs?.quickCaptureShortcut ?? ''}
            onChange={(e) => savePrefs({ quickCaptureShortcut: e.target.value })}
          >
            {['CommandOrControl+Shift+Space', 'CommandOrControl+Alt+Space', 'Alt+Shift+N'].map((s) => (
              <option key={s} value={s}>
                {shortcutLabel(s)}
              </option>
            ))}
            <option value="">Off</option>
          </select>
          {shortcut?.accelerator &&
            (shortcut.registered ? (
              <span className="text-xs text-ok">✓ Active</span>
            ) : (
              <span className="text-xs text-danger">Another app already uses this shortcut — pick another.</span>
            ))}
        </div>
      </section>

      <section className="card mb-4 p-5">
        <h2 className="mb-1 font-semibold">Your data</h2>
        <p className="mb-3 text-sm text-muted">
          Everything saves automatically on this PC — there is no save button. Your database and uploaded files live in this folder.
          To back up, copy the whole folder while the app is closed.
        </p>
        <div className="flex items-center gap-2">
          <code className="min-w-0 flex-1 truncate rounded-md bg-canvas px-2 py-1.5 text-xs">{data?.path}</code>
          <button className="btn" onClick={() => void api.app.openDataFolder()}>
            <Icon name="folder" /> Open folder
          </button>
        </div>
      </section>

      <section className="card p-5 text-sm text-muted">Studyhall {data?.version}</section>
    </div>
  )
}
