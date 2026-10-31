// Each alarm sound's name (#18): the bundled preset's in a browser (services/tones); in the
// Android app each sound is a notification channel the user may have set to another sound in
// Android's settings, so the name is read from there (and again when the app comes back).
import { useEffect, useState } from 'react'
import type { AlarmSound } from '../domain/sounds.ts'
import { SOUNDS } from '../domain/sounds.ts'
import type { NativeSound } from '../services/native/alarmsPlugin.ts'
import { isNativeShell, nativeSounds } from '../services/nativeShell.ts'
import { TONE_PRESETS } from '../services/tones.ts'

export interface SoundName {
  /** What it sounds like: "Beacon", or the sound picked in Android ("Silent" for none). */
  name: string
  /** Its channel is turned off in Android (it won't sound). */
  off: boolean
}

const presetNames = (): Record<AlarmSound, SoundName> =>
  Object.fromEntries(SOUNDS.map(s => [s, { name: TONE_PRESETS[s].name, off: false }])) as Record<AlarmSound, SoundName>

function fromNative(list: readonly NativeSound[]): Record<AlarmSound, SoundName> {
  const names = presetNames()
  for (const n of list) {
    if (!(n.sound in names)) continue
    names[n.sound] = { name: n.own ? names[n.sound].name : n.title || 'Silent', off: !n.on }
  }
  return names
}

/**
 * Each sound's name, and in the Android app `native`: whether its channels could be read (false
 * in an app from before sound channels: it needs installing again).
 */
export function useSoundNames(): { names: Record<AlarmSound, SoundName>; native: boolean } {
  const [state, setState] = useState(() => ({ names: presetNames(), native: false }))
  useEffect(() => {
    if (!isNativeShell()) return
    let alive = true
    const read = () => {
      void nativeSounds().then(list => { if (alive && list) setState({ names: fromNative(list), native: true }) })
    }
    read()
    // Back from Android's settings for a channel: its sound may have changed.
    const onVisible = () => { if (document.visibilityState === 'visible') read() }
    document.addEventListener('visibilitychange', onVisible)
    return () => { alive = false; document.removeEventListener('visibilitychange', onVisible) }
  }, [])
  return state
}
