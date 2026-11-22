// One sound preview at a time (a sound's ▶ in the pickers and in Settings › Alarms › Sounds):
// which one is playing, so its ▶ reads ■ to stop it; picking a sound stops it too
// (components/common/SoundPicker). In a browser the web preset plays (services/tones) and says
// when it ends; in the Android app the channel's own sound plays (Ringer.java), which stops by
// itself after NATIVE_PREVIEW_MS without telling the page, so its ■ goes back then.
import { useSyncExternalStore } from 'react'
import type { AlarmSound } from '../domain/sounds.ts'
import { previewSound, stopPreview } from './AlarmScheduler.ts'
import { previewNativeSound, stopNativePreview } from './nativeShell.ts'

/** How long the Android app's preview plays at most (Ringer.java PREVIEW_MS). */
export const NATIVE_PREVIEW_MS = 6000

let playing: AlarmSound | null = null
let inApp = false
let timer: ReturnType<typeof setTimeout> | null = null
/** Tells one preview from the next (an old one's end must not clear a new one). */
let token = 0
const listeners = new Set<() => void>()

function set(sound: AlarmSound | null) {
  playing = sound
  for (const l of listeners) l()
}

/** Plays `sound` (cutting a preview playing); `native`: the app's channel sound, else the web preset. */
export function playSoundPreview(sound: AlarmSound, native: boolean) {
  stopSoundPreview()
  const n = ++token
  inApp = native
  const ended = () => { if (token === n) set(null) }
  if (native) {
    void previewNativeSound(sound)
    timer = setTimeout(ended, NATIVE_PREVIEW_MS)
  } else if (!previewSound(sound, ended)) return
  set(sound)
}

/** Stops the preview playing, if any. */
export function stopSoundPreview() {
  if (timer) clearTimeout(timer)
  timer = null
  if (playing === null) return
  token++
  if (inApp) void stopNativePreview()
  else stopPreview()
  set(null)
}

const subscribe = (l: () => void) => {
  listeners.add(l)
  return () => { listeners.delete(l) }
}

/** The sound previewing now, or null. */
export const currentPreview = (): AlarmSound | null => playing

/** The sound previewing now, or null (re-renders when it changes). */
export const usePreviewing = (): AlarmSound | null => useSyncExternalStore(subscribe, currentPreview)
