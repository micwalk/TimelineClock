# Time tracking, tags and runs — exploration (2026-11-21)

Status: thinking, not a PRD. Split out of [prd_todos.md](prd_todos.md) so the todo Phase 1
can ship on its own. Nothing here is decided. The same rule as everywhere: **no new
underlying concepts** (instant, span, alarm); new ways to make them.

## 1. Ad hoc time tracking

Today's tracker: tap Stopwatch at the gym door, rename the span "Gym" later, Stop on the way
out. That already works and is all instants and spans. What's missing is small:

- **Naming at the start, for free.** The Stopwatch button offers recent names as chips
  ("Gym", "Laundry", "Reading") under it: one tap starts a named stopwatch. Typing a name is
  optional, like the Cursor ＋'s name box. Same records as today: a favorited start instant,
  its span to Now, ■ to stop.
- **Several at once.** A second named start while one runs is just another span to Now (the
  live side already draws several lanes). Laundry running while at the gym is fine.
- **Forgot to start / forgot to stop.** Both are moves: drag the start instant back to when
  you really arrived; Stop, then move the stop instant. Maybe a "started 10m ago" chip on
  start (Start · −5m · −10m · −15m), which only offsets the instant it drops.
- **Totals.** "Gym this week: 3h 10m." This is the first thing that needs a way to say
  which spans belong together: same name to begin with, tags after (§2).

Where it would live: Stopwatch's picker grows recents (as Timer has recents); totals in the
Agenda (a Tracking tab, or a summary at the top of All Spans: per name/tag, day / week).

## 2. Tags

Groups (TLC-9) are **one per instant**, switched on and off as a whole, like calendars.
Tags are the other axis: **many per thing**, for meaning, not visibility. They're what
tracking totals, colours and emoji (waiting for tags, per AGENTS.md) and estimates key on.

- **Cheapest form: the name.** "Gym" is already a tag if totals group by name
  (case-insensitive, ✓ prefix ignored). Covers most of the gym use case with no UI at all.
- **Next: hashtags in names.** "Leg day #gym", "Vet #cats #errand". Parsed from the label,
  shown as small coloured pills, hidden from the chip's text. No new field or editor to
  start with; a tag list (colour, emoji) in the Groups tab later.
