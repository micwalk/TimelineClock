// Names and marks the app writes itself (not what you type): computed instants, group summaries,
// the glyphs on chips. One place to change how they read. Not user-facing settings yet; edit here.

/** Glyphs on chips and buttons. */
export const MARKS = {
  /** After an occurrence's name, on a repeat's summary, and on "Apply to all future". */
  repeat: '⟳',
  /** A snooze in short names ("Test Alarm ⟲2") and on folded snooze badges and bells. */
  snooze: '⟲',
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
  /** Solstices and equinoxes (domain/seasons), named for the season they begin where you are (Settings › Sky; the north without a location). */
  vernalEquinox: 'Vernal Equinox',
  summerSolstice: 'Summer Solstice',
  autumnalEquinox: 'Autumnal Equinox',
  winterSolstice: 'Winter Solstice',
  /** The group every instant is in until you move it (domain/collections). */
  defaultGroup: 'Default',
  /** An imported file's Default group, or everything in a file from before groups. */
  importedGroup: 'Imported',
} as const
