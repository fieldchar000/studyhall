// Small date helpers. Storage is always ISO UTC (or YYYY-MM-DD for all-day);
// these convert to/from what the user sees in their local time.

const pad = (n: number): string => String(n).padStart(2, '0')

/** ISO -> value for <input type="datetime-local"> (local time). */
export function isoToLocalInput(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** <input type="datetime-local"> value -> ISO UTC (or null if empty). */
export function localInputToIso(v: string): string | null {
  if (!v) return null
  const d = new Date(v)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

/** Local calendar date of a Date as YYYY-MM-DD. */
export function localDate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** YYYY-MM-DD plus n days. */
export function addDays(date: string, n: number): string {
  const [y, m, d] = date.split('-').map(Number)
  return localDate(new Date(y, m - 1, d + n))
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit'
  })
}

export function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
}

/** "today 14:00", "tomorrow", "in 5 days", "in 3 weeks". */
export function relativeDue(iso: string): string {
  const due = new Date(iso)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const dueDay = new Date(due)
  dueDay.setHours(0, 0, 0, 0)
  const days = Math.round((dueDay.getTime() - today.getTime()) / 864e5)
  if (days < 0) return 'overdue'
  if (days === 0) return `today ${formatTime(iso)}`
  if (days === 1) return `tomorrow ${formatTime(iso)}`
  if (days < 14) return `in ${days} days`
  return `in ${Math.round(days / 7)} weeks`
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(0)} KB`
  return `${(n / 1024 ** 2).toFixed(1)} MB`
}
