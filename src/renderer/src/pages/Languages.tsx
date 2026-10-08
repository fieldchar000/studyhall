// Life → Languages. Built around what works for language learning:
//  • a little every day (daily goal + streak) beats occasional cramming
//  • balance the skills (listening, speaking, reading, writing + vocab & grammar)
//  • spaced repetition for vocabulary (each language gets a flashcard deck)
//  • a clear level and target (CEFR A1–C2, with JLPT / HSK / Goethe / DELF equivalents)
//  • know your "why", and use good free input (resources)

import { useEffect, useMemo, useState } from 'react'
import type { FocusSession, Flashcard, Language, LanguageLog, LanguageResource, LanguageSkill } from '@shared/types'
import { AutoText } from '@/components/AutoField'
import { Icon } from '@/components/ui'
import { api, db, useLive } from '@/lib/data'
import { addDays, localDate } from '@/lib/dates'
import { navigate } from '@/lib/nav'
import { isDue } from '@/lib/sm2'
import { LanguageLearn } from './LanguageLearn'

export const LEVELS = ['A0', 'A1', 'A2', 'B1', 'B2', 'C1', 'C2'] as const

const LEVEL_INFO: Record<string, string> = {
  A0: 'Just starting — learning the sounds and writing system.',
  A1: 'Beginner: introduce yourself, simple everyday phrases.',
  A2: 'Elementary: shopping, directions, simple chats about routine.',
  B1: 'Intermediate: handle travel, describe experiences and plans.',
  B2: 'Upper intermediate: follow most TV and talk fluently with natives.',
  C1: 'Advanced: understand demanding texts, express yourself flexibly.',
  C2: 'Mastery: understand virtually everything with ease.'
}

/** Rough exam equivalents (they don't map 1:1 to CEFR, but they're useful targets). */
const EXAMS: Record<string, Partial<Record<string, string>>> = {
  ja: { A1: 'JLPT N5', A2: 'JLPT N4', B1: 'JLPT N3', B2: 'JLPT N2', C1: 'JLPT N1', C2: 'JLPT N1' },
  zh: { A1: 'HSK 1–2', A2: 'HSK 3', B1: 'HSK 4', B2: 'HSK 5', C1: 'HSK 6', C2: 'HSK 7–9' },
  de: { A1: 'Goethe A1', A2: 'Goethe A2', B1: 'Goethe B1', B2: 'Goethe B2', C1: 'Goethe C1', C2: 'Goethe C2' },
  fr: { A1: 'DELF A1', A2: 'DELF A2', B1: 'DELF B1', B2: 'DELF B2', C1: 'DALF C1', C2: 'DALF C2' },
  es: { A1: 'DELE A1', A2: 'DELE A2', B1: 'DELE B1', B2: 'DELE B2', C1: 'DELE C1', C2: 'DELE C2' },
  ko: { A1: 'TOPIK 1', A2: 'TOPIK 2', B1: 'TOPIK 3', B2: 'TOPIK 4', C1: 'TOPIK 5', C2: 'TOPIK 6' }
}

export const SKILLS: { id: LanguageSkill; label: string; icon: string }[] = [
  { id: 'listening', label: 'Listening', icon: '🎧' },
  { id: 'speaking', label: 'Speaking', icon: '🗣️' },
  { id: 'reading', label: 'Reading', icon: '📖' },
  { id: 'writing', label: 'Writing', icon: '✍️' },
  { id: 'vocab', label: 'Vocab', icon: '🧠' },
  { id: 'grammar', label: 'Grammar', icon: '🧩' }
]

type Preset = Pick<Language, 'name' | 'native_name' | 'code' | 'flag' | 'color'> & { resources?: LanguageResource[] }

