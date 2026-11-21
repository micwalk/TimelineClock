# Todos — Product Requirements, Phase 1 (draft v0.3, 2026-11-21)

Status: proposal for the owner's review. Nothing here is built. v0.2 refocuses on Phase 1
and drops the todo record: **a todo is an alarm that asks "Done?"**. Estimates, time
tracking, breaks, runs and tags moved to [explore_time_tracking.md](explore_time_tracking.md).

## 1. The problem

A real user keeps about seven named iPhone timers as a to-do list: "Feed cats" (every day),
"Book appointment" (once), and so on. The timer's job is to remind her. Two things go wrong:

1. **Dismissing the timer deletes it, and its name.** The reminder is gone whether or not the
   thing got done, so she forgets it.
2. **"Not now" has only one tool: snooze.** There is no way to say "later today",
   "tomorrow", or "whenever, just don't lose it".

The app already does the timing: an instant with a name and alarms, snoozes kept as history,
repeating series, the Android app ringing with the app closed. What it lacks is the
difference between **silenced** and **done**: today both are Dismiss.

## 2. The model: no new concept

The app's rule is few underlying concepts (instant, span, alarm) and many ways to make them.
A todo adds no fourth one:

> **A todo is an instant with an alarm that asks "Done?".**
> The Todos tab is a view of those instants. Done is an answer, plus an instant and a span.

| Todo idea | What it is underneath |
|---|---|
| "Feed cats at 7a, every day" | A series whose alarm asks Done (as a series has a `sound`) |
| "Book appointment at 3p" | An instant at 3p with an alarm that asks Done |
| It rang, she silenced it | The alarm answered `dismissed`: no Done yet, so still open |
| She did it | The alarm answered `done`; a ✓ instant at Now; a span todo → ✓ |
| Won't do it | The alarm answered `dropped` |
| Later (tonight, tomorrow) | The instant moves; its alarm re-arms (`rearmAfterMove`, as today) |
| Missed (Feed cats at 7a, not done by 6p) | Derived: a series' occurrence still open when the next one arrives |
| "Book appointment", no time yet | **Not an instant**: an unscheduled entry (§4.3), the one non-time record |

Why the alarm and not the instant: "Done?" is how a reminder is *answered*, the same family
as the alarm's sound (a chime answers itself; a tone rings until answered; a todo rings until
answered Done). Warnings stay plain: "leave in 15m" before a todo doesn't ask anything.

## 3. Stories

- **Recurring chore.** "Feed cats" daily 7a and 6p. It rings; **Done**; gone until next
  time. Silenced instead, it stays in the Todos tab's Now section until Done, or until the
  next feeding comes (then it reads "passed").
- **One-off errand.** "Book appointment", no time. It sits in the Todos tab. When she has a
  gap: **Schedule → In 1h**, and it rings then.
- **Not now.** It rings at a bad moment: **Later → Tonight**. Name kept, it rings again then.
- **Looking back.** On the timeline: "✓ Feed cats" at 7:12a, the span from 7:00a reading 12m.

## 4. Data

### 4.1 Alarms

```ts
interface AlarmRecord {
  // …as today: id, offsetMs, snoozeOf, answered, sound
  /** A todo: it rings until answered Done (or Won't do); Dismiss only silences it. */
  ask?: 'done'
}
type AlarmAnswer = 'dismissed' | 'snoozed' | 'chimed' | 'done' | 'dropped'
```

- `ask` is per alarm, like `sound`; a snooze of an asking alarm asks too (as it keeps the
  sound). (`'skipped'` is taken: old data is dropped by that name in `sanitizeAlarms`.)
- **Open todo** (derived, `domain/todos.ts`): an instant with an asking alarm, none of its
  alarms answered `done` or `dropped`. It is **due** once an asking alarm has rung.
- **Done** answers the asking alarm that rang (or the next one) `done`, and cancels the
  instant's alarms still to ring (deleted, as cancelling does today). Won't do the same
  with `dropped`.
- Cancelling all alarms (bell-slash) on a todo leaves no asking alarm: it stops being a todo.
  The tool reads **Unschedule** on a todo and does §4.3's "back to the list" instead.

### 4.2 Series

