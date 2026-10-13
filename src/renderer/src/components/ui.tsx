// Small shared UI pieces: icons, modal, colour picker, save indicator.

import { useEffect, useState, type ReactNode } from 'react'
import { useSaveState } from '@/lib/data'
import { timeAgo, useCloud } from '@/lib/cloud'
import type { Icon as PhosphorIcon, IconWeight } from '@phosphor-icons/react'
import {
  Archive,
  ArrowClockwise,
  ArrowCounterClockwise,
  ArrowSquareOut,
  ShareNetwork,
  BookBookmark,
  Brain,
  Cake,
  CalendarHeart,
  Camera,
  ChatCircleText,
  Coffee,
  DiceFive,
  ForkKnife,
  Gift,
  HandHeart,
  Heart,
  Images,
  MapPin,
  Sun,
  BookmarkSimple,
  Books,
  Briefcase,
  CalendarBlank,
  Cards,
  CaretLeft,
  CaretRight,
  ChatsCircle,
  Check,
  CheckSquareOffset,
  Circle,
  Code,
  Compass,
  Exam,
  Feather,
  File,
  Flag,
  Flame,
  Folder,
  GameController,
  GearSix,
  Globe,
  Graph,
  HourglassMedium,
  House,
  List,
  Link,
  ListBullets,
  ListChecks,
  ListNumbers,
  MagnifyingGlass,
  Medal,
  Newspaper,
  Notebook,
  Pause,
  PenNib,
  PencilSimple,
  Play,
  Plus,
  Quotes,
  Rss,
  Scroll,
  SkipForward,
  Sparkle,
  Stack,
  Star,
  Target,
  TextB,
  TextItalic,
  Trash,
  Tray,
  UploadSimple,
  UsersThree,
  Wallet,
  X
} from '@phosphor-icons/react'

// ---------- Icons (Phosphor, light weight: fine-lined and classic) ----------

const ICONS: Record<string, PhosphorIcon> = {
  home: House,
  menu: List,
  brain: ShareNetwork,
  modules: BookBookmark,
  materials: Archive,
  settings: GearSix,
  plus: Plus,
  trash: Trash,
  x: X,
  back: CaretLeft,
  external: ArrowSquareOut,
  folder: Folder,
  refresh: ArrowClockwise,
  check: Check,
  file: File,
  chevron: CaretRight,
  tasks: CheckSquareOffset,
  projects: Stack,
  clients: Briefcase,
  focus: HourglassMedium,
  star: Star,
  flag: Flag,
  play: Play,
  pause: Pause,
  skip: SkipForward,
  reset: ArrowCounterClockwise,
  calendar: CalendarBlank,
  note: Notebook,
  mindmap: Graph,
  cards: Cards,
  grades: Medal,
  exam: Exam,
  link: Link,
  bold: TextB,
  italic: TextItalic,
  list: ListBullets,
  olist: ListNumbers,
  checklist: ListChecks,
  quote: Quotes,
  code: Code,
  pencil: PencilSimple,
  quill: Feather,
  pen: PenNib,
  upload: UploadSimple,
  inbox: Tray,
  game: GameController,
  globe: Globe,
  flame: Flame,
  target: Target,
  spark: Sparkle,
  book: Books,
  scroll: Scroll,
  news: Newspaper,
  wallet: Wallet,
  rss: Rss,
  bookmark: BookmarkSimple,
  gauge: Compass,
  users: UsersThree,
  chat: ChatsCircle,
  search: MagnifyingGlass,
  recall: Brain,
  heart: Heart,
  camera: Camera,
  photos: Images,
  gift: Gift,
  cake: Cake,
  date: CalendarHeart,
  pin: MapPin,
  question: ChatCircleText,
  coffee: Coffee,
  sun: Sun,
  dice: DiceFive,
  food: ForkKnife,
  care: HandHeart
}

export function Icon({ name, size = 16, className = '', weight = 'light' }: { name: string; size?: number; className?: string; weight?: IconWeight }): React.JSX.Element {
  const Glyph = ICONS[name] ?? Circle
  return <Glyph size={size} weight={weight} className={`shrink-0 ${className}`} aria-hidden />
}

