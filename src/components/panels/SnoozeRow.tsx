// The ringing card's snooze row (owner, 2026-11-22): the quick snooze ("Snooze 5m · 10:26p") and
// beside it a box that says what it does ("Snooze for [20m]", "Snooze until [4p]" once a time is
// typed), its submit the landing ("→ 10:41p"). Plain alarms and todos share it: a todo's box
// takes what Move (reschedule) does (a length, a time, "tomorrow"), so snoozing a todo and moving it are one thing.
import { formatClockCompact } from '../../domain/format.ts'
import { ALARM_UI } from '../../config/labels.ts'
import { PhraseBox } from '../common/PhraseBox.tsx'

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
  return (
    <div className="snooze-row">
      {quick && (
        <button type="button" className="alarm-btn alarm-btn--snooze snooze-row__quick glow-box" tabIndex={tabIndex} onClick={quick.run}>
          {quick.text} <span className="alarm-btn__at">{clock(quick.at)}</span>
        </button>
      )}
      {/* The whole phrase while empty ("Snooze for"); once typing, it has said what it does and
          gives the room to the text ("for", "until"). */}
      <PhraseBox<SnoozeTyped>
        word={(typing, read) => (typing ? (read?.kind === 'until' ? ALARM_UI.until : ALARM_UI.for) : ALARM_UI.snoozeFor)}
        name={read => (read?.kind === 'until' ? ALARM_UI.snoozeUntil : ALARM_UI.snoozeFor)}
        placeholder={ALARM_UI.snoozePlaceholder}
        parse={parse}
        go={read => ALARM_UI.snoozeGo(clock(read.ts))}
        goLabel={read => ALARM_UI.snoozeGoLabel(clock(read.ts))}
        onSubmit={read => onTyped(read.ts)}
        tabIndex={tabIndex}
      />
    </div>
  )
}
