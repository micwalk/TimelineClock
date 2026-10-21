// Names and marks the app writes itself (not what you type): computed instants, group summaries,
// the glyphs on chips. One place to change how they read. Not user-facing settings yet; edit here.

/** Glyphs on chips and buttons. */
export const MARKS = {
  /** After an occurrence's name, on a repeat's summary, and on "Apply to all future". */
  repeat: '⟳',
  /** A snooze in short names ("Test Alarm ⟲2") and on folded snooze badges and bells. */
  snooze: '⟲',
  /** The Unnamed group's row in the Groups tab ("○ Unnamed"). */
  unnamed: '○',
  /** Drop an instant (the NOW button while following Now). */
  drop: '＋',
} as const

/** Names of instants the app computes. */
export const LABELS = {
  sunrise: 'Sunrise',
  sunset: 'Sunset',
  /** A clock change where the clocks go back (daylight saving ends). */
  dstEnds: 'DST ends 🕰️⬅',
  /** A clock change where the clocks go forward (daylight saving begins). */
  dstBegins: 'DST begins 🕰️➡',
} as const
