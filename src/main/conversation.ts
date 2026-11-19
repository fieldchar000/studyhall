// Conversation mode (Ctrl+Alt+C): a hands-free spoken conversation with Nova. While it's on, Nova listens again after
// each reply (never while it's speaking), so you just talk: a spoken Q&A on your slides ("test me on this"), a
// practical checklist walked step by step ("test me on my practical", with a hint when you go quiet), or a chat. It
// ends with Ctrl+Alt+C again, Esc, "stop" / "that's all", or about three minutes of quiet. What you say is written down
// on your PC; only your words go to Nova, a turn at a time.

export const convHooks = {
  /** The voice window: start or stop listening hands-free. */
  send: (_on: boolean): void => {},
  /** The globe: its "live" ring on or off. */
  ring: (_on: boolean): void => {}
}

let on = false
export const conversationOn = (): boolean => on
export function setConversation(next: boolean): void {
  if (next === on) return
  on = next
  convHooks.ring(on)
  convHooks.send(on)
}
export const toggleConversation = (): void => setConversation(!on)

/** For Nova's live-state: how to behave while conversation mode is on. */
export const conversationLine = (): string =>
  on
    ? 'Conversation mode is on: a hands-free spoken conversation (you listen again after each reply; they just talk). Keep each reply to what\'s needed for this turn and end it so they know it\'s their turn. "Test me" on what\'s on screen: read_lesson (a deck or PDF) or read_window (a page), then a spoken Q&A, one question per reply, marking each answer like a person would. "Test me on my practical": read_window the checklist they have open (a Microsoft Form, a web page or HTML file: read_window gives the whole page, even what\'s scrolled out of view, so use it rather than take_screenshot) or read_material if it\'s one of their files, then ask "what\'s your next step?", check what they say against the next step in order, tick it off, gently say if they skipped or swapped a step, and keep track of where they are. When the system says they\'ve gone quiet: one short hint for the current question or step (never the answer), or nothing at all if you weren\'t waiting on them. "Stop", "that\'s all", "I\'m done": a short goodbye with how they did, then end_conversation.'
    : ''
