// Built-in lessons and practice for a language: writing system, phrasebook, starter
// words, grammar and quick drills (with pronunciation via the voices built into Windows).

import { useEffect, useMemo, useState } from 'react'
import type { Flashcard, Language, LangItem } from '@shared/types'
import { Icon } from '@/components/ui'
import { api, db, useLive } from '@/lib/data'
import { COURSES, type Course, type Entry } from '@/lib/langContent'

// ---------- Speech ----------

function voiceFor(tag: string): SpeechSynthesisVoice | null {
  const voices = speechSynthesis.getVoices()
  const lang = tag.split('-')[0]
  return voices.find((v) => v.lang === tag) ?? voices.find((v) => v.lang.toLowerCase().startsWith(lang)) ?? null
}

function useVoice(tag: string): SpeechSynthesisVoice | null {
  const [v, setV] = useState<SpeechSynthesisVoice | null>(() => voiceFor(tag))
  useEffect(() => {
    const update = (): void => setV(voiceFor(tag))
    update()
    speechSynthesis.addEventListener('voiceschanged', update)
    return () => speechSynthesis.removeEventListener('voiceschanged', update)
  }, [tag])
  return v
}

export function speak(text: string, voice: SpeechSynthesisVoice | null, rate = 0.85): void {
  if (!voice) return
  speechSynthesis.cancel()
  const u = new SpeechSynthesisUtterance(text.replace(/〇〇|___|…/g, ''))
  u.voice = voice
  u.lang = voice.lang
  u.rate = rate
  speechSynthesis.speak(u)
}

function Say({ text, voice }: { text: string; voice: SpeechSynthesisVoice | null }): React.JSX.Element | null {
  if (!voice) return null
  return (
    <button className="btn-ghost shrink-0 px-1 text-base" title="Listen" onClick={(e) => (e.stopPropagation(), speak(text, voice))}>
      🔊
    </button>
  )
}

function NoVoiceHint({ name }: { name: string }): React.JSX.Element {
  return (
    <div className="rounded-lg bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
      To hear {name} spoken, add the free {name} voice in Windows: <b>Settings → Time &amp; language → Speech → Add voices</b>, then restart Studyhall.
    </div>
  )
}

/** What to read aloud for a script row: the Japanese/Chinese characters if there are any, else the example word. */
const CJK = /[぀-ヿ㐀-鿿]+/
const sayFor = (a: string, c: string): string => CJK.exec(a)?.[0] ?? CJK.exec(c)?.[0] ?? c.split(' (')[0]

// ---------- Progress ----------

function useProgress(languageId: string): { items: LangItem[]; record: (kind: string, key: string, right: boolean) => void } {
  const items = useLive(['lang_items'], () => api.list('lang_items', { language_id: languageId }), [languageId]).data ?? []
  const record = (kind: string, key: string, right: boolean): void => {
    const it = items.find((x) => x.kind === kind && x.item_key === key)
    const now = new Date().toISOString()
    if (it) void db.update('lang_items', it.id, { seen: it.seen + 1, correct: it.correct + (right ? 1 : 0), streak: right ? it.streak + 1 : 0, last_at: now })
    else void db.create('lang_items', { language_id: languageId, kind, item_key: key, seen: 1, correct: right ? 1 : 0, streak: right ? 1 : 0, last_at: now })
  }
  return { items, record }
}

const mastered = (items: LangItem[], kind: string, keys: string[]): number => keys.filter((k) => (items.find((x) => x.kind === kind && x.item_key === k)?.streak ?? 0) >= 2).length

// ---------- Main ----------

type Tab = 'script' | 'phrases' | 'words' | 'grammar' | 'practice'

