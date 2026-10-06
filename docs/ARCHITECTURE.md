# Architecture

The timeline is plain DOM rendered by React. There is no canvas and no render loop.
React renders *structure* (which instants, spans and buttons exist); a small
**viewport engine** moves those elements along the time axis (horizontally or vertically) with CSS transforms and updates
time-dependent text, without re-rendering React.

```
 domain/      pure functions: time math, ticks, spans, navigation, alarms,
              labelLayout (chip overlap), layoutMode, glide, tunables         (unit tested)
 store/       Zustand stores + actions.ts (every user operation)            (unit tested)
 engine/      viewportEngine (frame scheduler) + React hooks
 components/  timeline/ (columns, lanes, ticks, popovers), panels/ (controls, list, alarms, settings)
 services/    AlarmScheduler, AlarmAudioManager, NotificationService,
              nativeShell + native/ (the Android app only, loaded on demand)
 styles/      theme.css (tokens), timeline.css, panels.css
```

## The rendering contract

| Changes…                                | Handled by                     | Mechanism                                    |
|-----------------------------------------|--------------------------------|----------------------------------------------|
| What exists (instants, spans, selection) | React                          | Zustand selectors → re-render                |
| Position along the time axis (pan, zoom, Now) | `usePositionMain`, `useFrameListener` | engine writes `transform: translate3d()` |
| Text that depends on time or the cursor | `<LiveText compute={f => …} />` | engine writes `textContent`                 |
| Coarse facts derived from the viewport (which items are on screen, whether an instant is past) | `useFrameValue(selector)` | re-renders only when the value changes |
| Saved chips' layout (row, slide) and the lines of every instant on screen | `savedLayoutAt(frame)` read in frame listeners | chips write their transform per frame; React sees only the structure (`useSavedLayoutStructure`) |

**Layers: lines never draw over text or boxes.** Everything that is a line (marker lines, span-lane bars and chevrons, the axis, tick marks) lives in a low layer; everything that is text or a box (saved, cluster and fold chips, Now/Cursor tags, menus and popovers, span-lane chips and tools, tick labels, the date label, buttons) sits above it on an opaque background. So a `Marker` renders two sibling elements (`.tl-col--line` and `.tl-col--label`, both moved by `usePositionMain`), `SpanLane` renders `.tl-lane--lines` and `.tl-lane--labels`, and `TickLayer` keeps tick marks and tick labels in two containers. The order is the `--z-lines < --z-ticks-labels < --z-chips < --z-lane-chips < --z-controls < --z-tags < --z-popovers` token ladder in `theme.css`; never put a line in the same element as its label, and never give a box a translucent background (use `--box-bg*`).

Rules of thumb:

- **Never put per-frame values in React state.** If it changes while panning or as the clock
  ticks, use one of the hooks above.
- **Never read layout in a frame.** `offsetWidth` or `getBoundingClientRect` inside a frame
  listener, after other listeners wrote transforms, forces a full style and layout pass every
  frame (it once cost a quarter of each zoom frame). Measure with a ResizeObserver and cache the
  size (`useChipWidth`, `observeLaneChip`, `observeFlag`, `observeTag`).
- **Use `frame.now`, not `Date.now()`, when drawing**, so everything in a frame agrees.
  In actions (responding to input) use `engine.sample()`, which is current to the
  millisecond. The last frame can be up to a second old while idle.
- **All user operations go through `store/actions.ts`.** Components don't mutate stores
  directly (except trivial UI state).

## Viewport engine (`engine/viewportEngine.ts`)

The engine holds no state of its own beyond animation bookkeeping. Each frame it:

1. resolves the target view from the stores (`domain/viewport.resolveViewTarget`). For
   example, focus mode `now` means "center = now"; a locked cursor means
   "center = now + offset";
2. applies an in-flight focus transition (350ms ease, log-space zoom) or exponential
   zoom smoothing;
3. calls phase-0 listeners (DOM writes), then phase-1 listeners (React subscriptions).

Frames speak in main-axis positions (`f.pos(t)`, `f.mainSize`): x when the timeline is horizontal, y when vertical, from the `useLayout` store.

Frames are scheduled on demand:

- every animation frame while animating, during gestures, or when a `LiveText` calls `ctx.fast()`
  (e.g. a millisecond readout);
- otherwise just often enough that Now moves by at most a quarter pixel, and on each
  wall-clock second so clocks tick. At the default zoom this is about once per second.