- **What carries tags:** instants. A span takes its start instant's tags plus its own name's
  (a stopwatch's span tagged by its start). Todos are instants with an alarm, so they take
  tags the same way.
- **Open:** do tags ever hide things (like groups)? Recommendation: no; that's what groups
  are for. Do groups become tags? Possibly one day; not now.

## 3. How these connect

```
tags (or names) ──▶ tracking totals ──▶ learned estimates ──▶ runs / scheduling push
```

Each needs the one before it: estimates are medians of tracked lengths per name/tag; runs
are only as good as their estimates. Suggested order after todo Phase 1: tracking polish
(§1, recents on Stopwatch) → name-based totals → hashtags → todo time tracking (§4) →
first-class spans (§6) → runs (§5).

## 4. Todo time tracking and breaks (from the todo PRD draft, 2026-11-20)

Note: written when a todo was its own record; in the Phase 1 model a todo is an instant
with an alarm that asks "Done?" ([prd_todos.md](prd_todos.md) §4), and Start / Done are
instants and spans as below.

The two real problems: **estimates are wrong** (always short), and **breaks are invisible**,
so the reminder after a break gets snoozed because "not ready yet" has nowhere else to go.

**A todo with an estimate has four moments, each one tap:**

```
 planned ──ring──▶ started ──estimate up──▶ over ──✓──▶ done ──break──▶ next rings
          [Start]            (soft chime)    [✓]                 [Start] [Not yet +5m]
```

1. **Ring: "Time for Laundry · 20m".** The primary button is **Start**, not Done (Done is
   there too, for "already did it"). Start drops the start instant and moves the todo to Now
   (pushing its run).
2. **Doing it.** The live lane counts down against the estimate, "Laundry · 14m left", like
   a timer. The lane chip's **✓** is Done (as ■ stop is today). On Android the live
   notification (as timers have) carries a ✓ Done action. Done is also in the Todos tab row.
   These are the four places "how do I say it's done" lives: lane chip, notification, Todos
   tab, and the cards below.
3. **Estimate up: a check-in, not an alarm.** One chime (the existing `chime`: it answers
   itself, no ringing) and a quiet card: **✓ Done** · **+5m** · **+15m** · **Keep going**.
   +5m/+15m add to the estimate (and push the run); Keep going turns the lane to overrun,
   counting up in a warning colour ("Laundry · 6m over"). One more chime after the
   `overrunNudgeMin` tunable (10m), then silence; the lane keeps counting.
4. **Done.** The ✓ instant; the actual span start → done is saved beside the planned one.

**Next todo while the last is still going (the handoff).** In a run, the next one's ring
reads: "Dishes is next · Laundry 6m over". Buttons: **Finish Laundry, start Dishes** (one
tap: Done + Start), **Laundry needs +10m** (pushes the run, Dishes included), **Both** (Start
Dishes, Laundry keeps running: the washing machine case; two live lanes). Outside a run,
two todos just ring on their own.

**Breaks are gaps, made visible.** A run's gap is a **break**: drawn as a named block
("Break · 5m"), not empty space. Appending with After ‹last› puts in the `todoBreakMin`
tunable (5m; 0 = back to back). Done starts the break at once: the live lane reads
"Break · 4m left · then Dishes". When it ends, the next todo rings: **Start** · **Not yet
+5m** · **Not yet…** (other lengths). **Not yet** is the post-break snooze, said honestly:
the break grows and the run moves with it, so the plan stays true and the extra minutes
are recorded as break, not as a lie about when Dishes started.

**Getting estimates right: learn them from history.** Every done todo with a Start has an
actual length. For the same todo (a series, or the same name, case and ☐/✓ ignored):
- The estimate box shows what it usually takes: "20m · usually 32m (last 5)". One tap uses it.
- Schedule and Add pre-fill the estimate with that median when the todo has none.
- Breaks learn the same way: "your breaks run 12m" beside the break length.
- A run's total can show both: "45m planned · likely 1h 10m".
Nothing is stored for this: it is computed from the start/done instants already kept
(`domain/estimates.ts`, median of the last N, N a tunable).

**Later:** pausing a todo (segments, for "interrupted by a call"); a day view of planned vs
actual in the Todos tab.

## 5. Runs: pushing a schedule (from the todo PRD draft, 2026-11-20)

Note: `after` was a field on the todo record. With todos as instants it would sit on the
instant: **an instant placed after another** (its end plus a gap). That is the "relative
instant" idea in general (+13m from the rice), so it may belong to first-class spans or
instants rather than todos. Open: owner said "return to this".

Critical workflow: Laundry 10m → Dishes 15m → Vacuum 20m. Delaying Laundry must push all
three. The rule has to be one sentence she can predict without looking.

**The rule: a scheduled todo is either *at a time*, or *after another todo*.**
A todo after another starts at that todo's end plus a gap (often 0). A todo at a time plus
everything hanging after it is a **run**. That is the whole model; everything below follows.

```ts
// on TodoRecord (replaces nothing; a todo at a time just has no `after`)
after?: { todoId: string; gapMs: number }
```

The run's first todo owns a real time. Each follower's time is computed from the one before:
`start = prev.end + gapMs`, `end = start + estimate` (no estimate = 0 long). Followers'
instants are still ordinary instants (alarms, bells, the Android app see nothing new); the
run just rewrites their times whenever something before them changes.

**What moves what** (all fall out of the rule):

| You do | What happens |
|---|---|
| Move a todo (drag, Later, typed "+30m") | It and **everything after it** move by the same amount, gaps kept. Earlier ones stay. Works later and earlier. |
| Change an estimate | Everything after it moves by the change. |
| Move a follower on its own | Its gap changes; it stays in the run and its followers come along. |
| Type a clock time for a follower ("at 4p") | It leaves the run and starts its own, taking its followers. A clock time means "at a time". |
| Done late (past its planned end) | Everything after it moves later by how late. |
| Done early | Nothing moves; the next one's chip offers **Start now** (one tap moves it, and its run, to Now). |
| Running over, not yet Done | Nothing moves on its own: alarms don't drift. The next one's ring is a handoff (§4). |
| Start (late or early) | Start means "at Now": it moves to Now, and its followers with it. |
| Snooze | Outside a run, nothing moves ("remind me"). Inside a run it is **Not yet**: the break before it grows, so the run moves (§4). |
| Won't do / back to the list | Its followers close up behind the one before it (gap kept). |

So "delay one, push the rest" is just *move*, and gaps never get eaten. Moving earlier pulls
the rest along too: the run is rigid from the moved todo onward, so it reads as one block.

**Only runs move.** Plain instants, alarms, sun times, other runs, and todos at a time are
never pushed. A run pushed across one of them just overlaps it (the chips already handle
overlap) and the Undo toast says so: "Moved Laundry +30m and 2 after it · Vacuum now overlaps
Dentist 3p · Undo". Every multi-todo move gets that toast.

**Making a run** (no "link" tool to learn; it falls out of scheduling):
- Schedule's chips gain **After ‹last todo›**: the latest scheduled todo today ("After
  Dishes · 3:25p"). One tap appends.
- **Do next** on an unscheduled row: after whatever todo is current (or at Now if none).
- Scheduling several at once from the Todos tab (select rows, Schedule): the first at the
  picked time, the rest after it in list order, back to back.
- Dragging a todo's block on the timeline so its start lands on another's end snaps and
  joins (the snap is visible, like a bell snapping onto its chip). Drag it away and type a
  time, or use **Unlink** in its tools, to leave.

**What she sees**: on the timeline a run's blocks are joined by a short link mark across
each gap. In the Todos tab a run reads as one indented group under its first todo with a
total: "Laundry · Dishes · Vacuum — 45m, done by 4:15p".

**Why not the alternatives:**
- *Push only what overlaps* (the first draft): with any gap between todos, delaying the first
  moves nothing, and the visible effect depends on gap sizes she can't see. Fails the case.
- *Reflow the whole day*: too magic; things move that she didn't touch.
- *Live push while running over*: alarms would slide continuously, and a forgotten Done
  stalls the rest forever.

Repeats: an occurrence of a repeating todo can start a run (Feed cats, then Litter after
it) but can't be a follower (its time comes from its rule). A follower's `after` on a todo
that gets deleted makes it "at" its current time.

Pure logic in `domain/todoRuns.ts`: `runOf(todos, id)`, `resolveTimes(todos) → Map<id, start>`,
`moveInRun(todos, id, deltaMs) → moves[]`, with tests for every row of the table.

## 6. What runs and estimates need from first-class spans

Phase 1 needs nothing new. Estimates and the stack need spans to be a bit more first class:

1. **A span made in one step with a length**: start instant + length makes the end instant
   (already near: `act.setSpanLength`).
2. **Moving a span moves both ends** (today you move instants one at a time).
3. **Planned vs actual**: a span flag `planned?: true` (draws hollow, has no "ago").
4. **A span's end that is not a user-facing instant**: the planned block's end shouldn't
   clutter the chips as its own instant. Either the end instant gets `role: 'spanEnd'`
   (no chip, only the lane), or a span may carry `durationMs` instead of an end id.

Recommendation: **build todo Phase 1 first** (no spans needed: it solves the real complaint),
then first-class spans with items 1–4 as its acceptance list, then todo phase 2 on top.

