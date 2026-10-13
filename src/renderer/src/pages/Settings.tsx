import type { Mode, Prefs } from '@shared/types'
import { Icon } from '@/components/ui'
import { api, notifyChanged, track, useLive } from '@/lib/data'
import { setEnabledModes, setMode, useEnabledModes, useMode, useProfile } from '@/lib/profile'
import { setAppearance, useAppearance, type Accent, type Theme } from '@/lib/appearance'
import { shortcutLabel } from './Inbox'
import { AccountCard } from '@/components/AccountCard'
import { RelationshipsCard } from '@/components/RelationshipsSettings'
import { UpdatesCard } from '@/components/UpdateBanner'
import { isPhoneApp } from '@/lib/platform'

export function SettingsPage(): React.JSX.Element {
  const phone = isPhoneApp()
  const mode = useMode()
  const enabled = useEnabledModes()
  const profile = useProfile()
  const look = useAppearance()
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

      <RelationshipsCard />

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
              ['life', 'Life', 'Languages, habits, journal, library, money and personal goals'],
              ...(profile?.devkit ? [['dev', 'DevKit', 'Your briefing, feeds on AI, geopolitics, politics and philosophy, the codex, forecasts and your game/AI projects']] : [])
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
        <h2 className="mb-1 font-semibold">Appearance</h2>
        <p className="mb-3 text-sm text-muted">On this PC only.</p>
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-4">
            <span className="w-20 text-sm">Theme</span>
            <div className="flex gap-0.5 rounded-lg bg-line/50 p-0.5 text-sm">
              {(['system', 'light', 'dark'] as Theme[]).map((t) => (
                <button key={t} onClick={() => setAppearance({ theme: t })} className={`rounded-md px-3 py-1 capitalize ${look.theme === t ? 'bg-panel font-medium shadow-sm' : 'text-muted'}`}>
                  {t === 'system' ? 'Match Windows' : t}
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-4">
            <span className="w-20 text-sm">Accent</span>
            <div className="flex flex-wrap gap-2">
              {(
                [
                  ['mode', 'By category: green for Study, navy for Work, oxblood for Life, petrol for DevKit', 'conic-gradient(#1f4d3a 0 25%, #1e3a5f 0 50%, #6b2234 0 75%, #12505e 0)'],
                  ['emerald', 'Racing green', '#1f4d3a'],
                  ['blue', 'Navy', '#1e3a5f'],
                  ['rose', 'Oxblood', '#6b2234'],
                  ['cyan', 'Petrol', '#12505e'],
                  ['violet', 'Plum', '#533a63'],
                  ['amber', 'Camel', '#7d5f27']
                ] as [Accent, string, string][]
              ).map(([a, label, bg]) => (
                <button
                  key={a}
                  title={label}
                  onClick={() => setAppearance({ accent: a })}
                  className={`h-8 w-8 rounded-full ring-offset-2 ring-offset-panel transition-transform hover:scale-110 ${look.accent === a ? 'ring-2 ring-brass' : ''}`}
                  style={{ background: bg, boxShadow: 'inset 0 0 0 1px rgb(255 255 255 / 0.18)' }}
                />
              ))}
            </div>
          </div>
          <label className="flex items-center gap-3 text-sm">
            <input type="checkbox" checked={look.glow} onChange={(e) => setAppearance({ glow: e.target.checked })} />
            Paper texture and warm light in the background
          </label>
        </div>
      </section>

      <section className="card mb-4 p-5">
        <h2 className="mb-2 font-semibold">{phone ? 'Notifications' : 'Tray & notifications'}</h2>
        {!phone && pref('closeToTray', 'Keep running in the tray when I close the window', 'The focus timer and reminders keep working. Quit from the tray icon menu.')}
        {!phone && pref('launchAtLogin', 'Start Studyhall when I sign in to Windows', 'Starts quietly in the tray. Works in the installed app.')}
        {pref('notifyDeadlines', 'Remind me about deadlines', 'About 24 hours and 1 hour before tasks and assessments are due.')}
        {pref('notifyTimer', 'Notify me when a focus session or break ends')}
        {pref('notifyMessages', 'Notify me about new server messages', 'Only while Studyhall is in the background; muted channels stay quiet.')}
      </section>

      {!phone && (
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
      )}

      <section className="card mb-4 p-5">
        <h2 className="mb-1 font-semibold">Your data</h2>
        {phone ? (
          <p className="mb-3 text-sm text-muted">Everything saves automatically on this phone — there is no save button. Sign in above to keep it in sync with your PC.</p>
        ) : (
          <>
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
          </>
        )}
        <label className="mt-3 flex items-start gap-3 py-1.5">
          <input
            type="checkbox"
            className="mt-1"
            checked={!!prefs?.syncAllFiles}
            onChange={(e) => {
              const on = e.target.checked
              savePrefs({ syncAllFiles: on })
              // Turning it on also queues every file you already have.
              if (on) void (async () => {
                const files = await api.list('materials', {})
                for (const m of files) if (!m.sync_file) await api.update('materials', m.id, { sync_file: 1 })
                notifyChanged('materials')
              })()
            }}
          />
          <span>
            <span className="block text-sm">Upload all my course files, so they open on my phone too</span>
            <span className="block text-xs text-muted">Uses the free 1 GB cloud space (shared with friends on this server). Journal and memory photos always sync. Each file can still be switched off in its week.</span>
          </span>
        </label>
      </section>

      <UpdatesCard version={data?.version} />
    </div>
  )
}
