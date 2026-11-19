import type { Mode, Prefs } from '@shared/types'
import { Icon } from '@/components/ui'
import { api, notifyChanged, track, useLive } from '@/lib/data'
import { setEnabledModes, setMode, useEnabledModes, useMode, useProfile } from '@/lib/profile'
import { shortcutLabel } from './Inbox'
import { AccountCard } from '@/components/AccountCard'
import { WifiShareCard } from '@/components/WifiShareCard'
import { RelationshipsCard } from '@/components/RelationshipsSettings'
import { UpdatesCard } from '@/components/UpdateBanner'
import { isPhoneApp } from '@/lib/platform'
import { navigate } from '@/lib/nav'

export function SettingsPage(): React.JSX.Element {
  const phone = isPhoneApp()
  const mode = useMode()
  const enabled = useEnabledModes()
  const profile = useProfile()
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
      <WifiShareCard />

      <RelationshipsCard />

      <section className="card mb-4 flex flex-wrap items-center gap-3 p-5">
        <div className="min-w-0 flex-1">
          <h2 className="mb-1 font-semibold">{prefs?.novaName ?? 'Nova'}, your assistant</h2>
          <p className="text-sm text-muted">Voice, wake word, Claude brain and usage now live on their own page.</p>
        </div>
        <button className="btn" onClick={() => navigate({ name: 'nova' })}>
          Open
        </button>
      </section>

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
        <h2 className="mb-1 font-semibold">Sky</h2>
        <p className="mb-3 text-sm text-muted">The live sky behind every page (Home and the Brain keep their galaxy). It reacts to your mouse, to things you finish, and to Bauer listening. Colours follow the category you’re in.</p>
        <div className="flex flex-wrap gap-2">
          {(
            [
              ['nebula', 'Hollow nebula', 'Fine glowing strands flowing through a nebula'],
              ['blackhole', 'Black hole', 'Rings of light streaming round a black hole'],
              ['galaxy', 'Galaxies', 'Spiral galaxies of sharp stars, slowly turning'],
              ['off', 'Plain', 'Dark and still (saves battery)']
            ] as [NonNullable<Prefs['sky']>, string, string][]
          ).map(([k, label, hint]) => (
            <button key={k} title={hint} onClick={() => savePrefs({ sky: k })} className={`glass rounded-full px-4 py-1.5 text-sm font-semibold ${(prefs?.sky ?? 'nebula') === k ? 'ring-1 ring-[var(--glow)]' : 'text-muted'}`}>
              {label}
            </button>
          ))}
        </div>
      </section>

      <section className="card mb-4 p-5">
        <h2 className="mb-2 font-semibold">{phone ? 'Notifications' : 'Tray & notifications'}</h2>
        {!phone && pref('closeToTray', 'Keep running in the tray when I close the window', 'The focus timer and reminders keep working. Quit from the tray icon menu.')}
        {!phone && pref('launchAtLogin', 'Start Studyhall when I sign in to Windows', 'Starts quietly in the tray. Works in the installed app.')}
        {pref('notifyDeadlines', 'Remind me about deadlines', 'About 24 hours and 1 hour before tasks and assessments are due.')}
        {pref('notifyTimer', 'Notify me when a focus session or break ends')}
        {pref('notifyMessages', 'Notify me about new server messages', 'Only while Studyhall is in the background; muted channels stay quiet.')}
        {pref('notifyBudgets', 'Budget alerts', 'When a category reaches 80% and 100% of its monthly budget.')}
        {pref('notifyPeople', 'Birthdays and anniversaries', 'Two weeks before, three days before and on the day — with gift ideas from their page.')}
        {pref('notifyCheckin', 'Evening check-in and weekly review', 'A nudge at 9pm if you haven’t checked in, and on Sunday evening when your week in review is ready.')}
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

      {!phone && <ShortcutsCard />}

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

/** Every keyboard shortcut in one place. "Anywhere" ones work in any app while Studyhall is running. */
const SHORTCUTS: { group: string; items: [string, string][] }[] = [
  {
    group: 'Nova (anywhere in Windows)',
    items: [
      ['Hold Ctrl + Alt', 'Talk to Nova. Let go when you’re done.'],
      ['Hold Ctrl + Alt + left mouse button', 'While talking: draw on the screen to show what you mean (right-click undoes a mark).'],
      ['Tap Ctrl + Shift', 'Type to Nova: a small box opens beside your mouse.'],
      ['Ctrl + Alt + B', 'Mark the screen first (hold the left button to draw, right-click undoes), then type or say your question.'],
      ['Ctrl + Alt + N', 'Show or hide Nova.'],
      ['Esc', 'Stop Nova talking or drawing; cancels marks.']
    ]
  },
  {
    group: 'Studyhall (anywhere in Windows)',
    items: [['Quick capture (above)', 'Opens a box; what you type goes to your Inbox. Ctrl + Shift + Space unless you changed it.']]
  },
  {
    group: 'Inside Studyhall',
    items: [
      ['Ctrl + K', 'Search everything, or jump to a page.'],
      ['Esc', 'Close a panel, menu or popup.'],
      ['Space or Enter', 'Flashcards and active recall: show the answer.'],
      ['Ctrl + Enter', 'Add the flashcard you’re writing; send an answer in active recall.'],
      ['Home / End', 'PDF viewer: first or last page.']
    ]
  }
]
function ShortcutsCard(): React.JSX.Element {
  return (
    <section className="card mb-4 p-5">
      <h2 className="mb-1 font-semibold">Keyboard shortcuts</h2>
      <p className="mb-3 text-sm text-muted">Everything you can do from the keyboard.</p>
      {SHORTCUTS.map((g) => (
        <div key={g.group} className="mb-3 last:mb-0">
          <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">{g.group}</h3>
          <table className="w-full text-sm">
            <tbody>
              {g.items.map(([keys, what]) => (
                <tr key={keys} className="border-t border-line first:border-t-0">
                  <td className="w-56 py-1.5 pr-3 align-top font-medium">{keys}</td>
                  <td className="py-1.5 text-muted">{what}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </section>
  )
}
