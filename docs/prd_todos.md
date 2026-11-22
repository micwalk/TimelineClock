# Todos — Product Requirements (draft v0.8, 2026-11-21)

Status: Phase 1 (web) built in 0.8.0 on branch `todo`; see §12 for what was built and the calls
made building it. Phase 1b, 2 and 3 are not built. A todo is a **record** that
ties together the instants, spans and alarms it makes; it holds no times itself. A todo's
length (its estimate) lives on the record; once scheduled, the timeline draws it as a
**planned block** computed from the record, never stored, and what gets saved is only what
happened, so Done is just the favorite's ordinary stop. Phase 2 is a scheduling workflow
(unscheduled → a spot on the timeline); Phase 3 is todo time tracking (▶ Start from the list,
⏸ Pause, Switch on the ringing card). Runs, breaks, tags and the rest of time tracking are in
[explore_time_tracking.md](explore_time_tracking.md).

## 1. The problem

A real user keeps about seven named iPhone timers as a to-do list: "Feed cats" (every day),
"Book appointment" (once), and so on. The timer's job is to remind her. Two things go wrong:

1. **Dismissing the timer deletes it, and its name.** The reminder is gone whether or not the
   thing got done, so she forgets it.
2. **"Not now" has only one tool: snooze.** There is no way to say "later today",
   "tomorrow", or "whenever, just don't lose it".

The app already does the timing: an instant with a name and alarms, snoozes kept as history,
repeating series, favorites whose span to Now counts until ■ stop, the Android app ringing
with the app closed. What it lacks is the difference between **silenced** and **done**.

## 2. The model

The app's rule is few underlying concepts (instant, span, alarm) and many ways to make them.
A todo keeps to it:

> **A todo is a record of a thing to do**: a name, maybe a length, open or done. It holds
> no times. Everything it puts in time is an ordinary instant, span or alarm that carries
> the todo's id. The record is the quick way to make them and the thread that ties them
> together, as a series is for its occurrences.

**The record is the plan; what is saved is what happened** (owner, 2026-11-21). A todo's
length is a number on the record ("Laundry · 20m"). Once the todo is scheduled, the timeline
draws the plan from it: a **planned block** from its `at` for its length (§4.2), computed
like a virtual instant, so nothing is stored and nothing has to be hidden afterwards. What
gets saved is what happened: when it was due, when it was done, and the span between. Done
ends the plan, and the saved span is the actual.

So a todo can be:
- **unscheduled**: just the record ("Book appointment"), in the Todos tab, not in time;
- **scheduled**: plus an instant at its time with an alarm;
- **counting**: its instant favorited, its span to Now on the live side;
- **done**: a ✓ instant, the span to it saved, and the record says so.

