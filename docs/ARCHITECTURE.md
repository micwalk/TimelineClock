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
 services/    AlarmScheduler, AlarmAudioManager, NotificationService
 styles/      theme.css (tokens), timeline.css, panels.css
```

## The rendering contract

| Changes…                                | Handled by                     | Mechanism                                    |
|-----------------------------------------|--------------------------------|----------------------------------------------|
| What exists (instants, spans, selection) | React                          | Zustand selectors → re-render                |
| Position along the time axis (pan, zoom, Now) | `usePositionMain`, `useFrameListener` | engine writes `transform: translate3d()` |
| Text that depends on time or the cursor | `<LiveText compute={f => …} />` | engine writes `textContent`                 |
| Coarse facts derived from the viewport (which items are on screen, whether an instant is past) | `useFrameValue(selector)` | re-renders only when the value changes |

**Layers: lines never draw over text or boxes.** Everything that is a line (marker lines, span-lane bars and chevrons, the axis, tick marks) lives in a low layer; everything that is text or a box (saved, cluster and fold chips, Now/Cursor tags, menus and popovers, span-lane chips and tools, tick labels, the date label, buttons) sits above it on an opaque background. So a `Marker` renders two sibling elements (`.tl-col--line` and `.tl-col--label`, both moved by `usePositionMain`), `SpanLane` renders `.tl-lane--lines` and `.tl-lane--labels`, and `TickLayer` keeps tick marks and tick labels in two containers. The order is the `--z-lines < --z-ticks-labels < --z-chips < --z-lane-chips < --z-controls < --z-tags < --z-popovers` token ladder in `theme.css`; never put a line in the same element as its label, and never give a box a translucent background (use `--box-bg*`).

Rules of thumb:

- **Never put per-frame values in React state.** If it changes while panning or as the clock
  ticks, use one of the hooks above.
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

Focus modes: `now` (follow the clock), `cursor` (free; optionally locked to an offset
from Now), `instant` (centered on an instant), `span` (centered on a saved span; spans
ending at Now keep widening). Focusing an instant also selects it; the previously
selected instant becomes the *secondary* selection, and the span between them is
shown as an implied span.

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

## Testing

`npm test` runs Vitest in jsdom. `domain/*.test.ts` cover the pure logic;
`store/actions.test.ts` covers user operations end to end through the stores;
`hooks/usePanZoom.test.tsx` covers gestures. Tests don't wait on timers or frames
(actions read the viewport via `engine.sample()`), so they're stable in CI. Netlify
runs them before every build.

## Performance

Measured in headless Edge, 40 instants, on the main thread (layout v2 numbers from the
Vite dev server):

| Phase | Canvas (before) | DOM (after) | Layout v2, 1400×900 horizontal | Layout v2, 390×844 vertical |
|-------|-----------------|-------------|--------------------------------|-----------------------------|
| Idle  | 64.5%           | 0.3%        | 0.4%                           | 0.2%                        |
| Pan   | 44%             | 15%         | 12.6%                          | 7.3%                        |
| Zoom  | 96%             | 32%         | 28.4%                          | 15.5%                       |

The overlap layout is pan-invariant and cached; before the cache, pan cost 19.5%.

Per-frame cost while zooming is about 5–6ms (style recalc, ticks, paint), within budget
for 60fps. If phones struggle, the next levers are fewer tick nodes at extreme zoom
levels and fewer composited layers (`will-change` on columns).
