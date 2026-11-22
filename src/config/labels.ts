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
  /** A todo started after its time (its ▶ instant: "▶ Laundry"). */
  todoStart: '▶',
  /** Where a todo was paused (its ⏸ instant: "⏸ Laundry"). */
  todoPause: '⏸',
} as const

/**
 * What the app says about todos (domain/todos). No guilt: facts, never judgements ("since
 * 7:00a", not "late"; "passed", not "missed"; "31m · planned 20m", not "11m over").
 */
export const TODO_COPY = {
  /** The instant where a todo was done: "✓ Feed cats". */
  doneName: (name: string) => `${MARKS.todoDone} ${name}`,
  /** The instant where a todo was started after its time: "▶ Feed cats". */
  startName: (name: string) => `${MARKS.todoStart} ${name}`,
  /** The instant where a todo was paused: "⏸ Feed cats". */
  pauseName: (name: string) => `${MARKS.todoPause} ${name}`,
  /** A todo's ⋯: its stretches' head, and where one counting now ends. */
  stretchesHead: (n: number) => (n === 1 ? '1 stretch' : `${n} stretches`),
  now: 'now',
  /** A paused todo's row: "12m so far". */
  soFar: (length: string) => `${length} so far`,
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
  /** Its schedule deleted from the timeline (the toast): "Laundry is back on the list". */
  backOnList: (name: string) => `${name} is back on the list`,
  /** The toast's second step: the todo itself. */
  deleteTodo: 'Delete todo',
  /** Making an instant a todo (a selected chip's ☐, a ringing card): "Make it a todo", or every occurrence of a series. */
  makeTodo: (series: string | null) => (series ? `Make every ${series} a todo` : 'Make it a todo'),
} as const

/**
 * Words on the todo controls (the Todos tab, a todo's chip and lane, its ringing card), so they
 * are changed in one place.
 */
export const TODO_UI = {
  schedule: 'Schedule',
  /** Moving a todo that has a time to another (act.rescheduleTodo). */
  reschedule: 'Move',
  unschedule: 'Unschedule',
  start: 'Start',
  startNow: 'Start now',
  pause: 'Pause',
  done: 'Done',
  doneAlready: 'Done already',
  /** A todo's ringing card: answer it without starting (it waits in Now). */
  ignore: 'Ignore',
  wontDo: "Won't do",
  rename: 'Rename',
  notTodo: 'Not a todo',
  deleteTodo: 'Delete todo',
  duration: 'Duration',
  noDuration: 'No duration',
  more: 'More',
  openAgain: 'Open it again',
  set: 'Set',
  ok: 'OK',
  fewer: 'Fewer',
  laterCount: (n: number) => `${n} later`,
  /** The Todos tab's sections. */
  sections: { active: 'Active', now: 'Now', today: 'Today', upcoming: 'Upcoming', unscheduled: 'Unscheduled', done: 'Done' },
  addPlaceholder: 'Add a todo… (laundry 4p 20m)',
  addLabel: 'Add a todo: a name, and maybe a time, a length or a repeat',
  whenPlaceholder: 'When… 3p, 1h30, tomorrow 9a',
  pickTime: 'Pick a time and date',
  /** Tooltips. */
  startTitle: 'Start: it counts from now until you tap ✓',
  startAgainTitle: 'Start again: it counts from now',
  pauseTitle: 'Pause: save this stretch; ▶ goes on later',
  startCardTitle: 'On it: it counts on the timeline from its time until you tap ✓',
  startNowTitle: 'Start it now: it moves to Now and counts until you tap ✓',
  okTitle: 'Got it: it rings again at its time',
  ignoreTitle: 'Ignore it for now, not started: it waits in the Todos tab’s Now',
  notTodoTitle: 'Keep it on the timeline as a plain instant, with its alarms',
} as const

/** Words on a ringing alarm's card (components/panels/RingingAlarms, SnoozeRow). */
export const ALARM_UI = {
  dismiss: 'Dismiss',
  snooze: (minutes: number) => `Snooze ${minutes}m`,
  untilStart: 'Until start',
  dismissAll: (n: number) => `Dismiss all ${n}`,
  dismissAllTitle: "Dismiss this and cancel the instant's other alarms",
  /** The Snooze row's box says what it does: "Snooze for 20m", or "Snooze until 4p" once a time is typed. */
  snoozeFor: 'Snooze for',
  snoozeUntil: 'Snooze until',
  /** Once typing, the shorter word. */
  for: 'for',
  until: 'until',
  snoozePlaceholder: '20m',
  /** Its submit, the landing: "→ 1:35p". */
  snoozeGo: (at: string) => `→ ${at}`,
  snoozeGoLabel: (at: string) => `Snooze until ${at}`,
  mute: 'Mute',
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
