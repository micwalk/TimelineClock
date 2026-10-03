# Stopwatch & Timer: quick UI over instants and spans — design

**Status:** design for owner review (2026-10-03, rev 2). The model in §1 is the owner's;
§2–§4 are proposals, and §5 lists what's still open. Nothing is built yet.

Stopwatch and Timer aren't new kinds of entity. They are **quick controls that create
ordinary instants and spans and track one span live**. Everything they create stays on the
timeline as history.

## 1. Model (owner)

A **tracker** is a small persisted record that says which instants a stopwatch or timer
is following. It owns no time data; all the times live in the instants.

```ts
interface Tracker {
  id: string
  kind: 'timer' | 'stopwatch'
  instantIds: string[]   // timer: [start, end]; stopwatch: [start, lap1, lap2, …, stop?]
  stopped?: boolean      // stopwatch only
}
```

### Timer (duration d)
- **Start:** create instant **A** at Now and instant **B** at Now + d with the alarm on. Save
  the span **A → B**, which is the original duration. Track the span **Now → B**, the time
  left. (B's alarm favorites it, which already draws its live lane to Now.)
- When B rings, the tracked span keeps going as overtime (B → Now).
- **Cancel** (before B): turn B's alarm off and stop tracking. A, B and A → B stay as history.

### Stopwatch
- **Start:** drop instant **S** at Now and favorite it. Track **S → Now**.
- **Lap:** create instant **L** at Now and save the span from the previous mark to L as a
  lap. Unfavorite the previous mark and favorite L, so tracking moves to **L → Now**.
- **Stop:** create instant **E** at Now and save the span from the last mark to E.
  Unfavorite the last mark. The tracker now shows that **old span**, frozen.
- **Reset:** stop tracking (remove the tracker). The instants and spans stay.

## 2. Tracking UI (proposal)

**A tracker strip** sits between the timeline and the control bar and appears only when
something is tracked. It holds one compact card per tracker and scrolls sideways if there
are several. In vertical layout it sits in the same place, above the bottom bar.

```
 ┌───────────────────────────────┐  ┌───────────────────────────────┐
 │ ⏲ rice              12:41     │  │ ⏱ run              3:07.4     │
 │ ▓▓▓▓▓░░░░░░░░░░░  of 13:00     │  │ lap 3 · total 18:22           │
 │            [+1m]  [✕]          │  │       [Lap]  [Stop]           │
 └───────────────────────────────┘  └───────────────────────────────┘
```

- **Timer card:** the **time left, Now → B, is the big number**. The original duration
  is small ("of 13:00"), next to a thin progress bar for elapsed / total. After B rings,
  the big number turns red and counts up as overtime ("+0:42"). Buttons: **+1m**, which
  moves B later and re-anchors A → B, and **✕** (Cancel, or Reset once it has rung).
- **Stopwatch card:** the big number is the **current lap span** (last mark → Now), with
  seconds and tenths under an hour. Small text shows the lap count and the total (S → Now).
  Buttons: **Lap**, **Stop**; once stopped: **Reset** and **Resume** (Resume is open
  question 3).
- **Tapping a card** focuses its tracked span on the timeline (`act.focusSpan`).
- The name is the label of A or S. A tap on it renames it, using the same inline edit as
  chips; when there's no name, it shows "Timer 13m" / "Stopwatch".
- Times update through `LiveText` (no React state per frame), per the timeline rules.

On the timeline nothing new is drawn. The tracked span is the existing live lane (Now red
chip), and the saved span A → B and the laps are ordinary saved lanes.

## 3. Starting one (proposal)

- **Two buttons** in the tracker strip: **⏱** and **⏲**. While nothing is tracked, the
  strip collapses to just these two small buttons at the right end of the control bar row.
  Horizontal: after Zoom in. Vertical grid: a 5th column.
- **⏱:** starts a stopwatch at once (1 tap).
- **⏲:** opens a preset picker: your **recent durations first** (e.g. 13m), then
  1 · 3 · 5 · 10 · 15 · 25 · 30 · 60m, then **Custom…**, which is the existing duration
  input. That makes the rice timer 2 taps, or 1 more for a custom value the first time.
- **From a selected instant:** the ⏲ picker has a "from *rice*" toggle when an instant is
  selected. It sets A = that instant instead of a new one at Now ("13m after rice went
  on").
- **Keys:** **T** = timer picker, **Shift+S** = stopwatch start/lap. S stays zoom out.

## 4. Implementation outline

1. `domain/trackers.ts` (pure, tested): the tracker record, sanitizing, and the
   lap/stop/reset transitions as functions over ids. The spans to save and the instants to
   (un)favorite come back as a plan.
2. `store/trackers.ts`: a persisted Zustand store, saved in backups as well. Actions in
   `store/actions.ts`: `startTimer(d, {fromInstantId?})`, `extendTimer`, `cancelTimer`,
   `startStopwatch`, `lap`, `stopStopwatch`, `resetTracker`. Deleting an instant a tracker
   uses ends that tracker.
3. `components/panels/TrackerStrip.tsx` with cards, `DurationPicker.tsx`, and the buttons
   in `ControlBar`.
4. Tests (domain + actions + components), a phone-size run in both orientations, and an
   update to the AGENTS.md / `.cursorrules` UX patterns.

## 5. Open questions

1. **Stop shows which span?** I read "stop tracks the old span" as the last lap
   (last mark → E), frozen, with the total S → E in small text. Or should the total be the
   big number?
2. **Lap spans saved?** A lap saves the span previous mark → L as a saved lane, so
   history shows each lap as a bar. Or are the instants alone enough?
3. **Resume after Stop?** Resume would continue tracking from E, as a new lap. Or is Stop
   final and only Reset remains?
4. **Timer after ringing:** does **Dismiss** in the ringing overlay also end the tracker,
   or does the card stay showing overtime until ✕?
5. **Placement:** is a strip above the control bar OK (it costs one card-height row only
   while something runs), or would you rather have the cards in the Agenda?
