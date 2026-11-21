# Todos — Product Requirements, Phase 1 (draft v0.4, 2026-11-21)

Status: proposal for the owner's review. Nothing here is built. A todo is an alarm that asks
to be answered, and doing it is the ordinary favorite → ■ stop. v0.4 adds durations (a todo
with a length is a span) and the Done celebration. Runs, breaks, tags and the rest of time
tracking are in [explore_time_tracking.md](explore_time_tracking.md).

## 1. The problem

A real user keeps about seven named iPhone timers as a to-do list: "Feed cats" (every day),
"Book appointment" (once), and so on. The timer's job is to remind her. Two things go wrong:

1. **Dismissing the timer deletes it, and its name.** The reminder is gone whether or not the
   thing got done, so she forgets it.
2. **"Not now" has only one tool: snooze.** There is no way to say "later today",
   "tomorrow", or "whenever, just don't lose it".

The app already does the timing: an instant with a name and alarms, snoozes kept as history,
repeating series, favorites whose span to Now counts until ■ stop, the Android app ringing
with the app closed. What it lacks is the difference between **silenced** and **done**:
today both are Dismiss.

## 2. The model: no new concept

The app's rule is few underlying concepts (instant, span, alarm) and many ways to make them.
A todo adds no fourth one:

> **A todo is an instant with an alarm that asks to be answered.**
> Starting it favorites the instant; the normal ■ stop records when it was done.
> A todo with a duration is also a span: the estimate. Stopping replaces it with the actual.

