# Todos Phase 2: scheduling by seeing — proposal (draft v0.1, 2026-11-21)

Status: proposal for the owner's review. Nothing here is built. Phase 1 (0.8.0) is in
[prd_todos.md](prd_todos.md); this is its §4.6, specced on its own. Runs and pushing come from
[explore_time_tracking.md](explore_time_tracking.md) §5, which this adopts with small changes.

## 1. The problem

Phase 1 schedules a todo by typing or tapping a chip (In 1h, Tonight, Tomorrow). That answers
"when", but not "where does it fit": she can't see her afternoon fill up, can't find a 20-minute
hole, and can't line up Laundry → Dishes → Vacuum so that a late start pushes the rest. The
planned block (Phase 1) already shows a plan on the timeline; Phase 2 makes it the handle.

## 2. What it adds, in four pieces (each its own release)

### 2a. Undo (first, because 2d moves many things at once)

A global **Undo**: every user operation in store/actions that changes data (instants, spans,
alarms, series, todos, groups) can be taken back, most recent first.
- A toast after anything that changed more than the one thing tapped ("Moved Laundry +30m and
  2 after it · **Undo**"; "Done: Feed cats · **Undo**"; "Deleted Dentist · **Undo**"), and
  **Ctrl+Z / U** and an undo button for the rest.
- Mechanics: each action runs inside `undoable(label, fn)`, which keeps the entities state
  before it (records are immutable, so a snapshot is a few references, not a copy); Undo puts it
  back, through the same path as an import (alarms rescheduled, the view let go of what is gone).
  A short stack (the last 20), not saved across reloads.
- It replaces the one-off fixes: Phase 1's "open again" ↺ on done rows becomes Undo's job (kept
  on the row: it still reads well for a done long ago).

### 2b. Place and move by seeing

- **Drag a planned block** to move its todo (its `at` and alarms move: `rearmAfterMove`), its
  start snapping to ticks like a dragged cursor. A todo with no length drags its chip, as today's
  move mode does.
- **Schedule › At the cursor**: a chip with the free cursor's time ("At cursor · 3:40p"), so
  "pan there, tap Schedule, tap" places it without typing.
- **Drag a row onto the timeline** (wide screens, Agenda docked): a ghost block of its length
  follows the pointer along time; let go to schedule it there. In the drawer (phones), a
  long-press on the row closes the drawer and the ghost rides the cursor: pan to the spot, tap ＋
  to place it, anything else to cancel.

### 2c. Find room

- **Busy** is what has a length on the timeline: todos' planned blocks, and (once #12 lands)
  block spans. Instants alone take no room.
- Schedule gains **Next free ‹length›** ("Next free 20m · 3:40p"): the first gap from Now that
  fits its length, within the day (then tomorrow from the Tomorrow time). Pure, in
  `domain/freeTime.ts`, tested.
- While a block is dragged, the gaps it fits glow faintly along the axis.

### 2d. Runs: a sequence that moves together (explore §5)

**The rule: a scheduled todo is either at a time, or after another todo.** A todo after another
starts at that one's end (its `at` plus its length, or its ✓ once done) plus a gap. A todo at a
time, and everything hanging after it, is a **run**.
- Data: `after?: { todoId: string; gapMs: number }` on the record (a relation and a length,
  still no times). The followers' `at` instants keep ordinary times, rewritten from the rule
  whenever something before them changes (like a series refreshing its occurrences), so alarms,
  bells and the Android app see nothing new.
- What moves what: moving one moves it and everything after it, gaps kept (later or earlier);
  a length change moves what follows; Done late pushes the rest by how late, Done early moves
  nothing (the next one's chip offers **Start now**); typing a clock time for a follower starts
  a run of its own; Won't do / Back to the list closes the gap behind it. Running over moves
  nothing by itself (alarms don't drift); the next one's alarm is the nudge.
- Only runs move: plain instants, sun times, other runs and todos at a time are never pushed.
  A run pushed over one just overlaps it, and the Undo toast says so.
- Making one: Schedule's **After ‹last todo today›** chip; **Do next** on an unscheduled row
  (after the current one, else at Now); drag a block so its start meets another's end (it snaps
  and joins, as a bell snaps onto its chip); **Unlink** in its tools to leave.
- Seen: blocks in a run are joined by a short link mark across each gap; the Todos tab shows a
  run as one group under its first todo with a total ("Laundry · Dishes · Vacuum: 45m, done by
  4:15p").
- Repeats: an occurrence can start a run but not follow one (its time is its rule's).
- Pure logic in `domain/todoRuns.ts` (`runOf`, `resolveTimes`, `moveInRun`), a test per row
  of explore §5's table.

## 3. What it needs from first-class spans (#12)

Little. The planned block is already a `block` lane (domain/blocks), computed from the record,
so dragging it is moving its `at`; no stored span with two ends is needed. #12 should reuse the
same lane kind for block spans (a solid look), and then they count as busy in 2c.

## 4. Questions for the owner

1. **Order**: Undo first (2a), then 2b, 2c, 2d? Or runs sooner, with only the toast's Undo?
2. **Done late pushes the rest** of a run automatically (explore §5), or asks ("Push the rest
   +12m?")?
3. **A todo with no length** in a run: 0 long (it is just a moment), or a default length
   (a setting, say 15m) so the next one doesn't start on top of it?
4. **Busy time** beyond plans and blocks: should sleep (the sky's night, or a setting) and
   another person's calendar (#38) count, or stay out until asked?
5. **Phones**: is long-press a row, then pan and tap ＋, the right way to place from the drawer,
   or should Schedule's "At cursor" be the only way there?
6. **Undo's reach**: data only (what you made and changed), or also the view (where you were)?
   Proposed: data only.
