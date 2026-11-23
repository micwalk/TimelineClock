// Settings › Alarms › Sounds (#18): what new alarms sound like, and each sound with a ▶ to hear
// it. In the Android app each sound is a notification channel ("Alarm tone 1"…, "Chime"):
// Change… opens Android's settings for it, where any sound can be picked, the user's own files
// included; the row then shows that sound's name.
import { SOUNDS, soundSlotName } from '../../domain/sounds.ts'
import { settings, useSettings } from '../../store/settings.ts'
import { isNativeShell, openNativeSoundSettings } from '../../services/nativeShell.ts'
import { PreviewButton, SoundChips } from '../common/SoundPicker.tsx'
import { useSoundNames } from '../../hooks/useSoundNames.ts'

export function SoundSettings() {
  const rings = useSettings(s => s.alarmRings)
  const { names, native } = useSoundNames()
  const shell = isNativeShell()
  return (
    <>
      <div className="settings__row settings__row--wrap">
        <span>New alarms sound</span>
        <SoundChips value={rings.sound} onChange={sound => settings.setAlarmRings({ ...rings, sound })} label="New alarms sound" />
      </div>
      <ul className="sound-list" aria-label="Sounds">
        {SOUNDS.map(s => (
          <li key={s} className="sound-list__row">
            <PreviewButton sound={s} name={`${soundSlotName(s)}: ${names[s].name}`} native={native} />
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
