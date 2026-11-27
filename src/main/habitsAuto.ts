// Habits that tick themselves: doing the thing in Studyhall ticks the habit that's about it, if you have one.
//  • a recall quiz → a habit about studying, revising, recall or quizzes
//  • a focus session of 15 minutes or more → focus, deep work or study
//  • the evening diary → journal, diary or reflecting
// Today only, once. Shared by the PC and the phone (the database only).
import { create, getProfileId, list } from './db'

const WORDS: Record<'recall' | 'focus' | 'diary', RegExp> = {
  recall: /\b(stud(y|ying)|revis(e|ion|ing)|recall|quiz|flashcards?)\b/i,
  focus: /\b(focus|deep work|stud(y|ying)|pomodoro)\b/i,
  diary: /\b(journal(ling)?|diary|reflect(ion|ing)?|gratitude)\b/i
}
const today = (): string => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Ticks today's habit for this kind of thing done (the first habit whose name fits). The habit's name, or null. */
export function tickHabit(kind: 'recall' | 'focus' | 'diary'): string | null {
  try {
    const me = getProfileId()
    const h = list<{ id: string; name: string; archived: number; owner_id: string }>('habits', { archived: 0 }).find((x) => x.owner_id === me && WORDS[kind].test(x.name))
    if (!h) return null
    const day = today()
    if (list<{ habit_id: string; date: string }>('habit_checks', { habit_id: h.id }).some((c) => c.date === day)) return h.name
    create('habit_checks', { habit_id: h.id, date: day })
    return h.name
  } catch {
    return null
  }
}