export function LanguageLearn({ l, ensureDeck }: { l: Language; ensureDeck: (l: Language) => Promise<string> }): React.JSX.Element {
  const course = COURSES[l.code]
  const voice = useVoice(course?.tts ?? `${l.code}`)
  const [tab, setTab] = useState<Tab>(course ? 'practice' : 'practice')
  const progress = useProgress(l.id)
  const deck = useLive(['flashcards'], async () => (l.deck_id ? api.list('flashcards', { deck_id: l.deck_id }) : []), [l.deck_id]).data ?? []

  const tabs: [Tab, string][] = course
    ? [
        ['practice', '🎯 Practice'],
        ['script', l.code === 'ja' ? 'あ Kana' : l.code === 'zh' ? '声 Tones & radicals' : '🔤 Sounds'],
        ['phrases', '💬 Phrasebook'],
        ['words', '🧠 Starter words'],
        ['grammar', '🧩 Grammar']
      ]
    : [['practice', '🎯 Practice']]

  return (
    <section className="card flex flex-col gap-4 p-5">
      <div className="flex flex-wrap gap-1 rounded-lg bg-line/50 p-0.5 text-sm">
        {tabs.map(([k, label]) => (
          <button key={k} onClick={() => setTab(k)} className={`rounded-md px-3 py-1 ${tab === k ? 'bg-panel font-medium shadow-sm' : 'text-muted'}`}>
            {label}
          </button>
        ))}
      </div>
      {!voice && course && <NoVoiceHint name={l.name} />}
      {tab === 'practice' && <Practice l={l} course={course} voice={voice} progress={progress} deck={deck} />}
      {course && tab === 'script' && <Scripts course={course} voice={voice} progress={progress.items} />}
      {course && tab === 'phrases' && <Phrases course={course} voice={voice} />}
      {course && tab === 'words' && <Words l={l} course={course} voice={voice} deck={deck} ensureDeck={ensureDeck} />}
      {course && tab === 'grammar' && <Grammar course={course} voice={voice} />}
    </section>
  )
}