`SeriesRecord.ask?: 'done'`: every occurrence's alarms at the instant ask (warnings don't).
**Missed** is derived, never stored: an occurrence still open when the series' next
occurrence's time arrives. It leaves the Now section and reads "passed" in history; nothing
is moved or carried over (owner's call, 2026-11-20).

### 4.3 Unscheduled entries (the one new record)

A todo with no time isn't in time yet, so it isn't an instant. It is a **draft of one**:

```ts
// timeline.todoDrafts.v1; backups data.todoDrafts
interface TodoDraft { id: string; label: string; createdAt: number; order: number; collectionId?: string }
```

Same standing as the Alarm picker's recent alarms: a template, never drawn on the timeline,
never in Previous/Next, lanes, capture, or the Android sync.

- **Schedule** turns a draft into an instant at the picked time with an alarm at it that
  asks (sound and warnings from Settings › Alarms), then removes the draft.
- **Back to the list** (from Later): a new draft with the name. The instant: deleted if
  none of its alarms rang (a plan that never happened isn't history); otherwise kept as
  history, its asking alarm answered `dismissed` and its `ask` cleared.

Considered and rejected: an unscheduled todo as an instant at the moment it was thought of.
Honest about capture, but every instant reader (lanes, Previous/Next, Agenda, visibility,
backups, the Android sync) would need a "not really here" exception: a new concept in disguise.

## 5. Making todos (richer ways in, same records)

- **Todos tab Add box**: a name and Enter makes a draft. A time in it schedules straight
  away ("book appt 3p", "feed cats 7a daily"), parsed as the Alarm picker parses times.
- **Capture from anywhere**: **N** (and a ＋ in the Todos tab header, which the drawer's ☰
  reaches) opens the same box over whatever is on screen. **Capture never interrupts**: a
  name and Enter, under 5 seconds, no follow-up question, nothing else moves (no schedule
  changes, no selection, the view stays put). Esc or a tap away keeps nothing.
- **Alarm picker**: a **Ask "Done?"** switch (off by default; remembered in recents). The way
  to make a repeating todo, and the same picker as every alarm.
- **Schedule** on a draft: the time entry (Time with Date, or From Now) plus chips: In 15m,
  In 1h, Tonight (setting, 7p), Tomorrow (setting, 9a).

Not in Phase 1: the same switch in a bell's tools, to make an existing alarm ask (owner
unsure, 2026-11-21; it overlaps the rejected "make it a todo" tool). Todos are made from the
Todos tab and the Alarm picker only.

## 6. Agenda: the Todos tab

New tab after Favorites ("Todos", short "Todo"). Sections, top down:

1. **Now**: due and open. ☐, name, since when ("since 7:00a"), **Done**, **Later**. This fixes
   the iPhone problem: nothing silenced is lost. Its count is a badge on the tab and a small
   badge on the ☰ that opens the Agenda drawer; todos show nowhere else (owner's call).
2. **Today**: scheduled later today, in time order (☐, name, time, ⟳ for repeats).
3. **Upcoming**: after today (collapsed past a week, as the Alarms tab does).
4. **Unscheduled**: drafts, drag to reorder; **Schedule** on each.
5. **Done**: the last day's done, won't-do and missed, newest first, headed by a count
   ("4 done today"). Older ones live on the timeline and in All Instants (history isn't
   kept twice).

Tapping a row goes to its instant (as Agenda rows do); its tools are the instant's.

**No guilt in the copy.** Todo text states facts without judging: "since 7:00a", not "25m
late" or "overdue"; a missed repeat reads "passed", not "missed!"; no red for open todos
(red stays Now's colour). Words live in `config/labels` so they can be tuned in one place.
Any todo is first class, chores and self-care alike ("Take pills", "Sit outside"): nothing
ranks them, and every Done counts the same.

## 7. Ringing and on the timeline

**Ringing card** for an asking alarm: **Done** (big), **Snooze 5m**, **Later…**, then quiet
**Won't do** and **Dismiss** (silences; the todo stays in Now). Later… offers In 1h ·
Tonight · Tomorrow · Back to the list · Other… (typed). Snooze is "remind me again"
(another alarm, the instant stays); Later is "the plan changed" (the instant moves). Both
stay (owner's call).

Dismiss stays, small and last: without it the card forces a decision on the spot, and the
easy way out is tapping Done to silence it, which records a lie. Android's swipe-away is a
silent dismiss anyway (owner's call, 2026-11-21: keep).

**Done** works like the lane's ■ stop: a "✓ Feed cats" instant at Now (name
from `config/labels`, in the todo's group), the span todo → ✓ saved ("12m"), the alarm
answered `done`. Same from the card, the Todos tab, a chip tool, or the notification.
Always, one rule (owner's call, 2026-11-21).

**Done is a win you can see**: the ✓ chip and the Todos row light up in a short glow burst
(the drop pulse's family, `--glow`; a fade under `reducedMotion()`), and the Done section's
count goes up. No sound, no streak, no confetti.

**A ✓ close to its todo folds into it**, as a bell folds into its chip
(`bellCollapsePx`): while the two would sit closer than a tunable (`doneFoldPx`), the todo's
chip shows ✓ and when ("✓ Feed cats · +12m") and the ✓ instant draws no chip of its own.
Zoom in and it comes back out. Nothing is hidden at its own scale (principle 7). Better
drawing of the todo → ✓ span waits for first-class spans.

**Chips**: an open todo leads with ☐, a done one with ✓, a passed one with the passed mark
(`config/labels`). The chip tools add **✓ Done** first. Nothing else on the timeline changes.

**Not favorited.** A todo's span to Now (counting up once due) shows on the live side only
if she favorites it herself, as any instant (owner's call, 2026-11-21).

## 8. Phase 1 scope

- Web: `ask` and the new answers; `SeriesRecord.ask`; drafts store and backup; derived todo
  state (`domain/todos.ts`, with tests: open, due, done, dropped, missed); Todos tab with
  Add, Now / Today / Upcoming / Unscheduled / Done; capture from anywhere (N); Schedule; the
  badges; the Alarm picker switch; the ringing card; Done (✓ instant + span, glow, fold);
  chip ☐/✓ and Done tool; the copy rules in `config/labels`; Help.
- Phase 1b, Android (reinstall): the native side learns `ask`; the notification's buttons
  become Done and Snooze; Done reported back like the 'chime' action.

Not in Phase 1 (see explore_time_tracking.md): estimates, Start, overrun, breaks, runs and
pushing schedules, tags, learned estimates. Also out: sharing between people, subtasks,
priorities, due dates (only scheduled times, owner's call), turning existing instants into
todos (owner's call: no), the bell-tools switch (§5). See §11 for what else is out.

## 9. Decisions

Owner, 2026-11-20: scheduled time only, no due date; missed repeats are just missed (now
"passed"); Later and Snooze both; todos show only in the Todos tab plus a ☰ badge; no
"make it a todo" tool.

Owner, 2026-11-21: a todo is the alarm's `ask` (v0.2), drafts the only new record; Dismiss
stays on the card, small and last; a todo's span to Now is never favorited for her; Done
always makes a ✓ instant, which folds into the todo's chip when close.

Open: the maybes in §11.2.

## 10. Success

- She replaces her seven iPhone timers and, a week later, none got lost by being silenced.
- Adding an unscheduled todo: the tab, a name, Enter. Scheduling it: 2 taps on a chip.
- Done from the card, the tab or the notification: 1 tap, and it records when.
- Nothing changes for alarms that don't ask.
- Capturing a todo mid-task takes under 5 seconds and changes nothing else on screen.

## 11. From a companion prioritization app's notes (2026-11-21)

A companion app idea, being specced separately, does the *what next* side: prioritising,
dealing one task, places, decisions, project notes. This app is the *when* side: reminding,
scheduling, tracking time. Its addendum's requirements, sorted for this app:

### 11.1 Taken into Phase 1 (above)
- Capture without breaking flow: N from anywhere, under 5 s, nothing else moves (§5).
- No guilt language; self-care todos are todos like any other and count the same (§6).
- Done as a visible win: the glow burst and the day's count (§7).
- "Can't right now" never loses the task: already true (Snooze, Later, Dismiss all keep it open).

### 11.2 Maybe (owner to decide)
1. **A reason on "not now"**: Snooze/Later ask why in one optional tap (Can't get up · Not
   ready · Busy), logged on the alarm, for patterns later. Small to store; the patterns need
   the time tracking work.
2. **Places as tags** (#couch, #kitchen, #out), filtering the Unscheduled list ("I'm on the
   couch"). Would come with tags (explore_time_tracking §2), not as its own field.
3. **One thing on re-entry**: the Now section shows one row (the oldest open) and "+3 more"
   behind a tap, instead of the whole list. Fights the pile; costs a tap to see everything.
4. **Swap from the ringing card**: "Can't get up" offers one unscheduled todo tagged for
   where she is. Needs 1 and 2.
5. **A note on a todo** (free text: what you did last, links). Cheap; the instant gets a
   `note`, and every instant could use one.
6. **Handoff from the companion app**: it decides what and when, this app rings and tracks.
   Paste a list or import a small JSON of todos (name, time, repeat) into drafts/instants.
7. **Another person's calendar as free slots** (read-only Google Calendar or ICS), feeding
   runs' replanning later. A network call carrying user data, against local-first; big.

### 11.3 Out of scope for this app (the companion app's job)
- Prioritising, ranking, or "dealing" the one task to do next.
- Subtasks and steps; decision steps, decision sizing, "good enough" picks.
- Project cards that accumulate knowledge; Obsidian sync; auto-filing captures into projects.
- Inferring a place or project from a todo's words.
- Mood or pain check-ins and care tasks triggered by them.
- Streaks.
- iPhone: alarms with the app closed need a native iOS app (this app's native side is Android
  only, and the web can't ring closed without a push server).
