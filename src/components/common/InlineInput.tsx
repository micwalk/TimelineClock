import { useEffect, useRef, useState } from 'react'

interface InlineInputProps {
  initial: string
  onCommit: (value: string) => void
  onCancel: () => void
  className?: string
  placeholder?: string
  ariaLabel: string
}

/** Text field that focuses itself; Enter or blur commits, Escape cancels. */
export function InlineInput({ initial, onCommit, onCancel, className = 'chip-input glow-box', placeholder, ariaLabel }: InlineInputProps) {
  const [value, setValue] = useState(initial)
  const ref = useRef<HTMLInputElement>(null)
  const done = useRef(false)

  useEffect(() => {
    ref.current?.focus()
    ref.current?.select()
  }, [])

  const finish = (commit: boolean) => {
    if (done.current) return
    done.current = true
    if (commit) onCommit(value)
    else onCancel()
  }

  return (
    <input
      ref={ref}
      className={className}
      value={value}
      placeholder={placeholder}
      aria-label={ariaLabel}
      size={Math.max(6, value.length + 1)}
      onChange={e => setValue(e.target.value)}
      onBlur={() => finish(true)}
      onKeyDown={e => {
        e.stopPropagation()
        if (e.key === 'Enter') finish(true)
        else if (e.key === 'Escape') finish(false)
      }}
      onClick={e => e.stopPropagation()}
      onDoubleClick={e => e.stopPropagation()}
    />
  )
}