// ---------- Modal ----------

export function Modal({
  title,
  onClose,
  children,
  wide = false,
  actions
}: {
  title: ReactNode
  onClose: () => void
  children: ReactNode
  wide?: boolean
  actions?: ReactNode
}): React.JSX.Element {
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div data-modal className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-6" onMouseDown={onClose}>
      <div
        className={`card flex max-h-full flex-col shadow-2xl ${wide ? 'h-full w-full max-w-6xl' : 'w-full max-w-lg'}`}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b border-line px-4 py-2.5">
          <div className="min-w-0 flex-1 truncate font-semibold">{title}</div>
          {actions}
          <button className="btn-ghost" onClick={onClose} title="Close (Esc)">
            <Icon name="x" />
          </button>
        </div>
        <div className={`min-h-0 flex-1 overflow-auto ${wide ? '' : 'p-4'}`}>{children}</div>
      </div>
    </div>
  )
}

// ---------- Colour picker ----------

// Heritage colours: racing green, navy, oxblood, petrol, brass, plum, olive, cognac, slate, pewter
export const PALETTE = ['#2f6b52', '#2c5282', '#8c2f45', '#1b6b7d', '#9c7a3c', '#6c4f80', '#61733a', '#a65f36', '#46587a', '#707b7d']

export function ColorPicker({ value, onChange }: { value: string | null; onChange: (c: string) => void }): React.JSX.Element {
  return (
    <div className="flex flex-wrap gap-1.5">
      {PALETTE.map((c) => (
        <button
          key={c}
          type="button"
          title={c}
          onClick={() => onChange(c)}
          className={`h-6 w-6 rounded-full ring-offset-2 ring-offset-panel ${value === c ? 'ring-2 ring-ink' : ''}`}
          style={{ background: c }}
        />
      ))}
    </div>
  )
}

// ---------- Save indicator ----------

/** Subtle status: "Saving…" while writing, "Saved" briefly after, errors stay visible. */
export function SaveIndicator(): React.JSX.Element {
  const { pending, lastSavedAt, error } = useSaveState()
  const [fresh, setFresh] = useState(false)

  useEffect(() => {
    if (!lastSavedAt) return
    setFresh(true)
    const t = setTimeout(() => setFresh(false), 2000)
    return () => clearTimeout(t)
  }, [lastSavedAt])

  if (error) {
    return (
      <div className="text-xs text-danger" title={error}>
        ⚠ Couldn't save — {error}
      </div>
    )
  }
  return (
    <div className="flex flex-col gap-0.5">
      {pending > 0 ? (
        <div className="text-xs text-muted">Saving…</div>
      ) : (
        <div className={`flex items-center gap-1 text-xs transition-colors ${fresh ? 'text-ok' : 'text-muted'}`}>
          <Icon name="check" size={13} />
          {fresh ? 'Saved' : 'All changes saved'}
        </div>
      )}
      <SyncLine />
    </div>
  )
}

/** Cloud sync state under "Saved" (only when signed in). */
function SyncLine(): React.JSX.Element | null {
  const c = useCloud()
  if (!c?.signedIn) return null
  const text: Record<string, [string, string]> = {
    synced: ['Synced', 'text-muted'],
    syncing: ['Syncing…', 'text-muted'],
    offline: ['Offline — will sync later', 'text-amber-600'],
    error: ['Sync problem — see Settings', 'text-danger'],
    off: ['Sync off', 'text-muted']
  }
  const [label, tone] = text[c.sync] ?? text.off
  return (
    <div className={`flex items-center gap-1 text-xs ${tone}`} title={c.error ?? (c.lastSyncAt ? `Last sync ${timeAgo(c.lastSyncAt)}` : '')}>
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
        <path d="M7 18a4.5 4.5 0 0 1-.5-9 6 6 0 0 1 11.5 1.5A4 4 0 0 1 17 18z" />
      </svg>
      {label}
      {c.pending > 0 && c.sync !== 'syncing' && <span>· {c.pending} waiting</span>}
    </div>
  )
}
