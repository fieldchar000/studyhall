// DevKit → Briefing: one calm start page instead of doomscrolling. A short, balanced
// selection of fresh articles, today's idea / model / paper, forecasts to resolve, and
// how your own projects are doing.

import { useEffect, useMemo, useState } from 'react'
import type { Devlog, FeedItem, Prediction, Project } from '@shared/types'
import { Icon } from '@/components/ui'
import { api, useLive } from '@/lib/data'
import { localDate } from '@/lib/dates'
import { navigate } from '@/lib/nav'
import { MENTAL_MODELS, ofTheDay, PAPERS, PHILOSOPHY, topicOf, TOPICS } from '@/lib/devContent'
import { ago, LeanDot, Reader, saveForLater, useFeedItems } from './Feeds'

/** Up to `n` fresh unread articles, taking turns between topics so no topic floods it. */
function pickBriefing(items: FeedItem[], n: number): FeedItem[] {
  const byTopic = new Map<string, FeedItem[]>()
  for (const it of items) {
    if (it.read_at || Date.now() - Date.parse(it.published_at) > 3 * 864e5) continue
    byTopic.set(it.topic, [...(byTopic.get(it.topic) ?? []), it])
  }
  const out: FeedItem[] = []
  const usedFeeds = new Set<string>()
  for (let round = 0; out.length < n && round < 10; round++) {
    for (const t of TOPICS.map((x) => x.id)) {
      const list = byTopic.get(t) ?? []
      const next = list.find((it) => !out.includes(it) && (!usedFeeds.has(it.feed_id) || round > 1))
      if (next && out.length < n) {
        out.push(next)
        usedFeeds.add(next.feed_id)
      }
    }
  }
  return out
}

function greeting(): string {
  const h = new Date().getHours()
  return h < 5 ? 'Up late' : h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'
}