| Todo idea | Underneath |
|---|---|
| "Book appointment", no time yet | A todo record, nothing in time |
| "Book appointment at 3p" | + an instant at 3p (role `at`) with an alarm |
| "Laundry at 4p, 20m" | The same; the record holds `durationMs` 20m, drawn as a planned block 4:00–4:20 (computed, not stored) |
| "Feed cats at 7a, every day" | A series marked as todos: each occurrence made gets its own todo record |
| It rang, she **dismissed** it | Its `at` instant is **favorited**: its span to Now counts on the live side ("Feed cats · 25m"). Silenced, not done, and visible |
| **✓ Done** (the lane's ■ stop, on a todo) | The favorite's normal stop, unchanged (`act.stopNowSpan`): a `done` instant at Now ("✓ Feed cats"), the span to Now becomes the saved span to it; the record is done |
| **Done** on the ringing card (already did it) | A `done` instant at Now; nothing was timed, so no span |
| Won't do it | The record is `dropped` |
| Later (tonight, tomorrow) | The `at` instant moves; its alarm re-arms (`rearmAfterMove`) |
| Passed (Feed cats at 7a, not done by 6p) | The record is `passed` when the series' next occurrence arrives |

**Alarms need nothing new**: an alarm on an instant that belongs to a todo is a todo's alarm.
Dismissing is the start of the count; there is no separate Start (owner, 2026-11-21). The
iPhone problem was that a dismissed timer vanished; here a dismissed todo is the one thing
that can't vanish, because it is counting on screen until she stops it.

**What changed from v0.5.** v0.5 drew the estimate as a planned span (`at` → an `end`
instant) and hid it once the actual was saved. The owner's call: the estimate belongs on the
record; the timeline draws the plan from it while it is a plan and saves only actuals. So
there is no `end` role, nothing to hide, and Later moves one instant (the block follows).
Pausing (several stretches per todo) is Phase 3's time tracking, with no automatic pause:
a todo pauses only when she pauses it or switches task on a ringing card (§4.4).

## 3. Stories

Phase 1:
- **Recurring chore.** "Feed cats" daily 7a and 6p. It rings; **Done** (it's a minute's job);
  🎉. Dismissed instead, its lane counts "Feed cats · 25m" until she taps ✓ (🎉), or until the
  next feeding comes (then it stops counting and reads "passed").
- **A chore with a length.** "Laundry 4p · 20m". The timeline shows its planned block
  4:00–4:20. It rings; she dismisses it and gets going; the lane counts "Laundry · 3:12" with
  the plan still drawn, so she sees where it was meant to end. At 4:31 she taps ✓: 🎉, the
  plan goes, and the timeline has the span 4:00–4:31. The Todos tab reads "31m · planned 20m".
- **One-off errand.** "Book appointment", no time. It sits in the Todos tab. When she has a
  gap: **Schedule → In 1h**, and it rings then.
- **Not now.** It rings at a bad moment: **Later → Tonight**. Name kept, it rings again then.

Phase 3:
- **Just start.** "Book appointment" sits unscheduled; she has a moment and taps **▶ Start**
  on its row: a stopwatch span counts from Now ("Book appointment · 0:04"), ✓ when done.
- **Interrupted.** Laundry counting at 12m; Dishes rings. The card offers **Switch to
  Dishes**: Laundry pauses (12m saved) and Dishes counts. Dishes done, she taps **▶ Start** on
  Laundry's row in the Todos tab: another 19m. Laundry reads "31m in 2 stretches · planned 20m".
- **Both at once.** The washer is running when Dishes rings; she just dismisses it. Nothing
  pauses by itself: both count until she stops one.

## 4. Data

### 4.1 The todo record (its own store, `timeline.todos.v1`; backups `data.todos`)

```ts
interface TodoRecord {
  id: string                // "t_…"
  label: string
  createdAt: number
  /** The estimate: the plan. Drawn as a planned block once scheduled; never stored as a span. */
  durationMs?: number
  status: 'open' | 'done' | 'dropped' | 'passed'
  /** Its place in the Unscheduled list (drag to reorder). */
  order: number
  /** Its group (domain/collections); absent = Default. Its instants follow it. */
  collectionId?: string
  /** An occurrence of a repeating todo: the series and its date. */
  seriesId?: string
  occurrence?: string
}
```

No times, no ids of instants or spans: those point at it (§4.2), so nothing has to be kept in
sync when an instant is moved or deleted. The same shape of relation as series and
occurrences (`seriesId` on the instant). Its own store, not a kind in the series store
(owner, 2026-11-21).

### 4.2 What the todo makes in time

Each instant it makes carries the todo and its part:

```ts
// on InstantRecord
todo?: { id: string; role: 'at' | 'was' | 'done' | 'start' | 'pause' }   // start, pause: Phase 3
```

| Role | The instant | Drawn as |
|---|---|---|
| `at` | When it is to be done; holds the alarms. At most one per todo. | A chip, ☐ (✓ once done) |
| `was` | An earlier `at` that rang before the todo went back to the list: history | A chip, as any instant |
| `done` | Where it was finished: "✓ ‹name›" (`config/labels`) | A chip (folds into `at` when close, §7.1) |
| `start` (Phase 3) | Where a stretch began other than at `at` (▶ Start) | A Mark (short line, no chip) |
| `pause` (Phase 3) | Where a stretch stopped, not done | A Mark |

**The planned block** (a todo with an `at` and a length): drawn from `at` for `durationMs`
on the saved side, like a span lane but in a planned look (hollow or dashed, a theme token),
named after the todo with its length ("Laundry · 20m"). Computed from the record each time it
is laid out, like a virtual instant: never stored, never in backups, nothing to hide. It shows
while the todo is scheduled, waiting, counting or (Phase 3) paused, and goes when the todo is
done, dropped, passed or back on the list: a plan that is over isn't history, the saved
stretches are. Later moves it with its `at`. A tap selects the todo's `at` instant. Phase 2
builds its scheduling workflow on it (§4.6).

Spans need no field: a span whose ends belong to the same todo is that todo's. Every such
span is a **stretch**, time actually worked, made by the favorite's stop and named after the
todo. In Phase 1 there is at most one: `at` → `done`. In Phase 3 a stretch runs from `at` or
`start` to `pause` or `done`, and a todo has as many as she makes: each ▶ Start begins one,
each ⏸ or ✓ ends it, with no limit.
- **Actual time** = the sum of its stretches (+ the one counting now). One stretch reads
  "31m"; more read "31m in 2 stretches". With a length: "31m · planned 20m".
- Done straight from the ringing card makes no stretch (owner, 2026-11-21: quick things like
  "Take medicine" need no span): it reads "done", with "planned 20m" if it had a length.

Derived state (`domain/todos.ts`, pure, tested), from the record and its instants:
- **Unscheduled**: open, no `at`.
- **Scheduled**: open, its `at` has an alarm still to ring.
- **Counting**: open, one of its instants (`at`, or in Phase 3 `start`) is favorited.
- **Waiting**: open, its `at` rang, never counted (dismissed then unfavorited).
- **Paused** (Phase 3): open, has stretches, none counting.
- **Done / dropped / passed**: the record's status.

### 4.3 The actions (each a quick way to make ordinary things)

- **Add** (the Todos tab box, or N): a record. With a time: also the `at` instant with an
  alarm at it (sound and warnings from Settings › Alarms).
- **Schedule** an unscheduled one: the `at` instant at the picked time.
- **Dismiss** (a todo's alarm): answered `dismissed` as today, the todo's other alarms still
  to ring cancelled, and **the `at` instant favorited** (`act.favorite`, the ordinary path).
  This is the only time the app favorites for her; before it rings a todo counts only if
  she favorites it herself.
- **✓ Done** (the lane's ■, the card, the Todos row, a chip tool, the notification): on a
  counting todo, `act.stopNowSpan` exactly as today (the span to Now becomes the saved span to
  the new instant: `entities.closeNowSpan`), the new instant taking role `done` and the ✓
  name; the record `done`; the celebration (§7.2). When nothing counts (from the card, a
  waiting todo, an unscheduled one): a `done` instant at Now, the alarm answered, no span.
- **Later**: moves `at`. Its alarms move with it and re-arm (`rearmAfterMove`); the planned
  block follows.
- **Back to the list**: the `at` instant deleted if none of its alarms rang (a plan that
  never happened isn't history); otherwise kept, its role becoming `was`.
- **Won't do**: the record `dropped`; alarms still to ring cancelled; a counting todo
  stops counting as unfavoriting does (nothing saved).
- **Unfavoriting** a counting todo (the star tool): stop tracking, nothing saved, as today;
  the todo is waiting.
- **Delete** a todo (its ⋯ in the Todos tab, with a second tap): the record goes; its `at`
  too if it never rang; every other instant stays as history with its `todo` link cleared.
- The **trash on a scheduled todo's chip** deletes the schedule, not the todo: Back to the
  list, then a toast offers **Delete todo** too (owner, 2026-11-21). Its bell-slash cancels its
  alarms as on any instant (it stays planned, ringing nothing).

The count runs from `at`, the scheduled time, not from the dismiss: one instant, one rule
(owner, 2026-11-21). If she really began later, she moves it like any instant.

### 4.4 Time tracking: start, pause, switch (Phase 3, its own push)

A todo worked on in pieces is several stretches tied to one record (§4.2), so the data needs
nothing more than the `start` and `pause` roles. Phase 1's only way to count is dismissing
the alarm; Phase 3 adds counting by choice (owner, 2026-11-21).

- **▶ Start** (on any open todo's Todos row, and a chip tool): a new stopwatch span at Now,
  i.e. a `start` instant at Now, favorited, its span to Now counting on the live side. The
  same button whatever its state: unscheduled, waiting, or paused (where it reads as
  resuming, but it is the same Start). **Scheduled ahead, the plan moves to Now** (owner,
  2026-11-21): its `at` instant moves to Now and is favorited (no `start` instant: the
  stretch begins at `at`, as a dismissed one does), its alarms still to ring are cancelled
  (she is on it), and its planned block follows to Now.
- **⏸ Pause**: the favorite's stop with role `pause`: the stretch saved, the record open, no
  celebration. On the lane it takes the lap pin's place (#28), beside ✓.
- **Done on a paused todo**: a `done` instant at Now, no new stretch (she wasn't timing it).

**No automatic pause** (owner, 2026-11-21). Two todos may count at once (the washer case)
until she says otherwise. The one shortcut is where a switch usually happens, the alarm:
- **Switch to ‹name›** on the ringing card, shown while another todo counts: pauses the one
  counting and dismisses this one (which starts its count). Plain Dismiss stays beside it
  and pauses nothing. No Switch elsewhere: from the list, she pauses one and starts another.
- Only todos switch. A plain favorite (a stopwatch, "Gym") is never paused by one.

### 4.5 Series

`SeriesRecord.todo?: { durationMs?: number }`: each occurrence made (14 days ahead, as today)
gets a todo record (`seriesId`, `occurrence`, the series' length) and its instant takes role
`at`. Virtual occurrences past the horizon have no record until held (made real), as any
virtual instant. **Passed**: when an occurrence's next one arrives with this one still open,
its record becomes `passed` and a counting todo stops counting with nothing saved (as
unfavoriting does). Nothing is moved or carried over (owner's call, 2026-11-20).

### 4.6 Scheduling workflow (Phase 2, its own spec: [prd_todos_phase2.md](prd_todos_phase2.md))

The next phase (owner, 2026-11-21): a good way to take an unscheduled todo to a spot on the
timeline. Phase 1 has only Schedule's time entry and chips (§5); Phase 2 makes placing it
visual, built on the planned block. To be specced on its own; what it should cover:

- **Place by seeing**: drag a todo from the Todos tab onto the timeline (or Schedule → at the
  cursor), its planned block previewing where it lands, its length showing how much room it
  takes.
- **Find room**: free gaps between the planned blocks already there (and, with #38, another
  person's busy times); a suggestion such as "Next free 20m: 3:40p", one tap to take it.
- **A sequence**: several todos placed one after another, with or without a gap.
- **Moving one moves what follows?** The runs and push question (explore_time_tracking.md
  §5): whether a sequence moves together, and how to make that simple to understand.
- **No length**: placed as an instant; the block appears once a length is given.

## 5. Making todos (quick ways in, same records)

- **Todos tab Add box**: a name and Enter makes a todo. A time and a length in it are
  parsed as the Alarm picker parses times and Timer parses lengths: "book appt 3p",
  "laundry 20m", "laundry 4p 20m", "feed cats 7a daily". A time schedules straight away.
- **Capture from anywhere**: **N** (and a ＋ in the Todos tab header, which the drawer's ☰
  reaches) opens the same box over whatever is on screen. **Capture never interrupts**: a
  name and Enter, under 5 seconds, no follow-up question, nothing else moves (no schedule
  changes, no selection, the view stays put). Esc or a tap away keeps nothing.
- **Alarm picker**: a **Todo** switch (off by default; remembered in recents) and, when on,
  a **Takes** length (optional). The way to make a repeating todo.
- **Schedule** on an unscheduled one: the time entry (Time with Date, or From Now) plus
  chips: In 15m, In 1h, Tonight (setting, 7p), Tomorrow (setting, 9a).

Not in Phase 1: turning an existing instant or alarm into a todo (owner's call: no).

## 6. Agenda: the Todos tab

New tab after Favorites ("Todos", short "Todo"). Sections, top down:

1. **Now**: rang and not done. The counting one first (name, "25m", ✓), then waiting ones
   (☐, name, "since 7:00a", **Done**, **Later**), and in Phase 3 paused ones ("12m so far",
   **▶ Start**, **Done**, **Later**). Phase 3 puts ▶ Start on every open row. This fixes the iPhone problem: nothing silenced is
   lost. Its count is a badge on the tab and a small badge on the ☰ that opens the Agenda
   drawer; todos show nowhere else (owner's call).
2. **Today**: scheduled later today, in time order (☐, name, time, length, ⟳ for repeats).
3. **Upcoming**: after today (collapsed past a week, as the Alarms tab does).
4. **Unscheduled**: drag to reorder; **Schedule** on each.
5. **Done**: the last day's done, won't-do and passed, newest first, with how long each
   took ("31m · planned 20m"), headed by a count ("4 done today"). Older ones live on the
   timeline and in All Instants (history isn't kept twice).

Tapping a scheduled row goes to its `at` instant (as Agenda rows do); its tools are the
instant's plus the todo's.

**No guilt in the copy.** Todo text states facts without judging: "since 7:00a", not "25m
late" or "overdue"; a passed repeat reads "passed", not "missed!"; "31m · planned 20m", not
"11m over"; no red for open todos (red stays Now's colour). Words live in `config/labels`.
Any todo is first class, chores and self-care alike ("Take pills", "Sit outside"): nothing
ranks them, and every Done counts the same.

## 7. Ringing, the timeline, and the celebration

### 7.1 Ringing, lanes and chips

**Ringing card** for a todo's alarm: **Done** and **Dismiss** (big, side by side: finished
already, or "on it / not yet", which starts the count), **Snooze 5m**, **Later…**, then
quiet **Won't do** (Phase 3 adds **Switch to ‹name›**, §4.4). Later… offers In 1h · Tonight ·
Tomorrow · Back to the list · Other… (typed). Snooze is "remind me again" (another alarm, the
instant stays, nothing counts yet); Later is "the plan changed" (the instant moves). Dismiss
can't make the todo disappear, only start it counting (owner's calls, 2026-11-20 and -21).

**Counting**: the todo's span to Now is a favorite's live lane ("Laundry · 3:12"). **Its
stopwatch controls become todo controls** (owner, 2026-11-21): the ■ stop is **✓ Done**; the
lap pin (#28) is not shown on a todo in Phase 1 and becomes **⏸ Pause** in Phase 3. Nothing
else on the lane changes. The Todos tab's Now row shows the same.

**Chips**: a todo's `at` chip leads with ☐, ✓ once done, the passed mark once passed
(`config/labels`); its length reads on the planned block. Its tools add **✓ Done**
first (Phase 3: **▶ Start** after it). The stretch's lane, named after the todo, is the
record of the time.

**A ✓ close to its todo folds into it**, as a bell folds into its chip (`bellCollapsePx`):
while the two would sit closer than a tunable (`doneFoldPx`), the `at` chip shows ✓ and when
("✓ Feed cats · +12m") and the `done` instant draws no chip of its own. Zoom in and it comes
back out (principle 7).

### 7.2 The celebration (on ✓ Done)

- **Glow pulse**: the ✓ chip, the lane chip it came from and the Todos row flare in a short
  glow burst (the drop pulse's family, `--accent`/`--halo` × `--glow`).
- **Sparks**: glowing e-confetti bursts from the ✓: a few dozen small sparks in the theme's
  accent colours, flung out, falling and fading over about a second and a half. Drawn on one
  short-lived canvas over the timeline from engine frames (`f.perf`), gone when done, so
  the timeline's DOM and its 60fps budget are untouched. Count, spread and length are
  tunables.
- **Fanfare**: a short "ta-da-daaa" brass call, synthesized like the alarm tones (Web Audio,
  `services/tones.ts`; an original phrase, not a recording). Settings › Alarms: "Done
  fanfare" on/off and its own volume. Plays only when the page is on screen; a Done from the
  Android notification with the app closed is silent (Phase 1b: maybe the native side plays
  a rendered `fanfare.ogg`, as the tones are rendered).
- `reducedMotion()`: the glow fades in and out, no sparks; the fanfare still follows its
  setting.

## 8. Phases

- **Phase 1** (web): the todo record and its store, `todo` on instants (`at`, `was`,
  `done`), backups (`data.todos`, by group as instants are); `domain/todos.ts` (derived state,
  actual time, with tests for every role and state); the actions of §4.3; series as todos;
  the planned block; the Todos tab (Add, Now / Today / Upcoming / Unscheduled / Done); capture from anywhere
  (N); Schedule; the badges; the Alarm picker's Todo and Takes; the ringing card; the lane's
  ✓; chips and the ✓ fold; the celebration (glow, sparks, fanfare, setting); the copy rules
  in `config/labels`; Help.
- **Phase 1b** (Android, reinstall): the native side learns which alarms are a todo's; the
  notification's buttons become Done and Snooze; dismissing or swiping it away favorites the
  todo like Dismiss; a counting todo's live notification shows ✓ as its lane does; answers
  reported back like the 'chime' action; maybe the fanfare as a rendered sound.
- **Phase 2**: the scheduling workflow (§4.6), specced on its own first: placing a todo by
  dragging, finding room, sequences, and whether moving one moves what follows.
- **Phase 3**: todo time tracking (§4.4), its own push: the `start` and `pause` roles, actual
  time summed over stretches, ▶ Start on Todos rows and chips, ⏸ on the lane, Switch to on
  the ringing card; ⏸ in the Android live notification.

Later (see explore_time_tracking.md): estimate-up check-ins, overrun nudges, breaks, runs
and pushing schedules, tags, learned estimates. Out: sharing between people, subtasks,
priorities, due dates (only scheduled times), turning existing instants into todos. See §11.

## 9. Decisions and open questions

Owner, 2026-11-20: scheduled time only, no due date; missed repeats are just passed; Later
and Snooze both; todos show only in the Todos tab plus a ☰ badge; no "make it a todo" tool.

Owner, 2026-11-21: Dismiss stays; dismissing a todo's alarm favorites it (otherwise only by
hand) and that is the start of the count, from the scheduled time; doing it is the
favorite's stop, whose control reads ✓ Done on a todo; Done always makes a ✓ instant, folded
into the chip when close; the celebration is glow, sparks and a fanfare; a todo is a record
that ties its instants and spans together, in its own store; the estimate lives only on the
record, drawn as a computed planned block once scheduled, and only actuals are saved (v0.6,
v0.7); the next phase is the scheduling workflow (Phase 2); time tracking is Phase 3: ▶ Start
from the list makes a new stopwatch span at Now, pausing is by hand, and Switch is only on
the ringing card (no automatic pause); Done from the ringing card saves no span; instant notes
are their own feature (#36); starting a todo before its time moves its plan to Now.

Open: none right now. Next: the Phase 2 scheduling workflow's own spec (§4.6).

## 10. Success

- She replaces her seven iPhone timers and, a week later, none got lost by being silenced.
- Adding an unscheduled todo: the tab, a name, Enter. Scheduling it: 2 taps on a chip.
- Done from the card, the tab or the notification: 1 tap, and it records when, with a 🎉.
- A scheduled todo with a length shows its plan on the timeline; afterwards, planned vs
  actual, with no extra taps.
- Phase 2: an unscheduled todo gets a spot on the timeline by seeing where it fits.
- Nothing changes for instants and alarms that aren't a todo's.
- Capturing a todo mid-task takes under 5 seconds and changes nothing else on screen.
- Phase 3: starting any todo from the list is one tap; a todo worked on in pieces adds up
  its time; switching task when the next one rings is one tap.

## 11. From a companion prioritization app's notes (2026-11-21)

A companion app idea, being specced separately, does the *what next* side: prioritising,
dealing one task, places, decisions, project notes. This app is the *when* side: reminding,
scheduling, tracking time. Its addendum's requirements, sorted for this app:

### 11.1 Taken in (above)
- Capture without breaking flow: N from anywhere, under 5 s, nothing else moves (§5).
- No guilt language; self-care todos are todos like any other and count the same (§6).
- Done as a visible win: glow, sparks, fanfare, the day's count (§7.2).
- "Can't right now" never loses the task: Snooze, Later and Dismiss all keep it open.

### 11.2 Future tickets (owner, 2026-11-21)
- **Instant notes** (#36): free text on any instant (what you did last, links); a todo shows
  its `at` instant's note. A general feature, not todo-only.
- **Handoff from the companion app** (#37): it decides what and when, this app rings and
  tracks. Import a small list of todos (name, time, length, repeat).
- **Another person's calendar as free slots** (#38) (read-only Google Calendar or ICS), to
  plan around later. A network call carrying user data, against local-first: opt-in.

### 11.3 Out of scope (decided, owner 2026-11-21)
- A reason on "not now"; places as tags; one-thing re-entry; swapping from the ringing card
  for a different, easier task.
- Prioritising, ranking, or "dealing" the one task to do next.
- Subtasks and steps; decision steps, decision sizing, "good enough" picks.
- Project cards that accumulate knowledge; Obsidian sync; auto-filing captures into projects.
- Inferring a place or project from a todo's words.
- Mood or pain check-ins and care tasks triggered by them.
- Streaks.
- iPhone: alarms with the app closed need a native iOS app (this app's native side is Android
  only, and the web can't ring closed without a push server).

## 12. Phase 1 as built (0.8.0, branch `todo`), and the calls made building it

Built: everything in §8's Phase 1 (web). Not built: Phase 1b (Android: the notification still
offers Dismiss / Snooze; dismissing there replays as a Dismiss, which now leaves the todo
waiting, not counting (call 5): Phase 1b should give it ▶ Start and ✓ Done), Phase 2 (its own
spec: prd_todos_phase2.md), Phase 3. Where things live: AGENTS.md › UX Patterns ›
Todos.

Calls made by Claude while building (for the owner to override):

| # | Call | Why |
|---|---|---|
| 1 | The branch starts from `minor-0.7.2` (0.7.2 plus this PRD): there is no v0.7.3 yet | Rebase onto 0.7.3 once it exists |
| 2 | Records live in the entities store, under their own key `timeline.todos.v1` | One place for data: backups, imports and groups handle them with the rest |
| 3 | The record has a `closedAt` (when it stopped being open) | The Done section lists "the last day's" done, won't do and passed; won't do and passed have no instant to date them |
| 4 | Only an alarm at (or after) its time starts the count. A warning's card says "in 10m · get ready" and asks **▶ Start now** (the plan moves to Now and counts, §4.4's Start, brought forward from Phase 3) or **OK** (it rings again at its time), with Done as a quiet link | Owner, 2026-11-21: a warning is "get ready", never a start by default |
| 5 | Only ▶ Start starts a todo. Its card asks ▶ Start (green, first: from its time) or ✓ Done; Silence answers it without starting (it waits in Now); so does an alarm nobody answered, a chime (whose card is the full todo card, without Silence) and Dismiss on the Android notification. Waiting, ▶ Start (its row, its chip) counts from Now: a `start` instant ("▶ Laundry", Phase 3's role), so the plan stays where it was and history shows the gap | Owner, 2026-11-21: Dismiss reads as Start; Silence hides without starting (replaces "a chime and an unanswered alarm start the count") |
| 5b | Snooze 5m on a todo's card at its time moves the todo itself 5 minutes on (as Later does), with no bell added; a warning's snooze stays a reminder before its time | Owner, 2026-11-21 |
| 5c | The panel's Silence (sound off, cards kept) is a small 🔇 by its title, for every alarm, lit once muted; the big button under the cards is gone | Owner, 2026-11-21; it no longer reads like the todo card's Silence |
| 6 | A counting todo's lane to Now always shows (like a running stopwatch's), whatever "favorite lanes" says | Otherwise a dismissed todo would be invisible unless selected |
| 7 | Done before its time, or Won't do before it rang: an `at` none of whose alarms rang is deleted | §4.3's "a plan that never happened isn't history" (said for Back to the list) |
| 8 | Later also drops pending snoozes, stops a count (nothing saved), and adds an alarm at the time if none is left to ring | Later is "the plan changed": it should ring at the new time, once |
| 9 | A folded ✓ draws as a Mark (a stub from the axis), not as nothing | Its line stays visible: history isn't hidden, only its chip folds |
| 10 | The planned block is a new `block` lane kind (domain/blocks `TimeBlock`, look `planned`), packed with the saved span lanes. Tap selects its `at`, double-tap focuses it. During a live move it stays put until the move is confirmed | Sparing #12: the same lane kind can draw first-class spans as blocks later (a `solid` look) |
| 11 | Schedule and Later: the quick chips, a typed box ("3p", "1h30", "tomorrow 9a") and the hh:mm:ss time entry (for a date) | The typed box matches the ringing card's Other…; the time entry reaches any date |
| 12 | In a typed "when", "1:30" is a clock time; lengths are "90", "1h30", "45m" | It answers "when", not "how long" |
| 13 | The Add box reads only words at its end that can't be part of a name: "3p", "at 7", "20m", "daily", "tomorrow"; "buy 2 eggs" stays a name; a repeat needs a time, else its words stay in the name | Capture must never mangle a name |
| 14 | A row's box is its Done, and a closed row's box opens it again (no separate ✓ or ↺); Later/Schedule on every open row; a ⋯ for Rename, Won't do (boxed), Delete (a second tap) and Duration: quick lengths 5m–2h with "—" for none, or a typed one in a box labelled Duration. A duration reads as a drawn stopwatch and its length, not "takes" | Owner, 2026-11-21: the ✓ was redundant with the box; uncheck is needed now, a global Undo is Phase 2a |
| 14b | A tap on an unscheduled row opens its Schedule (the drawer stays open); other rows go to their instant (closing the drawer) | Owner, 2026-11-21: it shouldn't hide the drawer; there is nothing on the timeline to go to |
| 14c | The Todo button: the control bar's way to the Todos tab, left of ＋ (horizontal), under Alarm (vertical), with the Now badge; tapped again while the drawer shows Todos, it closes it. N still adds one from anywhere | Owner, 2026-11-21 |
| 15 | No ＋ in the Agenda header: the Add box is at the top of the Todos tab, which the ☰ reaches | It would open the same box one tap later |
| 16 | On a scheduled todo's chip, the trash is Back to the list, then a toast (components/common/Toast, which Phase 2a's Undo can speak through) offers Delete todo; the bell-slash cancels alarms as everywhere (it no longer reads Unschedule: two tools would mean the same) | Owner, 2026-11-21 |
| 16d | Copy: the card's Silence is **Hide** (it only answers the alarm; the todo waits), Later is **Delay**, Back to the list is **Unschedule** (code keeps `laterTodo` / `backToList`). Rows: Schedule (or Delay) then a green ▶ on every open row not counting (the ⋯'s Start now and the chip's ▶ went: the tool row was crowded). A long-press on a selected todo chip's box opens the Todos tab and scrolls to its row, lit (its hover green only under a mouse: a touch long-press left it lit). A counting todo has no Not a todo. The chip's contents are centered and its box is 18px | Owner, 2026-11-21 |
| 16c | A selected todo chip's box is its Done (the ✓ tool was redundant); in its place, Not a todo (a struck-through box) un-todoes it: the instant stays (alarms, favorite), the record goes; on an occurrence the series stops being a todo, its occurrences ahead plain. Also in a row's ⋯ | Owner, 2026-11-21 |
| 16b | Any instant becomes a todo: a faint ☐ before a selected chip's name (it lights up as the chip's box), and ☐ Todo on a plain alarm's ringing card (the card becomes the todo card). One ahead gets an alarm at its time if it has none (a todo at a time rings); one past is waiting, or counting if it is a favorite; on an occurrence the series becomes a repeating todo; unnamed, the chip's name box opens; fixed times (sun, clock changes, seasons) never | Owner, 2026-11-21: a way to promote an instant; both places they suggested, one action |
| 17 | Repeating a todo's `at` with ⟳, or editing a series in the Alarm picker with Todo on, makes a repeating todo (its occurrences ahead get records) | The repeat should keep being a todo |
| 18 | Renaming the `at` renames the todo, and the other way round | The `at` carries the todo's name |
| 19 | A group switched off hides its todos from the tab too | As it hides its instants |
| 20 | Todo colour `--c-todo` (violet); the todo card's Dismiss is cyan, not red; Done is green | §6: no red for open todos |
| 21 | The fanfare is a herald's trumpet call, as for royal news (owner's reference, 2026-11-21): an original call on the natural trumpet's notes; since the owner's ask (2026-11-21) only its second half: a quick G–C–E pickup into a held C major chord in three trumpets, in a little hall, synthesized; only while the page is on screen; the volume slider plays it when let go | §7.2 |
