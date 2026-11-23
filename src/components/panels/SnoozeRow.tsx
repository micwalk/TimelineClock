// The ringing card's snooze row (owner, 2026-11-22): one segmented control that reads as one
// sentence, its parts divided by vertical lines:
//   [ Snooze | 5m      | or 20m, 4p…  | → 10:41p ]
//              10:26p     (typed)       (once it reads)
// "Snooze" is the verb for the row; the quick snooze is a filled button, its landing under it
// ("until start" in its place for a warning 5m would take past its instant); the box takes a
// length ("Snooze 20m") or a time ("Snooze until 4p": the word shows once a time is typed), and
// its submit says where it lands. Plain alarms and todos share it: a todo's box takes what Move
// (reschedule) does (a length, a time, "tomorrow"), so snoozing a todo and moving it are one thing.
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
  const typing = text.trim() !== ''
  const typed = typing ? parse(text) : null
  const name = typed?.kind === 'until' ? ALARM_UI.snoozeUntil : ALARM_UI.snoozeFor
  return (
    <form className={`snooze-row glow-box${typed ? ' is-ready' : ''}${typing && !typed ? ' is-invalid' : ''}`} role="group" aria-label={ALARM_UI.snoozeLabel}
      onSubmit={e => { e.preventDefault(); if (typed) onTyped(typed.ts) }}>
      <span className="snooze-row__label" aria-hidden>{ALARM_UI.snoozeLabel}</span>
      {quick && (
        <button type="button" className="snooze-row__quick" tabIndex={tabIndex} onClick={quick.run}
          aria-label={`${ALARM_UI.snoozeLabel} ${quick.text}, ${ALARM_UI.lands(clock(quick.at))}`}>
          <span className="snooze-row__quick-text">{quick.text}</span>
          <span className="snooze-row__at mono">{clock(quick.at)}</span>
        </button>
      )}
      <label className="snooze-row__field">
        {typed?.kind === 'until' && <span className="snooze-row__word" aria-hidden>{ALARM_UI.until}</span>}
        <input
          aria-label={name}
          className="snooze-row__input mono"
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={e => { e.stopPropagation(); if (e.key === 'Escape') setText('') }}
          placeholder={ALARM_UI.snoozePlaceholder}
          aria-invalid={typing && !typed}
          enterKeyHint="done"
          autoComplete="off"
          tabIndex={tabIndex}
        />
      </label>
      {typed && (
        <button type="submit" className="snooze-row__go mono" tabIndex={tabIndex} aria-label={ALARM_UI.snoozeGoLabel(clock(typed.ts))}>
          {ALARM_UI.snoozeGo(clock(typed.ts))}
        </button>
      )}
    </form>
  )
}
