import { Icon } from '@/components/ui'
import { api, useLive } from '@/lib/data'

export function SettingsPage(): React.JSX.Element {
  const { data } = useLive([], async () => ({ path: await api.app.dataPath(), version: await api.app.version() }), [])

  return (
    <div className="mx-auto max-w-2xl p-8">
      <h1 className="mb-6 text-2xl font-semibold tracking-tight">Settings</h1>

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

      <section className="card p-5 text-sm text-muted">
        <div>Studyhall {data?.version}</div>
        <div className="mt-1">Study/Work mode, focus timer and more arrive in the next phases.</div>
      </section>
    </div>
  )
}
