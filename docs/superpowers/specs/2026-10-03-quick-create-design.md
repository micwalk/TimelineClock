# Quick create: stopwatch, timer, alarm — design proposal

**Status:** proposal for owner review (2026-10-03). Nothing here is built. Pick or strike
options in §8; the plan in §9 follows the picks.
**Sources:** [next-steps handoff §2](../../handoffs/2026-10-02-next-steps.md), PRD
("Stopwatch", "Timer", "Drag-from-Now handle", "Active area"), AGENTS.md principles 8
(capture, then relate) and 10 (propose UX changes first).

## 1. Goal

Make the owner's cooking flow a few taps, without adding new kinds of things to the
timeline:

> Rice goes on → tap. Later: name it "rice". Set a 13-minute timer from it, with an alarm.
> Later still: "it's been 20 minutes since rice".

| Step | Today | Target |
|---|---|---|
| Capture "rice on" | 1 tap (＋) | 1 tap (unchanged) |
| Name it | 1 tap + type | 1 tap + type (unchanged) |
| 13-minute alarmed timer from it | ~6: double-tap Now, select it, cursor +13m, double-tap cursor, tap bell | **3**: tap the chip → ⏲ → 13m |
| Timer from Now, no instant first | ~4 | **2**: long-press ＋ → 13m |
| Stopwatch | 2 (drop, then ☆ for the live lane) | **1–2** |
| "How long since rice?" | glance at the chip (works today) | unchanged |

## 2. What already exists (the building blocks)

No new entity type is needed; stopwatches and timers are compositions of what is there:

- **Instant** with `alarm` (rings at its time) and `favorite` (carries a visible span to
  Now).
- A **favorite's span to Now is already a live lane** with a colour-coded chip ("26m") on
  the live side. That *is* a stopwatch display.
- **Setting an alarm favorites the instant**, so an alarmed future instant already gets a
  live lane from Now to it, i.e. a **countdown**; after it rings the same lane keeps
  growing from it ("continues as stopwatch from the end instant", PRD).
- `dropInstant`, the duration popover (`TimeEntryPopover`), chip tools (☆, 🔔, move,
  delete), Cursor/Now tag menus.

So:

| Thing | Made of |
|---|---|
| **Stopwatch** | an instant at Now, favorited (live lane counts up). |
| **Timer** | an alarmed instant at *anchor* + duration (live lane counts down, then up), plus a saved span anchor → end so the history keeps "rice: 13m". |
| **Alarm** | an alarmed instant at a clock time (exists: cursor to time → drop → 🔔). |

History stays intact (principle 7): everything created is an ordinary saved instant/span.

## 3. Entry points (options)

### A. "+ timer" in a chip's tools — *relative to this instant* (recommended)
Tapping a saved chip already shows its tools. Add a **⏲ timer** tool. It opens a small
duration picker anchored to the chip (§4). Picking 13m creates the alarmed end instant at
chip time + 13m and the span chip → end. Also works on the **Now tag** tools (anchor = Now)
and the **Cursor tag** tools (anchor = cursor).
*Cost:* 3 taps from a captured instant. *Risk:* the chip toolbar gets one more button
(☆ 🔔 ⏲ ⇄ 🗑).

### B. Long-press the big ＋ / NOW button — *quick menu* (recommended)
The primary button keeps its one-tap drop. A long-press (500 ms, same as the ± buttons'
step menu) opens a menu: **Stopwatch · Timer ▸ (presets) · Alarm at…**. Keyboard: see §6.
*Cost:* 2 taps for a timer from Now. *Risk:* long-press is undiscoverable; a tiny caret on
the button (like the ± buttons) fixes that.

### C. A quick-create strip above the control bar
Three always-visible buttons: ⏱ Stopwatch, ⏲ Timer, ⏰ Alarm.
*Cost:* 1–2 taps. *Risk:* costs a row of vertical space on phones, which layout v2 fought
for; duplicates A/B. Not recommended unless A/B prove too hidden.

### D. Drag-from-Now handle (PRD)
Grab a handle on the Now line, drag into the future: a live HUD shows "13m", release to
create the timer. Elegant, but it competes with the pan gesture and needs careful hit
areas in both orientations. **Later phase**, after A/B.