/** The four defaults, with free resources that are worth your time. */
const DEFAULTS: Preset[] = [
  {
    name: 'Japanese',
    native_name: '日本語',
    code: 'ja',
    flag: '日',
    color: '#e11d48',
    resources: [
      { title: 'Tofugu — Learn Hiragana', url: 'https://www.tofugu.com/japanese/learn-hiragana/' },
      { title: "Tae Kim's Guide to Japanese Grammar", url: 'https://guidetojapanese.org/learn/grammar' },
      { title: 'NHK News Web Easy (graded news)', url: 'https://www3.nhk.or.jp/news/easy/' },
      { title: 'Jisho — dictionary', url: 'https://jisho.org/' }
    ]
  },
  {
    name: 'Chinese',
    native_name: '中文',
    code: 'zh',
    flag: '中',
    color: '#dc2626',
    resources: [
      { title: 'Yabla — Pinyin chart with audio', url: 'https://yabla.com/chinese-pinyin-chart.php' },
      { title: 'Chinese Grammar Wiki', url: 'https://resources.allsetlearning.com/chinese/grammar/' },
      { title: 'MDBG — dictionary', url: 'https://www.mdbg.net/chinese/dictionary' }
    ]
  },
  {
    name: 'German',
    native_name: 'Deutsch',
    code: 'de',
    flag: 'De',
    color: '#ca8a04',
    resources: [
      { title: 'DW Learn German (free courses A1–C1)', url: 'https://learngerman.dw.com/en/overview' },
      { title: 'Easy German (street interviews, subtitled)', url: 'https://www.youtube.com/@EasyGerman' },
      { title: 'LEO — dictionary', url: 'https://dict.leo.org/' }
    ]
  },
  {
    name: 'French',
    native_name: 'Français',
    code: 'fr',
    flag: 'Fr',
    color: '#2563eb',
    resources: [
      { title: 'TV5Monde — Apprendre le français', url: 'https://apprendre.tv5monde.com/' },
      { title: 'RFI — Français facile', url: 'https://francaisfacile.rfi.fr/' },
      { title: 'Easy French (street interviews, subtitled)', url: 'https://www.youtube.com/@EasyFrench' },
      { title: 'WordReference — dictionary', url: 'https://www.wordreference.com/' }
    ]
  }
]

const MORE: Preset[] = [
  { name: 'Spanish', native_name: 'Español', code: 'es', flag: 'Es', color: '#f59e0b' },
  { name: 'Korean', native_name: '한국어', code: 'ko', flag: '한', color: '#0ea5e9' },
  { name: 'Italian', native_name: 'Italiano', code: 'it', flag: 'It', color: '#16a34a' },
  { name: 'Portuguese', native_name: 'Português', code: 'pt', flag: 'Pt', color: '#059669' },
  { name: 'Arabic', native_name: 'العربية', code: 'ar', flag: 'ع', color: '#0d9488' },
  { name: 'Russian', native_name: 'Русский', code: 'ru', flag: 'Ru', color: '#6366f1' },
  { name: 'Hindi', native_name: 'हिन्दी', code: 'hi', flag: 'हि', color: '#ea580c' },
  { name: 'Dutch', native_name: 'Nederlands', code: 'nl', flag: 'Nl', color: '#f97316' }
]

const TIPS = [
  ['Little and often', '15 minutes every day beats 2 hours once a week — memory needs repeated, spaced exposure.'],
  ['Lots of input you (mostly) understand', 'Graded readers, slow news, YouTube with subtitles. Aim for content where you know ~90% of the words.'],
  ['Review vocab with spaced repetition', 'Add words you actually meet. Rate honestly — the flashcards bring them back right before you forget.'],
  ['Speak from early on', 'Shadow audio (repeat right after the speaker) and talk to yourself. It feels silly; it works.'],
  ['Write, then get feedback', 'A few sentences a day about your life. Mistakes you notice are the ones you fix.']
]

export const parseResources = (l: Language): LanguageResource[] => {
  try {
    const r = JSON.parse(l.resources) as LanguageResource[]
    return Array.isArray(r) ? r : []
  } catch {
    return []
  }
}

// ---------- Stats ----------

export interface LangStats {
  today: number
  week: number
  total: number
  streak: number
  byDay: Map<string, number>
  bySkill: Map<LanguageSkill | 'focus', number>
  words: number
  due: number
}

