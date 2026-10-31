// Picking an alarm's sound (#18): the four tones and the chime, named for what they sound like
// (hooks/useSoundNames).
import type { AlarmSound } from '../../domain/sounds.ts'
import { SOUNDS, soundSlotName } from '../../domain/sounds.ts'
import { useSoundNames } from '../../hooks/useSoundNames.ts'

/** The sounds as chips, one picked: "Classic" "Beacon" "Marimba" "Klaxon" · "Glass (chime)". */
export function SoundChips({ value, onChange, label = 'Sound' }: { value: AlarmSound; onChange: (s: AlarmSound) => void; label?: string }) {
  const { names } = useSoundNames()
  return (
    <div className="alarm-pick__row" role="radiogroup" aria-label={label}>
      {SOUNDS.map(s => (
        <button key={s} type="button" role="radio" aria-checked={value === s}
          className={`repeat-chip glow-box${value === s ? ' is-on' : ''}${s === 'chime' ? '' : ''}`}
          aria-label={`${soundSlotName(s)}: ${names[s].name}${s === 'chime' ? ', once, no answer needed' : ''}${names[s].off ? ' (turned off in Android)' : ''}`}
          onClick={() => onChange(s)}>
          {s === 'chime' ? `${names[s].name} · chime` : names[s].name}
        </button>
      ))}
    </div>
  )
}