export function BriefingPage(): React.JSX.Element {
  const { items } = useFeedItems({ unread: true, limit: 400 })
  const [open, setOpen] = useState<FeedItem | null>(null)
  const brief = useMemo(() => pickBriefing(items, 10), [items])
  const data = useLive(
    ['predictions', 'projects', 'devlogs', 'saved_items', 'feeds'],
    async () => {
      const [predictions, projects, devlogs, saved, feeds] = await Promise.all([
        api.list('predictions'),
        api.list('projects', { mode: 'dev' }, 'sort'),
        api.list('devlogs', {}, 'date'),
        api.list('saved_items', { status: 'later' }),
        api.list('feeds')
      ])
      return { predictions, projects, devlogs, saved, feeds }
    },
    []
  ).data
  useEffect(() => {
    // First visit after unlocking: make sure the starter feeds exist and are fetched.
    if (data && !data.feeds.length) void api.feeds.seedDefaults().then((n) => (n ? api.feeds.refresh() : null))
  }, [data])

  const idea = ofTheDay(PHILOSOPHY)
  const model = ofTheDay(MENTAL_MODELS, 3)
  const paper = ofTheDay(PAPERS, 5)
  const today = localDate(new Date())
  const due = (data?.predictions ?? []).filter((p) => p.outcome == null && p.resolve_by && p.resolve_by <= today)
  const markBriefRead = async (): Promise<void> => {
    await api.feeds.markRead(
      brief.map((b) => b.id),
      true
    )
  }

  if (open) {
    return (
      <div className="flex h-full flex-col">
        <div className="border-b border-line/70 px-6 py-2">
          <button className="btn-ghost" onClick={() => setOpen(null)}>
            <Icon name="back" /> Briefing
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-auto">
          <Reader it={open} saved={(data?.saved ?? []).some((s) => s.url === open.link)} />
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 p-8">
      <header className="flex flex-wrap items-end gap-4">
        <div className="flex-1">
          <div className="text-sm text-muted">{new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}</div>
          <h1 className="text-4xl">
            {greeting()}, <span className="text-gradient">builder</span>.
          </h1>
        </div>
        <button className="btn" onClick={() => navigate({ name: 'feeds' })}>
          <Icon name="rss" /> All feeds
        </button>
      </header>

      <div className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
        {/* Today's reads */}
        <section className="card flex flex-col p-5">
          <div className="mb-3 flex items-center gap-2">
            <h2 className="flex-1 text-lg font-bold">Today’s 10</h2>
            <span className="text-xs text-muted">fresh, mixed across topics</span>
            {brief.length > 0 && (
              <button className="btn-ghost text-xs" onClick={() => void markBriefRead()} title="Mark these read and show the next ones">
                Next 10 →
              </button>
            )}
          </div>
          {brief.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted">{items.length ? 'You’re up to date. Nice.' : 'Fetching your feeds — give it a moment.'}</p>
          ) : (
            <ol className="flex flex-col">
              {brief.map((it, i) => {
                const t = topicOf(it.topic)
                return (
                  <li key={it.id} className="group flex items-start gap-3 border-b border-line/50 py-2.5 last:border-0">
                    <span className="w-5 pt-0.5 text-right text-sm font-bold text-muted/60 tabular-nums">{i + 1}</span>
                    <button
                      className="min-w-0 flex-1 text-left"
                      onClick={() => {
                        setOpen(it)
                        void api.feeds.markRead([it.id], true)
                      }}
                    >
                      <div className="flex items-center gap-1.5 text-[11px] text-muted">
                        <span style={{ color: t.color }}>
                          {t.icon} {t.label}
                        </span>
                        <LeanDot lean={it.lean} />
                        <span className="truncate">· {it.feed_name}</span>
                        <span>· {ago(it.published_at)}</span>
                      </div>
                      <div className="text-[15px] leading-snug font-semibold group-hover:text-accent">{it.title}</div>
                    </button>
                    <button className="btn-ghost invisible px-1 group-hover:visible" title="Save for later" onClick={() => void saveForLater(it)}>
                      <Icon name="bookmark" size={14} />
                    </button>
                  </li>
                )
              })}
            </ol>
          )}
        </section>

        <div className="flex flex-col gap-6">
          <section className="card relative overflow-hidden p-5">
            <div className="absolute -top-8 -right-8 h-28 w-28 rounded-full opacity-20 blur-2xl" style={{ background: 'var(--color-accent)' }} />
            <div className="text-[11px] font-semibold tracking-wider text-muted uppercase">Idea of the day</div>
            <h3 className="mt-1 text-lg font-bold">{idea.title}</h3>
            {idea.who && <div className="text-xs text-muted">{idea.who}</div>}
            <p className="mt-2 text-sm leading-relaxed">{idea.body}</p>
            {idea.ask && <p className="mt-2 text-sm text-accent italic">{idea.ask}</p>}
          </section>
          <section className="card p-5">
            <div className="text-[11px] font-semibold tracking-wider text-muted uppercase">Mental model</div>
            <h3 className="mt-1 font-bold">{model.title}</h3>
            <p className="mt-1 text-sm text-muted">{model.body}</p>
          </section>
          <section className="card p-5">
            <div className="text-[11px] font-semibold tracking-wider text-muted uppercase">Paper of the day</div>
            <button className="mt-1 text-left font-bold hover:text-accent" onClick={() => window.open(paper.url)}>
              {paper.title} ↗
            </button>
            <div className="text-xs text-muted">
              {paper.authors}, {paper.year}
            </div>
            <p className="mt-1 text-sm text-muted">{paper.why}</p>
          </section>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        <ProjectsPulse projects={data?.projects ?? []} devlogs={data?.devlogs ?? []} />
        <section className="card p-5">
          <div className="mb-2 flex items-center">
            <h2 className="flex-1 font-bold">Forecasts</h2>
            <button className="btn-ghost text-xs" onClick={() => navigate({ name: 'forecasts' })}>
              Open →
            </button>
          </div>
          {due.length > 0 ? (
            <ul className="flex flex-col gap-1.5 text-sm">
              {due.slice(0, 4).map((p: Prediction) => (
                <li key={p.id} className="flex gap-2">
                  <span className="chip">{Math.round(p.probability)}%</span>
                  <span className="line-clamp-2">{p.question}</span>
                </li>
              ))}
              <li className="text-xs text-amber-600">{due.length} ready to resolve — did they happen?</li>
            </ul>
          ) : (
            <p className="text-sm text-muted">
              {(data?.predictions ?? []).filter((p) => p.outcome == null).length} open. Write down what you expect to happen in AI or world events — then check how calibrated you are.
            </p>
          )}
        </section>
        <section className="card p-5">
          <div className="mb-2 flex items-center">
            <h2 className="flex-1 font-bold">Reading list</h2>
            <button className="btn-ghost text-xs" onClick={() => navigate({ name: 'reading' })}>
              Open →
            </button>
          </div>
          {(data?.saved ?? []).length ? (
            <ul className="flex flex-col gap-1.5 text-sm">
              {data!.saved.slice(-4).reverse().map((s) => (
                <li key={s.id} className="line-clamp-1">
                  {topicOf(s.topic).icon} {s.title}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted">Save articles worth a proper read — they wait here.</p>
          )}
        </section>
      </div>
    </div>
  )
}

function ProjectsPulse({ projects, devlogs }: { projects: Project[]; devlogs: Devlog[] }): React.JSX.Element {
  const active = projects.filter((p) => p.status === 'active')
  const last = (id: string): string | null => devlogs.filter((d) => d.project_id === id).map((d) => d.date).sort().pop() ?? null
  return (
    <section className="card p-5">
      <div className="mb-2 flex items-center">
        <h2 className="flex-1 font-bold">Your projects</h2>
        <button className="btn-ghost text-xs" onClick={() => navigate({ name: 'projects' })}>
          Open →
        </button>
      </div>
      {active.length === 0 ? (
        <p className="text-sm text-muted">Track your games and AI projects: devlog, experiments and GitHub activity in one place.</p>
      ) : (
        <ul className="flex flex-col gap-2 text-sm">
          {active.slice(0, 5).map((p) => {
            const l = last(p.id)
            const days = l ? Math.round((Date.parse(localDate(new Date())) - Date.parse(l)) / 864e5) : null
            return (
              <li key={p.id}>
                <button className="flex w-full items-center gap-2 text-left hover:text-accent" onClick={() => navigate({ name: 'project', id: p.id })}>
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: p.color }} />
                  <span className="min-w-0 flex-1 truncate font-medium">{p.title}</span>
                  <span className={`text-xs ${days != null && days > 7 ? 'text-amber-600' : 'text-muted'}`}>{days == null ? 'no log yet' : days === 0 ? 'logged today' : `${days}d since log`}</span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