- paused while the tab is hidden.

`engine.beginTransition()` animates from what's on screen to whatever the state says
next. Call it *before* changing focus/zoom state.

## The camera: lines in one world layer (`components/timeline/InstantLines.tsx`)

While panning, everything on the timeline is fixed relative to everything else except the
cursor. So the saved instants' lines live in one container, `.tl-world`, laid out at offsets from
an origin time: a pan moves only the container (one transform, one composited layer); the lines
are rewritten only when the zoom changes (and the origin re-bases when the container drifts
far). Lines are a pool of plain elements managed by a frame listener, like the ticks, so instants
entering or leaving the view mount nothing in React; only lines on screen are drawn. Inside the
container lines still move by transform: a left/top change makes the browser re-record their
paint, which measured three times the paint work while zooming.

## Chips: structure in React, geometry per frame (`savedLayout.ts`, `chipPlacement.ts`)

The overlap layout (`domain/labelLayout.ts`) runs from `savedLayoutAt(frame)`, once per frame at
most and reused for pans and for zoom steps under 0.5% (`ZOOM_REUSE`). The Timeline feeds it
(`useSavedLayoutSource`, which returns the rows in use); `SavedInstantColumns` subscribes to its
*structure* only (which chips exist, "+N" and "⟲N" contents), so a zoom re-renders nothing until
a chip appears, goes or joins a cluster. Each chip (and "+N" chip) places itself every frame:
its line's position plus the layout's slide and cross offset, both on critically damped springs
(`domain/spring.ts`: 220ms along time, 160ms for a pop to another row), so chips are pushed aside
smoothly and never teleport. Springs ask for frames only while they move.

## Motion

- **Cursor ＋ morph** (`plusMorph.ts`, `PlusMorphLayer.tsx`): one shell element, drawn per frame
  while a morph runs. Its ends are measured once (the ＋ button, the new chip); the chip end then
  follows the time axis, so a pan mid-morph keeps it attached. `useUi.plusMorph` (`in` →
  `editing` → `out`) hides the ＋ and the chip at the right moments. Naming ends through
  `act.endNaming` (pans, steps and wheel call it), which blurs the name box so it commits.
- **Hiding the cursor**: CSS only (`.is-collapsed` on the Cursor marker): the tag scales into its
  arrowhead, pivoting on the arrow's tip, and the line fades.
