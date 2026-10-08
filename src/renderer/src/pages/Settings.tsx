import type { Mode, Prefs } from '@shared/types'
import { Icon } from '@/components/ui'
import { api, notifyChanged, track, useLive } from '@/lib/data'
import { setEnabledModes, setMode, useEnabledModes, useMode } from '@/lib/profile'
import { shortcutLabel } from './Inbox'
import { AccountCard } from '@/components/AccountCard'
import { UpdatesCard } from '@/components/UpdateBanner'

export function SettingsPage(): React.JSX.Element {
  const mode = useMode()
  const enabled = useEnabledModes()
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
        <h2 className="mb-1 font-semibold">Categories</h2>
        <p className="mb-3 text-sm text-muted">
          Pick what you use Studyhall for. Each category keeps its own tasks, projects and notes. With more than one switched on, switch between them at the top of the sidebar.
        </p>
        <div className="flex flex-col gap-1">
          {(
            [
              ['study', 'Study', 'Modules, timetable, assessments, exam prep, grades'],
              ['work', 'Work', 'Clients, client projects and meeting notes'],
              ['life', 'Life', 'Languages, habits, journal, library, money and personal goals']
            ] as [Mode, string, string][]
          ).map(([m, label, hint]) => (
            <label key={m} className="flex items-start gap-3 py-1.5">
              <input
                type="checkbox"
                className="mt-1"
                checked={enabled.includes(m)}
                disabled={enabled.length === 1 && enabled.includes(m)}
                onChange={(e) => void setEnabledModes(e.target.checked ? [...enabled, m] : enabled.filter((x) => x !== m), mode)}
              />
              <span className="flex-1">
                <span className="block text-sm font-medium">{label}</span>
                <span className="block text-xs text-muted">{hint}</span>
              </span>
              {enabled.includes(m) && enabled.length > 1 && (
                <button className={`text-xs ${mode === m ? 'font-medium text-accent' : 'text-muted hover:text-ink'}`} onClick={() => void setMode(m)}>
                  {mode === m ? 'Showing now' : 'Show'}
                </button>
              )}
            </label>
          ))}
        </div>
      </section>

      <section className="card mb-4 p-5">
        <h2 className="mb-2 font-semibold">Tray &amp; notifications</h2>
        {pref('closeToTray', 'Keep running in the tray when I close the window', 'The focus timer and reminders keep working. Quit from the tray icon menu.')}
        {pref('launchAtLogin', 'Start Studyhall when I sign in to Windows', 'Starts quietly in the tray. Works in the installed app.')}
        {pref('notifyDeadlines', 'Remind me about deadlines', 'About 24 hours and 1 hour before tasks and assessments are due.')}
        {pref('notifyTimer', 'Notify me when a focus session or break ends')}
        {pref('notifyMessages', 'Notify me about new server messages', 'Only while Studyhall is in the background; muted channels stay quiet.')}
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

      <UpdatesCard version={data?.version} />
    </div>
  )
}
