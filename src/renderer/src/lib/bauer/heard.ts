// Keeping Bauer from acting on things you didn't ask him: checking the wake word really was said,
// ignoring small talk and half sentences, and only keeping actions your words actually support.

import { readCheckin, similarity } from '@/lib/brief'

/** How each name tends to come out of speech recognition ("Hey Nova" → "hey nover", …). */
const SOUNDS_LIKE: Record<string, string> = {
  nova: 'nova|novah|nover|noah|no va|novak',
  atlas: 'atlas|atlus|atless|at last|atlases',
  onyx: 'onyx|onix|on x|onyxes|annex',
  bauer: "bauer|bower|bowers|bauers|power|powers|tower|brower|bauer's|boa|bauder|baua|bow"
}
// Every name is accepted at the start, so changing the name never strands an old habit.
const ANY_NAME = Object.values(SOUNDS_LIKE).join('|')
const WAKE = new RegExp(`^(?:\\W*(?:hey|hi|hay|a|okay|ok|oi)\\W+)?\\W*(?:${ANY_NAME})\\b\\W*`, 'i')

/** Remove a leading "Hey Nova," from what was heard. */
export const stripWake = (t: string): string => t.replace(WAKE, '').trim()

/** After a wake-word start, the recording should begin with something like "Hey Nova".
 *  (It holds ~1.3 s from before the wake word was spotted, so the real thing shows up.) */
export function wakeWordHeard(t: string): boolean {
  const first = t.trim().split(/\s+/).slice(0, 4).join(' ')
  return WAKE.test(first) || (/^\W*(?:hey|hi|okay|ok)\W+\w+/i.test(first) && new RegExp(`\\b(?:${ANY_NAME})\\b`, 'i').test(t.slice(0, 40)))
}

const CHITCHAT = /^(?:ok(?:ay)?|yes|yeah|yep|no|nope|nah|sure|thanks?|thank you|cheers|cool|nice|great|right|ready|done|oh(?: my)? god|oh no|hmm+|um+|uh+|what|huh|wait|sorry|hello|hi|hey|bye|good(?: night| morning)?|(?:hey |hi )?(?:man|bro|dude)?,? ?(?:what'?s up|how are you|how'?s it going))[\s!?.,]*$/i

/** Small talk, a single word, or half a sentence: nothing for Bauer to do. */
export function isChitChat(t: string): boolean {
  const s = t.trim().replace(/[.!?…]+$/, '')
  const words = s.split(/\s+/).filter(Boolean)
  if (!words.length) return true
  if (CHITCHAT.test(s)) return true
  if (words.length < 3 && !/\b(open|explain|undo|cancel|stop|journal|inbox)\b/i.test(s)) return true
  // "Can you", "and then he's not really…" — trails off without saying what.
  if (/^(?:can|could|would|will) you\W*$/i.test(s)) return true
  return false
}

const TASK = /\b(task|remind|reminder|to-?do|need to|have to|got to|gotta|must|i'?ll|i will|promised|deadline|due|don'?t let me forget|add)\b/i
const EVENT = /\b(event|meeting|appointment|class|lecture|tutorial|session|book|schedule|calendar|put|add|at \d|\d ?(am|pm)|tomorrow|tonight|monday|tuesday|wednesday|thursday|friday|saturday|sunday|next week)\b/i
const DONE = /\b(done|finished|finish|complete|completed|tick|ticked|did)\b/i
const REMOVE = /\b(delete|remove|cancel|drop|scrap|get rid of|clear)\b/i
const MOVE = /\b(move|push|shift|bring|reschedule|change|earlier|later|back|forward|postpone|delay|to \d)\b/i
const STUDY = /\b(studied|study|revised|revision|revise|worked on|reading|read|practi[cs]ed|did)\b/i
const AMOUNT = /\d|\b(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|fifteen|twenty|thirty|forty|fifty|hundred|half|an hour|a couple)\b/i
const MONEY = /\b(spent|spend|paid|pay|bought|buy|cost|costs|earned|got paid|income|salary|dollars?|bucks|ringgit|rm|pounds?|euros?)\b/i
const JOURNAL = /\b(journal|diary|write (that|this|it) down|note (that|this) in my journal)\b/i
const INBOX = /\b(add (?:\w+ ){0,4}to (?:my |the )?inbox|put (?:\w+ ){0,4}in (?:my |the )?inbox|note (?:that|this|down)|remember (?:that|this)|save (?:that|this)|jot (?:that|this|it|down))\b/i
const WEB = /\b(google|search|look up|youtube|website|web|open|pull up|show me|find)\b/i
const OPEN = /\b(open|go to|show|pull up|take me|bring up)\b/i
const EXPLAIN = /\b(explain|teach|tell me about|what('?s| is| are| was| were)|how does|why)\b/i
const LOOK = /\b(look at|what('?s| is) this|this (question|thing|bit|part)|on (my )?screen|circle)\b/i

type Act = { type: string; title?: string; target?: string; text?: string; amount?: number; minutes?: number; page?: string }

/** Is this action something the words actually ask for? Stops the AI inventing things from a stray word. */
export function grounded(a: Act, said: string): boolean {
  const near = (x?: string, min = 0.4): boolean => !!x && similarity(x, said) >= min
  switch (a.type) {
    case 'add_task':
      return TASK.test(said) && near(a.title)
    case 'add_event':
      return EVENT.test(said) && near(a.title)
    case 'complete_task':
      return DONE.test(said) && near(a.target || a.title, 0.3)
    case 'delete_task':
    case 'cancel_event':
      return REMOVE.test(said) && near(a.target || a.title, 0.3)
    case 'change_task_date':
    case 'move_event':
      return MOVE.test(said) && near(a.target || a.title, 0.3)
    case 'log_study':
      return STUDY.test(said) && AMOUNT.test(said)
    case 'tick_habit':
      return (DONE.test(said) || /\b(went|ran|walked|meditated|worked out)\b/i.test(said)) && near(a.target || a.title || a.text, 0.3)
    case 'money':
      return MONEY.test(said) && AMOUNT.test(said)
    case 'journal':
      return JOURNAL.test(said)
    case 'checkin':
      return !!readCheckin(said)
    case 'inbox':
      return INBOX.test(said)
    case 'open_website':
      return WEB.test(said)
    case 'open_page':
      return OPEN.test(said) && !!a.page && new RegExp(a.page.replace(/s$/, ''), 'i').test(said)
    case 'explain':
      return EXPLAIN.test(said) && near(a.text || a.title, 0.5)
    case 'look_at_screen':
      return LOOK.test(said)
    case 'open_app':
      return OPEN.test(said) && !!(a.text || a.title) && said.toLowerCase().includes((a.text || a.title)!.toLowerCase().split(' ')[0])
    default:
      return false
  }
}
