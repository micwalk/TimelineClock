# Layout v2: design spec

**Status:** draft for owner review (2026-10-02).
**Sources:** [layout v2 handoff](../../handoffs/2026-10-02-layout-v2.md) (decisions from the first
session) and the 2026-10-02 follow-up session (open questions 1–4 answered by the owner;
5–7 decided by Claude at the owner's request, listed in §3).
**Read first:** [ARCHITECTURE.md](../../ARCHITECTURE.md).

## 1. Goal

One timeline layout that works in two orientations and stays readable when crowded:

- Vertical orientation (phones in portrait, and by choice on desktop) with a time-direction
  setting, a rotate button, and the same visual language as horizontal.
- Gestures in both orientations, with momentum.
- No label pile-ups: one compact chip per instant, a priority-based overlap layout, clusters
  as the last resort. The past is never faded, dimmed or hidden.
- Now and the Cursor drawn as arrow tags on the live side of the axis.
- The Agenda (today's `ListPanel`) docked at the bottom, docked at the side, or in a drawer,
  depending on the screen.
- Cursor snapping to ticks.

**Success looks like:** on a 390×844 phone in portrait, a day of cooking timers (10–20
instants, a few alarms and spans) reads without overlapping text at the default zoom;
drag, flick, pinch and tap all work with one hand; idle CPU stays near 0% and pan/zoom stay
within today's budget (see §9).

## 2. Owner decisions (settled)

### Orientation
- Setting: **Auto / Horizontal / Vertical**. Auto picks the starting orientation; it is
  not the main control.
- **Auto rule:** time runs along the screen's longer side. Vertical when height > width,
  with hysteresis (switch only once one side is ≥10% longer than the other).
- **Rotate button** (two curved arrows): a floating, round, ~44px button, always easy to
  hit. A tap overrides the orientation setting **until the screen's shape changes** (phone
  turned, window resized past the threshold); then the setting applies again. (It also
  works when the setting is Horizontal or Vertical, not only Auto.)
- Vertical time direction: **future goes down** by default, with a setting to flip it.
- **Switching keeps your place:** the center time and the visible time span are kept; only
  pixels per millisecond change.

### Geometry (option B, revised)
- The axis splits the timeline into a **live side** and a **saved side**.
  Horizontal: live above, saved below. Vertical: live on the left, saved on the right.
  The vertical layout is the horizontal one rotated, so both share one visual language.
- **Now and the Cursor are arrow tags** on the live side: a small readout box whose tip is
  a sleek arrowhead with inward-curved edges, touching the axis.
- The live side is kept narrow: two-line tags (about 84px in vertical); tick labels tuck
  under tags where they overlap.
- Instant lines run across the whole timeline (full width in vertical, full height in
  horizontal), as today.
- Span lanes sit beyond the chips: below them in horizontal, at the far (right) edge in
  vertical. Owner change (live lanes): spans that include Now or the cursor go to the live
  side instead (see 5.8).

### Clutter (approved in the first session)
1. One compact chip per instant ("Take Meds 6:00p"). Seconds only when zoomed in, or on Now,
   the Cursor and the selected instant.
2. Overlap layout by priority; overlapping chips move to another row (column in vertical);
   when there is still no room, nearby chips collapse into a "+3" chip that zooms in when tapped.
3. Live markers on the live side, saved instants on the saved side. The Cursor's readout
   replaces the two top lanes (offset from Now, offset from the selected instant); its lock
   and save-span buttons appear when it is tapped.
4. Short span chips: the duration only ("15:38"); endpoint names on tap or in the Agenda.
   Chips stay on screen (clamped, ellipsis).
5. Quieter defaults: favorites and alarms show "Rice · 20m ago" / "Tea · in 6m" on the chip
   instead of a permanent lane; the lane appears when selected or switched on. Selecting
   shows only Selected→Now; Secondary→Selected becomes opt-in.
   Owner change (span creation on mobile): the automatic lane spans to the *selection*
   instead. Previous→Selected is on by default; a live Selected→Cursor lane shows in cursor
   mode; Selected→Now is off by default (its Agenda toggle stays). Their chips name the
   endpoints in time order ("Wake up → Sleep · 16:00:00"; unnamed instants show their time,
   the cursor shows "Cursor"), and each has the 📍 pin that saves the span.
6. Snoozes stay on the timeline with a short name ("Test Alarm ⟲2") and group with their
   original in the overlap layout.
7. **Never fade, dim or hide the past.**

### Cursor arrow
- Owner change: the Cursor tag no longer hides when the cursor lands on an instant. In instant
  focus mode it stays, in its own accent (`--c-cursor-on`, default the instant colour), showing
  the instant's time with seconds and "26m ago" / "in 5m". No ＋ (that drops at a free cursor),
  no double-tap, and its tools are Save span to Now, Type a time…, Offset from Now…. The focused
  instant's chip drops its "· ago" suffix because the tag carries it.
- Double-tap the Cursor tag drops a nameless instant there (no name box, no selection); the
  tag also has a round ＋ button beside it that does the same. A single tap shows its tools
  (lock, save span, type a time). While following Now the big red control-bar button is a ＋
  ("Drop an instant at Now"); it becomes NOW again in cursor mode. Drops are nameless; the chip
  shows a "name…" hint and one tap on it opens the name box in place.

### Agenda
- Rename `ListPanel` → `Agenda`.
- Placement follows the screen: **dock when there is room, otherwise drawer.**
  Horizontal → bottom dock. Vertical on a wide window → side dock beside a narrower timeline
  column. Vertical on a phone, or any screen too short for the bottom dock (phone in
  landscape) → drawer that slides in from the left behind a ☰ button.

### Gestures and momentum
- One-finger / one-button drag moves through time in both orientations.
- Vertical: wheel / two-finger scroll moves through time; Ctrl+wheel or pinch zooms.
- Horizontal: vertical wheel zooms (as today); sideways two-finger swipe moves through time.
- Momentum:
  1. Mouse, touch and pen all glide, but only when released while moving (velocity from
     the last ~100ms; no glide if the pointer was still for ~50ms before release).
  2. A glide never snaps: it stops where it comes to rest (owner change after phone testing;
     the earlier rule snapped at rest). Snapping needs a release at almost no speed
     (`snapMaxReleaseSpeed`, 0.05 px/ms); a faster release that is too slow to glide also
     ends without snapping.
  3. Touching during a glide stops it, and that touch is not a tap. A drag can start from it.
  4. Only drags glide. Wheel/trackpad scrolling already has OS momentum.
  5. Glide stays on under prefers-reduced-motion (direct manipulation); focus transitions
     still turn off.

### Snap to ticks
- A setting, **on by default**. Snaps to the **finest ticks currently shown** (tier 0 of
  `pickTickTiers`; always ≥ ~14px apart).
- Applies only where the cursor comes to rest after a drag or glide, with a short ease.
  Landing on Now or an instant (8px mouse / 12px touch; lowered from 12/20 after phone testing) wins over ticks. A tick is snapped to only within `tickSnapPx` (8px); farther away the cursor stays.
- ± steps and typed times are never snapped (relative moves stay exact: "+13m from Rice").

### Numbers
- **Every numeric limit is configurable** (owner, this session). See §5.1.

### Later (saved in Ideas.md, not in this spec)
- "Genie" save animation (readout drains through the arrow and axis into the new chip).
- Orientation switch animation (labels hide, timeline rotates, labels return).

## 3. Calls made by Claude (owner may override)

These were open questions 5–7 and details the decisions above left open.

| # | Topic | Call |
|---|-------|------|
| C1 | Overlap limits | Horizontal: up to **3** chip rows. Vertical: as many chip columns as fit the saved side, capped at **4** (2 on a phone). Both tunable. |
| C2 | What clusters | Only chips collapse; every line is still drawn. Focused, selected, ringing, in-edit and moving instants never collapse. |
| C3 | Cluster chip | "+N" in the color of its most important member, with 🔔 if any member has an alarm and ★ if any is a favorite. Tap zooms to fit its members. |
| C4 | Snooze grouping | When a snooze collides with its original (or a sibling), it folds into the original's chip as a "⟲N" badge (latest count) before any generic clustering. Tapping the badge zooms to fit the group. |
| C5 | Seconds on saved chips | Shown when the finest visible tick is under 1 minute (tunable). Now, Cursor and the selected instant always show seconds. |
| C6 | Dock vs drawer override | A dock/drawer toggle in the Agenda tab bar (next to the gear). Like the rotate button, the override lasts until the screen's shape class changes. Settings also has Agenda: Auto / Docked / Drawer. |
| C7 | Cursor tag contents | Line 1: time with seconds. Line 2: offset from Now ("Now −8:13"). Line 3, only with a selected instant: offset from it ("Snooze… +2:37"), name truncated. |
| C8 | Favorite/alarm lanes | New setting "Lanes for favorites and alarms": *When selected* (default) / *Always*. Existing data is not migrated. |
| C9 | Secondary→Selected lane | Default off. Existing installs get it switched off once (v2 settings migration); the toggle stays where it is. |
| C10 | Rotate button position | Bottom-right corner of the timeline area, above the control bar, in both orientations. |
| C11 | Agenda breakpoints | Side dock needs a window ≥ 900px wide; bottom dock needs ≥ 600px tall. Tunable. |
| C12 | Named spans | A span with a name shows "Name · 26:13" (name truncated first); unnamed spans show the duration only. |
| C13 | Settings "Advanced" | A generic list of every tunable as a number field with per-field reset, generated from the tunables table. |
| C14 | Live-side collisions | When the Cursor and Now tags would overlap, the Cursor tag moves out one slot; Now keeps the slot next to the axis. |
| C15 | Chip anchoring | Horizontal: chip centered under its line. Vertical: chip starts at the axis edge and is centered on its line. A chip moved to another slot stays on its own line. |
| C16 | Relative time on more chips | The focused and the selected instant also show "· 20m ago" / "· in 6m", which replaces the offset that top lane A used to show. |
| C17 | Top bar in vertical | Vertical gets a slim top bar with the date (and ☰ when the Agenda is a drawer). In horizontal, ☰ sits before the date at the timeline's top-left. |
| C18 | Rotate hotkey | `V` toggles orientation (free today). |

### Interaction changes that need the owner's OK (AGENTS rule 10)
- **I1. Now's ★ moves into the Now tag's tap tools.** Saving Now as a favorite takes two taps
  instead of one until the quick-create work (next-steps handoff §2) adds a one-tap path.
  Double-tap the Now tag drops a nameless instant at Now (superseded: drops are nameless now,
  and the big button is a ＋ while following Now, so a one-tap path exists).
- **I2. One chip per saved instant.** Today the name and time are separate chips. In v2,
  double-tapping the name part renames and double-tapping the time part focuses, so both
  existing gestures survive. A single tap anywhere on the chip selects.
- **I3. Offset entry moves.** "Type an offset from Now / from the selected instant" opens
  from the Cursor tag's tools instead of from the (removed) top-lane chips.

## 4. Approach

Three ways to build the vertical orientation were considered:

1. **Generalize the engine to a main axis (chosen).** The projection speaks in main-axis
   position; components position along the main axis with one hook, and cross-axis
   placement comes from layout results and CSS tokens keyed on an orientation attribute.
   One DOM tree, one set of components, both orientations.
2. **Rotate the whole timeline with a CSS transform** and counter-rotate every label. Cheap
   to start, but chips are horizontal text in both orientations, so every chip needs its own
   counter-rotation, hit-testing and measurement happen in rotated space, and the overlap
   layout would reason about rotated boxes. Rejected.
3. **Separate vertical components.** Clear, but duplicates every timeline component and
   doubles the bug surface. Rejected.

Within option 1, label placement is a **pure function** (`domain/labelLayout.ts`) run in a
`useFrameValue` selector, so React re-renders only when the placement changes, never per frame.

## 5. Design

### 5.1 Tunables (`src/domain/tunables.ts`)

Behavior numbers live in one typed table; visual sizes stay CSS tokens in `theme.css` (the
style editor's territory). Each entry has a key, label, default, min, max, step and group.

| Key | Default | Meaning |
|-----|---------|---------|
| `chipRowsMax` | 3 | Chip rows below the axis (horizontal) |
| `chipColumnsMax` | 4 | Cap on chip columns (vertical; actual count = what fits) |
| `chipGapPx` | 6 | Minimum gap between chips |
| `autoHysteresis` | 0.10 | Aspect-ratio margin before Auto switches orientation |
| `sideDockMinWidthPx` | 900 | Window width needed for the side-docked Agenda |
| `bottomDockMinHeightPx` | 600 | Window height needed for the bottom-docked Agenda |
| `dragThresholdMousePx` / `dragThresholdTouchPx` | 3 / 8 | Press → drag (existing) |
| `landingMousePx` / `landingTouchPx` | 8 / 12 | Landing on Now/instants |
| `tickSnapPx` | 8 | Snap to a tick only within this distance |
| `snapMaxReleaseSpeed` | 0.05 | Snap only when released slower than this (px/ms) |
| `glideWindowMs` | 100 | Velocity sampling window |
| `glideStillMs` | 50 | Pause before release that cancels a glide |
| `glideMinSpeed` | 0.3 | px/ms needed to start a glide |
| `glideStopSpeed` | 0.02 | px/ms at which a glide ends |
| `glideMaxSpeed` | 8 | px/ms cap |
| `glideTauMs` | 325 | Exponential friction time constant |
| `tickSnapEaseMs` | 150 | Ease into a snapped tick |
| `secondsBelowTickMs` | 60000 | Saved chips show seconds when the finest tick is shorter than this |

- `useSettings` gains `tunables: Partial<Tunables>` (persisted in `timeline.settings.v1`);
  `getTunables()` merges defaults with overrides and clamps to min/max. Gesture code and
  layout read through it, not module constants.
- Settings → Advanced (C13) renders the table generically.

### 5.2 Orientation in the engine

- `domain/viewport.ts`: `Projection` becomes `{ center, width, mainSize, dir }` where
  `dir = 1 | -1`. `timeToPos = mainSize/2 + dir·(t − center)·mainSize/width`, and the inverse.
  Horizontal always uses `dir = 1`; vertical uses `dir = 1` for future-down, `-1` for future-up.
- `Frame` replaces `x`/`screenW`/`time` with `pos(t)`, `time(pos)`, `mainSize`, `crossSize`,
  `orientation`, `dir`. `start`/`end` stay the **earliest/latest** visible times regardless
  of direction (culling relies on that).
- The engine reads orientation and direction from a new `useLayout` store (5.3) at compute
  time, the same way it reads `useView`, and invalidates on change.
- `engine/hooks.ts`: `usePositionX` → `usePositionMain(ref, f => f.pos(ts))`, writing
  `translate3d(p,0,0)` or `translate3d(0,p,0)`.
- `actions.panByPixels(d)` moves the center by `−dir·d/pxPerMs`.
- Because `width` is in milliseconds, switching orientation keeps the place automatically.

### 5.3 Layout mode (`src/store/layout.ts`, `src/domain/layoutMode.ts`)

Pure functions, unit tested:

- `shapeClass(w, h, previous, hysteresis)`: `'portrait' | 'landscape'`, the aspect rule
  with hysteresis. It is both Auto's answer and the trigger that clears overrides.
- `resolveOrientation(setting, override, shape)`: the rotate-button override wins while
  the shape class is unchanged, whatever the setting; otherwise the setting, with Auto
  mapping portrait → vertical.
- `resolveAgendaPlacement(orientation, setting, override, w, h, tunables)`:
  `'bottom' | 'side' | 'drawer'`. Horizontal: bottom if `h ≥ bottomDockMinHeightPx`, else
  drawer. Vertical: side if `w ≥ sideDockMinWidthPx`, else drawer. "Docked" forced on a
  screen too small for its dock falls back to the drawer.
- The `useLayout` store holds the resolved `orientation`, `dir`, `agendaPlacement` and
  session-only overrides (rotate button, Agenda toggle). A `resize` / `orientationchange`
  listener recomputes it. Settings hold the persisted choices.

### 5.4 Timeline structure

`.timeline` gets `data-orientation="horizontal|vertical"`. Cross-axis offsets are CSS tokens
(`--tl-live`, `--tl-axis`, `--tl-slot`, `--tl-lane`, …) applied to `top` in horizontal and
`left` in vertical through the orientation attribute.

Along the cross axis, from the live edge:
1. **Live band:** the date (horizontal; in vertical it moves to the top bar, C17), tick
   labels next to the axis, and the arrow tags (two slots: next to the axis, and one further
   out for collisions, C14).
2. **Axis** with ticks crossing it. `TickLayer` positions ticks along the main axis.
3. **Saved band:** chip slots placed by the overlap layout (5.7).
4. **Span lanes:** horizontal: below the chip rows, and the timeline grows taller with lanes
   as today (`useBottomLanes`). Vertical: anchored to the far edge, stacking inward; chip
   columns get the width that remains.

Sizing: horizontal height = live band + chip rows actually used + lanes. Vertical fills the
height available between the top bar and the control bar; its width is the window, or the
timeline column when the Agenda is side-docked.

The **rotate button** (C10) and, when the Agenda is a drawer, the **☰ button** are fixed
overlays marked `data-no-pan`.

### 5.5 Live markers: arrow tags

New `components/timeline/LiveTags.tsx` replaces `NowColumn`, `CursorColumn` and `TopLanes`.

- Shape: a chip with an attached arrowhead (SVG path with inward-curved edges) whose tip
  touches the axis; it points down in horizontal and right (toward the axis) in vertical.
  The direction setting doesn't affect tags: they always sit on the live side.
- **Now tag:** "NOW" caption + clock with seconds (`LiveText`). Single tap → tools (★ save
  as favorite [I1], type a time). Double-tap → drop a nameless instant at Now.
- **Cursor tag** (cursor mode only, as today): contents per C7. Single tap → tools: lock to
  Now, save span to Now, save span to selected, type a time, type an offset (from Now / from
  selected) [I3], ★ save as favorite. Double-tap → save an instant at the cursor.
- Tools open as a small popover on the saved side of the tag; existing `ClockPopover` /
  `DurationPopover` are reused and placed to open toward open space in either orientation.
- The full-length line of each live marker is drawn as today.

### 5.6 Saved instants: compact chips

`SavedInstantColumn` becomes `SavedMarker`: a line plus one chip.

- Chip text: `[★|🔔] name time [· relative]`. `name` uses a new `domain/format.chipName(inst)`
  that renders snoozes as "Base ⟲N" (display only; stored labels unchanged).
- Seconds per C5. Relative suffix ("· 20m ago" / "· in 6m") on favorites, alarms, the
  focused and the selected instant.
- Taps per I2. When selected, a tool strip (★, 🔔, move, delete) appears beside the chip;
  moving keeps today's ghost line, badge and confirm/cancel.
- Layout measures each chip in its **widest form** (relative suffix rendered as its widest
  value, e.g. "· 00m ago"), so ticking text never re-flows the layout.

### 5.7 Overlap layout (`src/domain/labelLayout.ts`)

Input: items `{ id, pos, mainExtent, crossExtent, priority, groupId?, pinned }` plus
`{ orientation, crossBudget, slotGap, maxSlots, centerPos, cluster: { mainExtent,
crossExtent }, foldBadgeExtent }`. Output: `placed` (id → `{ slot, crossOffset }`),
`folded` (snooze id → the chip showing it), `foldCount` (chip id → snoozes shown) and
`clusters` (`{ id, memberIds, pos, slot, crossOffset, topPriority }`, in time order). The
caller derives a cluster's color and 🔔/★ badges from its members.

Rules:
- Priority (high → low): focused > selected > moving/editing > ringing > upcoming alarm >
  favorite > other. Pinned chips go first; ties go to the earlier chip (by time, then id), so panning never reorders chips. `centerPos` is optional: when given, ties go to chips nearer the screen center.
- Snooze groups fold first (C4): a snooze folds into its original when their chips
  overlap, transitively through other snoozes; without the original in view, siblings
  fold into the most important one. Pinned snoozes never fold. The badge widens the
  anchor chip by `foldBadgeExtent`.
- Greedy placement: a chip takes the nearest cross offset (from the axis) where its box
  doesn't intersect a placed box, within `crossBudget` and `maxSlots`. A chip's `slot` is
  its stacking depth (1 + the deepest chip between it and the axis). Offsets start after
  the far edge of a blocking chip, which gives uniform rows in horizontal (equal heights)
  and tightly packed columns in vertical. Pinned chips ignore the limits.
- Chips that don't fit are swept in time order; neighbours whose chips overlap share a
  cluster. A cluster with no room takes the place of the least important unpinned chip it
  overlaps, absorbing it (and that chip's folded snoozes), and repeats until it fits.
- Invariants (tested on random inputs): every item ends up placed, folded or in exactly
  one cluster, and no two placed boxes overlap. Deterministic: same input → same output.

Runtime: `useSavedLayout()` builds inputs from the visible set (existing culling) and the
chip-width cache, runs the layout inside `useFrameValue` with structural equality, and
re-renders only when placements change. During a pure pan, relative positions are constant,
so placements change only when items enter or leave the screen; during zoom they change
at discrete thresholds.

Chip widths: `measureChip(text, kind)` uses an offscreen canvas `measureText` with the chip
font plus padding/icon constants, cached by text. Tests inject a fake measurer.

### 5.8 Span lanes

- Chip text per C12; clamped on screen with ellipsis (today's `spanGeometry` clamp).
- Tap → select the span: its chip expands to "Start → End · 26:13" with its tools (rename,
  show/hide, delete). Double-tap → focus the span (unchanged).
- `savedSpanLanes` adds the C8 rule: favorite/alarm→Now spans get a lane only when their
  instant is selected/focused, or always when the setting says so.
- Implied lanes: Previous→Selected (on) and Selected→Cursor (live, cursor mode); Selected→Now only when switched on (C9, revised: owner change, layout v3).
- A focused saved span becomes the first lane, emphasized (it used to be top lane B).
- Vertical: lanes are vertical bars; the chip sits beside its bar on the inner side,
  centered on the visible part of the span.
- **Live lanes (owner change, after layout v3):** "Spans that include now or cursor should
  render to the left/above the timeline. And can have shorter labels, color coded too (now
  span red, cursor span same color as cursor)." A lane with an endpoint at Now or the cursor
  (saved spans to Now, Selected→Now, Selected→Cursor; not a span whose endpoint is the
  instant being moved) is live. Horizontal: a band above the live tags, lanes at
  y = 10 + i × 24, the axis and everything below shifting down by the band (none: unchanged).
  Vertical: thin bars at the left edge, x = 8 + i × 12, in the lines layer, chip on the inner
  side. Chips are short ("45s", "26m", "1h 5m", "2d 3h"; a name is cut to 8 characters then
  the length), accented `--c-now` or `--c-cursor`. Pin, rename, visibility, delete and the
  endpoint arrows appear only after tapping the chip. The saved side (below / right edge)
  holds only spans between two saved instants and alone counts against the vertical chip budget.

### 5.9 Gestures (`hooks/usePanZoom.ts`, new `hooks/glide.ts`)

- Drag uses the main-axis coordinate (`clientX` or `clientY`) for threshold and delta. Touch
  rules unchanged: tap slack, capture only once dragging, the one-event click guard.
- Wheel mapping: vertical: `deltaY` pans, `ctrlKey` + wheel zooms (also trackpad pinch, which
  arrives as ctrl+wheel). Horizontal: `deltaY` zooms (as today), `deltaX` pans,
  `ctrlKey` + wheel zooms.
- **Glide:** pointer samples are kept for `glideWindowMs`. On release, if the pointer moved
  within the last `glideStillMs` and speed ≥ `glideMinSpeed`, start a glide. The glide is an
  engine frame listener: each frame it pans by `v·dt`, decays `v` by `exp(−dt/glideTauMs)`
  and calls `engine.requestFrame()`; below `glideStopSpeed` it ends and calls
  the glide just ends (no snap). A `pointerdown` during a glide cancels it and marks that press as
  "not a tap" (its click is swallowed unless it becomes a drag). The step function is pure
  and unit tested.
- **Tick snap** in `settleCursor`: after the Now/instant landing check fails, if the setting
  is on, move the cursor to the nearest tier-0 tick time (computed with the tick generator
  for the current zoom, so calendar boundaries and DST match what is drawn), eased over
  `tickSnapEaseMs`. Not applied by `moveCursorBy` (± steps) or typed times.

### 5.10 Agenda

- Rename `ListPanel.tsx` → `Agenda.tsx` (and CSS classes as they're touched).
- Containers: **bottom dock** (today's position), **side dock** (`.app` becomes a row: timeline
  column + Agenda at a fixed width token), **drawer** (portaled, slides in from the left,
  scrim, Esc and scrim tap close it, focus moves in and back out).
- The ☰ button shows only in drawer placement. The dock/drawer toggle (C6) sits in the tab
  bar next to the gear.

### 5.11 Settings additions

Layout group: Orientation (Auto/Horizontal/Vertical) · Future goes (Down/Up; vertical only) ·
Agenda (Auto/Docked/Drawer) · Snap cursor to ticks (on) · Lanes for favorites and alarms
(When selected/Always) · Show Secondary→Selected span (off). Advanced group: tunables (C13).

## 6. Data and persistence

- No change to instant or span records. Snooze short names are display-only.
- `timeline.settings.v1` gains: `orientation`, `verticalDir`, `agendaPlacement`, `tickSnap`,
  `favoriteLanes`, `tunables`, `layoutVersion`. On first load with `layoutVersion < 2`,
  `showImpliedSelectedPrev` is set to false once (C9), then `layoutVersion = 2`. With
  `layoutVersion < 3`, `showImpliedSelectedNow` is set to false and `showImpliedSelectedPrev` to
  true once, then `layoutVersion = 3`.
- Overrides from the rotate button and the Agenda toggle are session-only.

## 7. Accessibility and keyboard

- Arrow tags and chips are buttons with accessible names ("Now, 6:06:13 PM", "Cursor, 5:58 PM,
  8 minutes 13 seconds before Now"). The cluster chip says "3 more instants: Rice, Tea, …".
- Arrow keys keep today's mapping (Left/Up previous, Right/Down next), which reads naturally
  in both orientations. `V` rotates (C18).
- The drawer is a dialog with a focus trap. prefers-reduced-motion disables the drawer slide
  and the tick-snap ease (jumps instead); glide stays (§2).

## 8. Testing

- **Domain (Vitest):** projection with both orientations and directions; `resolveOrientation`
  (aspect, hysteresis, override reset on shape change); `resolveAgendaPlacement`;
  `labelLayout` (priorities, pinned overflow, snooze folding, clusters, both orientations,
  determinism); glide step physics; nearest tier-0 tick including a DST day; `chipName`;
  seconds rule; `getTunables` merge and clamping.
- **Gestures (`usePanZoom.test.tsx`):** vertical drags use `clientY`; wheel mapping per
  orientation; glide starts only when moving at release; a touch during a glide stops it and
  does not click; existing touch tests unchanged.
- **Actions:** landing order (Now/instant before tick); ± steps and typed times unsnapped.
- **Components (RTL):** rotate button toggles orientation; Agenda drawer opens/closes (Esc,
  scrim); Cursor tag tap shows tools and double-tap saves an instant.
- **Browser check** (headless Edge recipe in the next-steps handoff): screenshots of both
  orientations at 390×844 and 1400×900 with a crowded data set; benchmark (§9).

## 9. Performance

- Idle main thread stays ~0%. Nothing per-frame in React state.
- Layout runs in a phase-1 selector: O(n·slots) for ≤ ~60 visible chips, well under 0.5ms.
- Re-run the pan/zoom benchmark in both orientations after phases 3 and 5. Budgets: no worse
  than today's 15% pan / 32% zoom at 1400×900 with 40 instants.

## 10. Delivery phases

Each phase ships on its own with tests green.

1. **Foundations:** tunables + settings plumbing; projection/Frame generalization;
   `usePositionMain`. No visible change.
2. **Horizontal v2 visuals:** arrow tags with tap tools (removes top lanes); compact chips,
   relative suffixes, seconds rule, snooze short names; short span chips; quieter defaults
   and the v2 settings migration.
3. **Overlap layout and clusters** (horizontal) with the chip-width cache.
4. **Vertical orientation:** cross-axis CSS, ticks, vertical lanes and columns, main-axis
   drag and wheel mapping, orientation/direction settings, Auto rule, rotate button.
5. **Momentum and tick snap.**
6. **Agenda:** rename, bottom/side/drawer placements, ☰, dock/drawer toggle.
7. **Wrap-up:** benchmark, ARCHITECTURE.md update, handoff cleanup.

## 11. Out of scope

Genie and rotation animations (Ideas.md); stopwatch/timer/alarm quick-create and the control
bar redesign (next-steps handoff); swipe-to-close for the drawer; a horizontal direction flip
(RTL); spans drawn as rectangles.
