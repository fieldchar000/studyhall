// Autosaving inputs. Typing updates the screen instantly; the value is written
// ~1s after you stop typing, when you leave the field, or when the app closes.

import { useCallback, useEffect, useRef, useState, type InputHTMLAttributes } from 'react'
import { registerFlusher } from '@/lib/data'

type BaseProps = {
  value: string
  onSave: (value: string) => Promise<unknown> | void
  delay?: number
  className?: string
  placeholder?: string
}

type AutoTextProps = BaseProps &
  ({ multiline: true; rows?: number } | ({ multiline?: false } & Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'>))

export function AutoText(props: AutoTextProps): React.JSX.Element {
  const { value, onSave, delay = 1000, className = 'field', placeholder } = props
  const [local, setLocal] = useState(value)
  const ref = useRef<HTMLInputElement & HTMLTextAreaElement>(null)
  const dirty = useRef(false)
  const latest = useRef(value)
  const timer = useRef<number | undefined>(undefined)
  const saveRef = useRef(onSave)
  saveRef.current = onSave

  // Take the stored value when it changes elsewhere — but never while you're typing.
  useEffect(() => {
    if (!dirty.current && document.activeElement !== ref.current) {
      setLocal(value)
      latest.current = value
    }
  }, [value])

  const flush = useCallback(async () => {
    window.clearTimeout(timer.current)
    if (!dirty.current) return
    dirty.current = false
    await saveRef.current(latest.current)
  }, [])

  // Save on unmount and when the app asks before closing.
  useEffect(() => {
    const unregister = registerFlusher(flush)
    return () => {
      unregister()
      void flush()
    }
  }, [flush])

  const change = (v: string): void => {
    setLocal(v)
    latest.current = v
    dirty.current = true
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(flush, delay)
  }

  if (props.multiline) {
    return (
      <textarea
        ref={ref}
        className={className}
        rows={props.rows ?? 3}
        placeholder={placeholder}
        value={local}
        onChange={(e) => change(e.target.value)}
        onBlur={flush}
      />
    )
  }
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { multiline: _m, value: _v, onSave: _s, delay: _d, className: _c, ...inputProps } = props
  return (
    <input
      {...inputProps}
      ref={ref}
      className={className}
      value={local}
      onChange={(e) => change(e.target.value)}
      onBlur={flush}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur()
      }}
    />
  )
}

/** Number field that stores null when empty. */
export function AutoNumber(props: {
  value: number | null
  onSave: (value: number | null) => Promise<unknown> | void
  className?: string
  placeholder?: string
  min?: number
  max?: number
  step?: number
}): React.JSX.Element {
  const { value, onSave, ...rest } = props
  return (
    <AutoText
      {...rest}
      type="number"
      inputMode="decimal"
      value={value == null ? '' : String(value)}
      onSave={(s) => {
        const n = s.trim() === '' ? null : Number(s)
        if (n !== null && Number.isNaN(n)) return
        return onSave(n)
      }}
    />
  )
}
