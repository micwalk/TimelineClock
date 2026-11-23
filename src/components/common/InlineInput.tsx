import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type MouseEvent } from 'react'

interface InlineInputProps {
  initial: string
  onCommit: (value: string) => void
  onCancel: () => void
  className?: string
  placeholder?: string
  ariaLabel: string
  /**
   * A name that may be long: a box that wraps onto more lines and grows taller as you type
   * (a textarea, its width set by CSS), instead of a one-line field that grows sideways.
   * Still one line of text: Enter commits, and line breaks (pasted) become spaces.
   */
  multiline?: boolean
}

// Browsers that size a textarea to its text by themselves (field-sizing: content); others get
// their height set after each change.
const fieldSizing = typeof CSS !== 'undefined' && typeof CSS.supports === 'function' && CSS.supports('field-sizing', 'content')

/** Text field that focuses itself; Enter or blur commits, Escape cancels. */
export function InlineInput({ initial, onCommit, onCancel, className = 'chip-input glow-box', placeholder, ariaLabel, multiline }: InlineInputProps) {
  const [value, setValue] = useState(initial)
  const ref = useRef<HTMLInputElement & HTMLTextAreaElement>(null)
  const done = useRef(false)

  useEffect(() => {
    ref.current?.focus()
    ref.current?.select()
  }, [])

  // Grows with its text (not in a frame listener: once per change).
  useLayoutEffect(() => {
    const el = ref.current
    if (!multiline || fieldSizing || !el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight + el.offsetHeight - el.clientHeight}px`
  }, [multiline, value])

  const finish = (commit: boolean) => {
    if (done.current) return
    done.current = true
    if (commit) onCommit(value)
    else onCancel()
  }

  const shared = {
    className: multiline ? `${className} is-multiline` : className,
    value,
    placeholder,
    'aria-label': ariaLabel,
    onBlur: () => finish(true),
    onKeyDown: (e: KeyboardEvent) => {
      e.stopPropagation()
      if (e.key === 'Enter') { e.preventDefault(); finish(true) }
      else if (e.key === 'Escape') finish(false)
    },
    onClick: (e: MouseEvent) => e.stopPropagation(),
    onDoubleClick: (e: MouseEvent) => e.stopPropagation(),
  }

  return multiline ? (
    <textarea ref={ref} {...shared} rows={1} onChange={e => setValue(e.target.value.replace(/\s*[\r\n]+\s*/g, ' '))} />
  ) : (
    <input ref={ref} {...shared} size={Math.max(6, value.length + 1)} onChange={e => setValue(e.target.value)} />
  )
}
