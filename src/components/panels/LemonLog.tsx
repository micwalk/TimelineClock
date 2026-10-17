// Settings › Lemon log: whether to ask "Are you a sour lemon?", the yes/no tally, and the answers
// (newest first, with what you had written).
import { useState } from 'react'
import { settings, useSettings } from '../../store/settings.ts'
import { useLemons } from '../../store/lemons.ts'
import { lemonTally } from '../../domain/lemons.ts'
import { formatDateTime } from '../../domain/format.ts'

const SHOWN = 10

export function LemonLog() {
  const ask = useSettings(s => s.askLemon)
  const log = useLemons(s => s.log)
  const [all, setAll] = useState(false)
  const { sour, sweet } = lemonTally(log)
  const recent = [...log].reverse().slice(0, all ? undefined : SHOWN)
  return (
    <>
      <label className="settings__row">
        <span>Ask if I'm a sour lemon</span>
        <input type="checkbox" checked={ask} onChange={e => settings.setAskLemon(e.target.checked)} />
      </label>
      {log.length === 0
        ? <p className="sky-settings__note">No answers yet.</p>
        : <>
          <p className="lemon-log__tally"><span>🍋 Sour {sour}</span> · <span>😊 Not {sweet}</span></p>
          <ul className="lemon-log">
            {recent.map(e => (
              <li key={e.id} className={e.sour ? 'is-sour' : ''}>
                <span className="lemon-log__answer">{e.sour ? '🍋 Yes' : '😊 No'}</span>
                <span className="lemon-log__when mono">{formatDateTime(e.ts)}</span>
                <span className="lemon-log__text">{e.text}</span>
              </li>
            ))}
          </ul>
          {log.length > SHOWN && (
            <button type="button" className="sky-settings__clear" onClick={() => setAll(a => !a)}>{all ? 'Show fewer' : `Show all ${log.length}`}</button>
          )}
        </>}
    </>
  )
}
