// Settings › Alarms › Sounds (#18): what new alarms sound like, and each sound with a ▶ to hear
// it. In the Android app each sound is a notification channel ("Alarm tone 1"…, "Chime"):
// Change… opens Android's settings for it, where any sound can be picked, the user's own files
// included; the row then shows that sound's name.
import { PlayIcon } from '@heroicons/react/20/solid'
import { SOUNDS, soundSlotName } from '../../domain/sounds.ts'
import type { AlarmSound } from '../../domain/sounds.ts'
import { settings, useSettings } from '../../store/settings.ts'
import { previewSound } from '../../services/AlarmScheduler.ts'
import { isNativeShell, openNativeSoundSettings, previewNativeSound } from '../../services/nativeShell.ts'
import { SoundChips } from '../common/SoundPicker.tsx'
import { useSoundNames } from '../../hooks/useSoundNames.ts'
import { IconButton } from '../common/IconButton.tsx'

export function SoundSettings() {
  const rings = useSettings(s => s.alarmRings)
  const { names, native } = useSoundNames()
  const shell = isNativeShell()
  // The app's channels' own sound, as Android plays it; in a browser (or an older app), the preset.
  const play = (s: AlarmSound) => (native ? void previewNativeSound(s) : previewSound(s))
  return (
    <>
      <div className="settings__row settings__row--wrap">
        <span>New alarms sound</span>
        <SoundChips value={rings.sound} onChange={sound => settings.setAlarmRings({ ...rings, sound })} label="New alarms sound" />
      </div>
      <ul className="sound-list" aria-label="Sounds">
        {SOUNDS.map(s => (
          <li key={s} className="sound-list__row">
            <IconButton icon={PlayIcon} label={`Play ${soundSlotName(s)}: ${names[s].name}`} color="var(--c-alarm)" bare onClick={() => play(s)} />
            <span className="sound-list__slot">{soundSlotName(s)}</span>
            <span className={`sound-list__name${names[s].off ? ' is-off' : ''}`}>
              {names[s].name}
              {names[s].off ? ' · off in Android' : s === 'chime' ? ' · once, no answer' : ''}
            </span>
            {native && (
              <button type="button" className="sound-list__change glow-box" onClick={() => void openNativeSoundSettings(s)}
                aria-label={`Change ${soundSlotName(s)} in Android`}>Change…</button>
            )}
          </li>
        ))}
      </ul>
      {shell && !native && <p className="sky-settings__note">Install the app again to pick any sound for these in Android.</p>}
      {native && <p className="sky-settings__note">Change… opens Android’s settings for that sound: pick a ringtone, or one of your own files.</p>}
    </>
  )
}
