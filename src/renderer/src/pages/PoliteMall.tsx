// PoliteMall: the real Brightspace (signed in) on the left, and on the right what Studyhall read from it: what's due
// (quizzes first), what's new, each course's weeks with buttons for Nova, grades, and a search across all of it.
// Read-only: nothing is ever submitted or posted. (main/politePage.ts)

import { useEffect, useMemo, useRef, useState } from 'react'
import type { PoliteStatus } from '@shared/types'
import { Icon } from '@/components/ui'
import { api } from '@/lib/data'
import { isPhoneApp } from '@/lib/platform'

const LMS = 'https://nplms.polite.edu.sg'
type Due = {
  key: string
  kind: 'quiz' | 'assignment'
  courseId: number
  course: string
  courseName: string
  id: number
  name: string
  due: string
  done: boolean
  doneAt: string | null
  attempts: number | null
  allowed: number | null
  ready: { pct: number; cards: number } | null
}
type News = { at: string; kind: 'file' | 'news' | 'grade' | 'assignment' | 'quiz'; courseId: number; course: string; text: string; topicId?: number }
type Topic = { id: number; title: string; kind: string; ext: string | null }
type Course = {
  id: number
  code: string
  name: string
  weeks: { id: number; title: string; topics: Topic[] }[]
  grades: { name: string; grade: string }[]
  news: { title: string; at: string | null; text: string }[]
}
type PageData = { status: PoliteStatus; due: Due[]; news: News[]; courses: Course[]; tasks: boolean; notify: boolean }

const when = (iso: string): string => {
  const d = new Date(iso)
  const days = Math.round((new Date(d).setHours(0, 0, 0, 0) - new Date().setHours(0, 0, 0, 0)) / 864e5)
  const time = d.toLocaleTimeString('en-GB', { hour: 'numeric', minute: '2-digit', hour12: true }).replace(':00', '').replace(' ', '')
  return days === 0
    ? `today ${time}`
    : days === 1
      ? `tomorrow ${time}`
      : days === -1
        ? `yesterday ${time}`
        : `${d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })} ${time}`
}
const KIND_ICON: Record<News['kind'], string> = { file: 'note', news: 'inbox', grade: 'grades', assignment: 'pencil', quiz: 'exam' }