| Todo idea | What it is underneath |
|---|---|
| "Feed cats at 7a, every day" | A series whose alarm asks (as a series has a `sound`) |
| "Book appointment at 3p" | An instant at 3p with an asking alarm |
| "Laundry at 4p, 20m" | That, plus an end instant at 4:20p and the saved span between: the estimate |
| It rang, she silenced it | The alarm answered `dismissed`: still open, in the Now section |
| **Start** | The alarm answered `started`; the instant is favorited, so its span to Now counts |
| **■ Stop** (finished) | The favorite's normal stop: a ✓ instant at Now, the saved span start → ✓; the alarm answered `done` |
| …on a todo with a duration | The same; the estimate span and its end instant are then hidden (kept, not deleted) |
| **Done** on the card (already did it) | Start and Stop in one tap |
| Won't do it | The alarm answered `dropped` |
| Later (tonight, tomorrow) | The instant moves (with its estimate's end); its alarm re-arms (`rearmAfterMove`) |
| Passed (Feed cats at 7a, not done by 6p) | Derived: a series' occurrence still open when the next one arrives |
| "Book appointment", no time yet | **Not an instant**: a draft (§4.4), the one non-time record |

Why the alarm and not the instant: being answered is what an alarm is for, the same family
as its sound (a chime answers itself; a tone rings until answered; a todo rings until
started or done). Warnings stay plain: "leave in 15m" before a todo doesn't ask anything.

Reading of the owner's note (2026-11-21, "a Todo alarm favorites the start instant once
done"): *once the alarm is answered with Start*, the todo's own instant is favorited. To
confirm.

## 3. Stories

- **Recurring chore.** "Feed cats" daily 7a and 6p. It rings; **Done** (it's a minute's job);
  🎉. Silenced instead, it stays in the Todos tab's Now section until done, or until the next
  feeding comes (then it reads "passed").
- **A chore with a length.** "Laundry 4p · 20m". The timeline shows the planned 4:00–4:20
  block. It rings; **Start**; the live lane counts "Laundry · 3:12". At 4:31 she taps ■: 🎉,
  the block now reads 4:00–4:31 (31m), and the 20m estimate is tucked away.
- **One-off errand.** "Book appointment", no time. It sits in the Todos tab. When she has a
  gap: **Schedule → In 1h**, and it rings then.
- **Not now.** It rings at a bad moment: **Later → Tonight**. Name kept, it rings again then.

## 4. Data

### 4.1 Alarms

```ts
interface AlarmRecord {
  // …as today: id, offsetMs, snoozeOf, answered, sound
  /** A todo: it rings until started, done or dropped; Dismiss only silences it. */
  ask?: 'todo'
}
type AlarmAnswer = 'dismissed' | 'snoozed' | 'chimed' | 'started' | 'done' | 'dropped'
```

- `ask` is per alarm, like `sound`; a snooze of an asking alarm asks too (as it keeps the
  sound). (`'skipped'` is taken: old data is dropped by that name in `sanitizeAlarms`.)
- **Todo state** is derived (`domain/todos.ts`), never stored on its own:
  scheduled (asking alarm still to ring) → due (rang; unanswered, dismissed or snoozed) →
  started (`started` and the instant favorited) → done / dropped / passed.
- **Start** answers the asking alarm that rang (or the next one, started early) `started`,
  cancels the instant's alarms still to ring, and favorites the instant.
- **Stop** on a started todo is `act.stopNowSpan` as today, plus: the stop instant is named
  "✓ ‹name›" (`config/labels`), the asking alarm is answered `done`, the celebration plays
  (§7.2). Unfavoriting a started todo instead (the star tool: stop tracking, nothing saved)
  puts it back to due (`dismissed`).
- **Done** (card, tab, chip tool, notification) is Start then Stop at once: the span runs
  from the todo's time to now.
- Cancelling all alarms (bell-slash) on an open todo would leave no asking alarm: on a todo
  the tool reads **Unschedule** and does §4.4's "back to the list" instead.

### 4.2 Durations: a todo with a length is a span

- Scheduling a todo with a duration makes three things: the start instant with the asking
  alarm, an **end instant** at start + duration (no alarm, unnamed), and the **saved span**
  between them, named after the todo: the estimate, drawn as an ordinary saved span.
- Start favorites the start instant, as for any todo; its span to Now is the live lane.
- Stop saves the actual span (start → ✓), and **hides the estimate**: the estimate span gets
  `visible: false`, its end instant `hidden: true`. Both stay stored: they are what the
  learned estimates later read (explore_time_tracking §4). Done does the same.
- Later and the move tool move the end with the start (one action moves both; first-class
  spans will make this general). A typed new length on the estimate span is
  `act.setSpanLength`, as for any span.
- Start counts from the todo's scheduled time, not from the tap: one instant, one rule. If
  she started late, she moves the start instant (move mode) like any instant. (Open: move
  the start to Now on a late Start instead? §9.)

### 4.3 Series

`SeriesRecord.ask?: 'todo'` and `SeriesRecord.durationMs?`: every occurrence's alarm at the
instant asks, and gets its estimate span (warnings don't ask). **Passed** is derived, never
stored: an occurrence still open when the series' next occurrence's time arrives. It leaves
the Now section and reads "passed" in history; nothing is moved or carried over (owner's
call, 2026-11-20). Virtual occurrences past the horizon draw no estimate span (the span is
made when the occurrence is).

### 4.4 Unscheduled entries (the one new record)

A todo with no time isn't in time yet, so it isn't an instant. It is a **draft of one**:

```ts
// timeline.todoDrafts.v1; backups data.todoDrafts
interface TodoDraft {
  id: string; label: string; createdAt: number; order: number
  durationMs?: number; collectionId?: string
}
```

Same standing as the Alarm picker's recent alarms: a template, never drawn on the timeline,
never in Previous/Next, lanes, capture, or the Android sync.

- **Schedule** turns a draft into the instant (and estimate span) at the picked time, with
  an asking alarm at it (sound and warnings from Settings › Alarms), and removes the draft.
- **Back to the list** (from Later): a new draft with the name and duration. The instant
  (and its estimate): deleted if none of its alarms rang (a plan that never happened isn't
  history); otherwise kept as history, its asking alarm answered `dismissed`, `ask` cleared.

Considered and rejected: an unscheduled todo as an instant at the moment it was thought of.
Every instant reader (lanes, Previous/Next, Agenda, visibility, backups, the Android sync)
would need a "not really here" exception: a new concept in disguise.

## 5. Making todos (richer ways in, same records)

- **Todos tab Add box**: a name and Enter makes a draft. A time and a length in it are
  parsed as the Alarm picker parses times and Timer parses lengths: "book appt 3p",
  "laundry 20m", "laundry 4p 20m", "feed cats 7a daily". A time schedules straight away.
- **Capture from anywhere**: **N** (and a ＋ in the Todos tab header, which the drawer's ☰
  reaches) opens the same box over whatever is on screen. **Capture never interrupts**: a
  name and Enter, under 5 seconds, no follow-up question, nothing else moves (no schedule
  changes, no selection, the view stays put). Esc or a tap away keeps nothing.
- **Alarm picker**: an **Ask** switch ("Todo: ring until done", off by default; remembered
  in recents) and, when on, a **Takes** length (optional). The way to make a repeating todo.
- **Schedule** on a draft: the time entry (Time with Date, or From Now) plus chips: In 15m,
  In 1h, Tonight (setting, 7p), Tomorrow (setting, 9a).

Not in Phase 1: the same switch in a bell's tools, to make an existing alarm ask (owner
unsure, 2026-11-21; it overlaps the rejected "make it a todo" tool).

## 6. Agenda: the Todos tab

New tab after Favorites ("Todos", short "Todo"). Sections, top down:

1. **Now**: started ones first ("started 4:02p", ■), then due ones (☐, name, "since
   7:00a", **Start**, **Done**, **Later**). This fixes the iPhone problem: nothing silenced
   is lost. Its count is a badge on the tab and a small badge on the ☰ that opens the Agenda
   drawer; todos show nowhere else (owner's call).
2. **Today**: scheduled later today, in time order (☐, name, time, length, ⟳ for repeats).
3. **Upcoming**: after today (collapsed past a week, as the Alarms tab does).
4. **Unscheduled**: drafts, drag to reorder; **Schedule** on each.
5. **Done**: the last day's done, won't-do and passed, newest first, with how long each took
   ("31m · planned 20m"), headed by a count ("4 done today"). Older ones live on the
   timeline and in All Instants (history isn't kept twice).

Tapping a row goes to its instant (as Agenda rows do); its tools are the instant's.

**No guilt in the copy.** Todo text states facts without judging: "since 7:00a", not "25m
late" or "overdue"; a passed repeat reads "passed", not "missed!"; "31m · planned 20m", not
"11m over"; no red for open todos (red stays Now's colour). Words live in `config/labels`.
Any todo is first class, chores and self-care alike ("Take pills", "Sit outside"): nothing
ranks them, and every Done counts the same.

## 7. Ringing, the timeline, and the celebration

### 7.1 Ringing and chips

**Ringing card** for an asking alarm: **Start** and **Done** (big, side by side; a todo with
no duration leads with Done), **Snooze 5m**, **Later…**, then quiet **Won't do** and
**Dismiss** (silences; the todo stays in Now). Later… offers In 1h · Tonight · Tomorrow ·
Back to the list · Other… (typed). Snooze is "remind me again" (another alarm, the instant
stays); Later is "the plan changed" (the instant moves). Dismiss stays, small and last:
without it the easy way out is Done to silence it, which records a lie (owner's calls,
2026-11-20 and -21).

**Started**: the todo's span to Now is a favorite's live lane like any other ("Laundry ·
3:12"), with its ■ stop; nothing new on the lane. Not favorited before Start: a due todo
shows on the live side only if she favorites it herself (owner's call, 2026-11-21).

**Chips**: an open todo leads with ☐, a started one with ▶, a done one with ✓, a passed one
with the passed mark (`config/labels`). The chip tools add **Start** / **✓ Done** first.

**A ✓ close to its todo folds into it**, as a bell folds into its chip (`bellCollapsePx`):
while the two would sit closer than a tunable (`doneFoldPx`), the todo's chip shows ✓ and
when ("✓ Feed cats · +12m") and the ✓ instant draws no chip of its own. Zoom in and it comes
back out (principle 7). Better drawing of the actual span waits for first-class spans.

### 7.2 The celebration (on Stop and Done)

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

## 8. Phase 1 scope

- Web: `ask`, the new answers; durations (estimate span, hide on Stop); `SeriesRecord.ask`
  and `durationMs`; drafts store and backup; derived todo state (`domain/todos.ts`, with
  tests: scheduled, due, started, done, dropped, passed, unfavorite back to due); Todos tab
  with Add, Now / Today / Upcoming / Unscheduled / Done; capture from anywhere (N);
  Schedule; the badges; the Alarm picker's Ask and Takes; the ringing card; Start / Stop /
  Done on the favorite path; chip marks and tools; the ✓ fold; the celebration (glow,
  sparks, fanfare, setting); the copy rules in `config/labels`; Help.
- Phase 1b, Android (reinstall): the native side learns `ask`; the notification's buttons
  become Start/Done and Snooze; answers reported back like the 'chime' action; maybe the
  fanfare as a rendered sound.

Not in Phase 1 (see explore_time_tracking.md): estimate-up check-ins, overrun nudges, breaks,
runs and pushing schedules, tags, learned estimates. Also out: sharing between people,
subtasks, priorities, due dates (only scheduled times), turning existing instants into
todos, the bell-tools switch (§5). See §11 for what else is out.

## 9. Decisions and open questions

Owner, 2026-11-20: scheduled time only, no due date; missed repeats are just passed; Later
and Snooze both; todos show only in the Todos tab plus a ☰ badge; no "make it a todo" tool.

Owner, 2026-11-21: a todo is the alarm's `ask`, drafts the only new record; Dismiss stays,
small and last; a todo is favorited only when started (or by hand); doing it is the normal
favorite stop; a todo with a duration is a span, and Stop replaces it with the actual and
hides the estimate; Done always makes a ✓ instant, folded into the chip when close; the
celebration is glow, sparks and a fanfare; instant notes are their own feature.

Open:
1. **The reading of "favorites the start instant once done"** (§2): answering with Start
   favorites it. Right?
2. **A late Start**: count from the scheduled time (proposed: one instant, she can move it)
   or move the start instant to Now?
3. **The card's two big buttons** (Start, Done): both for a todo with a duration, Done alone
   (Start under Later…) for one without? Proposed as written in §7.1.

## 10. Success

- She replaces her seven iPhone timers and, a week later, none got lost by being silenced.
- Adding an unscheduled todo: the tab, a name, Enter. Scheduling it: 2 taps on a chip.
- Done from the card, the tab or the notification: 1 tap, and it records when, with a 🎉.
- A todo with a length shows planned vs actual afterwards, with no extra taps.
- Nothing changes for alarms that don't ask.
- Capturing a todo mid-task takes under 5 seconds and changes nothing else on screen.

## 11. From a companion prioritization app's notes (2026-11-21)

A companion app idea, being specced separately, does the *what next* side: prioritising,
dealing one task, places, decisions, project notes. This app is the *when* side: reminding,
scheduling, tracking time. Its addendum's requirements, sorted for this app:

### 11.1 Taken into Phase 1 (above)
- Capture without breaking flow: N from anywhere, under 5 s, nothing else moves (§5).
- No guilt language; self-care todos are todos like any other and count the same (§6).
- Done as a visible win: glow, sparks, fanfare, the day's count (§7.2).
- "Can't right now" never loses the task: already true (Snooze, Later, Dismiss all keep it open).

### 11.2 Future tickets (owner, 2026-11-21)
- **Instant notes** (#36): free text on any instant (what you did last, links); todos and drafts
  show it. A general feature, not todo-only.
- **Handoff from the companion app** (#37): it decides what and when, this app rings and tracks.
  Import a small list of todos (name, time, length, repeat) into drafts or instants.
- **Another person's calendar as free slots** (#38) (read-only Google Calendar or ICS), to plan
  around later. A network call carrying user data, against local-first by default: opt-in.

### 11.3 Out of scope (decided, owner 2026-11-21)
- A reason on "not now"; places as tags; one-thing re-entry; swapping from the ringing card.
- Prioritising, ranking, or "dealing" the one task to do next.
- Subtasks and steps; decision steps, decision sizing, "good enough" picks.
- Project cards that accumulate knowledge; Obsidian sync; auto-filing captures into projects.
- Inferring a place or project from a todo's words.
- Mood or pain check-ins and care tasks triggered by them.
- Streaks.
- iPhone: alarms with the app closed need a native iOS app (this app's native side is Android
  only, and the web can't ring closed without a push server).
