// A box that says what it does (owner, 2026-11-22): a word before the text ("Snooze for",
// "Schedule", "Takes") that, once typing, can shorten to what was read ("until", "in", "at"), and
// a submit that shows the result ("→ 10:41p"). The ringing card's Snooze row and a todo's panel
// (Schedule / Move, its length) share it; it takes its colour from --accent (styles: .snooze-box).
import { useState } from 'react'

export function PhraseBox<T>({ word, name, placeholder, parse, go, goLabel, onSubmit, onEscape, tabIndex, className }: {
  /** The word before the text: `typing` once there is text, `read` what it parsed to (null: nothing yet, or not readable). */
  word: (typing: boolean, read: T | null) => string
  /** The input's accessible name (the whole phrase). */
  name: (read: T | null) => string
  placeholder: string
  parse: (text: string) => T | null
  /** The submit's text, shown once the text reads ("→ 10:41p"). */
  go: (read: T) => string
  goLabel?: (read: T) => string
  onSubmit: (read: T) => void
  /** Escape with nothing typed (with text, Escape clears it). */
  onEscape?: () => void
  tabIndex?: number
  className?: string
}) {
  const [text, setText] = useState('')
  const typing = text.trim() !== ''
  const read = typing ? parse(text) : null
  return (
    <form className={`snooze-box glow-box${read !== null ? ' is-ready' : ''}${className ? ` ${className}` : ''}`}
      onSubmit={e => { e.preventDefault(); if (read !== null) onSubmit(read) }}>
      <label className="snooze-box__field">
        <span className="snooze-box__word" aria-hidden>{word(typing, read)}</span>
        <input
          aria-label={name(read)}
          className="snooze-box__input mono"
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={e => {
            e.stopPropagation()
            if (e.key !== 'Escape') return
            if (text) setText('')
            else onEscape?.()
          }}
          placeholder={placeholder}
          aria-invalid={typing && read === null}
          enterKeyHint="done"
          autoComplete="off"
          tabIndex={tabIndex}
        />
      </label>
      {read !== null && (
        <button type="submit" className="snooze-box__go" tabIndex={tabIndex} aria-label={goLabel?.(read)}>{go(read)}</button>
      )}
    </form>
  )
}