### E. Natural-language quick add
A text field: `13m`, `rice 13m`, `at 6pm`, `tomorrow 8am`. Good on desktop/keyboard,
slow on phones. **Later phase** (and a dependency decision: `chrono-node` ≈ 40 KB gz vs. a
small in-house parser covering `Nm`/`Nh`/`at H:MM`).

## 4. The duration picker

One component, used by A and B:

- A row of **preset chips**: 1m · 3m · 5m · 10m · 15m · 25m · 30m · 1h.
- **Recent durations first** (the last 3 used, e.g. *13m*, remembered in settings), so
  the second rice timer is 2 taps.
- **Custom…** opens the existing duration input (`TimeEntryPopover`, minutes:seconds).
- The alarm is **on by default** for timers (a timer without one is just a future
  instant); a small 🔔 toggle in the picker turns it off.

## 5. What a running timer / stopwatch looks like

v1 uses what is drawn today: the live lane and its chip. Proposed small additions:

- **Countdown text** on a timer's live chip while it is in the future: "−4:32" with
  seconds under 10 minutes (today the chip shows a coarse "5m").
- **Label defaults:** a timer's end instant is named from its anchor: "rice +13m"
  (anchor unnamed → "13m timer"); a stopwatch is "stopwatch" until renamed. Both
  editable with the existing one-tap "name…" hint.
- **Done:** ringing behaves as today (overlay, Snooze/Dismiss, notification that now opens
  the app on the alarm).

Later (PRD "Active area"): big cards for running timers/stopwatches in the Agenda or a
strip, sorted by time left; Screen Wake Lock while a timer runs in the foreground.

## 6. Keyboard

PRD's T/A/S/I clash with today's keys (I/W zoom in, S/O zoom out, A previous). Proposal:
keep the navigation keys and add **T = timer** (opens the duration picker anchored to
the selection, else the cursor, else Now) and **Shift+S = stopwatch** (S stays zoom out).
`+`/`=` keeps dropping an instant.

## 7. Stopwatch scope

A stopwatch as "an instant plus its live lane" has **no pause and no laps**. Options:

1. **No pause; laps are instants.** Tapping ＋ while a stopwatch runs already drops an
   instant on its lane; we could render instants inside a stopwatch's span as lap ticks
   and show split times. Fits "everything is an instant". *(recommended for v1)*
2. **Real pause/resume** (PRD monotonic `accumulatedMs`): a new stopwatch record type,
   paused stretches drawn hatched. More model and UI; only worth it if pausing matters for
   the owner's uses.

## 8. Decisions for the owner

1. Entry points: **A + B** (recommended), or include C, or start with D?
2. Timer alarm on by default? (recommended: yes)
3. Timer from an instant: also save the span anchor → end? (recommended: yes, so history
   reads "rice +13m" as a bar)
4. Preset list and "recent first" — OK? Any presets to add/remove?
5. Countdown with seconds on the timer's live chip — OK?
6. Default labels ("rice +13m", "13m timer", "stopwatch") — OK?
7. Keyboard: T = timer, Shift+S = stopwatch — OK?
8. Stopwatch: v1 without pause (laps = instants), or real pause/resume?
9. Natural-language quick add: next phase, and in-house parser or `chrono-node`?

## 9. Plan (assuming the recommendations)

1. **Domain:** `domain/quickCreate.ts` — timer/stopwatch construction (times, labels,
   preset ordering with recents), unit-tested.
2. **Actions:** `act.startTimer(anchor: TimeRef | instantId, durationMs, { alarm })`,
   `act.startStopwatch()`, recent-durations setting.
3. **UI:** `DurationPicker` component; ⏲ tool on chip/Now/Cursor tools; long-press + caret
   menu on the ＋/NOW button (both orientations' control bars); `T` / `Shift+S` hotkeys.
4. **Display:** countdown text on future live-lane chips.
5. **Docs:** AGENTS.md/.cursorrules UX patterns, Ideas.md, handoff.
6. **Verify:** unit + component tests, then a phone-size (390×844) run in both
   orientations for tap counts in §1.
