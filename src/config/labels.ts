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
  /** A todo's chip and row (domain/todos), by its state: open, done, passed (a repeat's next one came), won't do. */
  todoOpen: '☐',
  todoDone: '✓',
  todoPassed: '↷',
  todoDropped: '–',
} as const

/**
 * What the app says about todos (domain/todos). No guilt: facts, never judgements ("since
 * 7:00a", not "late"; "passed", not "missed"; "31m · planned 20m", not "11m over").
 */
export const TODO_COPY = {
  /** The instant where a todo was done: "✓ Feed cats". */
  doneName: (name: string) => `${MARKS.todoDone} ${name}`,
  /** A waiting todo's row: "since 7:00a". */
  since: (clock: string) => `since ${clock}`,
  /** What it took, with its length: "31m · planned 20m". */
  planned: (length: string) => `planned ${length}`,
  /** Worked on in pieces: "31m in 2 stretches". */
  stretches: (n: number) => `in ${n} stretches`,
  /** A warning's card: it isn't time yet. */
  getReady: 'get ready',
  /** Done straight away (nothing was timed). */
  done: 'done',
  passed: 'passed',
  dropped: "won't do",
  /** The Done section's head: "4 done today". */
  doneToday: (n: number) => `${n} done today`,
  /** A ✓ folded into its todo's chip: "+12m" after it. */
  foldAfter: (length: string) => `+${length}`,
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