function Scripts({ course, voice, progress }: { course: Course; voice: SpeechSynthesisVoice | null; progress: LangItem[] }): React.JSX.Element {
  return (
    <div className="flex flex-col gap-5">
      {course.scripts.map((s) => {
        const grid = s.quiz === 'reading'
        return (
          <div key={s.title}>
            <div className="mb-1 flex items-baseline gap-2">
              <h3 className="font-semibold">{s.title}</h3>
              <span className="text-xs text-muted">
                {mastered(progress, `script:${s.title}`, s.items.map((i) => i[0]))}/{s.items.length} mastered
              </span>
            </div>
            <p className="mb-3 text-sm text-muted">{s.note}</p>
            {grid ? (
              <div className="grid grid-cols-5 gap-1.5 sm:grid-cols-10">
                {s.items.map(([ch, r]) => {
                  const st = progress.find((x) => x.kind === `script:${s.title}` && x.item_key === ch)?.streak ?? 0
                  return (
                    <button
                      key={ch}
                      onClick={() => speak(ch, voice)}
                      className={`flex flex-col items-center rounded-lg border py-1.5 hover:bg-canvas ${st >= 2 ? 'border-ok/50 bg-ok/5' : 'border-line'}`}
                      title={voice ? 'Listen' : r}
                    >
                      <span className="text-2xl">{ch}</span>
                      <span className="text-[11px] text-muted">{r}</span>
                    </button>
                  )
                })}
              </div>
            ) : (
              <div className="grid gap-1.5 sm:grid-cols-2">
                {s.items.map(([a, b, c]) => (
                  <div key={a} className="flex items-center gap-3 rounded-lg border border-line px-3 py-2 text-sm">
                    <span className="min-w-14 text-lg font-semibold">{a}</span>
                    <div className="min-w-0 flex-1">
                      <div>{b}</div>
                      <div className="text-xs text-muted">{c}</div>
                    </div>
                    <Say text={sayFor(a, c)} voice={voice} />
                  </div>
                ))}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

function EntryRow({ e, voice }: { e: Entry; voice: SpeechSynthesisVoice | null }): React.JSX.Element {
  return (
    <div className="flex items-center gap-3 rounded-lg px-2 py-1.5 hover:bg-canvas">
      <Say text={e[0]} voice={voice} />
      <div className="min-w-0 flex-1">
        <div className="font-medium">{e[0]}</div>
        {e[1] && <div className="text-xs text-muted">{e[1]}</div>}
      </div>
      <div className="max-w-[45%] text-right text-sm text-muted">{e[2]}</div>
    </div>
  )
}

function Phrases({ course, voice }: { course: Course; voice: SpeechSynthesisVoice | null }): React.JSX.Element {
  return (
    <div className="grid gap-5 md:grid-cols-2">
      {course.phrases.map((g) => (
        <div key={g.title}>
          <h3 className="mb-1 text-sm font-semibold">{g.title}</h3>
          {g.items.map((e) => (
            <EntryRow key={e[0]} e={e} voice={voice} />
          ))}
        </div>
      ))}
    </div>
  )
}

function Words({ l, course, voice, deck, ensureDeck }: { l: Language; course: Course; voice: SpeechSynthesisVoice | null; deck: Flashcard[]; ensureDeck: (l: Language) => Promise<string> }): React.JSX.Element {
  const [busy, setBusy] = useState<string | null>(null)
  const inDeck = new Set(deck.map((c) => c.front))
  const addGroup = async (items: Entry[], title: string): Promise<void> => {
    setBusy(title)
    const id = await ensureDeck(l)
    for (const [w, r, m] of items) if (!inDeck.has(w)) await db.create('flashcards', { deck_id: id, front: w, back: r ? `${r} — ${m}` : m })
    setBusy(null)
  }
  return (
    <div className="grid gap-5 md:grid-cols-2">
      {course.vocab.map((g) => {
        const missing = g.items.filter((e) => !inDeck.has(e[0])).length
        return (
          <div key={g.title}>
            <div className="mb-1 flex items-center gap-2">
              <h3 className="flex-1 text-sm font-semibold">{g.title}</h3>
              <button className="btn px-2 py-0.5 text-xs" disabled={!missing || busy !== null} onClick={() => void addGroup(g.items, g.title)}>
                {busy === g.title ? 'Adding…' : missing ? `+ Add ${missing} to my flashcards` : '✓ In my flashcards'}
              </button>
            </div>
            {g.items.map((e) => (
              <EntryRow key={e[0]} e={e} voice={voice} />
            ))}
          </div>
        )
      })}
    </div>
  )
}

function Grammar({ course, voice }: { course: Course; voice: SpeechSynthesisVoice | null }): React.JSX.Element {
  const [open, setOpen] = useState(0)
  return (
    <div className="flex flex-col gap-2">
      {course.lessons.map((lesson, i) => (
        <div key={lesson.title} className="rounded-lg border border-line">
          <button className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm font-semibold" onClick={() => setOpen(open === i ? -1 : i)}>
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-accent-soft text-xs text-accent">{i + 1}</span>
            <span className="flex-1">{lesson.title}</span>
            <Icon name="chevron" className={`transition-transform ${open === i ? 'rotate-90' : ''}`} />
          </button>
          {open === i && (
            <div className="flex flex-col gap-2 border-t border-line px-4 py-3 text-sm">
              {lesson.body.map((p, k) => (
                <p key={k}>{p}</p>
              ))}
              <div className="mt-1 rounded-lg bg-canvas p-2">
                {lesson.examples.map((e) => (
                  <EntryRow key={e[0]} e={e} voice={voice} />
                ))}
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

// ---------- Practice ----------

interface Q {
  kind: string // progress bucket
  key: string
  prompt: string
  sub?: string
  say?: string // text to speak
  options: string[]
  answer: number
}

const shuffle = <T,>(a: T[]): T[] => {
  const b = [...a]
  for (let i = b.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[b[i], b[j]] = [b[j], b[i]]
  }
  return b
}
const pick = <T,>(a: T[], n: number): T[] => shuffle(a).slice(0, n)

/** Four options: the right one plus three different wrong ones. */
function choices(right: string, pool: string[]): { options: string[]; answer: number } {
  const wrong = pick(
    [...new Set(pool)].filter((x) => x !== right),
    3
  )
  const options = shuffle([right, ...wrong])
  return { options, answer: options.indexOf(right) }
}

type Mode = { id: string; label: string; hint: string; make: () => Q | null; needsVoice?: boolean }

function Practice({
  l,
  course,
  voice,
  progress,
  deck
}: {
  l: Language
  course: Course | undefined
  voice: SpeechSynthesisVoice | null
  progress: ReturnType<typeof useProgress>
  deck: Flashcard[]
}): React.JSX.Element {
  const words: Entry[] = useMemo(() => {
    const own: Entry[] = deck.map((c) => {
      const [r, m] = c.back.includes(' — ') ? c.back.split(' — ') : ['', c.back]
      return [c.front, r, m]
    })
    return [...(course?.vocab.flatMap((g) => g.items) ?? []), ...own.filter((o) => !course?.vocab.some((g) => g.items.some((i) => i[0] === o[0])))]
  }, [course, deck])

  const modes: Mode[] = []
  const shortMeaning = (m: string): string => m.split(' (')[0]
  if (words.length >= 4) {
    modes.push({
      id: 'word',
      label: 'Word → meaning',
      hint: 'See a word, pick what it means.',
      make: () => {
        const w = pick(words, 1)[0]
        return { kind: 'word', key: w[0], prompt: w[0], sub: w[1], say: w[0], ...choices(shortMeaning(w[2]), words.map((x) => shortMeaning(x[2]))) }
      }
    })
    modes.push({
      id: 'meaning',
      label: 'Meaning → word',
      hint: 'See the English, pick the word.',
      make: () => {
        const w = pick(words, 1)[0]
        return { kind: 'word', key: w[0], prompt: w[2], say: w[0], ...choices(w[0], words.map((x) => x[0])) }
      }
    })
    modes.push({
      id: 'listen',
      label: 'Listening',
      hint: 'Hear a word, pick the meaning.',
      needsVoice: true,
      make: () => {
        const w = pick(words, 1)[0]
        return { kind: 'listen', key: w[0], prompt: '🔊', say: w[0], ...choices(shortMeaning(w[2]), words.map((x) => shortMeaning(x[2]))) }
      }
    })
  }
  if (course) {
    for (const s of course.scripts) {
      const idx = /radical/i.test(s.title) ? 2 : 1 // radicals: ask the meaning
      const ans = (x: Entry): string => x[idx].split(' (')[0]
      modes.push({
        id: `script:${s.title}`,
        label: s.title,
        hint: s.quiz === 'reading' ? 'See a character, pick its sound.' : 'Pick the right description.',
        make: () => {
          const it = pick(s.items, 1)[0]
          return { kind: `script:${s.title}`, key: it[0], prompt: it[0], say: sayFor(it[0], it[2]), ...choices(ans(it), s.items.map(ans)) }
        }
      })
    }
    const phrases = course.phrases.flatMap((g) => g.items)
    modes.push({
      id: 'phrase',
      label: 'Phrases',
      hint: 'What would you say?',
      make: () => {
        const p = pick(phrases, 1)[0]
        return { kind: 'phrase', key: p[0], prompt: p[2], say: p[0], ...choices(p[0], phrases.map((x) => x[0])) }
      }
    })
    modes.push({
      id: 'number',
      label: 'Numbers 0–99',
      hint: 'See a number, pick how it’s said.',
      make: () => {
        const n = Math.floor(Math.random() * 100)
        const near = [n - 10, n + 10, n - 1, n + 1, n + 11, n - 11, (n + 50) % 100, 99 - n].filter((x) => x >= 0 && x < 100 && x !== n)
        const fmt = (x: number): string => {
          const r = course.number(x)
          return r.roman ? `${r.text} (${r.roman})` : r.text
        }
        return { kind: 'number', key: String(n), prompt: String(n), say: course.number(n).text, ...choices(fmt(n), near.map(fmt)) }
      }
    })
    if (course.genders) {
      const g = course.genders
      const nouns = words.map((w) => /^(\S+)\s+(.+)$/.exec(w[0])).filter((m): m is RegExpExecArray => !!m && g.articles.includes(m[1]))
      if (nouns.length >= 4) {
        modes.push({
          id: 'gender',
          label: g.label,
          hint: 'Pick the article — the key to German/French nouns.',
          make: () => {
            const m = pick(nouns, 1)[0]
            return { kind: 'gender', key: m[0], prompt: m[2], say: m[0], options: g.articles, answer: g.articles.indexOf(m[1]) }
          }
        })
      }
    }
  }

  const [modeId, setModeId] = useState<string | null>(null)
  const [q, setQ] = useState<Q | null>(null)
  const [picked, setPicked] = useState<number | null>(null)
  const [score, setScore] = useState({ right: 0, total: 0 })
  const mode = modes.find((m) => m.id === modeId)

  const next = (m = mode): void => {
    if (!m) return
    const nq = m.make()
    setQ(nq)
    setPicked(null)
    if (nq?.say && (m.id === 'listen' || m.id.startsWith('script:'))) setTimeout(() => speak(nq.say!, voice), 150)
  }
  const answer = (i: number): void => {
    if (!q || picked !== null) return
    setPicked(i)
    const right = i === q.answer
    setScore((s) => ({ right: s.right + (right ? 1 : 0), total: s.total + 1 }))
    progress.record(q.kind, q.key, right)
    if (q.say && voice && mode?.id !== 'listen') speak(q.say, voice)
  }
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (!q) return
      if (/^[1-4]$/.test(e.key) && picked === null) answer(Number(e.key) - 1)
      else if ((e.key === 'Enter' || e.key === ' ') && picked !== null) {
        e.preventDefault()
        next()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  if (!mode || !q) {
    return (
      <div className="flex flex-col gap-3">
        {modes.length === 0 && (
          <p className="text-sm text-muted">Add at least four words to this language's vocabulary (above) and practice drills appear here.</p>
        )}
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {modes.map((m) => {
            const disabled = m.needsVoice && !voice
            const seen = progress.items.filter((x) => x.kind === (m.id === 'meaning' ? 'word' : m.id) && x.seen > 0)
            return (
              <button
                key={m.id}
                disabled={disabled}
                onClick={() => {
                  setModeId(m.id)
                  setScore({ right: 0, total: 0 })
                  next(m)
                }}
                className="flex flex-col items-start gap-0.5 rounded-xl border border-line p-3 text-left hover:border-accent hover:bg-accent-soft/40 disabled:opacity-40"
                title={disabled ? 'Needs a voice for this language (see above)' : ''}
              >
                <span className="font-medium">{m.label}</span>
                <span className="text-xs text-muted">{m.hint}</span>
                {seen.length > 0 && <span className="mt-1 text-[11px] text-ok">{seen.filter((x) => x.streak >= 2).length} mastered</span>}
              </button>
            )
          })}
        </div>
        <p className="text-xs text-muted">Each answer earns 💎 in Pixel Quest. Keys 1–4 answer, Enter goes on.</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center gap-4 py-2">
      <div className="flex w-full items-center gap-2 text-sm">
        <button className="btn-ghost" onClick={() => setModeId(null)}>
          <Icon name="back" /> Drills
        </button>
        <span className="flex-1 font-medium">{mode.label}</span>
        <span className="text-muted">
          {score.right}/{score.total}
        </span>
      </div>
      <button
        className={`min-h-24 px-6 text-center ${q.prompt.length > 20 ? 'text-xl' : 'text-5xl'} font-semibold`}
        onClick={() => q.say && speak(q.say, voice)}
        title={q.say && voice ? 'Listen again' : undefined}
        style={{ color: l.color }}
      >
        {q.prompt}
        {q.sub && picked !== null && <div className="mt-1 text-base font-normal text-muted">{q.sub}</div>}
      </button>
      <div className="grid w-full max-w-xl gap-2 sm:grid-cols-2">
        {q.options.map((o, i) => (
          <button
            key={i}
            onClick={() => answer(i)}
            disabled={picked !== null}
            className={`rounded-xl border px-4 py-3 text-left text-sm transition-colors ${
              picked === null ? 'border-line hover:border-accent hover:bg-accent-soft/40' : i === q.answer ? 'border-ok bg-ok/10 font-medium' : i === picked ? 'border-danger bg-danger/10' : 'border-line opacity-50'
            }`}
          >
            <span className="mr-2 text-xs text-muted">{i + 1}</span>
            {o}
          </button>
        ))}
      </div>
      {picked !== null && (
        <button className="btn-primary" onClick={() => next()} autoFocus>
          {picked === q.answer ? 'Correct! Next →' : 'Next →'}
        </button>
      )}
    </div>
  )
}
