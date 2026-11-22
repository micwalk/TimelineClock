// The ringing card's snooze row (owner, 2026-11-22): the quick snooze ("Snooze 5m · 10:26p") and
// beside it a box that says what it does ("Snooze for [20m]", "Snooze until [4p]" once a time is
// typed), its submit the landing ("→ 10:41p"). Plain alarms and todos share it: a todo's box
// takes what Move (reschedule) does (a length, a time, "tomorrow"), so snoozing a todo and moving it are one thing.
import { useState } from 'react'
import { formatClockCompact } from '../../domain/format.ts'
import { ALARM_UI } from '../../config/labels.ts'

const clock = (ts: number) => formatClockCompact(ts, false)

export interface SnoozeQuick { text: string; at: number; run: () => void }
/** What the box read: when it lands, and whether it was a length ("for") or a time ("until"). */
export interface SnoozeTyped { ts: number; kind: 'for' | 'until' }

export function SnoozeRow({ quick, parse, onTyped, tabIndex }: {
  quick: SnoozeQuick | null
  parse: (text: string) => SnoozeTyped | null
  onTyped: (ts: number) => void
  tabIndex?: number
}) {
  const [text, setText] = useState('')
  const typed = text.trim() ? parse(text) : null
  // The whole phrase while empty ("Snooze for"); once typing, it has said what it does and gives
  // the room to the text ("for", "until").
  const word = text.trim()
    ? (typed?.kind === 'until' ? ALARM_UI.until : ALARM_UI.for)
    : ALARM_UI.snoozeFor
  const name = typed?.kind === 'until' ? ALARM_UI.snoozeUntil : ALARM_UI.snoozeFor
  return (
    <div className="snooze-row">
      {quick && (
        <button type="button" className="alarm-btn alarm-btn--snooze snooze-row__quick glow-box" tabIndex={tabIndex} onClick={quick.run}>
          {quick.text} <span className="alarm-btn__at">{clock(quick.at)}</span>
        </button>
      )}
      <form className={`snooze-box glow-box${typed ? ' is-ready' : ''}`} onSubmit={e => { e.preventDefault(); if (typed) onTyped(typed.ts) }}>
        <label className="snooze-box__field">
          <span className="snooze-box__word" aria-hidden>{word}</span>
          <input
            aria-label={name}
            className="snooze-box__input mono"
            value={text}
            onChange={e => setText(e.target.value)}
            onKeyDown={e => { e.stopPropagation(); if (e.key === 'Escape') setText('') }}
            placeholder={ALARM_UI.snoozePlaceholder}
            aria-invalid={text.trim() !== '' && !typed}
            enterKeyHint="done"
            autoComplete="off"
            tabIndex={tabIndex}
          />
        </label>
        {typed && (
          <button type="submit" className="snooze-box__go" tabIndex={tabIndex} aria-label={ALARM_UI.snoozeGoLabel(clock(typed.ts))}>
            {ALARM_UI.snoozeGo(clock(typed.ts))}
          </button>
        )}
      </form>
    </div>
  )
}
