# Architecture

The timeline is plain DOM rendered by React. There is no canvas and no render loop.
React renders *structure* (which instants, spans and buttons exist); a small
**viewport engine** moves those elements horizontally with CSS transforms and updates
time-dependent text, without re-rendering React.

```
 domain/      pure functions: time math, ticks, spans, navigation, alarms   (unit tested)
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
| Horizontal position (pan, zoom, Now)    | `usePositionX`, `useFrameListener` | engine writes `transform: translate3d()`  |
| Text that depends on time or the cursor | `<LiveText compute={f => …} />` | engine writes `textContent`                 |
| Coarse facts derived from the viewport (which items are on screen, whether an instant is past) | `useFrameValue(selector)` | re-renders only when the value changes |

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
  usePositionX(ref, f => f.x(ts))                     // follows pan/zoom
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
| `useSettings`    | `timeline.settings.v1`  | Glow intensity (more appearance settings will land here).          |
| `useUi`          | (not persisted)         | Agenda tab, open time-entry popover.                              |

Focus modes: `now` (follow the clock), `cursor` (free; optionally locked to an offset
from Now), `instant` (centered on an instant), `span` (centered on a saved span; spans
ending at Now keep widening). Focusing an instant also selects it; the previously
selected instant becomes the *secondary* selection, and the span between them is
shown as an implied span.

Store helpers that return partial state (like `domain/navigation.pushFocusHistory`)
must return **only their own fields**. Spreading a whole state object into a patch
silently reverts unrelated fields; a bug like that once made refocusing the most
recent instant undo itself.

## Gestures and cursor landing (`hooks/usePanZoom.ts`, `store/actions.ts`)

- **Drag (one finger or mouse button)** moves through time. A press becomes a drag
  after 3px with a mouse and 8px with touch (finger wobble). Pointer capture starts only
  once dragging, so plain taps still reach chips and buttons.
- **Click guard:** a mouse drag ends with a click on whatever is under the pointer, and
  that one click is swallowed. Touch drags produce no click, so the guard lasts only
  for the current event (`setTimeout(…, 0)`). Otherwise it would eat the next real tap.
- **Wheel** zooms (about 10% per notch); **pinch** zooms.
- **Where the cursor comes to rest** (`settleCursor`): a drag that ends within 12px
  (mouse) or 20px (touch) of Now or an instant focuses it, hiding the cursor. ± steps
  and typed times land on an instant only on an essentially exact hit (within 2px and
  0.5s), so a precise typed time is never pulled to a nearby instant. Tapping the
  instant under the cursor focuses it.

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

Measured in headless Edge, 1400×900, 40 instants, on the main thread:

| Phase | Canvas (before) | DOM (after) |
|-------|-----------------|-------------|
| Idle  | 64.5%           | 0.3%        |
| Pan   | 44%             | 15%         |
| Zoom  | 96%             | 32%         |

Per-frame cost while zooming is about 5–6ms (style recalc, ticks, paint), within budget
for 60fps. If phones struggle, the next levers are fewer tick nodes at extreme zoom
levels and fewer composited layers (`will-change` on columns).
