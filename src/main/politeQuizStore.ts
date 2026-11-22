import { app, BrowserWindow } from 'electron'
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { SavedQuiz, SavedQuizQuestion } from '@shared/types'

const DIR = (): string => join(app.getPath('userData'), 'nova', 'quizzes')
const safeId = (id: string): string => id.replace(/[^a-zA-Z0-9_-]/g, '')
const fileOf = (id: string): string => join(DIR(), `${safeId(id)}.json`)

function notifyChanged(): void {
  for (const w of BrowserWindow.getAllWindows()) {
    if (!w.isDestroyed()) w.webContents.send('quizzes:changed')
  }
}

export async function listSavedQuizzes(): Promise<SavedQuiz[]> {
  try {
    const dir = DIR()
    const files = (await readdir(dir)).filter((f) => f.endsWith('.json'))
    const out: SavedQuiz[] = []
    for (const f of files) {
      try {
        const parsed = JSON.parse(await readFile(join(dir, f), 'utf8')) as SavedQuiz
        if (parsed && parsed.id && Array.isArray(parsed.questions)) out.push(parsed)
      } catch { /* ignore corrupt entry */ }
    }
    return out.sort((a, b) =>
      (b.submittedAt ?? b.startedAt).localeCompare(a.submittedAt ?? a.startedAt)
    )
  } catch {
    return []
  }
}

export async function getSavedQuiz(id: string): Promise<SavedQuiz | null> {
  const clean = safeId(id)
  if (!clean) return null
  try {
    return JSON.parse(await readFile(fileOf(clean), 'utf8')) as SavedQuiz
  } catch {
    return null
  }
}

export async function upsertSavedQuiz(quiz: SavedQuiz): Promise<SavedQuiz> {
  await mkdir(DIR(), { recursive: true })
  await writeFile(fileOf(quiz.id), JSON.stringify(quiz, null, 2), 'utf8')
  notifyChanged()
  return quiz
}

export async function deleteSavedQuiz(id: string): Promise<boolean> {
  const clean = safeId(id)
  if (!clean) return false
  await rm(fileOf(clean), { force: true }).catch(() => {})
  notifyChanged()
  return true
}

export async function reviewQuizQuestion(
  quizId: string,
  questionId: string,
  grade: 1 | 3 | 4 | 5
): Promise<SavedQuiz | null> {
  const quiz = await getSavedQuiz(quizId)
  if (!quiz) return null
  const q = quiz.questions.find((item) => item.id === questionId)
  if (!q) return null

  const now = new Date()
  let ease = Number.isFinite(q.ease) ? q.ease : 2.5
  let repetitions = Number.isFinite(q.repetitions) ? q.repetitions : 0
  let interval_days = Number.isFinite(q.interval_days) ? q.interval_days : 0

  if (grade < 3) {
    repetitions = 0
    interval_days = 0
  } else {
    interval_days =
      repetitions === 0 ? 1 : repetitions === 1 ? 6 : Math.round(interval_days * ease)
    repetitions += 1
  }
  ease = Math.max(1.3, ease + (0.1 - (5 - grade) * (0.08 + (5 - grade) * 0.02)))

  const due = new Date(now)
  if (grade < 3) due.setMinutes(due.getMinutes() + 10)
  else due.setDate(due.getDate() + interval_days)

  q.ease = Math.round(ease * 100) / 100
  q.repetitions = repetitions
  q.interval_days = interval_days
  q.due_at = due.toISOString()
  q.last_reviewed_at = now.toISOString()
  return upsertSavedQuiz(quiz)
}

export async function updateQuizQuestionNote(
  quizId: string,
  questionId: string,
  note: string
): Promise<SavedQuiz | null> {
  const quiz = await getSavedQuiz(quizId)
  if (!quiz) return null
  const q = quiz.questions.find((item) => item.id === questionId)
  if (!q) return null
  q.note = String(note ?? '').trim()
  return upsertSavedQuiz(quiz)
}

export async function createManualQuiz(input: {
  title: string
  course: string
  questions: { prompt: string; options?: string[]; chosen?: string[]; note?: string }[]
}): Promise<SavedQuiz> {
  const now = new Date().toISOString()
  const id = `q_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`
  const questions: SavedQuizQuestion[] = (input.questions ?? [])
    .filter((q) => q.prompt?.trim())
    .map((q, idx) => ({
      id: `item_${idx + 1}_${Math.random().toString(36).slice(2, 6)}`,
      prompt: q.prompt.trim(),
      kind: q.options && q.options.length ? 'radio' : 'text',
      options: (q.options ?? []).map((o) => o.trim()).filter(Boolean),
      chosen: (q.chosen ?? []).map((c) => c.trim()).filter(Boolean),
      images: [],
      note: (q.note ?? '').trim(),
      ease: 2.5,
      repetitions: 0,
      interval_days: 0,
      due_at: now
    }))
  return upsertSavedQuiz({
    id,
    title: input.title.trim() || 'Practice Quiz',
    course: input.course.trim() || 'General',
    url: '',
    startedAt: now,
    submittedAt: now,
    questions
  })
}