export function PoliteMallPage(): React.JSX.Element {
  const [data, setData] = useState<PageData | null>(null)
  const [tab, setTab] = useState<'due' | 'new' | 'courses' | 'grades'>('due')
  const [onlyQuizzes, setOnlyQuizzes] = useState(true)
  const [q, setQ] = useState('')
  const [courseId, setCourseId] = useState<number | null>(null)
  const [msg, setMsg] = useState('')
  const box = useRef<HTMLDivElement>(null)

  const load = (): void => void api.polite.page().then((d) => setData(d as PageData))
  useEffect(() => {
    load()
    return api.polite.onChanged(() => load())
  }, [])
  useEffect(() => {
    if (!msg) return
    const t = setTimeout(() => setMsg(''), 5000)
    return () => clearTimeout(t)
  }, [msg])

  // Brightspace sits exactly over the left side; hidden when a dialog needs to be on top, and when you leave.
  useEffect(() => {
    const el = box.current
    if (!el || isPhoneApp()) return
    const place = (): void => {
      if (document.querySelector('[data-modal]')) return void api.polite.hide()
      const r = el.getBoundingClientRect()
      void api.polite.show({ x: r.left, y: r.top, width: r.width, height: r.height })
    }
    place()
    const ro = new ResizeObserver(place)
    ro.observe(el)
    window.addEventListener('resize', place)
    const mo = new MutationObserver(place)
    mo.observe(document.body, { childList: true })
    return () => {
      ro.disconnect()
      mo.disconnect()
      window.removeEventListener('resize', place)
      void api.polite.hide()
    }
  }, [])

  const act = async (a: { kind: string; courseId: number; topicId?: number; id?: number; name?: string; due?: string }): Promise<void> => {
    const r = await api.polite.action(a)
    if (r) setMsg(r)
  }
  const st = data?.status
  const course = data?.courses.find((c) => c.id === courseId) ?? data?.courses[0] ?? null

  // Search across every course: weeks, files and announcements.
  const hits = useMemo(() => {
    const n = q.trim().toLowerCase()
    if (!n || !data) return []
    const out: { courseId: number; course: string; text: string; sub: string; topicId?: number }[] = []
    for (const c of data.courses) {
      for (const w of c.weeks) {
        if (w.title.toLowerCase().includes(n)) out.push({ courseId: c.id, course: c.code || c.name, text: w.title, sub: `${w.topics.length} items` })
        for (const t of w.topics) if (t.title.toLowerCase().includes(n)) out.push({ courseId: c.id, course: c.code || c.name, text: t.title, sub: w.title, topicId: t.id })
      }
      for (const a of c.news) if (`${a.title} ${a.text}`.toLowerCase().includes(n)) out.push({ courseId: c.id, course: c.code || c.name, text: a.title, sub: 'Announcement' })
    }
    return out.slice(0, 60)
  }, [q, data])

  if (isPhoneApp()) return <div className="p-6 text-sm text-muted">PoliteMall lives in Studyhall on your PC.</div>

  const due = (data?.due ?? []).filter((d) => !onlyQuizzes || d.kind === 'quiz')
  const soon = due.filter((d) => !d.done && Date.parse(d.due) < Date.now() + 3 * 864e5)
  const later = due.filter((d) => !d.done && Date.parse(d.due) >= Date.now() + 3 * 864e5)
  const done = due.filter((d) => d.done)

  const dueRow = (d: Due): React.JSX.Element => (
    <li key={d.key} className="border-t border-line py-2 first:border-t-0">
      <div className="flex items-start gap-2">
        <span className="mt-0.5 rounded bg-accent/15 px-1.5 text-[10px] font-semibold text-accent">{d.course}</span>
        <div className="min-w-0 flex-1">
          <button
            className="block w-full truncate text-left text-[13px] font-medium hover:underline"
            title={`Open ${d.name}`}
            onClick={() => void act({ kind: d.kind, courseId: d.courseId, id: d.id })}
          >
            {d.name}
          </button>
          <div className="text-[11px] text-muted">
            {d.kind === 'quiz' ? 'Quiz' : 'Assignment'} · due {when(d.due)}
            {d.done ? (d.kind === 'quiz' ? ' · attempted' : ' · submitted') : d.kind === 'quiz' && d.allowed ? ` · ${d.allowed} attempt${d.allowed === 1 ? '' : 's'}` : ''}
          </div>
          {d.ready && (
            <div className="mt-1 flex items-center gap-2" title={`From your ${d.ready.cards} flashcards for this module`}>
              <div className="h-1.5 flex-1 overflow-hidden rounded bg-line">
                <div className="h-full rounded bg-accent" style={{ width: `${d.ready.pct}%` }} />
              </div>
              <span className="text-[10px] text-muted">{d.ready.pct}% ready</span>
            </div>
          )}
        </div>
      </div>
      <div className="mt-1.5 flex gap-1.5 pl-1">
        <button className="btn-ghost rounded-md border border-line px-2 py-0.5 text-[11px]" onClick={() => void act({ kind: d.kind, courseId: d.courseId, id: d.id })}>
          {d.kind === 'quiz' ? 'Open quiz' : 'Open assignment'}
        </button>
        {!d.done && (
          <button className="btn-ghost rounded-md border border-line px-2 py-0.5 text-[11px]" onClick={() => void act({ kind: 'study', courseId: d.courseId, name: d.name, due: d.due })}>
            Study for this
          </button>
        )}
      </div>
    </li>
  )

  return (
    <div className="flex h-full min-h-0 gap-3 p-3">
      {/* Brightspace itself (Studyhall's own signed-in PoliteMall session) */}
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div className="flex items-center gap-2 text-sm">
          <h1 className="font-semibold">PoliteMall</h1>
          <span className={`text-xs ${st?.state === 'error' || st?.state === 'signed-out' ? 'text-danger' : 'text-muted'}`}>
            {!st || st.state === 'off'
              ? 'Sign in below with your school Microsoft account (you type your password there yourself).'
              : st.state === 'checking'
                ? 'Reading your courses…'
                : st.state === 'signed-out'
                  ? 'Your sign-in ran out: sign in again below.'
                  : st.state === 'error'
                    ? `Couldn’t read it: ${st.error}`
                    : `${st.courses} courses · read ${st.at ? when(st.at) : ''}`}
          </span>
          <span className="flex-1" />
          <button className="btn-ghost px-1" title="Back" onClick={() => void api.polite.back()}>
            <Icon name="back" />
          </button>
          <button className="btn-ghost px-1" title="PoliteMall home" onClick={() => void api.polite.go(`${LMS}/d2l/home`)}>
            <Icon name="home" />
          </button>
          <button className="btn rounded-lg px-2.5 py-1 text-xs" disabled={st?.state === 'checking'} onClick={() => void api.polite.sync()}>
            Check now
          </button>
        </div>
        <div ref={box} className="min-h-0 flex-1 overflow-hidden rounded-xl border border-line bg-[#0b1530]" />
      </div>

      {/* What Studyhall read from it */}
      <aside className="card flex w-[350px] shrink-0 flex-col rounded-2xl p-3">
        <input className="field-boxed mb-2 text-sm" placeholder="Search all your courses…" value={q} onChange={(e) => setQ(e.target.value)} />
        {q.trim() ? (
          <ul className="min-h-0 flex-1 overflow-y-auto">
            {hits.map((h, i) => (
              <li key={i}>
                <button
                  className="w-full rounded-lg px-2 py-1.5 text-left hover:bg-accent/10"
                  onClick={() => void (h.topicId ? act({ kind: 'open', courseId: h.courseId, topicId: h.topicId }) : act({ kind: 'course', courseId: h.courseId }))}
                >
                  <div className="truncate text-[13px]">{h.text}</div>
                  <div className="truncate text-[11px] text-muted">
                    {h.course} · {h.sub}
                  </div>
                </button>
              </li>
            ))}
            {!hits.length && <li className="px-2 text-sm text-muted">Nothing matches.</li>}
          </ul>
        ) : (
          <>
            <div className="mb-2 flex gap-1 text-xs">
              {(
                [
                  ['due', `Due${data?.due.filter((d) => !d.done).length ? ` (${data.due.filter((d) => !d.done).length})` : ''}`],
                  ['new', `New${data?.news.length ? ` (${data.news.length})` : ''}`],
                  ['courses', 'Courses'],
                  ['grades', 'Grades']
                ] as const
              ).map(([k, label]) => (
                <button key={k} className={`rounded-lg px-2.5 py-1 ${tab === k ? 'bg-accent/20 font-semibold' : 'hover:bg-accent/10'}`} onClick={() => setTab(k)}>
                  {label}
                </button>
              ))}
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto pr-1">
              {tab === 'due' && (
                <>
                  <div className="mb-2 flex gap-1 text-[11px]">
                    <button className={`rounded-full border border-line px-2 py-0.5 ${onlyQuizzes ? 'bg-accent/20' : ''}`} onClick={() => setOnlyQuizzes(true)}>
                      Quizzes
                    </button>
                    <button className={`rounded-full border border-line px-2 py-0.5 ${!onlyQuizzes ? 'bg-accent/20' : ''}`} onClick={() => setOnlyQuizzes(false)}>
                      Everything due
                    </button>
                  </div>
                  <h3 className="label-caps text-[10px] text-muted">Next 3 days</h3>
                  <ul className="mb-3">{soon.length ? soon.map(dueRow) : <li className="py-1 text-xs text-muted">Nothing due.</li>}</ul>
                  <h3 className="label-caps text-[10px] text-muted">Next 7 days</h3>
                  <ul className="mb-3">{later.length ? later.map(dueRow) : <li className="py-1 text-xs text-muted">Nothing else this week.</li>}</ul>
                  {done.length > 0 && (
                    <details className="text-xs">
                      <summary className="cursor-pointer text-muted">Done ({done.length})</summary>
                      <ul className="opacity-70">{done.map(dueRow)}</ul>
                    </details>
                  )}
                </>
              )}
              {tab === 'new' && (
                <ul>
                  {(data?.news ?? []).map((n, i) => (
                    <li key={i} className="border-t border-line py-1.5 first:border-t-0">
                      <button
                        className="flex w-full items-start gap-2 text-left"
                        onClick={() => void (n.topicId ? act({ kind: 'open', courseId: n.courseId, topicId: n.topicId }) : act({ kind: 'course', courseId: n.courseId }))}
                      >
                        <Icon name={KIND_ICON[n.kind]} className="mt-0.5 text-accent" />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[13px]">{n.text}</span>
                          <span className="block text-[11px] text-muted">
                            {n.course} · {when(n.at)}
                          </span>
                        </span>
                      </button>
                    </li>
                  ))}
                  {!data?.news.length && <li className="text-xs text-muted">Nothing new since you connected. New files, announcements and grades show here after each check.</li>}
                </ul>
              )}
              {tab === 'courses' && course && (
                <>
                  <select className="field-boxed mb-2 w-full text-sm" value={course.id} onChange={(e) => setCourseId(Number(e.target.value))}>
                    {data?.courses.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.code ? `${c.code} · ` : ''}
                        {c.name}
                      </option>
                    ))}
                  </select>
                  {course.weeks.map((w) => (
                    <details key={w.id} className="border-t border-line py-1 first:border-t-0">
                      <summary className="cursor-pointer truncate py-0.5 text-[13px]" title={w.title}>
                        {w.title} <span className="text-[11px] text-muted">({w.topics.length})</span>
                      </summary>
                      <ul className="pb-1 pl-2">
                        {w.topics.map((t) => {
                          const readable = !!t.ext && /^(pdf|pptx?|ppsx?)$/.test(t.ext)
                          return (
                            <li key={t.id} className="py-1">
                              <div className="truncate text-[12px]" title={t.title}>
                                {t.title} {t.ext && <span className="text-[10px] text-muted">.{t.ext}</span>}
                              </div>
                              <div className="mt-0.5 flex flex-wrap gap-1">
                                {(
                                  [
                                    ['open', 'Open', true],
                                    ['teach', 'Teach me', readable],
                                    ['summary', 'Summarise', readable],
                                    ['flashcards', 'Flashcards', readable],
                                    ['save', 'Save to Materials', t.kind !== 'Link']
                                  ] as const
                                )
                                  .filter(([, , ok]) => ok)
                                  .map(([k, label]) => (
                                    <button
                                      key={k}
                                      className="btn-ghost rounded-md border border-line px-1.5 py-0.5 text-[10px]"
                                      onClick={() => void act({ kind: k, courseId: course.id, topicId: t.id })}
                                    >
                                      {label}
                                    </button>
                                  ))}
                              </div>
                            </li>
                          )
                        })}
                        {!w.topics.length && <li className="text-[11px] text-muted">No files directly in it.</li>}
                      </ul>
                    </details>
                  ))}
                </>
              )}
              {tab === 'grades' &&
                (data?.courses ?? []).map((c) => (
                  <div key={c.id} className="mb-3">
                    <h3 className="text-[12px] font-semibold">{c.code || c.name}</h3>
                    {c.grades.length ? (
                      <ul>
                        {c.grades.map((g) => (
                          <li key={g.name} className="flex justify-between gap-2 text-[12px]">
                            <span className="truncate text-muted">{g.name}</span>
                            <span>{g.grade}</span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-[11px] text-muted">No grades released yet.</p>
                    )}
                  </div>
                ))}
              {!data?.courses.length && tab !== 'new' && <p className="text-xs text-muted">Sign in on the left; your courses show here once Studyhall has read them.</p>}
            </div>
          </>
        )}
        {msg && <p className="mt-2 rounded-lg bg-accent/10 px-2 py-1 text-xs">{msg}</p>}
        <div className="mt-2 flex flex-col gap-1 border-t border-line pt-2 text-[11px] text-muted">
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={data?.tasks !== false} onChange={(e) => void api.prefs.set({ politeTasks: e.target.checked }).then(load)} />
            Add quizzes and assignments to my tasks (with reminders)
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={data?.notify !== false} onChange={(e) => void api.prefs.set({ politeNotify: e.target.checked }).then(load)} />
            Notify me about new announcements, files and grades
          </label>
          <span>Checks every 8 hours while Studyhall is open. Read-only: nothing is ever submitted.</span>
        </div>
      </aside>
    </div>
  )
}
