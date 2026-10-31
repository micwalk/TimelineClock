// What an alarm sounds like (#18). Pure.
//
// Two styles: an alarm tone rings over and over until it is answered; a chime sounds once and
// needs no answer (it is answered 'chimed' as it sounds). There are four tones, each a slot: on
// the web one of the bundled presets (services/tones), in the Android app a notification channel
// ("Alarm tone 1"…) whose sound starts as that preset and can be changed in Android's own settings
// to any system ringtone or the user's own file. The chime is one channel too.

/** One of the four alarm tones, or the chime. */
export type AlarmSound = 'tone1' | 'tone2' | 'tone3' | 'tone4' | 'chime'

export const TONES = ['tone1', 'tone2', 'tone3', 'tone4'] as const satisfies readonly AlarmSound[]
export const SOUNDS: readonly AlarmSound[] = [...TONES, 'chime']

/** What new alarms ring with unless Settings › Alarms say otherwise. */
export const DEFAULT_TONE: AlarmSound = 'tone1'

export const isSound = (x: unknown): x is AlarmSound => typeof x === 'string' && (SOUNDS as readonly string[]).includes(x)

/** A chime: sounds once, no ringing card, no answer needed. */
export const isChime = (sound: AlarmSound) => sound === 'chime'

/** An alarm's sound: its own, else the default tone (Settings › Alarms). */
export const soundOf = (a: { sound?: AlarmSound }, fallback: AlarmSound = DEFAULT_TONE): AlarmSound => a.sound ?? fallback

/** "Tone 1" … "Tone 4", "Chime": the slot's name (what it sounds like is the preset's or Android's). */
export const soundSlotName = (sound: AlarmSound) => (sound === 'chime' ? 'Chime' : `Tone ${sound.slice(4)}`)
