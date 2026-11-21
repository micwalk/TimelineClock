// Picking an alarm's sound (#18): the four tones and the chime, named for what they sound like
// (hooks/useSoundNames), one per row with a ▶ to hear it. Outside Settings its title row carries
// SoundSettingsButton, a gear to Settings › Alarms › Sounds (ui.openSettings).
import { Cog6ToothIcon, PlayIcon } from '@heroicons/react/20/solid'
import type { AlarmSound } from '../../domain/sounds.ts'
import { SOUNDS, soundSlotName } from '../../domain/sounds.ts'
import { useSoundNames } from '../../hooks/useSoundNames.ts'
import { previewSound } from '../../services/AlarmScheduler.ts'
import { previewNativeSound } from '../../services/nativeShell.ts'
import { ui } from '../../store/ui.ts'
import { IconButton } from './IconButton.tsx'

/** A gear to Settings › Alarms › Sounds; `onLeave` closes what it sits in first. */
export function SoundSettingsButton({ onLeave }: { onLeave: () => void }) {
  return (
    <IconButton icon={Cog6ToothIcon} label="Sound settings" bare className="sound-pick__gear"
      onClick={() => { onLeave(); ui.openSettings('sounds') }} />
  )
}

/** The sounds as a list, one picked: "Classic" "Beacon" "Marimba" "Klaxon" · "Glass · chime once". */
export function SoundChips({ value, onChange, label = 'Sound' }: { value: AlarmSound; onChange: (s: AlarmSound) => void; label?: string }) {
  const { names, native } = useSoundNames()
  // The app's channels' own sound, as Android plays it; in a browser (or an older app), the preset.
  const play = (s: AlarmSound) => (native ? void previewNativeSound(s) : previewSound(s))
  return (
    <div className="sound-pick" role="radiogroup" aria-label={label}>
      {SOUNDS.map(s => (
        <div key={s} className="sound-pick__row">
          <button type="button" role="radio" aria-checked={value === s}
            className={`sound-pick__choice glow-box${value === s ? ' is-on' : ''}`}
            aria-label={`${soundSlotName(s)}: ${names[s].name}${s === 'chime' ? ', once, no answer needed' : ''}${names[s].off ? ' (turned off in Android)' : ''}`}
            onClick={() => onChange(s)}>
            <span className={`sound-pick__name${names[s].off ? ' is-off' : ''}`}>{names[s].name}</span>
            {s === 'chime' && <span className="sound-pick__note">chime · once</span>}
          </button>
          <IconButton icon={PlayIcon} label={`Play ${names[s].name}`} color="var(--c-alarm)" bare className="sound-pick__play" onClick={() => play(s)} />
        </div>
      ))}
    </div>
  )
}