/** Practice minutes from logged practice and from Focus sessions tagged with the language. */
export function languageStats(l: Language, logs: LanguageLog[], sessions: FocusSession[], cards: Flashcard[]): LangStats {
  const byDay = new Map<string, number>()
  const bySkill = new Map<LanguageSkill | 'focus', number>()
  const month = addDays(localDate(new Date()), -30)
  for (const g of logs) {
    if (g.language_id !== l.id) continue
    byDay.set(g.date, (byDay.get(g.date) ?? 0) + g.minutes)
    if (g.date >= month) bySkill.set(g.skill, (bySkill.get(g.skill) ?? 0) + g.minutes)
  }
  for (const s of sessions) {
    if (s.language_id !== l.id) continue
    const d = localDate(new Date(s.started_at))
    const m = s.focused_seconds / 60
    byDay.set(d, (byDay.get(d) ?? 0) + m)
    if (d >= month) bySkill.set('focus', (bySkill.get('focus') ?? 0) + m)
  }
  const today = localDate(new Date())
  let week = 0
  for (let i = 0; i < 7; i++) week += byDay.get(addDays(today, -i)) ?? 0
  // Streak = days in a row the daily goal was met (today only counts once it's met).
  const goal = Math.max(1, l.daily_goal_min)
  let streak = 0
  let day = (byDay.get(today) ?? 0) >= goal ? today : addDays(today, -1)
  while ((byDay.get(day) ?? 0) >= goal) {
    streak++
    day = addDays(day, -1)
  }
  const mine = cards.filter((c) => c.deck_id && c.deck_id === l.deck_id)
  return {
    today: byDay.get(today) ?? 0,
    week,
    total: [...byDay.values()].reduce((a, b) => a + b, 0),
    streak,
    byDay,
    bySkill,
    words: mine.length,
    due: mine.filter((c) => isDue(c)).length
  }
}

function useLanguageData(): { langs: Language[]; logs: LanguageLog[]; sessions: FocusSession[]; cards: Flashcard[] } | undefined {
  return useLive(
    ['languages', 'language_logs', 'focus_sessions', 'flashcards'],
    async () => {
      const [langs, logs, sessions, cards] = await Promise.all([
        api.list('languages', {}, 'sort'),
        api.list('language_logs', {}, 'date'),
        api.list('focus_sessions', { mode: 'life' }),
        api.list('flashcards')
      ])
      return { langs, logs, sessions, cards }
    },
    []
  ).data
}

const fmtMin = (m: number): string => (m >= 60 ? `${Math.floor(m / 60)}h ${Math.round(m % 60)}m` : `${Math.round(m)}m`)

async function createLanguage(p: Preset, sort: number): Promise<Language> {
  return db.create('languages', {
    name: p.name,
    native_name: p.native_name,
    code: p.code,
    flag: p.flag,
    color: p.color,
    resources: JSON.stringify(p.resources ?? []),
    sort
  })
}

/** Each language's vocabulary lives in its own flashcard deck (made on first use). */
export async function ensureDeck(l: Language): Promise<string> {
  if (l.deck_id && (await api.get('flashcard_decks', l.deck_id))) return l.deck_id
  const deck = await db.create('flashcard_decks', { name: `${l.name} vocab` })
  await db.update('languages', l.id, { deck_id: deck.id })
  return deck.id
}

export function Badge({ l, size = 40 }: { l: Pick<Language, 'flag' | 'color'>; size?: number }): React.JSX.Element {
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-xl font-semibold text-white"
      style={{ background: l.color, width: size, height: size, fontSize: size * (l.flag.length > 1 ? 0.36 : 0.48) }}
    >
      {l.flag}
    </span>
  )
}

function Ring({ value, goal, color, size = 44 }: { value: number; goal: number; color: string; size?: number }): React.JSX.Element {
  const r = size / 2 - 4
  const c = 2 * Math.PI * r
  const k = Math.min(1, value / Math.max(1, goal))
  return (
    <svg width={size} height={size} className="shrink-0 -rotate-90">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--color-line)" strokeWidth="5" />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth="5" strokeLinecap="round" strokeDasharray={`${c * k} ${c}`} />
    </svg>
  )
}

// ---------- List ----------

