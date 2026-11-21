# Todos — Product Requirements, Phase 1 (draft v0.2, 2026-11-21)

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
  next feeding comes (then it reads as missed).
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
occurrence's time arrives. It leaves the Now section and reads "missed" in history; nothing
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
- **Alarm picker**: a **Ask "Done?"** switch (off by default; remembered in recents). The way
  to make a repeating todo, and the same picker as every alarm.
- **A bell's tools**: the same switch on any alarm (it is just the alarm's `ask`).
- **Schedule** on a draft: the time entry (Time with Date, or From Now) plus chips: In 15m,
  In 1h, Tonight (setting, 7p), Tomorrow (setting, 9a).

## 6. Agenda: the Todos tab

New tab after Favorites ("Todos", short "Todo"). Sections, top down:

1. **Now**: due and open. ☐, name, how late ("25m late"), **Done**, **Later**. This fixes
   the iPhone problem: nothing silenced is lost. Its count is a badge on the tab and a small
   badge on the ☰ that opens the Agenda drawer; todos show nowhere else (owner's call).
2. **Today**: scheduled later today, in time order (☐, name, time, ⟳ for repeats).
3. **Upcoming**: after today (collapsed past a week, as the Alarms tab does).
4. **Unscheduled**: drafts, drag to reorder; **Schedule** on each.
5. **Done**: the last day's done, won't-do and missed, newest first. Older ones live on the
   timeline and in All Instants (history isn't kept twice).

Tapping a row goes to its instant (as Agenda rows do); its tools are the instant's.

## 7. Ringing and on the timeline

**Ringing card** for an asking alarm: **Done** (big), **Snooze 5m**, **Later…**, then quiet
**Won't do** and **Dismiss** (silences; the todo stays in Now). Later… offers In 1h ·
Tonight · Tomorrow · Back to the list · Other… (typed). Snooze is "remind me again"
(another alarm, the instant stays); Later is "the plan changed" (the instant moves). Both
stay (owner's call).

Dismiss stays, small and last: without it the card forces a decision on the spot, and the
easy way out is tapping Done to silence it, which records a lie. Android's swipe-away is a
silent dismiss anyway. (Proposed; owner to confirm.)

**Done** works like the lane's ■ stop: a "✓ Feed cats" instant at Now (name
from `config/labels`, in the todo's group), the span todo → ✓ saved ("12m"), the alarm
answered `done`. Same from the card, the Todos tab, a chip tool, or the notification.

**Chips**: an open todo leads with ☐, a done one with ✓, a missed one with the missed mark
(`config/labels`). The chip tools add **✓ Done** first. Nothing else on the timeline changes.

## 8. Phase 1 scope

- Web: `ask` and the new answers; `SeriesRecord.ask`; drafts store and backup; derived todo
  state (`domain/todos.ts`, with tests: open, due, done, dropped, missed); Todos tab with
  Add, Now / Today / Upcoming / Unscheduled / Done; Schedule; the badges; the Alarm picker
  and bell switch; the ringing card; Done (✓ instant + span); chip ☐/✓ and Done tool; Help.
- Phase 1b, Android (reinstall): the native side learns `ask`; the notification's buttons
  become Done and Snooze; Done reported back like the 'chime' action.

Not in Phase 1 (see explore_time_tracking.md): estimates, Start, overrun, breaks, runs and
pushing schedules, tags, learned estimates. Also out: sharing between people, subtasks,
priorities, due dates (only scheduled times, owner's call), turning existing instants into
todos with a dedicated tool (owner's call: no; the bell switch is the alarm's own setting).

## 9. Decisions and open questions

Decided (owner, 2026-11-20): scheduled time only, no due date; missed repeats are just
missed; Later and Snooze both; todos show only in the Todos tab plus a ☰ badge; no
"make it a todo" tool.

Changed in v0.2 (owner, 2026-11-21: "maybe a property of an alarm"): Q1 was "own record";
now the todo is the alarm's `ask`, with drafts as the only new record. To confirm.

Open:
1. **Dismiss on a todo's card**: keep, small and last (recommended), or drop?
2. **The bell switch** (§5): is "Ask Done?" on any alarm the same as the rejected "make it
   a todo" tool? Recommend keeping it: it's a setting of the alarm, like its sound, not a
   conversion. Drop it if it reads as the same thing.
3. **Overdue on the timeline**: should a due todo also show its span to Now on the live
   side ("Feed cats · 25m late", ✓ to finish)? Recommend not in Phase 1: seven open todos
   would be seven live lanes. The ☐ chip and the Now section are enough.
4. **Done's ✓ instant**: always, or only when done more than a minute from its time (done on
   the spot adds a ✓ chip right beside the todo's)? Recommend always: one rule, and the
   chips' layout handles neighbours.

## 10. Success

- She replaces her seven iPhone timers and, a week later, none got lost by being silenced.
- Adding an unscheduled todo: the tab, a name, Enter. Scheduling it: 2 taps on a chip.
- Done from the card, the tab or the notification: 1 tap, and it records when.
- Nothing changes for alarms that don't ask.