- State changes ease in CSS (colours, tools popping in, the timeline's height), never on
  properties the engine writes (transforms).

## Adding something to the timeline

```tsx
function Marker({ ts }: { ts: number }) {
  const ref = useRef<HTMLDivElement>(null)
  usePositionMain(ref, f => f.pos(ts))                     // follows pan/zoom
  return (
    <div ref={ref} className="tl-col">                 {/* absolutely positioned, width 0 */}
      <LiveText compute={f => formatRelativeCoarse(ts - f.now)} />
    </div>
  )
}
```

For spans use `<SpanLane a={…} b={…} />`. Endpoints are `TimeRef`s: a timestamp,
`'now'` or `'center'` (the cursor), so live spans need no extra code.

## State and persistence

| Store            | localStorage key        | Notes                                                             |
|------------------|-------------------------|-------------------------------------------------------------------|
| `useEntities`    | `timeline.saved.v1`, `timeline.spans.v1` | Same record format as the original canvas app.    |
| `useView`        | `timeline.state`        | Focus, selection, zoom, step, cursor lock. Debounced 300ms.        |
| `useAlarms`      | `timeline.alarms.v1`    | Ringing alarms + ring duration/unanswered behavior.               |
| `useSettings`    | `timeline.settings.v1`  | Glow, tunables (Settings > Advanced), favorite lanes, layout version for one-time migrations (store/migrations.ts). |
| `useUi`          | (not persisted)         | Agenda tab, `agendaOpen` (the drawer), open time-entry popover, `tagMenu` (which live tag's tools menu is open). Both popovers close when the orientation changes. |
| `useLayout`      | (not persisted)         | Resolved layout, see below. |
| `useShell`       | (not persisted)         | Inside the Android app: its version and what Android allows (notifications, alarm sound, exact alarms), for Settings. |

Focus modes: `now` (follow the clock), `cursor` (free; optionally locked to an offset
from Now), `instant` (centered on an instant), `span` (centered on a saved span; spans
ending at Now keep widening). Focusing an instant also selects it; the previously
selected instant becomes the *secondary* selection, and the span between them is
shown as an implied span (on by default). In cursor mode a live Selected→Cursor lane runs
from the selection to the cursor; Selected→Now is opt-in. All three have a pin that saves the span
and chips that name their endpoints. The Cursor tag stays in instant focus mode (in the
`--c-cursor-on` accent) with the instant's time and its distance from Now.

Store helpers that return partial state (like `domain/navigation.pushFocusHistory`)
must return **only their own fields**. Spreading a whole state object into a patch
silently reverts unrelated fields; a bug like that once made refocusing the most
recent instant undo itself.

## Layout (orientation, chips, Agenda)

- **`store/layout.ts`** resolves the layout from the window size, the settings and the rotate
  button's session override (`domain/layoutMode.ts`): `orientation` (horizontal or vertical),
  `dir` (1, or -1 for "future up"), `shape` (portrait/landscape with hysteresis), the
  `override` (lapses when the shape class changes) and the Agenda placement. `startLayoutTracking`
  keeps it current. The engine reads it, so `f.pos`/`f.mainSize`/`f.crossSize` already speak in
  the main axis; components never branch on x/y themselves. `components/timeline/geometry.ts`
  holds the px distances across the timeline (axis, tag slots, lane offsets, vertical cross
  budget) and writes them as `--tl-*` custom properties.
- **Chip overlap layout.** `domain/labelLayout.ts` is pure: positions and chip sizes in,
  rows/columns, "+N" clusters and snooze folds out. `components/timeline/savedLayout.ts` builds
  its inputs from the visible instants and measured chip widths (`useChipWidths`, pruned when an
  instant is deleted) and exposes a structural result (`useSavedLayout`). It is **pan-invariant
  and cached**: item positions are taken relative to the earliest visible instant, and the last
  result is reused while the visible set, zoom, cross size, widths and the other inputs are
  unchanged, so a pure pan costs a cheap probe per frame and no layout. While an instant is
  being moved the cache is skipped. The limits are the `chipRowsMax` (horizontal) and
  `chipColumnsMax` (vertical) tunables.
- **Lane packing and crowded names.** Saved-side lanes are packed (`domain/laneSlots.packSlots`):
  spans that don't overlap in time share a slot, a span's containers are placed just before it
  so it sits inside them, and a lane keeps its slot while it still fits. Names on one slot that
  would touch fold into an "N spans" chip (`domain/labelGroups`; horizontal: `laneChipLayout.ts`
  and `LaneGroupChips.tsx`, read per frame by `SpanLane`; vertical: the label boxes in
  `rightSideLayout.ts` / `NowFlags.tsx`).
- **Live side vs saved side lanes (`useBottomLanes.ts`: `isLiveLane`, `partitionLanes`, `placeLanes`).** A lane with an endpoint at Now or the cursor is *live*: saved spans ending at Now, the implied Selected→Now lane and the implied Selected→Cursor lane. (A span whose endpoint is the instant being moved is not live; it follows the cursor but stays saved.) Live lanes draw on the live side: horizontal, a band above the tags with lanes at y = 10 + i × 24 (`geometry.ts` `liveBandHeight`; the axis, tags, chip rows and saved lanes shift down by the band, written as `--tl-axis` / `--tl-chip-top`, so with no live lanes the geometry is unchanged); vertical, thin bars stacked inward from the left edge (x = 8 + i × 12, in the lines layer) with the chip on the inner side. Their chips are short and colour-coded (`formatDurationShort`; a name is cut to 8 characters; `now` variant red, `cursor` variant the cursor accent) and their arrows and tools (pin, rename/visibility/delete) show only after a tap on the chip (`useUi.laneTools`, dismissed by an outside tap or Escape). Saved-side lanes (below the chips, or the right edge in vertical) hold only spans between two saved instants, and only they count against the vertical chip budget.
- **Control bar (`components/panels/ControlBar.tsx`).** Horizontal: one row. Vertical: still the bottom bar, laid out as a two-row grid that follows the screen: zoom out, ▲, step up | NOW/＋ (spanning both rows) on row 1, and zoom in, ▼, step down on row 2. `useLayout.dir` decides what up means: with the future down (dir 1) ▲ is the previous instant and step up is the earlier step (−30m); with the future up (dir −1) they are the next instant and the later step (+30m). Steps use compact labels ("−30m") and keep the split caret / long-press menu, which places itself above or below by the available room.
- **Momentum (`hooks/glide.ts`, `domain/glide.ts`).** A flicked drag keeps panning from engine
  frames with decaying velocity, then stops without snapping. There is one glide for the app;
  `engine.beginTransition()`, `rotate()`, zoom, ± steps and the wheel stop it, and it stops
  itself if the view leaves the free cursor.
- **Tunables (`domain/tunables.ts`, Settings > Advanced).** Every magic number of the gestures
  and layout (drag thresholds, landing radii, glide constants, chip gaps and limits, Agenda
  breakpoints) is declared once with label, range and default; the settings store holds only
  overrides.
- **Agenda shell (`components/panels/AgendaShell.tsx`).** The Agenda is docked at the bottom or
  side, or in a modal drawer opened by the menu button (`useUi.agendaOpen`). Placement comes
  from `useLayout` (setting Auto/Docked/Drawer plus the dock/drawer toggle's override). Picking
  a row in the drawer closes it.
- **Stacking.** Timeline pieces stay below 60; the Agenda drawer is 150/151, Settings 200, and the
  ringing-alarm panel uses `--z-alarm` (300) so Dismiss/Snooze are always reachable.

## Gestures and cursor landing (`hooks/usePanZoom.ts`, `store/actions.ts`)

- **Drag (one finger or mouse button)** moves through time. A press becomes a drag
  after 3px with a mouse and 8px with touch (finger wobble). Pointer capture starts only
  once dragging, so plain taps still reach chips and buttons.
- **Click guard:** a mouse drag ends with a click on whatever is under the pointer, and
  that one click is swallowed. Touch drags produce no click, so the guard lasts only
  for the current event (`setTimeout(…, 0)`). Otherwise it would eat the next real tap.
- **Wheel** zooms (about 10% per notch) in horizontal and pans in vertical; Ctrl+wheel and **pinch** zoom. Drags follow the main axis (x or y). A flick glides (see Layout) and stops where it rests, without snapping.
- **Where the cursor comes to rest** (`settleCursor`): a drag released at almost no
  speed (below `snapMaxReleaseSpeed`, 0.05 px/ms) that ends within 8px (mouse) or 12px (touch)
  of Now or an instant focuses it, hiding the cursor; failing that it eases to the nearest
  finest tick if that is within `tickSnapPx` (8px). A release with speed (`endPan(…, { snap: false })`)
  or the end of a glide never snaps. ± steps
  and typed times land on an instant only on an essentially exact hit (within 2px and
  0.5s), so a precise typed time is never pulled to a nearby instant. Tapping the
  instant under the cursor focuses it.

**Tick tiers** (`domain/ticks.ts`): `pickTickTiers(pxPerMs, minLabelSpacingPx)` picks the first unit (250ms ... 30m, 1h, 6h, day ...) spaced at least that far apart as the labeled tier, with the unit below as the minor tier. `labelSpacingPx(orientation)` gives 100 (horizontal, labels side by side) or 48 (vertical, labels stacked). Drawing (`TickLayer`), tick snapping (`settleCursor`) and the seconds rule (`InstantColumns`) all pass the same value, so they agree.

Gesture tests (`hooks/usePanZoom.test.tsx`) dispatch `MouseEvent`s tagged with
`pointerType`/`pointerId`, because jsdom has no `PointerEvent`.

## Styling

`styles/theme.css` defines every color, glow and row offset as a custom property.
Components set `--accent` (their color) and optionally `--halo` (their glow color),
and the shared `.glow-box` / `.glow-text` classes do the rest. `--glow` scales every
glow in the app (the Settings slider writes it), which is the starting point for a
user-editable style engine: expose more tokens in Settings.

## Alarms

`services/AlarmScheduler` sleeps until the next alarm (at most 1s, or 60s when none
are set) and rings any alarm that came due within the ring window. A window instead of
an exact-time match means throttled background timers can't skip an alarm. Ringing
state is persisted, so a reload or HMR keeps it on screen; the audio manager is kept
on `globalThis` across HMR.

A browser freezes the page in the background, so the PWA can't ring until it is opened.
The **Android app** ([android.md](android.md)) fixes that: it is a Capacitor shell around
the live site, and inside it `services/nativeShell` loads `services/native/` (a separate
chunk; browsers never fetch it). On start, on resume and on every entity change (debounced)
it brings Android in line with the entities, using pure decisions from
`domain/nativeNotifications`:

- **Alarms** (`native/alarmSync`, the app's `AlarmsPlugin`): each sync first replays the
  answers given from notifications while the page wasn't running (`replayAlarmActions`:
  dismiss, or snooze at the time the notification chose), then hands the native side every
  alarmed instant that is ahead or still within its ring time. The native side schedules them
  (`setAlarmClock`), rings them as an insistent notification with Dismiss / Snooze (replacing a
  timer's countdown), and stops what the page dropped. Ids are stable 31-bit hashes of instant
  ids. It never prompts: permission is asked on the app's first start and on bell/timer taps
  (`primeNotifications`).
- **Live notifications** (`native/liveSync`, `LiveNotificationsPlugin`): a countdown for each
  future alarmed instant that ends a timer (`timerSpanFor`: a saved span that has started),
  and a count-up for the running stopwatch. They and the ringing alarms are Live Updates
  (pinned on the lock screen, a status-bar chip); Android draws the time (Android 17:
  MetricStyle's big value; 16: the header chronometer), so it stays right while the page is
  frozen. A tap on a ringing alarm silences it; Silence in the app silences them all.
- Taps go where `liveTapTarget` says: the stopwatch's span to Now, a running timer's span, or
  an alarm's overtime (its span to Now), focused and selected (`act.revealLive`), including a
  tap that starts the app.

Inside the app the in-app scheduler still rings (the ringing panel), but the notification
makes the sound, so Dismiss / Snooze in either place stops it. Dismissing a timer's alarm also
unfavorites its end.

## Testing

`npm test` runs Vitest in jsdom. `domain/*.test.ts` cover the pure logic;
`store/actions.test.ts` covers user operations end to end through the stores;
`hooks/usePanZoom.test.tsx` covers gestures. Tests don't wait on timers or frames
(actions read the viewport via `engine.sample()`), so they're stable in CI. Netlify
runs them before every build.

## Performance

Frame rate in headless Chromium with the CPU throttled (to stand in for a phone), production
build, about 140 instants over five days with a stopwatch's laps, a running timer and a dozen
spans; a continuous zoom (ctrl+wheel every frame) or drag for 4 s (scratch harness: CDP
`Emulation.setCPUThrottlingRate`, `Performance.getMetrics`, tracing with invalidation tracking):

| Scenario (fps; runs vary by ±3) | Before (0.1.0), 4× | 0.2.0, 4× | 0.2.0, 2× |
|----------------|--------------------|-----------|-----------|
| Zoom, 412×915 vertical   | 23.6 | 35–37 | 52–58 |
| Zoom, 915×412 horizontal | 24.6 | 34–37 | 53–54 |
| Pan, vertical            | 43.5 | 51–56 | 59–60 |
| Pan, horizontal          | 47.8 | 50–57 | 59–60 |

With 400 instants and 40 random spans (4×): zoom 14.9 → 20.4 (horizontal), 16.8 → 24.6
(vertical); pan 20.4 → 31.5, 26.1 → 36.1. What it took: no layout reads in frames (the span
labels' widths and the chips' mount-time measuring were forcing a layout every frame), the
Timeline no longer re-rendering on every zoom frame (the chip structure is separate from the
culled set of visible instants), lines in one panned layer, ticks and lines laid out only a
little past the screen while zooming, no label elements for unlabeled ticks, no empty lane anchor
layers, and one-pass lane packing. What remains is mostly the browser's own style, layout and
paint work for what moves.

Earlier measurements, in headless Edge, 40 instants, on the main thread (layout v2 numbers from the
Vite dev server):

| Phase | Canvas (before) | DOM (after) | Layout v2, 1400×900 horizontal | Layout v2, 390×844 vertical |
|-------|-----------------|-------------|--------------------------------|-----------------------------|
| Idle  | 64.5%           | 0.3%        | 0.4%                           | 0.2%                        |
| Pan   | 44%             | 15%         | 12.6%                          | 7.3%                        |
| Zoom  | 96%             | 32%         | 28.4%                          | 15.5%                       |

The overlap layout is pan-invariant and cached; before the cache, pan cost 19.5%.

Next levers, if phones still struggle: fewer composited layers for chips (a world container
for unselected chips, the selected one outside it for its z-order), and lane lines that don't
change width while zooming.