export function LanguagesPage(): React.JSX.Element {
  const data = useLanguageData()
  const [adding, setAdding] = useState(false)
  const [archived, setArchived] = useState(false)

  // First visit: start with Japanese, Chinese, German and French (remove any you don't want).
  useEffect(() => {
    if (!data || data.langs.length) return
    let seeded = false
    try {
      seeded = localStorage.getItem('sh-languages-seeded') === '1'
      localStorage.setItem('sh-languages-seeded', '1')
    } catch {
      /* ignore */
    }
    if (!seeded) void Promise.all(DEFAULTS.map((p, i) => createLanguage(p, i)))
  }, [data])

  if (!data) return <div />
  const shown = data.langs.filter((l) => (archived ? !l.active : l.active))
  const used = new Set(data.langs.map((l) => l.code))

  return (
    <div className="mx-auto max-w-5xl p-8">
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Languages</h1>
        <div className="ml-2 flex gap-1 rounded-lg bg-line/50 p-0.5">
          {[false, true].map((a) => (
            <button key={String(a)} onClick={() => setArchived(a)} className={`rounded-md px-3 py-1 text-sm ${archived === a ? 'bg-panel font-medium shadow-sm' : 'text-muted'}`}>
              {a ? `Paused (${data.langs.filter((l) => !l.active).length})` : 'Learning'}
            </button>
          ))}
        </div>
        <div className="flex-1" />
        <div className="relative">
          <button className="btn-primary" onClick={() => setAdding((v) => !v)}>
            <Icon name="plus" /> Add language
          </button>
          {adding && (
            <div className="card absolute right-0 z-20 mt-1 flex w-60 flex-col p-1 shadow-xl">
              {[...DEFAULTS, ...MORE]
                .filter((p) => !used.has(p.code))
                .map((p) => (
                  <button
                    key={p.code}
                    className="flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-canvas"
                    onClick={() => {
                      setAdding(false)
                      void createLanguage(p, data.langs.length).then((l) => navigate({ name: 'language', id: l.id }))
                    }}
                  >
                    <Badge l={p} size={22} />
                    <span className="flex-1">{p.name}</span>
                    <span className="text-xs text-muted">{p.native_name}</span>
                  </button>
                ))}
              <button
                className="flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-accent hover:bg-canvas"
                onClick={() => {
                  setAdding(false)
                  void createLanguage({ name: 'New language', native_name: '', code: '', flag: '?', color: '#64748b' }, data.langs.length).then((l) =>
                    navigate({ name: 'language', id: l.id })
                  )
                }}
              >
                <Icon name="plus" /> Another language…
              </button>
            </div>
          )}
        </div>
      </div>

      {shown.length === 0 ? (
        <div className="card p-8 text-center text-sm text-muted">
          {archived ? 'No paused languages.' : 'No languages yet — add the one you want to learn.'}
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {shown.map((l) => (
            <LanguageCard key={l.id} l={l} s={languageStats(l, data.logs, data.sessions, data.cards)} />
          ))}
        </div>
      )}

      <section className="card mt-6 p-5">
        <h2 className="mb-3 text-sm font-semibold">What actually works</h2>
        <div className="grid gap-3 text-sm md:grid-cols-2">
          {TIPS.map(([t, d]) => (
            <div key={t}>
              <div className="font-medium">{t}</div>
              <div className="text-muted">{d}</div>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}

function LanguageCard({ l, s }: { l: Language; s: LangStats }): React.JSX.Element {
  const exam = EXAMS[l.code]?.[l.target_level]
  return (
    <button className="card flex flex-col gap-4 p-5 text-left transition-shadow hover:shadow-md" onClick={() => navigate({ name: 'language', id: l.id })}>
      <div className="flex items-center gap-3">
        <Badge l={l} />
        <div className="min-w-0 flex-1">
          <div className="font-semibold">
            {l.name} <span className="font-normal text-muted">{l.native_name}</span>
          </div>
          <div className="text-xs text-muted">
            {l.level} → {l.target_level}
            {exam && ` (${exam})`}
            {l.target_date && ` by ${new Date(l.target_date + 'T00:00').toLocaleDateString(undefined, { month: 'short', year: 'numeric' })}`}
          </div>
        </div>
        <div className="relative flex items-center justify-center">
          <Ring value={s.today} goal={l.daily_goal_min} color={l.color} />
          <span className="absolute text-[10px] font-semibold">{Math.round(s.today)}m</span>
        </div>
      </div>
      <LevelBar level={l.level} target={l.target_level} color={l.color} />
      <div className="flex gap-4 text-sm">
        <span title="Days in a row you hit your daily goal">🔥 {s.streak}</span>
        <span className="text-muted">{fmtMin(s.week)} this week</span>
        <span className="text-muted">{s.words} words</span>
        {s.due > 0 && <span className="text-accent">{s.due} to review</span>}
      </div>
    </button>
  )
}

function LevelBar({ level, target, color }: { level: string; target: string; color: string }): React.JSX.Element {
  const i = LEVELS.indexOf(level as (typeof LEVELS)[number])
  const t = LEVELS.indexOf(target as (typeof LEVELS)[number])
  return (
    <div className="flex gap-1">
      {LEVELS.slice(1).map((lv, k) => {
        const idx = k + 1
        return (
          <div key={lv} className="flex flex-1 flex-col items-center gap-1">
            <div
              className="h-1.5 w-full rounded-full"
              style={{ background: idx <= i ? color : idx <= t ? color + '40' : 'var(--color-line)', outline: idx === t ? `1.5px solid ${color}` : undefined, outlineOffset: 1 }}
            />
            <span className={`text-[10px] ${idx === i ? 'font-semibold' : 'text-muted'}`}>{lv}</span>
          </div>
        )
      })}
    </div>
  )
}

// ---------- Detail ----------

export function LanguageDetailPage({ id }: { id: string }): React.JSX.Element {
  const data = useLanguageData()
  const l = data?.langs.find((x) => x.id === id)
  const s = useMemo(() => (l && data ? languageStats(l, data.logs, data.sessions, data.cards) : null), [l, data])
  if (!data) return <div />
  if (!l || !s) {
    return (
      <div className="p-8 text-sm text-muted">
        This language was removed.{' '}
        <button className="text-accent underline" onClick={() => navigate({ name: 'languages' })}>
          Back to languages
        </button>
      </div>
    )
  }
  const save = (patch: Partial<Language>): Promise<Language> => db.update('languages', l.id, patch)
  const logs = data.logs.filter((g) => g.language_id === l.id).reverse()

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-5 p-8">
      <div className="flex items-center gap-3">
        <button className="btn-ghost" onClick={() => navigate({ name: 'languages' })} title="All languages">
          <Icon name="back" />
        </button>
        <Badge l={l} size={48} />
        <div className="min-w-0 flex-1">
          <AutoText value={l.name} onSave={(v) => save({ name: v.trim() || 'Language' })} className="field text-2xl font-semibold tracking-tight" />
          <AutoText value={l.native_name} onSave={(v) => save({ native_name: v })} className="field text-sm text-muted" placeholder="Name in the language itself" />
        </div>
        <button
          className="btn"
          onClick={() => {
            void api.timer.setContext({ languageId: l.id, taskId: null })
            navigate({ name: 'focus' })
          }}
          title="Timed practice: counts towards today's minutes"
        >
          <Icon name="focus" /> Focus on {l.name}
        </button>
        <LangMenu l={l} save={save} />
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Tile label="Today" value={`${Math.round(s.today)} / ${l.daily_goal_min}m`} hint={s.today >= l.daily_goal_min ? 'goal met ✓' : 'daily goal'} />
        <Tile label="Streak" value={`🔥 ${s.streak}`} hint="days hitting the goal" />
        <Tile label="This week" value={fmtMin(s.week)} hint="last 7 days" />
        <Tile label="All time" value={fmtMin(s.total)} hint="logged + focus" />
        <Tile label="Vocabulary" value={String(s.words)} hint={s.due ? `${s.due} due to review` : 'all reviewed'} />
      </div>

      <LanguageLearn l={l} ensureDeck={ensureDeck} />

      <div className="grid gap-5 lg:grid-cols-[1.25fr_1fr]">
        <div className="flex flex-col gap-5">
          <LogPractice l={l} />
          <Vocab l={l} s={s} />
          <section className="card p-5">
            <h2 className="mb-3 text-sm font-semibold">Recent practice</h2>
            {logs.length === 0 ? (
              <p className="text-sm text-muted">Nothing logged yet. Focus sessions on this language count too.</p>
            ) : (
              <ul className="flex max-h-72 flex-col gap-1 overflow-auto text-sm">
                {logs.slice(0, 50).map((g) => (
                  <li key={g.id} className="group flex items-center gap-2">
                    <span className="w-20 shrink-0 text-xs text-muted">{new Date(g.date + 'T00:00').toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}</span>
                    <span title={g.skill}>{SKILLS.find((k) => k.id === g.skill)?.icon}</span>
                    <span className="min-w-0 flex-1 truncate">{g.activity || SKILLS.find((k) => k.id === g.skill)?.label}</span>
                    <span className="text-xs text-muted">{g.minutes}m</span>
                    <button className="btn-ghost invisible px-1 group-hover:visible" title="Delete" onClick={() => void db.remove('language_logs', g.id)}>
                      <Icon name="trash" size={13} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <div className="flex flex-col gap-5">
          <section className="card flex flex-col gap-3 p-5">
            <h2 className="text-sm font-semibold">Level &amp; target</h2>
            <div className="grid grid-cols-3 gap-2 text-sm">
              <label className="flex flex-col gap-1">
                <span className="text-xs text-muted">Now</span>
                <select className="field-boxed" value={l.level} onChange={(e) => void save({ level: e.target.value })}>
                  {LEVELS.map((v) => (
                    <option key={v}>{v}</option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs text-muted">Target</span>
                <select className="field-boxed" value={l.target_level} onChange={(e) => void save({ target_level: e.target.value })}>
                  {LEVELS.slice(1).map((v) => (
                    <option key={v} value={v}>
                      {v}
                      {EXAMS[l.code]?.[v] ? ` · ${EXAMS[l.code]![v]}` : ''}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs text-muted">By (exam/trip)</span>
                <input type="date" className="field-boxed" value={l.target_date ?? ''} onChange={(e) => void save({ target_date: e.target.value || null })} />
              </label>
            </div>
            <LevelBar level={l.level} target={l.target_level} color={l.color} />
            <p className="text-xs text-muted">
              <b className="text-ink">{l.level}:</b> {LEVEL_INFO[l.level]}
              <br />
              <b className="text-ink">{l.target_level}:</b> {LEVEL_INFO[l.target_level]}
            </p>
            <label className="flex items-center justify-between gap-2 text-sm">
              <span>Daily goal</span>
              <select className="field-boxed w-auto" value={l.daily_goal_min} onChange={(e) => void save({ daily_goal_min: Number(e.target.value) })}>
                {[5, 10, 15, 20, 30, 45, 60, 90].map((m) => (
                  <option key={m} value={m}>
                    {m} minutes
                  </option>
                ))}
              </select>
            </label>
          </section>

          <section className="card flex flex-col gap-2 p-5">
            <h2 className="text-sm font-semibold">Why I'm learning {l.name}</h2>
            <AutoText
              multiline
              rows={3}
              value={l.why}
              onSave={(v) => save({ why: v })}
              className="field-boxed text-sm"
              placeholder="e.g. Talk to my grandparents, watch anime without subtitles, a year abroad in Lyon…"
            />
          </section>

          <section className="card p-5">
            <h2 className="mb-1 text-sm font-semibold">Skill balance</h2>
            <p className="mb-3 text-xs text-muted">Last 30 days. Try to keep all four core skills moving.</p>
            <SkillBars s={s} color={l.color} />
          </section>

          <section className="card p-5">
            <h2 className="mb-3 text-sm font-semibold">Last 12 weeks</h2>
            <Heatmap byDay={s.byDay} goal={l.daily_goal_min} color={l.color} />
          </section>

          <Resources l={l} save={save} />
        </div>
      </div>
    </div>
  )
}

function Tile({ label, value, hint }: { label: string; value: string; hint: string }): React.JSX.Element {
  return (
    <div className="card p-4">
      <div className="text-xs text-muted">{label}</div>
      <div className="mt-1 text-xl font-semibold tabular-nums">{value}</div>
      <div className="text-[11px] text-muted">{hint}</div>
    </div>
  )
}

function LangMenu({ l, save }: { l: Language; save: (p: Partial<Language>) => Promise<Language> }): React.JSX.Element {
  const [open, setOpen] = useState(false)
  return (
    <div className="relative">
      <button className="btn-ghost" onClick={() => setOpen((v) => !v)} title="More">
        •••
      </button>
      {open && (
        <div className="card absolute right-0 z-20 mt-1 flex w-56 flex-col gap-2 p-3 text-sm shadow-xl">
          <label className="flex items-center justify-between gap-2">
            <span>Badge</span>
            <input className="field-boxed w-16 text-center" maxLength={3} value={l.flag} onChange={(e) => void save({ flag: e.target.value || '?' })} />
          </label>
          <label className="flex items-center justify-between gap-2">
            <span>Colour</span>
            <input type="color" value={l.color} onChange={(e) => void save({ color: e.target.value })} />
          </label>
          <label className="flex items-center justify-between gap-2">
            <span>Language code</span>
            <input className="field-boxed w-16 text-center" maxLength={5} value={l.code} onChange={(e) => void save({ code: e.target.value.toLowerCase() })} />
          </label>
          <button className="btn justify-center" onClick={() => void save({ active: l.active ? 0 : 1 }).then(() => setOpen(false))}>
            {l.active ? 'Pause this language' : 'Resume learning'}
          </button>
          <button
            className="btn justify-center text-danger"
            onClick={() => {
              if (!confirm(`Delete ${l.name} and its practice log? (Its vocabulary deck stays in Flashcards.)`)) return
              void db.remove('languages', l.id).then(() => navigate({ name: 'languages' }))
            }}
          >
            Delete
          </button>
        </div>
      )}
    </div>
  )
}

function LogPractice({ l }: { l: Language }): React.JSX.Element {
  const [minutes, setMinutes] = useState(15)
  const [skill, setSkill] = useState<LanguageSkill>('listening')
  const [activity, setActivity] = useState('')
  const [date, setDate] = useState(localDate(new Date()))
  const [saved, setSaved] = useState(false)
  const log = async (): Promise<void> => {
    await db.create('language_logs', { language_id: l.id, date, minutes, skill, activity: activity.trim() })
    setActivity('')
    setSaved(true)
    setTimeout(() => setSaved(false), 1800)
  }
  return (
    <section className="card flex flex-col gap-3 p-5">
      <h2 className="text-sm font-semibold">Log practice</h2>
      <div className="flex flex-wrap gap-1.5">
        {SKILLS.map((k) => (
          <button
            key={k.id}
            onClick={() => setSkill(k.id)}
            className={`rounded-full border px-3 py-1 text-sm ${skill === k.id ? 'border-transparent text-white' : 'border-line text-muted hover:text-ink'}`}
            style={skill === k.id ? { background: l.color } : undefined}
          >
            {k.icon} {k.label}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        {[5, 10, 15, 20, 30, 45, 60].map((m) => (
          <button key={m} onClick={() => setMinutes(m)} className={`rounded-md px-2.5 py-1 text-sm ${minutes === m ? 'bg-accent-soft font-medium text-accent' : 'text-muted hover:bg-line/50'}`}>
            {m}m
          </button>
        ))}
        <input
          type="number"
          min={1}
          max={600}
          className="field-boxed w-20"
          value={minutes}
          onChange={(e) => setMinutes(Math.max(1, Math.min(600, Number(e.target.value) || 1)))}
          aria-label="Minutes"
        />
        <input type="date" className="field-boxed w-auto" value={date} max={localDate(new Date())} onChange={(e) => setDate(e.target.value || localDate(new Date()))} />
      </div>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          void log()
        }}
      >
        <input
          className="field-boxed flex-1"
          value={activity}
          onChange={(e) => setActivity(e.target.value)}
          placeholder={skill === 'listening' ? 'e.g. Podcast episode, anime with JP subs' : skill === 'speaking' ? 'e.g. Shadowing, chat with a tutor' : 'What did you do? (optional)'}
        />
        <button className="btn-primary">{saved ? 'Logged ✓' : `Log ${minutes}m`}</button>
      </form>
    </section>
  )
}

function Vocab({ l, s }: { l: Language; s: LangStats }): React.JSX.Element {
  const [word, setWord] = useState('')
  const [reading, setReading] = useState('')
  const [meaning, setMeaning] = useState('')
  const needsReading = l.code === 'ja' || l.code === 'zh' || l.code === 'ko' || l.code === 'ar' || l.code === 'ru' || l.code === 'hi'
  const add = async (): Promise<void> => {
    if (!word.trim() || !meaning.trim()) return
    const deck = await ensureDeck(l)
    await db.create('flashcards', { deck_id: deck, front: word.trim(), back: reading.trim() ? `${reading.trim()} — ${meaning.trim()}` : meaning.trim() })
    setWord('')
    setReading('')
    setMeaning('')
    document.getElementById('vocab-word')?.focus()
  }
  return (
    <section className="card flex flex-col gap-3 p-5">
      <div className="flex items-center gap-2">
        <h2 className="flex-1 text-sm font-semibold">Vocabulary</h2>
        {s.words > 0 && (
          <button className="btn" onClick={() => void ensureDeck(l).then((id) => navigate({ name: 'deck', id }))}>
            Open deck
          </button>
        )}
        <button className="btn-primary" disabled={!s.due} onClick={() => void ensureDeck(l).then((id) => navigate({ name: 'deck', id, review: true }))}>
          Review {s.due || ''}
        </button>
      </div>
      <form
        className="flex flex-wrap gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          void add()
        }}
      >
        <input id="vocab-word" className="field-boxed min-w-24 flex-1" value={word} onChange={(e) => setWord(e.target.value)} placeholder={`Word in ${l.name}`} />
        {needsReading && <input className="field-boxed min-w-24 flex-1" value={reading} onChange={(e) => setReading(e.target.value)} placeholder={l.code === 'zh' ? 'Pinyin' : 'Reading'} />}
        <input className="field-boxed min-w-24 flex-1" value={meaning} onChange={(e) => setMeaning(e.target.value)} placeholder="Meaning" />
        <button className="btn" disabled={!word.trim() || !meaning.trim()}>
          <Icon name="plus" /> Add
        </button>
      </form>
      <p className="text-xs text-muted">Add words you meet in real content. Each becomes a spaced-repetition flashcard (+1 💎 per review in Pixel Quest).</p>
    </section>
  )
}

function SkillBars({ s, color }: { s: LangStats; color: string }): React.JSX.Element {
  const rows = [...SKILLS.map((k) => ({ label: `${k.icon} ${k.label}`, min: s.bySkill.get(k.id) ?? 0 })), { label: '⏱️ Focus sessions', min: s.bySkill.get('focus') ?? 0 }]
  const max = Math.max(1, ...rows.map((r) => r.min))
  return (
    <div className="flex flex-col gap-1.5 text-sm">
      {rows.map((r) => (
        <div key={r.label} className="flex items-center gap-2">
          <span className="w-32 shrink-0 text-xs">{r.label}</span>
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-line">
            <div className="h-full rounded-full" style={{ width: `${(r.min / max) * 100}%`, background: color }} />
          </div>
          <span className="w-12 text-right text-xs text-muted">{fmtMin(r.min)}</span>
        </div>
      ))}
    </div>
  )
}

export function Heatmap({ byDay, goal, color }: { byDay: Map<string, number>; goal: number; color: string }): React.JSX.Element {
  const today = localDate(new Date())
  const dow = (new Date().getDay() + 6) % 7 // Monday = 0
  const start = addDays(today, -(7 * 11 + dow))
  return (
    <div className="flex gap-[3px]">
      {Array.from({ length: 12 }, (_, w) => (
        <div key={w} className="flex flex-col gap-[3px]">
          {Array.from({ length: 7 }, (_, d) => {
            const date = addDays(start, w * 7 + d)
            if (date > today) return <span key={d} className="h-3 w-3" />
            const m = byDay.get(date) ?? 0
            const k = m <= 0 ? 0 : m >= goal ? 1 : 0.35 + 0.4 * (m / goal)
            return <span key={d} title={`${date}: ${Math.round(m)} min`} className="h-3 w-3 rounded-sm" style={{ background: k ? color : 'var(--color-line)', opacity: k ? k : 1 }} />
          })}
        </div>
      ))}
    </div>
  )
}

function Resources({ l, save }: { l: Language; save: (p: Partial<Language>) => Promise<Language> }): React.JSX.Element {
  const list = parseResources(l)
  const [title, setTitle] = useState('')
  const [url, setUrl] = useState('')
  const add = (): void => {
    let u = url.trim()
    if (!u) return
    if (!/^https?:\/\//i.test(u)) u = `https://${u}`
    void save({ resources: JSON.stringify([...list, { title: title.trim() || u.replace(/^https?:\/\//, ''), url: u }]) })
    setTitle('')
    setUrl('')
  }
  return (
    <section className="card flex flex-col gap-2 p-5">
      <h2 className="text-sm font-semibold">Resources</h2>
      {list.length === 0 && <p className="text-xs text-muted">Bookmark the courses, channels and dictionaries you use.</p>}
      <ul className="flex flex-col gap-1 text-sm">
        {list.map((r, i) => (
          <li key={i} className="group flex items-center gap-2">
            <Icon name="external" size={13} className="text-muted" />
            <button className="min-w-0 flex-1 truncate text-left text-accent hover:underline" onClick={() => window.open(r.url)} title={r.url}>
              {r.title}
            </button>
            <button className="btn-ghost invisible px-1 group-hover:visible" title="Remove" onClick={() => void save({ resources: JSON.stringify(list.filter((_, j) => j !== i)) })}>
              <Icon name="x" size={13} />
            </button>
          </li>
        ))}
      </ul>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          add()
        }}
      >
        <input className="field-boxed w-28" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Name" />
        <input className="field-boxed flex-1" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="Link" />
        <button className="btn" disabled={!url.trim()}>
          Add
        </button>
      </form>
    </section>
  )
}
