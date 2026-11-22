// Picking an alarm's sound (#18): the four tones and the chime, named for what they sound like
// (hooks/useSoundNames), one per row with a ▶ to hear it, ■ while it plays (services/soundPreview);
// picking one, or closing the picker, stops it. Outside Settings its title row carries
// SoundSettingsButton, a gear to Settings › Alarms › Sounds (ui.openSettings).
import { useEffect } from 'react'
import { Cog6ToothIcon, PlayIcon, StopIcon } from '@heroicons/react/20/solid'
import type { AlarmSound } from '../../domain/sounds.ts'
import { SOUNDS, soundSlotName } from '../../domain/sounds.ts'
import { useSoundNames } from '../../hooks/useSoundNames.ts'
import { playSoundPreview, stopSoundPreview, usePreviewing } from '../../services/soundPreview.ts'
import { ui } from '../../store/ui.ts'
import { IconButton } from './IconButton.tsx'

/** A gear to Settings › Alarms › Sounds; `onLeave` closes what it sits in first. */
export function SoundSettingsButton({ onLeave }: { onLeave: () => void }) {
  return (
    <IconButton icon={Cog6ToothIcon} label="Sound settings" bare className="sound-pick__gear"
      onClick={() => { onLeave(); ui.openSettings('sounds') }} />
  )
}

/** ▶ to hear a sound, ■ while it plays (one at a time). `native`: the Android app's channel sound. */
export function PreviewButton({ sound, name, native }: { sound: AlarmSound; name: string; native: boolean }) {
  const on = usePreviewing() === sound
  return on
    ? <IconButton icon={StopIcon} label={`Stop ${name}`} color="var(--c-alarm)" bare pressed className="sound-pick__play" onClick={stopSoundPreview} />
    : <IconButton icon={PlayIcon} label={`Play ${name}`} color="var(--c-alarm)" bare className="sound-pick__play" onClick={() => playSoundPreview(sound, native)} />
}

/** The sounds as a list, one picked: "Classic" "Beacon" "Marimba" "Klaxon" · "Glass · chime once". */
export function SoundChips({ value, onChange, label = 'Sound' }: { value: AlarmSound; onChange: (s: AlarmSound) => void; label?: string }) {
  // The app's channels' own sound, as Android plays it; in a browser (or an older app), the preset.
  const { names, native } = useSoundNames()
  // Closing the picker stops a preview.
  useEffect(() => stopSoundPreview, [])
  return (
    <div className="sound-pick" role="radiogroup" aria-label={label}>
      {SOUNDS.map(s => (
        <div key={s} className="sound-pick__row">
          <button type="button" role="radio" aria-checked={value === s}
            className={`sound-pick__choice glow-box${value === s ? ' is-on' : ''}`}
            aria-label={`${soundSlotName(s)}: ${names[s].name}${s === 'chime' ? ', once, no answer needed' : ''}${names[s].off ? ' (turned off in Android)' : ''}`}
            onClick={() => { stopSoundPreview(); onChange(s) }}>
            <span className={`sound-pick__name${names[s].off ? ' is-off' : ''}`}>{names[s].name}</span>
            {s === 'chime' && <span className="sound-pick__note">chime · once</span>}
          </button>
          <PreviewButton sound={s} name={names[s].name} native={native} />
        </div>
      ))}
    </div>
  )
}
