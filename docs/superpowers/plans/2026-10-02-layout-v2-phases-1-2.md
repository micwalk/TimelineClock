# Layout v2, Phases 1–2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Phase 1 generalizes the viewport engine to a main axis, wires tunables into gestures and Settings, and moves timeline geometry into one module, with no visible change. Phase 2 restyles the horizontal timeline: Now and the Cursor become arrow tags above the axis, saved instants become one compact chip each, span chips get shorter, and lanes for favorites and alarms only appear when they're selected.

**Architecture:** The engine's `Frame` speaks in main-axis positions (`pos(t)`, `mainSize`, `dir`) read from a new `useLayout` store. It stays horizontal until phase 4. Components position along the main axis with `usePositionMain`. Cross-axis geometry (axis, chip rows, lanes) lives in `components/timeline/geometry.ts`, which the Timeline writes as CSS custom properties. New UI pieces are small components (`Marker`, `ArrowTag`, `TagMenu`, `LiveTags`) beside the existing timeline components. Behavior stays in `store/actions.ts`, and the pure logic was already built and tested in `src/domain/`.

**Tech Stack:** React 19, TypeScript (strict, no `any`), Zustand, Vite, Vitest (jsdom) + React Testing Library, Heroicons.

**Spec:** `docs/superpowers/specs/2026-10-02-layout-v2-design.md`. Read §2–§5 before starting. The architecture contract is `docs/ARCHITECTURE.md`.

## Global Constraints

- Work on branch `layout-v2`. Commit messages carry **no** attribution or co-author lines.
- TypeScript strictly: no `any`. Imports use explicit `.ts`/`.tsx` extensions (project style).
- Never put per-frame values (pan, zoom, current time) in React state. Positions: `usePositionMain`; time-dependent text: `<LiveText>`; coarse viewport facts: `useFrameValue`.
- Use `frame.now` when drawing and `engine.sample()` (via `actions.ts`) when acting. No `Date.now()` in render.
- All user operations go through `src/store/actions.ts`.
- Never fade, dim or hide past instants or spans.
- Style with theme tokens: components set `--accent`/`--halo`; glow comes from `.glow-box`/`.glow-text`, scaled by `--glow`.
- Interaction changes allowed by the spec: I1 (Now's ★ moves into the Now tag's tools), I2 (one chip: double-tap the name renames, double-tap the time focuses), I3 (offset entry opens from the Cursor tag's tools). Make no other interaction changes.
- Every task ends green: `npx vitest run`, `npx tsc -b`, `npx eslint .`.
- A dev server with HMR is already running (http://localhost:5173). Don't start another.

## Review Focus

1. **A saved instant with a very long name** must not produce a giant chip. The name truncates with an ellipsis, and the full name stays in the chip's `title`. Test in Task 6.
2. **The Cursor tag when the selected instant was just deleted** (a stale id in the view store) shows no third line and doesn't crash. Test in Task 7.
3. **An instant within a second of Now** reads "now", not "0s ago" or "in 0s". Test in Task 5.
4. **Upgrading with saved state:** the Secondary→Selected span is switched off once. A user who turns it back on keeps it on across reloads. Test in Task 9.
5. **Garbage typed into an Advanced tunable field** ("", "abc") is ignored, not saved as NaN. Test in Task 3.

---

## Phase 1: Foundations (no visible change)

### Task 1: Main-axis frames, layout store, `usePositionMain`

**Files:**
- Create: `src/store/layout.ts`, `src/engine/viewportEngine.test.ts`
- Modify: `src/domain/viewport.ts`, `src/domain/viewport.test.ts`, `src/domain/spans.ts:31-38`, `src/engine/viewportEngine.ts`, `src/engine/hooks.ts:40-53`, `src/components/timeline/InstantColumns.tsx`, `src/components/timeline/SpanLane.tsx:62-65`, `src/components/timeline/TickLayer.tsx`, `src/components/timeline/useBottomLanes.ts:94`, `src/store/actions.ts:166-170,196`, `AGENTS.md:24`, `.cursorrules:22`, `docs/ARCHITECTURE.md:22,63`

**Interfaces:**
- Consumes: `AxisProjection`, `Dir`, `timeToPos`, `posToTime`, `visibleRange`, `panCenterByPixels` (already in `src/domain/viewport.ts`); `Orientation` from `src/domain/layoutMode.ts`.
- Produces:
  - `useLayout` store: `{ orientation: Orientation; dir: Dir }`.
  - `Frame extends AxisProjection` with `now`, `orientation`, `crossSize`, `pxPerMs`, `start`, `end` (earliest and latest visible), `animating`, `pos(t)`, `time(pos)`, `seq`. The old `x`, `time(x)`, `screenW` and `height` are gone.
  - `usePositionMain(ref, getPos: (f: Frame) => number)` replaces `usePositionX`.
  - `zoomToFitRange(p: AxisProjection, aTs, bTs)`.
  - `pxPerMs(p: AxisProjection)`.
  - `spanGeometry(posA, posB, mainSize)`.

- [ ] **Step 1: Write the failing engine test**

Create `src/engine/viewportEngine.test.ts`:

```ts
import { beforeEach, describe, expect, it } from 'vitest'
import { engine } from './viewportEngine.ts'
import { useLayout } from '../store/layout.ts'
import { initialViewState, useView } from '../store/view.ts'
import { useEntities } from '../store/entities.ts'

beforeEach(() => {
  engine.cancelTransition()
  useEntities.setState({ instants: [], spans: [] })
  useView.setState({ ...initialViewState(), viewFocusMode: 'cursor' })
  useLayout.setState({ orientation: 'horizontal', dir: 1 })
  engine.setSize(1000, 400)
})

describe('engine frames', () => {
  it('project along the width when horizontal', () => {
    const f = engine.sample()
    expect(f.orientation).toBe('horizontal')
    expect(f.mainSize).toBe(1000)
    expect(f.crossSize).toBe(400)
    expect(f.pos(f.center)).toBeCloseTo(500)
    expect(f.pos(f.center + f.width / 10)).toBeCloseTo(600)
    expect(f.time(600)).toBeCloseTo(f.center + f.width / 10)
    expect(f.pxPerMs).toBeCloseTo(1000 / f.width)
    expect(f.start).toBeCloseTo(f.center - f.width / 2)
    expect(f.end).toBeCloseTo(f.center + f.width / 2)
  })

  it('project along the height when vertical, in either direction', () => {
    useLayout.setState({ orientation: 'vertical', dir: 1 })
    let f = engine.sample()
    expect(f.mainSize).toBe(400)
    expect(f.crossSize).toBe(1000)
    expect(f.pos(f.center + f.width / 10)).toBeCloseTo(240)
    useLayout.setState({ dir: -1 })
    f = engine.sample()
    expect(f.pos(f.center + f.width / 10)).toBeCloseTo(160)
    expect(f.start).toBeLessThan(f.end)
  })

  it('keep the center and visible time span when the orientation changes', () => {
    const before = engine.sample()
    useLayout.setState({ orientation: 'vertical' })
    const after = engine.sample()
    expect(after.center).toBeCloseTo(before.center)
    expect(after.width).toBeCloseTo(before.width)
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/engine/viewportEngine.test.ts`
Expected: FAIL, because `../store/layout.ts` cannot be resolved.

- [ ] **Step 3: Add the layout store**

Create `src/store/layout.ts`:

```ts
// Resolved layout: which way the timeline runs and which way time flows along it.
// Until the vertical layout lands (phase 4) the timeline stays horizontal; later
// phases resolve these from the window size and settings (domain/layoutMode.ts).
import { create } from 'zustand'
import type { Orientation } from '../domain/layoutMode.ts'
import type { Dir } from '../domain/viewport.ts'

export interface LayoutState {
  orientation: Orientation
  /** 1: later times further right (horizontal) or down (vertical). */
  dir: Dir
}

export const useLayout = create<LayoutState>(() => ({ orientation: 'horizontal', dir: 1 }))
```

- [ ] **Step 4: Generalize the viewport math**

In `src/domain/viewport.ts`:
1. Replace the header comment with:

```ts
// Pure viewport math: projection between time and a position along the timeline's
// main axis (x when horizontal, y when vertical), and the view target
// (center/width) implied by the current focus mode.
```

2. Delete the `Projection` interface, `timeToX`, `xToTime` and the old `pxPerMs`. Then, directly after the `Dir`/`AxisProjection` declarations, add:

```ts
export const pxPerMs = (p: AxisProjection) => p.mainSize / p.width
```

3. Replace `zoomToFitRange` with:

```ts
/**
 * Zoom needed so [aTs, bTs] is comfortably in view: fit with 10% margins when an
 * end is off screen, or zoom in when the range covers under 20% of the axis.
 * Returns null when no change is needed.
 */
export function zoomToFitRange(p: AxisProjection, aTs: number, bTs: number): { center: number; width: number } | null {
  const early = Math.min(aTs, bTs)
  const late = Math.max(aTs, bTs)
  if (late === early) return null
  const ends = [timeToPos(p, early), timeToPos(p, late)]
  const lo = Math.min(...ends)
  const hi = Math.max(...ends)
  if (lo < 0 || hi > p.mainSize) return { center: (early + late) / 2, width: (late - early) / 0.8 }
  if (hi - lo < 0.2 * p.mainSize) return { center: (early + late) / 2, width: 2 * (late - early) }
  return null
}
```

In `src/domain/viewport.test.ts`:
1. Change the import to `import { panCenterByPixels, posToTime, resolveViewTarget, timeToPos, visibleRange, zoomToFitRange } from './viewport.ts'`.
2. In `describe('zoomToFitRange')`, change `const p = { center: now, width: 6 * HOUR, screenW: 1200 }` to `const p = { center: now, width: 6 * HOUR, mainSize: 1200, dir: 1 as const }`, and add:

```ts
  it('gives the same answer when time runs the other way', () => {
    const flipped = { ...p, dir: -1 as const }
    expect(zoomToFitRange(flipped, now - 4 * HOUR, now + HOUR)).toEqual(zoomToFitRange(p, now - 4 * HOUR, now + HOUR))
    expect(zoomToFitRange(flipped, now - HOUR, now + HOUR)).toBeNull()
  })
```

3. Replace the test `'flips with dir and matches timeToX for dir=1'` with:

```ts
  it('flips with dir', () => {
    expect(timeToPos(mk(1), 1100)).toBe(600)
    expect(timeToPos(mk(-1), 1100)).toBe(200)
  })
```

In `src/domain/spans.ts`, replace `spanGeometry` (keep the `SpanGeometry` interface) with:

```ts
/** Visible part of a span between main-axis positions `posA` and `posB`, clamped to the axis. */
export function spanGeometry(posA: number, posB: number, mainSize: number): SpanGeometry {
  const lo = Math.min(posA, posB)
  const hi = Math.max(posA, posB)
  const left = Math.max(0, lo)
  const right = Math.min(mainSize, hi)
  const onScreen = hi >= 0 && lo <= mainSize && posA !== posB
  return { left, right, mid: (left + right) / 2, leftOffscreen: lo < 0, rightOffscreen: hi > mainSize, onScreen }
}
```

- [ ] **Step 5: Generalize the engine frame**

In `src/engine/viewportEngine.ts`:
1. After the first header paragraph, add the line `// Positions are along the main axis; orientation and time direction come from the layout store.`
2. Replace the two `../domain/viewport.ts` imports with:

```ts
import { useLayout } from '../store/layout.ts'
import type { Orientation } from '../domain/layoutMode.ts'
import type { AxisProjection } from '../domain/viewport.ts'
import { posToTime, pxPerMs, resolveViewTarget, timeToPos, visibleRange } from '../domain/viewport.ts'
```

3. Replace `export interface Frame extends Projection { … }` with:

```ts
export interface Frame extends AxisProjection {
  /** Wall clock for this frame; use it instead of Date.now() for consistency. */
  now: number
  orientation: Orientation
  /** Size across the time axis, px (the timeline's height when horizontal). */
  crossSize: number
  pxPerMs: number
  /** Earliest and latest visible times, whatever the direction. */
  start: number
  end: number
  /** True while a focus transition or zoom smoothing is in flight. */
  animating: boolean
  /** Position of a time along the main axis, px from the timeline's start edge. */
  pos: (t: number) => number
  /** Time at a main-axis position. */
  time: (pos: number) => number
  seq: number
}
```

4. In `start()`, after `useEntities.subscribe(() => this.invalidate())`, add `useLayout.subscribe(() => this.invalidate())`.
5. In `compute()`, replace everything from `const p: Projection = …` to the end of the method with:

```ts
    const { orientation, dir } = useLayout.getState()
    const horizontal = orientation === 'horizontal'
    const p: AxisProjection = { center, width, mainSize: horizontal ? this.size.w : this.size.h, dir }
    const { start, end } = visibleRange(p)
    return {
      ...p,
      now,
      orientation,
      crossSize: horizontal ? this.size.h : this.size.w,
      pxPerMs: pxPerMs(p),
      start,
      end,
      animating,
      pos: t => timeToPos(p, t),
      time: pos => posToTime(p, pos),
      seq: this.seq,
    }
  }
```

- [ ] **Step 6: Replace `usePositionX` with `usePositionMain`**

In `src/engine/hooks.ts`, replace everything from `/** Hard limit on transform offsets …` to the end of the file with:

```ts
/** Hard limit on transform offsets so far-off items never produce huge layer sizes. */
const POS_LIMIT = 100_000

/**
 * Keeps an element at main-axis position `getPos(frame)` (px) with a transform:
 * translateX when the timeline is horizontal, translateY when vertical.
 */
export function usePositionMain(ref: React.RefObject<HTMLElement | null>, getPos: (f: Frame) => number) {
  const last = useRef<{ pos: number; orientation: Frame['orientation'] } | null>(null)
  useFrameListener(f => {
    const el = ref.current
    if (!el) return
    const pos = Math.max(-POS_LIMIT, Math.min(POS_LIMIT, getPos(f)))
    const prev = last.current
    if (prev && prev.orientation === f.orientation && Math.abs(prev.pos - pos) < 0.01) return
    last.current = { pos, orientation: f.orientation }
    el.style.transform = f.orientation === 'horizontal' ? `translate3d(${pos}px,0,0)` : `translate3d(0,${pos}px,0)`
  })
}
```

- [ ] **Step 7: Update the consumers**

`src/components/timeline/InstantColumns.tsx`:
- The hooks import becomes `import { shallowArrayEqual, useFrameValue, usePositionMain } from '../../engine/hooks.ts'`.
- `ColumnProps.getX: (f: Frame) => number` becomes `getPos: (f: Frame) => number`. In `Column`, destructure `getPos` and call `usePositionMain(ref, getPos)`.
- `NowColumn`: `getX={f => f.x(f.now)}` becomes `getPos={f => f.pos(f.now)}`.
- `CursorColumn`: `getX={f => f.screenW / 2}` becomes `getPos={f => f.mainSize / 2}`.
- `SavedInstantColumn`: `getX={moving ? f => f.screenW / 2 : f => f.x(ts)}` becomes `getPos={moving ? f => f.mainSize / 2 : f => f.pos(ts)}`.
- `GhostColumn`: `usePositionX(ref, f => f.x(ts))` becomes `usePositionMain(ref, f => f.pos(ts))`.

`src/components/timeline/SpanLane.tsx` lines 63–65 become:

```ts
    const pa = f.pos(resolveTimeRef(a, f.now, f.center))
    const pb = f.pos(resolveTimeRef(b, f.now, f.center))
    const g = spanGeometry(pa, pb, f.mainSize)
```

`src/components/timeline/useBottomLanes.ts` line 94 becomes:

```ts
    .filter(c => spanGeometry(f.pos(resolveTimeRef(c.a, f.now, f.center)), f.pos(resolveTimeRef(c.b, f.now, f.center)), f.mainSize).onScreen)
```

`src/components/timeline/TickLayer.tsx`: ticks must respect direction now that frames carry it. Replace the `layout` ref and the body of the `useFrameListener` callback up to `if (stale) {` with:

```ts
  const layout = useRef({ center: 0, pxPerMs: 0, start: 0, end: 0, mainSize: 0, dir: 1, nodes: new Map<number, TickNode>() })

  useFrameListener(f => {
    const inner = innerRef.current
    if (!inner) return
    const s = layout.current
    const stale =
      s.pxPerMs === 0 ||
      Math.abs(f.pxPerMs - s.pxPerMs) > s.pxPerMs * 1e-6 ||
      f.mainSize !== s.mainSize ||
      f.dir !== s.dir ||
      f.start < s.start ||
      f.end > s.end
```

Inside `if (stale) { … }`:
- Replace `s.screenW = f.screenW` with `s.mainSize = f.mainSize` and `s.dir = f.dir`.
- Replace the position line with `const x = s.mainSize / 2 + s.dir * (tick.t - s.center) * s.pxPerMs`.

Then replace the container line after the block with:

```ts
    inner.style.transform = `translate3d(${s.dir * (s.center - f.center) * f.pxPerMs}px,0,0)`
```

`src/store/actions.ts`:
- Add `panCenterByPixels` to the `../domain/viewport.ts` import: `import { panCenterByPixels, zoomToFitRange } from '../domain/viewport.ts'`.
- `panByPixels` body becomes:

```ts
export function panByPixels(dx: number) {
  const f = frame()
  view.setTimeCenter(panCenterByPixels({ ...f, center: v().timeCenter }, dx))
  refreshLock()
}
```

- In `selectInstant`, replace `Math.abs(f.x(inst.tsEpochMs) - f.screenW / 2)` with `Math.abs(f.pos(inst.tsEpochMs) - f.mainSize / 2)`.

- [ ] **Step 8: Update the docs**

- `AGENTS.md` line 24 and `.cursorrules` line 22: replace `Horizontal position: usePositionX(ref, f => f.x(ts)).` with `Position along the time axis: usePositionMain(ref, f => f.pos(ts)).`
- `docs/ARCHITECTURE.md`:
  - In the rendering-contract table, replace the row ``| Horizontal position (pan, zoom, Now)    | `usePositionX`, `useFrameListener` | engine writes `transform: translate3d()`  |`` with ``| Position along the time axis (pan, zoom, Now) | `usePositionMain`, `useFrameListener` | engine writes `transform: translate3d()` |``.
  - In the "Adding something to the timeline" sample, replace `usePositionX(ref, f => f.x(ts))` with `usePositionMain(ref, f => f.pos(ts))`.
  - Add a sentence after the engine's numbered list: "Frames speak in main-axis positions (`f.pos(t)`, `f.mainSize`): x when the timeline is horizontal, y when vertical, from the `useLayout` store."

- [ ] **Step 9: Run everything**

Run: `npx vitest run && npx tsc -b && npx eslint .`
Expected: all tests pass, including the 3 new engine tests. No type or lint errors. `grep -rn "usePositionX\|screenW\|f\.x(" src` prints nothing.

- [ ] **Step 10: Commit**

```bash
git add -A src AGENTS.md .cursorrules docs/ARCHITECTURE.md
git commit -m "Frames speak in main-axis positions; add the layout store

The engine projects time along the timeline's main axis (x or y) in either
direction, read from a new useLayout store that stays horizontal for now.
usePositionMain replaces usePositionX; ticks honor the direction."
```

---

### Task 2: Gestures read their limits from tunables

**Files:**
- Modify: `src/hooks/usePanZoom.ts`, `src/store/actions.ts:172-175`, `src/hooks/usePanZoom.test.tsx`

**Interfaces:**
- Consumes: `getTunables()` and `settings.setTunable` from `src/store/settings.ts` (keys `dragThresholdMousePx`, `dragThresholdTouchPx`, `landingMousePx`, `landingTouchPx`).
- Produces: `endPan(tolerancePx: number)`, with the parameter now required.

- [ ] **Step 1: Write the failing tests**

In `src/hooks/usePanZoom.test.tsx`:
- Add the import `import { settings, useSettings } from '../store/settings.ts'`.
- Add `useSettings.setState({ tunables: {} })` at the end of the existing `beforeEach`.
- Append inside `describe('usePanZoom')`:

```tsx
  it('takes the touch drag threshold from settings', () => {
    settings.setTunable('dragThresholdTouchPx', 30)
    const onTap = vi.fn()
    render(<Harness onTap={onTap} />)
    tap(screen.getByText('Tap me'), 50, 20)
    expect(onTap).toHaveBeenCalledTimes(1)
    expect(useView.getState().viewFocusMode).toBe('now')
  })

  it('takes the touch landing radius from settings', () => {
    settings.setTunable('landingTouchPx', 40)
    render(<Harness onTap={() => {}} />)
    const pxPerMs = engine.sample().pxPerMs
    // 30px from the center after the drag: outside the default 20px, inside 40px.
    const id = entities.createInstant(Date.now() - (100 + 30) / pxPerMs, 'Rice')
    drag(screen.getByTestId('timeline'), 300, 400)
    expect(useView.getState()).toMatchObject({ viewFocusMode: 'instant', focusedInstantId: id })
  })
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run src/hooks/usePanZoom.test.tsx`
Expected: the two new tests FAIL. The 20px wobble pans instead of tapping, and the drag lands in cursor mode, not on the instant.

- [ ] **Step 3: Read the limits at event time**

In `src/hooks/usePanZoom.ts`:
- Delete the `DRAG_THRESHOLD_PX` and `SNAP_PX` constants and their comments.
- Add `import { getTunables } from '../store/settings.ts'`.
- In `onPointerMove`, replace `if (Math.abs(e.clientX - drag.startX) < DRAG_THRESHOLD_PX[drag.touch ? 'touch' : 'mouse']) return` with:

```ts
        const t = getTunables()
        if (Math.abs(e.clientX - drag.startX) < (drag.touch ? t.dragThresholdTouchPx : t.dragThresholdMousePx)) return
```

- In `onPointerUp`, replace `endPan(SNAP_PX[drag.touch ? 'touch' : 'mouse'])` with:

```ts
          const t = getTunables()
          endPan(drag.touch ? t.landingTouchPx : t.landingMousePx)
```

- Update the file header's second sentence to: `Movement and landing limits come from the tunables (Settings > Advanced).`

In `src/store/actions.ts`, change `export function endPan(tolerancePx = 12) {` to `export function endPan(tolerancePx: number) {`.

- [ ] **Step 4: Run the tests**

Run: `npx vitest run src/hooks/usePanZoom.test.tsx`
Expected: PASS (6 tests).

- [ ] **Step 5: Run everything and commit**

Run: `npx vitest run && npx tsc -b && npx eslint .` (expected: all green), then:

```bash
git add src/hooks/usePanZoom.ts src/hooks/usePanZoom.test.tsx src/store/actions.ts
git commit -m "Read drag and landing limits from tunables"
```

---

### Task 3: Settings > Advanced lists every tunable

**Files:**
- Create: `src/components/panels/AdvancedSettings.tsx`, `src/components/panels/AdvancedSettings.test.tsx`
- Modify: `src/components/panels/SettingsPanel.tsx`, `src/styles/panels.css`

**Interfaces:**
- Consumes: `TUNABLE_DESCRIPTORS`, `TunableKey` from `src/domain/tunables.ts`; `useSettings`, `getTunables`, `settings.setTunable`, `settings.resetTunable` from `src/store/settings.ts`.
- Produces: `<AdvancedSettings />`.

- [ ] **Step 1: Write the failing test**

Create `src/components/panels/AdvancedSettings.test.tsx`:

```tsx
import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { AdvancedSettings } from './AdvancedSettings.tsx'
import { getTunables, useSettings } from '../../store/settings.ts'
import { DEFAULT_TUNABLES, TUNABLE_DESCRIPTORS } from '../../domain/tunables.ts'

beforeEach(() => useSettings.setState({ tunables: {} }))

describe('AdvancedSettings', () => {
  it('lists every tunable with its current value', () => {
    render(<AdvancedSettings />)
    for (const d of TUNABLE_DESCRIPTORS) {
      expect(screen.getByLabelText(d.label)).toHaveValue(d.default)
    }
  })

  it('saves a typed value, clamped, and resets it', () => {
    render(<AdvancedSettings />)
    const rows = screen.getByLabelText('Chip rows (horizontal)')
    fireEvent.change(rows, { target: { value: '5' } })
    expect(getTunables().chipRowsMax).toBe(5)
    fireEvent.change(rows, { target: { value: '50' } })
    expect(getTunables().chipRowsMax).toBe(8)
    fireEvent.click(screen.getByRole('button', { name: 'Reset Chip rows (horizontal)' }))
    expect(getTunables().chipRowsMax).toBe(DEFAULT_TUNABLES.chipRowsMax)
  })

  it('ignores empty or non-numeric input', () => {
    render(<AdvancedSettings />)
    const gap = screen.getByLabelText('Gap between chips (px)')
    fireEvent.change(gap, { target: { value: '' } })
    fireEvent.change(gap, { target: { value: 'abc' } })
    expect(useSettings.getState().tunables).toEqual({})
  })

  it('offers reset only for changed values', () => {
    render(<AdvancedSettings />)
    expect(screen.queryByRole('button', { name: /^Reset / })).toBeNull()
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/components/panels/AdvancedSettings.test.tsx`
Expected: FAIL, because `./AdvancedSettings.tsx` cannot be resolved.

- [ ] **Step 3: Implement the list**

Create `src/components/panels/AdvancedSettings.tsx`:

```tsx
// Settings > Advanced: every behavior tunable as a number field, generated from the
// tunables table, with a reset button on changed values.
import { ArrowUturnLeftIcon } from '@heroicons/react/20/solid'
import type { TunableDescriptor, TunableGroup } from '../../domain/tunables.ts'
import { TUNABLE_DESCRIPTORS } from '../../domain/tunables.ts'
import { getTunables, settings, useSettings } from '../../store/settings.ts'
import { IconButton } from '../common/IconButton.tsx'

const GROUPS: TunableGroup[] = ['Layout', 'Gestures', 'Glide', 'Labels']

function TunableRow({ d }: { d: TunableDescriptor }) {
  const overridden = useSettings(s => d.key in s.tunables)
  // Re-render on changes; the resolved value is clamped and merged with defaults.
  useSettings(s => s.tunables[d.key])
  const value = getTunables()[d.key]
  const id = `tunable-${d.key}`
  return (
    <div className="settings__row settings__row--tunable">
      <label htmlFor={id}>{d.label}</label>
      <input
        id={id}
        type="number"
        min={d.min}
        max={d.max}
        step={d.step}
        value={value}
        onChange={e => {
          const n = e.target.valueAsNumber
          if (Number.isFinite(n)) settings.setTunable(d.key, n)
        }}
      />
      {overridden ? (
        <IconButton icon={ArrowUturnLeftIcon} label={`Reset ${d.label}`} bare onClick={() => settings.resetTunable(d.key)} />
      ) : (
        <span className="settings__reset-spacer" aria-hidden />
      )}
    </div>
  )
}

export function AdvancedSettings() {
  return (
    <>
      {GROUPS.map(group => (
        <div key={group} className="settings__subgroup">
          <h4>{group}</h4>
          {TUNABLE_DESCRIPTORS.filter(d => d.group === group).map(d => <TunableRow key={d.key} d={d} />)}
        </div>
      ))}
    </>
  )
}
```

In `src/components/panels/SettingsPanel.tsx`:
- Add `import { AdvancedSettings } from './AdvancedSettings.tsx'`.
- Change `const PANEL_EST_HEIGHT = 340` to `const PANEL_EST_HEIGHT = 420`.
- Insert this section before the `Dev` section:

```tsx
          <section className="settings__group">
            <details className="settings__advanced">
              <summary><h3>Advanced</h3></summary>
              <AdvancedSettings />
            </details>
          </section>
```

Append to `src/styles/panels.css`:

```css
/* Settings > Advanced: long list, so the panel scrolls */
.settings__panel { max-height: calc(100vh - 16px); overflow-y: auto; }
.settings__advanced summary { cursor: pointer; list-style: none; }
.settings__advanced summary h3 { display: inline; }
.settings__advanced summary::before { content: '▸ '; color: var(--ink-faint); }
.settings__advanced[open] summary::before { content: '▾ '; }
.settings__subgroup { margin-top: 8px; }
.settings__subgroup h4 { font: 700 11px/1 var(--font-ui); color: var(--ink-dim); margin: 6px 0; }
.settings__row--tunable { grid-template-columns: 1fr 76px 26px; }
.settings__row--tunable label { font-size: 13px; color: var(--ink-dim); }
.settings__row--tunable input {
  width: 76px; height: 26px; padding: 0 6px; border-radius: 6px;
  background: var(--surface-raised); border: 1px solid rgba(148, 163, 184, 0.25);
  font: 600 13px/1 var(--font-mono); text-align: right;
}
.settings__reset-spacer { width: 26px; }
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run src/components/panels/AdvancedSettings.test.tsx`
Expected: PASS (4 tests).

- [ ] **Step 5: Check it in the browser, run everything, commit**

Open http://localhost:5173, then gear > Advanced. Every field shows its default, changing a value shows a reset arrow, and the panel scrolls.
Run: `npx vitest run && npx tsc -b && npx eslint .` (green). Then:

```bash
git add src/components/panels/AdvancedSettings.tsx src/components/panels/AdvancedSettings.test.tsx src/components/panels/SettingsPanel.tsx src/styles/panels.css
git commit -m "Settings > Advanced lists every tunable"
```

---

### Task 4: Timeline geometry in one module

**Files:**
- Create: `src/components/timeline/geometry.ts`, `src/components/timeline/geometry.test.ts`
- Modify: `src/components/timeline/Timeline.tsx`, `src/components/timeline/useBottomLanes.ts:12,99`, `src/styles/theme.css:46-52`

**Interfaces:**
- Produces:
  - `GEOMETRY`: px from the timeline's top edge.
  - `geometryStyle: CSSProperties`, the custom properties for `.timeline`.
  - `lanesTop(): number`.
- This task changes nothing on screen: the values equal today's tokens.

- [ ] **Step 1: Write the failing test**

Create `src/components/timeline/geometry.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { GEOMETRY, geometryStyle, lanesTop } from './geometry.ts'

describe('timeline geometry', () => {
  it('exposes every value as a px custom property', () => {
    expect(geometryStyle).toMatchObject({ '--tl-axis': `${GEOMETRY.axis}px` })
    expect(Object.keys(geometryStyle)).toHaveLength(Object.keys(GEOMETRY).length)
    for (const value of Object.values(geometryStyle)) expect(value).toMatch(/^\d+(\.\d+)?px$/)
  })

  it('starts lanes below the chips', () => {
    expect(lanesTop()).toBe(312)
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/components/timeline/geometry.test.ts`
Expected: FAIL, because `./geometry.ts` cannot be resolved.

- [ ] **Step 3: Implement the module and wire it**

Create `src/components/timeline/geometry.ts`:

```ts
// Where things sit across the timeline, in px from its top edge. The Timeline writes
// these onto its element as CSS custom properties (--tl-<name>), so the stylesheet
// and the lane math in JS share one source. Colors and glows stay in theme.css.
import type { CSSProperties } from 'react'

export const GEOMETRY = {
  laneA: 26,
  laneB: 70,
  axis: 146,
  label: 180,
  time: 214,
  actions: 260,
  lanes: 312,
} as const

const kebab = (s: string) => s.replace(/[A-Z]/g, c => `-${c.toLowerCase()}`)

/** Custom properties for the .timeline element: --tl-axis, --tl-lane-a, … */
export const geometryStyle = Object.fromEntries(
  Object.entries(GEOMETRY).map(([k, v]) => [`--tl-${kebab(k)}`, `${v}px`]),
) as CSSProperties

/** Vertical center of the first bottom lane's band starts here. */
export const lanesTop = (): number => GEOMETRY.lanes
```

In `src/components/timeline/Timeline.tsx`:
- Add `import { geometryStyle } from './geometry.ts'`.
- Change `style={{ height }}` to `style={{ ...geometryStyle, height }}`.

In `src/components/timeline/useBottomLanes.ts`:
- Delete `export const LANES_TOP = 312` and add `import { lanesTop } from './geometry.ts'`.
- Change `let y = LANES_TOP` to `let y = lanesTop()`.

In `src/styles/theme.css`, replace the block from `/* Timeline rows, in px from the top of the timeline */` through `--tl-actions: 260px;` with:

```css
  /* Timeline rows (--tl-axis, --tl-lane-a, …) are set on .timeline by
     components/timeline/geometry.ts so CSS and lane math share one source. */
```

Then run `grep -rn "var(--tl-" src/styles`. Every match must be in `timeline.css`, in rules that apply inside `.timeline`.

- [ ] **Step 4: Run the tests and check the screen**

Run: `npx vitest run src/components/timeline/geometry.test.ts`. Expected: PASS.
Open http://localhost:5173. The timeline looks exactly as before: axis, chips and lanes are in the same places.

- [ ] **Step 5: Run everything and commit**

Run: `npx vitest run && npx tsc -b && npx eslint .` (green). Then:

```bash
git add src/components/timeline/geometry.ts src/components/timeline/geometry.test.ts src/components/timeline/Timeline.tsx src/components/timeline/useBottomLanes.ts src/styles/theme.css
git commit -m "Move timeline row geometry into one module"
```

---

## Phase 2: Horizontal v2 visuals

### Task 5: Compact clock and relative-time formatters

**Files:**
- Modify: `src/domain/format.ts`, `src/domain/format.test.ts`

**Interfaces:**
- Produces:
  - `formatClockCompact(ts: number, withSeconds: boolean): string` gives "6:00p" or "6:04:13p".
  - `formatRelativeShort(deltaMs: number): string` gives "now", "45s ago", "in 6m", "2h 5m ago" or "3d 4h ago". `deltaMs` is the event time minus now.

- [ ] **Step 1: Write the failing tests**

Append to `src/domain/format.test.ts`, and add `formatClockCompact, formatRelativeShort` to its `./format.ts` import:

```ts
describe('formatClockCompact', () => {
  it('drops leading zeros and shortens am/pm', () => {
    expect(formatClockCompact(new Date(2026, 0, 5, 18, 0, 0).getTime(), false)).toBe('6:00p')
    expect(formatClockCompact(new Date(2026, 0, 5, 9, 7, 0).getTime(), false)).toBe('9:07a')
  })
  it('shows seconds on request', () => {
    expect(formatClockCompact(new Date(2026, 0, 5, 18, 4, 13).getTime(), true)).toBe('6:04:13p')
  })
  it('handles midnight and noon', () => {
    expect(formatClockCompact(new Date(2026, 0, 5, 0, 5, 0).getTime(), false)).toBe('12:05a')
    expect(formatClockCompact(new Date(2026, 0, 5, 12, 0, 0).getTime(), false)).toBe('12:00p')
  })
})

describe('formatRelativeShort', () => {
  it('says now within a second', () => {
    expect(formatRelativeShort(0)).toBe('now')
    expect(formatRelativeShort(999)).toBe('now')
    expect(formatRelativeShort(-999)).toBe('now')
  })
  it('uses the largest useful units', () => {
    expect(formatRelativeShort(-45 * SECOND)).toBe('45s ago')
    expect(formatRelativeShort(6 * MINUTE + 30 * SECOND)).toBe('in 6m')
    expect(formatRelativeShort(-(2 * HOUR + 5 * MINUTE))).toBe('2h 5m ago')
    expect(formatRelativeShort(2 * HOUR)).toBe('in 2h')
    expect(formatRelativeShort(-(3 * DAY + 4 * HOUR))).toBe('3d 4h ago')
    expect(formatRelativeShort(3 * DAY)).toBe('in 3d')
  })
})
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run src/domain/format.test.ts`
Expected: FAIL, because `formatClockCompact` is not exported.

- [ ] **Step 3: Implement them**

Add to `src/domain/format.ts`, after `formatClock12h`:

```ts
/** Compact local clock for chips and tags: "6:00p", or "6:04:13p" with seconds. */
export function formatClockCompact(ts: number, withSeconds: boolean): string {
  const d = new Date(ts)
  const h = d.getHours()
  const hour = h % 12 === 0 ? 12 : h % 12
  const seconds = withSeconds ? `:${pad2(d.getSeconds())}` : ''
  return `${hour}:${pad2(d.getMinutes())}${seconds}${h >= 12 ? 'p' : 'a'}`
}

/**
 * How long ago or until, for chips: "now", "45s ago", "in 6m", "2h 5m ago", "3d 4h ago".
 * `deltaMs` is the event's time minus now (negative = past). Units are floored.
 */
export function formatRelativeShort(deltaMs: number): string {
  const abs = Math.abs(deltaMs)
  if (abs < SECOND) return 'now'
  let text: string
  if (abs < MINUTE) {
    text = `${Math.floor(abs / SECOND)}s`
  } else if (abs < HOUR) {
    text = `${Math.floor(abs / MINUTE)}m`
  } else if (abs < DAY) {
    const h = Math.floor(abs / HOUR)
    const m = Math.floor((abs % HOUR) / MINUTE)
    text = m ? `${h}h ${m}m` : `${h}h`
  } else {
    const d = Math.floor(abs / DAY)
    const h = Math.floor((abs % DAY) / HOUR)
    text = h ? `${d}d ${h}h` : `${d}d`
  }
  return deltaMs < 0 ? `${text} ago` : `in ${text}`
}
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run src/domain/format.test.ts`. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/domain/format.ts src/domain/format.test.ts
git commit -m "Add compact clock and relative-time formatters for chips"
```

---

### Task 6: One compact chip per saved instant

**Files:**
- Create: `src/components/timeline/Marker.tsx`, `src/components/timeline/InstantColumns.test.tsx`
- Modify: `src/components/timeline/InstantColumns.tsx` (replace `SavedInstantColumn`, `GhostColumn`, `SavedInstantColumns`), `src/components/timeline/geometry.ts`, `src/components/timeline/geometry.test.ts`, `src/styles/timeline.css`

**Interfaces:**
- Consumes:
  - `chipName`, `showsSeconds`, `formatClockCompact`, `formatRelativeShort`, `formatDateTime` from `src/domain/format.ts`.
  - `pickTickTiers` from `src/domain/ticks.ts`.
  - `getTunables` from `src/store/settings.ts`.
  - `usePositionMain` from Task 1.
  - `GEOMETRY` from Task 4.
- Produces:
  - `<Marker className getPos ariaLabel>{children}</Marker>`: a positioned line with content.
  - `SavedInstantColumns` keeps its export name.
  - Geometry gains `chipTop` and `chipRow` (`--tl-chip-top`, `--tl-chip-row`).

- [ ] **Step 1: Write the failing tests**

Create `src/components/timeline/InstantColumns.test.tsx`:

```tsx
import { act, fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { SavedInstantColumns } from './InstantColumns.tsx'
import { engine } from '../../engine/viewportEngine.ts'
import { entities, useEntities } from '../../store/entities.ts'
import { initialViewState, useView } from '../../store/view.ts'
import { useAlarms } from '../../store/alarms.ts'
import { formatClockCompact } from '../../domain/format.ts'
import { MINUTE } from '../../domain/time.ts'

beforeEach(() => {
  engine.cancelTransition()
  useEntities.setState({ instants: [], spans: [] })
  useView.setState(initialViewState())
  useAlarms.setState({ ringing: [] })
})

// The last rendered frame is what components draw from; anchor times to it.
const twentyMinutesAgo = () => engine.getFrame().now - 20 * MINUTE

describe('saved instant chips', () => {
  it('show the name and a compact time in one chip', () => {
    const t = twentyMinutesAgo()
    entities.createInstant(t, 'Take Meds')
    render(<SavedInstantColumns />)
    expect(screen.getByText('Take Meds')).toBeInTheDocument()
    expect(screen.getByText(formatClockCompact(t, false))).toBeInTheDocument()
  })

  it('show seconds when selected', () => {
    const t = twentyMinutesAgo()
    const id = entities.createInstant(t, 'Take Meds')
    useView.setState({ currentSelectedInstantId: id })
    render(<SavedInstantColumns />)
    expect(screen.getByText(formatClockCompact(t, true))).toBeInTheDocument()
  })

  it('show time since on favorites, and the star unfavorites', () => {
    const id = entities.createInstant(twentyMinutesAgo(), 'Rice', { favorite: true })
    render(<SavedInstantColumns />)
    expect(screen.getByText('· 20m ago')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Unfavorite' }))
    expect(entities.getInstant(id)?.favorite).toBe(false)
  })

  it('select on click, rename on double-clicking the name, focus on double-clicking the time', () => {
    const t = twentyMinutesAgo()
    const id = entities.createInstant(t, 'Tea')
    render(<SavedInstantColumns />)
    fireEvent.click(screen.getByText('Tea'))
    expect(useView.getState().currentSelectedInstantId).toBe(id)
    fireEvent.doubleClick(screen.getByText('Tea'))
    expect(useView.getState().editingInstantId).toBe(id)
    act(() => useView.setState({ editingInstantId: null }))
    fireEvent.doubleClick(screen.getByText(formatClockCompact(t, true)))
    expect(useView.getState()).toMatchObject({ viewFocusMode: 'instant', focusedInstantId: id })
  })

  it('offer tools when selected, including delete', () => {
    const id = entities.createInstant(twentyMinutesAgo(), 'Tea')
    useView.setState({ currentSelectedInstantId: id })
    render(<SavedInstantColumns />)
    expect(screen.getByRole('button', { name: 'Favorite' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Delete instant' }))
    expect(entities.getInstant(id)).toBeUndefined()
  })

  it('shorten snooze names', () => {
    entities.createInstant(twentyMinutesAgo(), 'Snooze 2: Test Alarm')
    render(<SavedInstantColumns />)
    expect(screen.getByText('Test Alarm ⟲2')).toBeInTheDocument()
  })

  it('keep a long name whole in the title', () => {
    const long = 'Take the lasagna out of the oven and let it rest for ten minutes before cutting'
    entities.createInstant(twentyMinutesAgo(), long)
    render(<SavedInstantColumns />)
    const main = screen.getByText(long).closest('button')!
    expect(main.getAttribute('title')).toContain(long)
    expect(screen.getByText(long)).toHaveClass('chip__name')
  })
})
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run src/components/timeline/InstantColumns.test.tsx`
Expected: FAIL. Today's columns render a long `formatClock12h` time, show no "· 20m ago", and have no "Delete instant"/"Favorite" tools in this shape.

- [ ] **Step 3: Add `Marker` and the chip geometry**

Create `src/components/timeline/Marker.tsx`:

```tsx
// A marker on the timeline: a line across the timeline at one time, plus whatever
// content hangs off it, moved as a unit along the time axis by the engine.
import { useRef } from 'react'
import type { ReactNode } from 'react'
import { usePositionMain } from '../../engine/hooks.ts'
import type { Frame } from '../../engine/viewportEngine.ts'

export function Marker({ className, getPos, ariaLabel, children }: {
  className: string
  getPos: (f: Frame) => number
  ariaLabel?: string
  children?: ReactNode
}) {
  const ref = useRef<HTMLDivElement>(null)
  usePositionMain(ref, getPos)
  return (
    <div ref={ref} className={`tl-col ${className}`} role={ariaLabel ? 'group' : undefined} aria-label={ariaLabel} aria-hidden={ariaLabel ? undefined : true}>
      <div className="tl-col__line" />
      {children}
    </div>
  )
}
```

In `src/components/timeline/geometry.ts`, add `chipTop: 180,` and `chipRow: 34,` to `GEOMETRY` after `actions: 260,`. In `geometry.test.ts`, nothing changes: the length check follows `GEOMETRY`.

- [ ] **Step 4: Replace the saved columns**

In `src/components/timeline/InstantColumns.tsx`:
- Replace the imports with:

```tsx
import { memo, useMemo, useRef } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { StarIcon as StarOutline, BellIcon as BellOutline } from '@heroicons/react/24/outline'
import { StarIcon as StarSolid, BellAlertIcon } from '@heroicons/react/24/solid'
import { ArrowsRightLeftIcon, CheckIcon, TrashIcon, XMarkIcon } from '@heroicons/react/20/solid'
import { shallowArrayEqual, useFrameValue, usePositionMain } from '../../engine/hooks.ts'
import { LiveText } from '../../engine/LiveText.tsx'
import type { Frame } from '../../engine/viewportEngine.ts'
import { chipName, formatClock12h, formatClockCompact, formatDateTime, formatRelativeShort, showsSeconds } from '../../domain/format.ts'
import { pickTickTiers } from '../../domain/ticks.ts'
import type { InstantRecord } from '../../domain/entities.ts'
import { displayName } from '../../domain/entities.ts'
import { useEntities } from '../../store/entities.ts'
import { useView, view } from '../../store/view.ts'
import { useAlarms } from '../../store/alarms.ts'
import { ui, useUi } from '../../store/ui.ts'
import { getTunables } from '../../store/settings.ts'
import * as act from '../../store/actions.ts'
import { IconButton } from '../common/IconButton.tsx'
import { InlineInput } from '../common/InlineInput.tsx'
import { ClockPopover } from './TimeEntryPopover.tsx'
import { Marker } from './Marker.tsx'
```

  `NowColumn`, `CursorColumn` and `Column` stay exactly as they are; Task 7 replaces them.
- Replace everything from `// ---------------------------------------------------------------------------\n\ninterface SavedFlags` to the end of the file with:

```tsx
// ---------------------------------------------------------------------------
// Saved instants: a line plus one compact chip ("Take Meds 6:00p · 20m ago").

interface SavedFlags {
  selected: boolean
  focused: boolean
  secondary: boolean
  spanEnd: boolean
  editing: boolean
  moving: boolean
  /** Zoomed in far enough that every chip shows seconds. */
  fineSeconds: boolean
}

const SavedMarker = memo(function SavedMarker({ inst, selected, focused, secondary, spanEnd, editing, moving, fineSeconds }: { inst: InstantRecord } & SavedFlags) {
  const ts = inst.tsEpochMs
  const isPast = useFrameValue(f => ts < f.now)
  const ringing = useAlarms(s => s.ringing.some(r => r.instantId === inst.id))
  const name = chipName(inst.label)

  const stateClass = moving ? 'is-moving' : focused ? 'is-focused' : selected ? 'is-selected' : spanEnd ? 'is-span-end' : secondary ? 'is-secondary' : ''
  const bellGlyph = (!!inst.alarm && !isPast) || ringing
  const showRelative = !!inst.favorite || !!inst.alarm || selected || focused
  const withSeconds = fineSeconds || selected || focused

  return (
    <Marker className={stateClass} ariaLabel={`Instant ${name}`} getPos={moving ? f => f.mainSize / 2 : f => f.pos(ts)}>
      <div className="tl-col__chip" style={{ '--row': 0 } as CSSProperties}>
        <div className={`chip chip--saved glow-box glow-text${inst.label ? '' : ' chip--empty'}`}>
          {inst.favorite && (
            <IconButton icon={StarSolid} label="Unfavorite" color={starColor} bare pressed onClick={() => act.toggleFavorite(inst.id)} />
          )}
          {bellGlyph && (
            <IconButton icon={BellAlertIcon} label={ringing ? 'Dismiss alarm' : 'Turn alarm off'} color={bellColor} bare pressed
              className={ringing ? 'is-ringing' : ''} onClick={() => act.toggleAlarm(inst.id)} />
          )}
          {editing ? (
            <InlineInput
              initial={inst.label}
              ariaLabel="Instant name"
              placeholder="Name"
              onCommit={v => act.renameInstant(inst.id, v)}
              onCancel={() => view.editInstant(null)}
            />
          ) : (
            <button
              type="button"
              className="chip__main"
              title={`${displayName(inst.label)} · ${formatDateTime(ts)}. Click to select; double-click the name to rename, the time to focus`}
              onClick={() => act.selectInstant(inst.id)}
            >
              <span className="chip__name" onDoubleClick={() => view.editInstant(inst.id)}>{name}</span>
              <span className="chip__time" onDoubleClick={() => act.focusInstant(inst.id)}>
                {moving ? <LiveText compute={f => formatClockCompact(f.center, true)} /> : formatClockCompact(ts, withSeconds)}
              </span>
              {showRelative && !moving && <LiveText className="chip__rel" compute={f => `· ${formatRelativeShort(ts - f.now)}`} />}
            </button>
          )}
        </div>
        {selected && !moving && (
          <div className="tl-col__tools">
            {!inst.favorite && <IconButton icon={StarOutline} label="Favorite" color={starColor} bare onClick={() => act.toggleFavorite(inst.id)} />}
            {!inst.alarm && !isPast && <IconButton icon={BellOutline} label="Set alarm" color={bellColor} bare onClick={() => act.toggleAlarm(inst.id)} />}
            {focused && <IconButton icon={ArrowsRightLeftIcon} label="Move instant" color="var(--c-cursor)" bare onClick={() => act.enterMove(inst.id)} />}
            <IconButton icon={TrashIcon} label="Delete instant" color="var(--c-danger)" className="glow-box" onClick={() => act.deleteInstant(inst.id)} />
          </div>
        )}
        {moving && (
          <div className="tl-col__tools">
            <IconButton icon={CheckIcon} label="Confirm move" color="var(--c-ok)" bare onClick={act.confirmMove} />
            <IconButton icon={XMarkIcon} label="Cancel move" color="var(--c-danger)" bare onClick={act.cancelMove} />
          </div>
        )}
      </div>
      {moving && <div className="tl-col__badge glow-box glow-text">Moving</div>}
    </Marker>
  )
})

/** Faint marker at the original position of an instant being moved. */
function GhostColumn({ ts }: { ts: number }) {
  return <Marker className="is-ghost" getPos={f => f.pos(ts)} />
}

export function SavedInstantColumns() {
  const instants = useEntities(s => s.instants)
  const spans = useEntities(s => s.spans)
  const v = useView(useShallow(s => ({
    mode: s.viewFocusMode,
    focusedInstantId: s.focusedInstantId,
    focusedSpanId: s.focusedSpanId,
    selected: s.currentSelectedInstantId,
    secondary: s.secondarySelectedInstantId,
    editing: s.editingInstantId,
    moving: s.moveMode?.instantId ?? null,
  })))

  // Mount only instants near the screen (plus anything selected/focused/edited).
  const pinned = useMemo(() => new Set([v.selected, v.secondary, v.focusedInstantId, v.editing, v.moving].filter(Boolean) as string[]), [v])
  const visibleIds = useFrameValue(f => {
    const margin = CULL_MARGIN_PX / f.pxPerMs
    const lo = f.start - margin
    const hi = f.end + margin
    return instants.filter(i => pinned.has(i.id) || (i.tsEpochMs >= lo && i.tsEpochMs <= hi)).map(i => i.id)
  }, shallowArrayEqual)
  const fineSeconds = useFrameValue(f => showsSeconds(pickTickTiers(f.pxPerMs)[0].ms, getTunables().secondsBelowTickMs))

  const spanEnds = useMemo(() => {
    if (v.mode !== 'span' || !v.focusedSpanId) return new Set<string>()
    const sp = spans.find(s => s.id === v.focusedSpanId)
    return new Set(sp ? [sp.startInstantId, sp.endInstantId] : [])
  }, [spans, v.mode, v.focusedSpanId])

  const byId = useMemo(() => new Map(instants.map(i => [i.id, i])), [instants])
  const moving = v.moving ? byId.get(v.moving) : undefined

  return (
    <>
      {moving && <GhostColumn ts={moving.tsEpochMs} />}
      {visibleIds.map(id => {
        const inst = byId.get(id)
        if (!inst) return null
        return (
          <SavedMarker
            key={id}
            inst={inst}
            selected={v.selected === id}
            focused={v.mode === 'instant' && v.focusedInstantId === id}
            secondary={v.secondary === id}
            spanEnd={spanEnds.has(id)}
            editing={v.editing === id}
            moving={v.moving === id}
            fineSeconds={fineSeconds}
          />
        )
      })}
    </>
  )
}
```

- Leave `formatClock12h` imported; `NowColumn` and `CursorColumn` still use it until Task 7. Remove `useRef` from the import only if lint reports it unused (the `Column` helper still uses it).

- [ ] **Step 5: Style the chip**

In `src/styles/timeline.css`:
- Change `.tl-col__badge`'s `top: calc(var(--tl-actions) + 2px);` to `top: calc(var(--tl-chip-top) + var(--tl-chip-row) + 4px);`.
- Add after the `.tl-col__icons` rule:

```css
/* Saved instants: one chip under the axis, in a row chosen by the overlap layout */
.tl-col__chip {
  position: absolute;
  left: 0;
  top: calc(var(--tl-chip-top) + var(--row, 0) * var(--tl-chip-row));
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 4px;
  white-space: nowrap;
}
.chip--saved { gap: 2px; padding: 0 3px; }
.chip--saved .icon-btn { width: 22px; height: 22px; }
.chip--saved .icon-btn > svg { width: 15px; height: 15px; }
.chip__main {
  display: inline-flex;
  align-items: baseline;
  gap: 6px;
  padding: 0 5px;
  max-width: 300px;
  font: 650 15px/1 var(--font-ui);
}
.chip__name { min-width: 0; max-width: 190px; overflow: hidden; text-overflow: ellipsis; }
.chip__time { font: 700 14px/1 var(--font-mono); font-variant-numeric: tabular-nums; }
.chip__rel { font: 600 12px/1 var(--font-ui); color: var(--ink-dim); }
.tl-col__tools { display: flex; align-items: center; gap: 3px; }
```

- [ ] **Step 6: Run the tests and look at it**

Run: `npx vitest run src/components/timeline/InstantColumns.test.tsx`. Expected: PASS (7 tests).
Open http://localhost:5173:
- Each saved instant shows one chip under the axis.
- Selecting an instant shows seconds and the tools (★/🔔/🗑).
- Double-clicking the name renames it; double-clicking the time focuses it.
- Favorites show "· 20m ago".

- [ ] **Step 7: Run everything and commit**

Run: `npx vitest run && npx tsc -b && npx eslint .` (green). Then:

```bash
git add src/components/timeline/Marker.tsx src/components/timeline/InstantColumns.tsx src/components/timeline/InstantColumns.test.tsx src/components/timeline/geometry.ts src/styles/timeline.css
git commit -m "One compact chip per saved instant

Name, compact time and (for favorites, alarms, the selection) time since or
until, in one chip. Double-click the name to rename, the time to focus; tools
appear beside the chip when it is selected."
```

---

### Task 7: Now and the Cursor as arrow tags above the axis

**Files:**
- Create: `src/hooks/usePopoverDismiss.ts`, `src/components/timeline/ArrowTag.tsx`, `src/components/timeline/TagMenu.tsx`, `src/components/timeline/LiveTags.tsx`, `src/components/timeline/LiveTags.test.tsx`
- Modify:
  - `src/components/timeline/TimeEntryPopover.tsx`: use the shared dismiss hook.
  - `src/components/timeline/InstantColumns.tsx`: delete `Column`, `NowColumn`, `CursorColumn`.
  - `src/components/timeline/Lanes.tsx`: delete `TopLanes`, `SignedDuration`; draw the focused span as a bottom lane.
  - `src/components/timeline/useBottomLanes.ts`
  - `src/components/timeline/Timeline.tsx`
  - `src/components/timeline/geometry.ts` and `geometry.test.ts`
  - `src/domain/spans.ts` and `spans.test.ts`
  - `src/store/ui.ts`
  - `src/store/actions.ts`: add `nowTime`.
  - `src/styles/timeline.css`

**Interfaces:**
- Consumes:
  - `Marker` (Task 6) and `GEOMETRY` (Task 4).
  - `formatClockCompact` (Task 5), `chipName`, `formatSignedDuration`, `durationShowsMillis`.
  - `ClockPopover`, `DurationPopover`.
  - Actions `createInstantAndEdit`, `cursorTime`, `toggleCursorLock`, `saveSpanRefs`, `applyClockInput`, `applyDurationInput`.
- Produces:
  - `usePopoverDismiss(ref, onDismiss, enabled = true)`.
  - `ui.tagMenu: 'now' | 'cursor' | null`, `ui.toggleTagMenu(which)`, `ui.closeTagMenu()`.
  - `act.nowTime(): number`.
  - `liveTagsCollide(nowPos, cursorPos, clearancePx): boolean`.
  - `<NowTag />`, `<CursorTag />`.
  - `LaneSpan.focused: boolean`; `savedSpanLanes` includes the focused span first.
- Final geometry: `axis 112, tagArrow 14, tagSlot 48, tagClearance 100, chipTop 128, chipRow 34, lanes 176`. `laneA`, `laneB`, `label`, `time` and `actions` are removed.

- [ ] **Step 1: Write the failing tests**

Create `src/components/timeline/LiveTags.test.tsx`:

```tsx
import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { CursorTag, NowTag, liveTagsCollide } from './LiveTags.tsx'
import { engine } from '../../engine/viewportEngine.ts'
import { entities, useEntities } from '../../store/entities.ts'
import { initialViewState, useView } from '../../store/view.ts'
import { useUi } from '../../store/ui.ts'
import { formatClockCompact } from '../../domain/format.ts'

beforeEach(() => {
  engine.cancelTransition()
  useEntities.setState({ instants: [], spans: [] })
  useView.setState(initialViewState())
  useUi.setState({ timeInput: null, tagMenu: null })
})

const cursorMode = () => useView.setState({ viewFocusMode: 'cursor', timeCenter: engine.getFrame().center })

describe('NowTag', () => {
  it('shows NOW and the clock with seconds', () => {
    render(<NowTag />)
    expect(screen.getByText('NOW')).toBeInTheDocument()
    expect(screen.getByText(formatClockCompact(engine.getFrame().now, true))).toBeInTheDocument()
  })

  it('is named by its caption and readout', () => {
    render(<NowTag />)
    const now = engine.getFrame().now
    expect(screen.getByRole('button', { name: `NOW ${formatClockCompact(now, true)}` })).toBeInTheDocument()
  })

  it('saves an instant at Now on double-click and opens its name', () => {
    render(<NowTag />)
    fireEvent.doubleClick(screen.getByRole('button', { name: /^now/i }))
    const [inst] = useEntities.getState().instants
    expect(inst).toBeDefined()
    expect(useView.getState().editingInstantId).toBe(inst.id)
  })

  it('opens its tools on click: save as favorite, set a time', () => {
    render(<NowTag />)
    fireEvent.click(screen.getByRole('button', { name: /^now/i }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Save as favorite' }))
    expect(useEntities.getState().instants[0].favorite).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: /^now/i }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Set cursor to a time…' }))
    expect(screen.getByRole('dialog', { name: 'Set cursor time' })).toBeInTheDocument()
  })
})

describe('CursorTag', () => {
  it('is hidden while following Now', () => {
    render(<CursorTag />)
    expect(screen.queryByRole('button', { name: /^Cursor/ })).toBeNull()
  })

  it('shows its time and its offset from Now', () => {
    cursorMode()
    render(<CursorTag />)
    expect(screen.getByText(/^Now [+-]/)).toBeInTheDocument()
  })

  it('adds the offset from the selected instant', () => {
    const id = entities.createInstant(engine.getFrame().now - 60_000, 'Rice')
    useView.setState({ currentSelectedInstantId: id })
    cursorMode()
    render(<CursorTag />)
    expect(screen.getByText(/^Rice [+-]/)).toBeInTheDocument()
  })

  it('ignores a selection that no longer exists', () => {
    useView.setState({ currentSelectedInstantId: 'deleted' })
    cursorMode()
    render(<CursorTag />)
    expect(screen.getAllByText(/[+-]\d/)).toHaveLength(1)
  })

  it('saves spans and locks from its tools', () => {
    cursorMode()
    render(<CursorTag />)
    fireEvent.click(screen.getByRole('button', { name: /^Cursor/ }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Lock offset to Now' }))
    expect(useView.getState()).toMatchObject({ cursorLocked: true, viewFocusMode: 'cursor' })
    fireEvent.click(screen.getByRole('button', { name: /^Cursor/ }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Save span to Now' }))
    expect(useEntities.getState().spans).toHaveLength(1)
  })

  it('saves an instant at the cursor on double-click', () => {
    cursorMode()
    render(<CursorTag />)
    fireEvent.doubleClick(screen.getByRole('button', { name: /^Cursor/ }))
    expect(useEntities.getState().instants).toHaveLength(1)
  })
})

describe('liveTagsCollide', () => {
  it('is true within the clearance on either side, false beyond', () => {
    expect(liveTagsCollide(500, 500, 100)).toBe(true)
    expect(liveTagsCollide(401, 500, 100)).toBe(true)
    expect(liveTagsCollide(599, 500, 100)).toBe(true)
    expect(liveTagsCollide(400, 500, 100)).toBe(false)
    expect(liveTagsCollide(600, 500, 100)).toBe(false)
  })
})
```

In `src/domain/spans.test.ts`, replace the test `'prioritizes the focused instant in instant mode and skips the focused span'` with:

```ts
  it('prioritizes the focused instant in instant mode', () => {
    const lanes = savedSpanLanes({ ...base, focusMode: 'instant', focusedInstantId: 'c' })
    expect(lanes.map(s => [s.span.id, s.priority])).toEqual([['ac', 0], ['bc', 0]])
  })
  it('puts the focused span first and marks it', () => {
    const lanes = savedSpanLanes({ ...base, focusMode: 'span', focusedSpanId: 'ab' })
    expect(lanes.map(s => [s.span.id, s.focused])).toEqual([['ab', true], ['ac', false], ['bc', false]])
  })
```

In `src/components/timeline/geometry.test.ts`, change `expect(lanesTop()).toBe(312)` to `expect(lanesTop()).toBe(GEOMETRY.chipTop + GEOMETRY.chipRow + 14)`.

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run src/components/timeline/LiveTags.test.tsx src/domain/spans.test.ts src/components/timeline/geometry.test.ts`
Expected: FAIL. `./LiveTags.tsx` cannot be resolved, the focused span is skipped, and the lanes still start at 312.

- [ ] **Step 3: Shared dismiss hook, UI state, `nowTime`**

Create `src/hooks/usePopoverDismiss.ts`:

```ts
// Closes a popover or menu on Escape or a press outside `ref` (capture phase, so it
// runs before the press does anything else).
import { useEffect, useRef } from 'react'
import type { RefObject } from 'react'

export function usePopoverDismiss(ref: RefObject<HTMLElement | null>, onDismiss: () => void, enabled = true) {
  const dismissRef = useRef(onDismiss)
  dismissRef.current = onDismiss
  useEffect(() => {
    if (!enabled) return
    const onDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) dismissRef.current()
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') dismissRef.current() }
    document.addEventListener('pointerdown', onDown, true)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onDown, true)
      document.removeEventListener('keydown', onKey)
    }
  }, [ref, enabled])
}
```

In `src/components/timeline/TimeEntryPopover.tsx`, delete the local `usePopoverDismiss` function and add `import { usePopoverDismiss } from '../../hooks/usePopoverDismiss.ts'`. Remove `useEffect` from the React import only if it becomes unused (`Fields` still uses it).

Replace `src/store/ui.ts` with:

```ts
// Transient UI state that isn't part of the timeline model.
import { create } from 'zustand'

export type ListTab = 'instants' | 'favorites' | 'spans'

/** Which time-entry popover is open, if any. */
export type TimeInputTarget =
  /** Cursor offset from Now, from the Cursor tag's tools. */
  | { kind: 'duration'; reference: 'now' }
  /** Cursor offset from the selected instant, from the Cursor tag's tools. */
  | { kind: 'duration'; reference: 'selected' }
  /** Wall-clock time for the cursor, from the Now or Cursor tag's tools. */
  | { kind: 'clock'; anchor: 'now' | 'cursor' }

/** A live tag whose tools menu is open. */
export type TagMenu = 'now' | 'cursor'

export interface UiState {
  listTab: ListTab
  timeInput: TimeInputTarget | null
  tagMenu: TagMenu | null
}

export const useUi = create<UiState>(() => ({
  listTab: 'instants',
  timeInput: null,
  tagMenu: null,
}))

export const ui = {
  setListTab: (listTab: ListTab) => useUi.setState({ listTab }),
  openTimeInput: (timeInput: TimeInputTarget) => useUi.setState({ timeInput, tagMenu: null }),
  closeTimeInput: () => useUi.setState({ timeInput: null }),
  toggleTagMenu: (which: TagMenu) => useUi.setState(s => ({ tagMenu: s.tagMenu === which ? null : which, timeInput: null })),
  closeTagMenu: () => useUi.setState({ tagMenu: null }),
}
```

In `src/store/actions.ts`, after `export const cursorTime = () => frame().center`, add:

```ts
/** Now, as currently displayed. */
export const nowTime = () => frame().now
```

- [ ] **Step 4: ArrowTag and TagMenu**

Create `src/components/timeline/ArrowTag.tsx`:

```tsx
// A live marker's readout: a box on the live side of the axis with an arrowhead
// (inward-curved edges) whose tip touches the axis. Slot 1 lifts the box one
// step further from the axis when it would overlap another tag; the arrowhead
// stays on the axis.
import { useRef } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import { usePopoverDismiss } from '../../hooks/usePopoverDismiss.ts'

/** Points down, tip at (9,18); the sides and back curve inward. */
const ARROW_PATH = 'M9 18 Q10.5 8 17 1 Q9 5 1 1 Q7.5 8 9 18 Z'

export function ArrowTag({ srName, hint, slot, onClick, onDoubleClick, menuOpen, onDismissMenu, menu, popover, children }: {
  /**
   * Name read before the visible readout when the readout doesn't say what the tag
   * is ("Cursor"). The readout stays in the accessible name, so it is announced.
   */
  srName?: string
  /** Tooltip: what tapping and double-tapping do. */
  hint: string
  slot: 0 | 1
  onClick: () => void
  onDoubleClick: () => void
  menuOpen: boolean
  onDismissMenu: () => void
  menu?: ReactNode
  popover?: ReactNode
  children: ReactNode
}) {
  const ref = useRef<HTMLDivElement>(null)
  usePopoverDismiss(ref, onDismissMenu, menuOpen)
  return (
    <>
      <svg className="tl-tag__arrow" viewBox="0 0 18 18" aria-hidden><path d={ARROW_PATH} /></svg>
      <div ref={ref} className="tl-tag" style={{ '--slot': slot } as CSSProperties}>
        <button
          type="button"
          className="tl-tag__box glow-box glow-text"
          title={hint}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          onClick={onClick}
          onDoubleClick={onDoubleClick}
        >
          {srName && <span className="sr-only">{srName} </span>}
          {children}
        </button>
        {menuOpen && menu}
        {popover}
      </div>
    </>
  )
}
```

Create `src/components/timeline/TagMenu.tsx`:

```tsx
// The tools menu that opens from a live tag. Choosing an item closes the menu.
import type { ComponentType, SVGProps } from 'react'

export interface TagMenuItem {
  label: string
  icon: ComponentType<SVGProps<SVGSVGElement>>
  onSelect: () => void
}

const stop = (e: { stopPropagation: () => void }) => e.stopPropagation()

export function TagMenu({ label, items, onClose }: { label: string; items: TagMenuItem[]; onClose: () => void }) {
  return (
    <div className="menu tl-tag__menu glow-box" role="menu" aria-label={label} data-no-pan onPointerDown={stop} onClick={stop} onDoubleClick={stop}>
      {items.map(item => (
        <button
          key={item.label}
          type="button"
          role="menuitem"
          className="menu__item tl-tag__menu-item"
          onClick={() => { onClose(); item.onSelect() }}
        >
          <item.icon aria-hidden className="tl-tag__menu-icon" />
          {item.label}
        </button>
      ))}
    </div>
  )
}
```

- [ ] **Step 5: The live tags**

Create `src/components/timeline/LiveTags.tsx`:

```tsx
// Now and the Cursor as arrow tags on the live side of the axis. A tap opens the
// tag's tools; a double-tap saves an instant there.
import { StarIcon as StarOutline } from '@heroicons/react/24/outline'
import { ClockIcon, LockClosedIcon, LockOpenIcon, MapPinIcon, PlusSmallIcon } from '@heroicons/react/20/solid'
import { useFrameValue } from '../../engine/hooks.ts'
import { LiveText } from '../../engine/LiveText.tsx'
import type { LiveTextContext } from '../../engine/LiveText.tsx'
import { chipName, durationShowsMillis, formatClockCompact, formatSignedDuration } from '../../domain/format.ts'
import { useEntities } from '../../store/entities.ts'
import { useView } from '../../store/view.ts'
import { ui, useUi } from '../../store/ui.ts'
import * as act from '../../store/actions.ts'
import { ArrowTag } from './ArrowTag.tsx'
import { Marker } from './Marker.tsx'
import { TagMenu } from './TagMenu.tsx'
import type { TagMenuItem } from './TagMenu.tsx'
import { ClockPopover, DurationPopover } from './TimeEntryPopover.tsx'
import { GEOMETRY } from './geometry.ts'

/** The Cursor tag moves out a slot when it would overlap the Now tag (spec C14). */
export const liveTagsCollide = (nowPos: number, cursorPos: number, clearancePx: number) => Math.abs(nowPos - cursorPos) < clearancePx

/** Longest name shown in the Cursor tag's offset line. */
const NAME_MAX = 10
const shortName = (name: string) => (name.length > NAME_MAX ? `${name.slice(0, NAME_MAX - 1)}…` : name)

function offsetText(name: string, ms: number, ctx: LiveTextContext) {
  if (durationShowsMillis(ms)) ctx.fast()
  return `${name} ${formatSignedDuration(ms)}`
}

function clockPopover(anchor: 'now' | 'cursor') {
  return (
    <ClockPopover
      initialTs={anchor === 'now' ? act.nowTime() : act.cursorTime()}
      onCancel={ui.closeTimeInput}
      onSubmit={(h, m, s, pm) => { act.applyClockInput(h, m, s, pm); ui.closeTimeInput() }}
    />
  )
}

export function NowTag() {
  const focused = useView(s => s.viewFocusMode === 'now')
  const menuOpen = useUi(s => s.tagMenu === 'now')
  const clockOpen = useUi(s => s.timeInput?.kind === 'clock' && s.timeInput.anchor === 'now')
  const items: TagMenuItem[] = [
    { label: 'Save as favorite', icon: StarOutline, onSelect: () => act.createInstantAndEdit(act.nowTime(), { favorite: true }) },
    { label: 'Set cursor to a time…', icon: ClockIcon, onSelect: () => ui.openTimeInput({ kind: 'clock', anchor: 'now' }) },
  ]
  return (
    <Marker className={`is-now${focused ? ' is-focused' : ''}${menuOpen || clockOpen ? ' has-popover' : ''}`} ariaLabel="Now" getPos={f => f.pos(f.now)}>
      <ArrowTag
        hint="Tap for tools; double-tap to save an instant at Now"
        slot={0}
        onClick={() => ui.toggleTagMenu('now')}
        onDoubleClick={() => { ui.closeTagMenu(); act.createInstantAndEdit(act.nowTime()) }}
        menuOpen={menuOpen}
        onDismissMenu={ui.closeTagMenu}
        menu={<TagMenu label="Now tools" items={items} onClose={ui.closeTagMenu} />}
        popover={clockOpen ? clockPopover('now') : undefined}
      >
        {/* The spaces keep words apart in the accessible name; flex layout ignores them. */}
        <span className="tl-tag__caption">NOW</span>{' '}
        <LiveText compute={f => formatClockCompact(f.now, true)} />
      </ArrowTag>
    </Marker>
  )
}

export function CursorTag() {
  const visible = useView(s => s.viewFocusMode === 'cursor' && !s.moveMode)
  const locked = useView(s => s.cursorLocked)
  const selectedId = useView(s => s.currentSelectedInstantId)
  const selected = useEntities(s => s.instants.find(i => i.id === selectedId))
  const menuOpen = useUi(s => s.tagMenu === 'cursor')
  const timeInput = useUi(s => s.timeInput)
  const slot = useFrameValue(f => (liveTagsCollide(f.pos(f.now), f.mainSize / 2, GEOMETRY.tagClearance) ? 1 : 0))
  if (!visible) return null

  const name = selected ? shortName(chipName(selected.label)) : ''
  const items: TagMenuItem[] = [
    { label: locked ? 'Unlock from Now' : 'Lock offset to Now', icon: locked ? LockClosedIcon : LockOpenIcon, onSelect: act.toggleCursorLock },
    { label: 'Save span to Now', icon: MapPinIcon, onSelect: () => act.saveSpanRefs('center', 'now') },
    ...(selected ? [{ label: `Save span to ${name}`, icon: MapPinIcon, onSelect: () => act.saveSpanRefs(selected.tsEpochMs, 'center') }] : []),
    { label: 'Type a time…', icon: ClockIcon, onSelect: () => ui.openTimeInput({ kind: 'clock', anchor: 'cursor' }) },
    { label: 'Offset from Now…', icon: PlusSmallIcon, onSelect: () => ui.openTimeInput({ kind: 'duration', reference: 'now' }) },
    ...(selected ? [{ label: `Offset from ${name}…`, icon: PlusSmallIcon, onSelect: () => ui.openTimeInput({ kind: 'duration', reference: 'selected' }) }] : []),
    { label: 'Save as favorite', icon: StarOutline, onSelect: () => act.createInstantAndEdit(act.cursorTime(), { favorite: true }) },
  ]

  let popover = null
  if (timeInput?.kind === 'clock' && timeInput.anchor === 'cursor') popover = clockPopover('cursor')
  else if (timeInput?.kind === 'duration' && (timeInput.reference === 'now' || selected)) {
    const reference = timeInput.reference
    popover = (
      <DurationPopover
        title={reference === 'now' ? 'Offset from Now' : `Offset from ${name}`}
        initialMs={act.cursorTime() - (reference === 'now' ? act.nowTime() : selected!.tsEpochMs)}
        onCancel={ui.closeTimeInput}
        onSubmit={text => { if (act.applyDurationInput(text, reference)) ui.closeTimeInput() }}
      />
    )
  }

  return (
    <Marker className={`is-cursor${menuOpen || popover ? ' has-popover' : ''}`} ariaLabel="Cursor" getPos={f => f.mainSize / 2}>
      <ArrowTag
        srName="Cursor"
        hint="Tap for tools; double-tap to save an instant here"
        slot={slot}
        onClick={() => ui.toggleTagMenu('cursor')}
        onDoubleClick={() => { ui.closeTagMenu(); act.createInstantAndEdit(act.cursorTime()) }}
        menuOpen={menuOpen}
        onDismissMenu={ui.closeTagMenu}
        menu={<TagMenu label="Cursor tools" items={items} onClose={ui.closeTagMenu} />}
        popover={popover ?? undefined}
      >
        <LiveText compute={f => formatClockCompact(f.center, true)} />{' '}
        <LiveText className="tl-tag__sub" compute={(f, ctx) => offsetText('Now', f.center - f.now, ctx)} />
        {selected && (
          <>
            {' '}
            <LiveText className="tl-tag__sub" compute={(f, ctx) => offsetText(name, f.center - selected.tsEpochMs, ctx)} />
          </>
        )}
      </ArrowTag>
    </Marker>
  )
}
```

- [ ] **Step 6: Final geometry, lanes, Timeline**

Replace `GEOMETRY` and `lanesTop` in `src/components/timeline/geometry.ts` with:

```ts
export const GEOMETRY = {
  /** The axis line. */
  axis: 112,
  /** Arrowhead height; live tag boxes sit just above it. */
  tagArrow: 14,
  /** Distance between the two live tag slots. */
  tagSlot: 48,
  /** Main-axis distance under which the Now and Cursor tags would overlap. */
  tagClearance: 100,
  /** Top of the first saved chip row, and the row pitch. */
  chipTop: 128,
  chipRow: 34,
  /** Where bottom lanes start: one chip row plus a gap (the overlap layout adds rows in phase 3). */
  lanes: 128 + 34 + 14,
} as const
```

and `export const lanesTop = (): number => GEOMETRY.lanes`.

In `src/domain/spans.ts`:
- Add `focused: boolean` to `LaneSpan`, with the doc comment `/** The focused saved span (span focus mode); drawn first and emphasized. */`.
- In `savedSpanLanes`, replace the line `if (focusMode === 'span' && focusedSpanId === r.span.id) continue // drawn in the top lane` with:

```ts
    if (focusMode === 'span' && focusedSpanId === r.span.id) {
      focused.push({ ...r, priority: 0, focused: true })
      continue
    }
```

  declare `const focused: LaneSpan[] = []` next to `const out: LaneSpan[] = []`, change `out.push({ ...r, priority })` to `out.push({ ...r, priority, focused: false })`, and change the return to:

```ts
  return [...focused, ...out.sort((x, y) => x.priority - y.priority || mid(x) - mid(y))]
```

  Also update the function's doc comment: drop "drawn in the top lane" and add "The focused span comes first."

In `src/components/timeline/Lanes.tsx`:
- Delete `TopLanes`, `SignedDuration` and the `// Top lanes` section.
- Remove the now-unused imports: `LockClosedIcon`, `LockOpenIcon`, `formatSignedDuration`, `useShallow` (if unused), `useMemo` (if unused), `resolveSpan`, `useEntities`, `ui`, `useUi`, `DurationPopover` and `ReactNode` (if unused). Let `npx eslint .` and `npx tsc -b` confirm.
- In `BottomLanes`, replace the last three lines of the map callback with:

```tsx
        const r = lane.span
        const variant: LaneVariant = r.focused ? 'span' : r.priority === 0 ? 'focused' : r.priority === 1 ? 'selected' : 'span'
        const controls = r.focused || r.priority <= 1 || selectedSpanId === r.span.id
        return <SavedSpanLane key={lane.key} r={r} a={lane.a} b={lane.b} top={lane.top} variant={variant} controls={controls} emphasis={r.focused} />
```

- Update the file header to: `// Span lanes below the timeline: implied spans for the selection, then saved spans (the focused one first).`

In `src/components/timeline/InstantColumns.tsx`:
- Delete `ColumnProps`, `Column`, `NowColumn`, `CursorColumn` and the first `// ----` separator line. Keep `CULL_MARGIN_PX`, `starColor` and `bellColor`; the saved chips use them.
- Remove now-unused imports: `ReactNode`, `useRef`, `usePositionMain`, `Frame`, `formatClock12h`, `ui`, `useUi`, `ClockPopover`.
- Update the file header to: `// Saved instant markers: a line plus one compact chip, moved along the time axis by the engine.`

In `src/components/timeline/Timeline.tsx`:
- Change the imports to:

```tsx
import { SavedInstantColumns } from './InstantColumns.tsx'
import { CursorTag, NowTag } from './LiveTags.tsx'
import { BottomLanes } from './Lanes.tsx'
```

- In the JSX, replace `<NowColumn />`, `<SavedInstantColumns />`, `<CursorColumn />`, `<TopLanes />` with:

```tsx
      <SavedInstantColumns />
      <NowTag />
      <CursorTag />
```

- [ ] **Step 7: Style the tags; remove the old rows**

In `src/styles/timeline.css`:
- `.tl-date`: change `top: calc(var(--tl-axis) - 58px);` to `top: 10px;`.
- Delete the rules `.tl-col__time-wrap`, `.tl-col__row`, `.tl-col__row--label`, `.tl-col__row--time`, `.tl-col__row--actions`, `.tl-col__icons`, and `.tl-col.is-now .chip--label, .tl-col.is-cursor .chip--label`.
- Add:

```css
/* --- Live tags (Now, Cursor) ------------------------------------------- */

.tl-tag__arrow {
  position: absolute;
  left: -9px;
  top: calc(var(--tl-axis) - var(--tl-tag-arrow));
  width: 18px;
  height: var(--tl-tag-arrow);
  fill: var(--accent);
  filter:
    drop-shadow(0 0 calc(3px * var(--glow)) var(--halo))
    drop-shadow(0 0 calc(8px * var(--glow)) color-mix(in srgb, var(--halo) 60%, transparent));
  pointer-events: none;
}
.tl-tag {
  position: absolute;
  left: 0;
  bottom: calc(100% - var(--tl-axis) + var(--tl-tag-arrow) - 1px + var(--slot, 0) * var(--tl-tag-slot));
  transform: translateX(-50%);
  display: flex;
  flex-direction: column;
  align-items: center;
}
.tl-tag__box {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  padding: 4px 9px;
  border-radius: var(--radius-chip);
  background: var(--surface);
  color: var(--ink);
  font: 700 15px/1.1 var(--font-mono);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.tl-tag__box:hover { background: var(--surface-raised); }
.tl-tag__caption { font: 800 10px/1 var(--font-ui); letter-spacing: 0.14em; color: var(--accent); }
.tl-tag__sub { font: 600 12px/1.1 var(--font-mono); color: var(--ink-dim); }
.tl-tag__menu { left: 50%; transform: translateX(-50%); }
.tl-tag__box .sr-only {
  position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px;
  overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0;
}
.tl-tag__menu-item { display: flex; align-items: center; gap: 8px; white-space: nowrap; }
.tl-tag__menu-icon { width: 16px; height: 16px; flex: none; color: var(--accent); }
```

- [ ] **Step 8: Run the tests**

Run: `npx vitest run src/components/timeline src/domain/spans.test.ts`
Expected: PASS. This covers `LiveTags.test.tsx` (11 tests), the updated `spans.test.ts`, `geometry.test.ts` and `InstantColumns.test.tsx`.

- [ ] **Step 9: Check it in the browser**

Open http://localhost:5173 and check each behavior:
- Now is a red tag above the axis (caption "NOW" plus the clock), with its arrow tip on the axis.
- Dragging shows the cyan Cursor tag with its time and "Now ±…". With an instant selected, a third line shows its offset.
- Dragging the cursor next to Now lifts the Cursor tag one slot.
- Tapping a tag opens its tools. Choosing a tool works, and pressing Escape or tapping outside closes the menu.
- Double-tapping a tag saves an instant and opens its name.
- Focusing a saved span (double-click its chip) draws it as the first, emphasized lane below.
- Nothing remains above the axis except the date, ticks and tags.

- [ ] **Step 10: Run everything and commit**

Run: `npx vitest run && npx tsc -b && npx eslint .` (green). Then:

```bash
git add -A src
git commit -m "Now and the Cursor become arrow tags above the axis

Tags point at the axis with an inward-curved arrowhead; tap for tools (lock,
save span, type a time or offset, save as favorite), double-tap to save an
instant. The Cursor tag shows its offset from Now and from the selection and
steps out a slot near Now. The two top lanes are gone; a focused saved span
is drawn as the first bottom lane."
```

---

### Task 8: Short span chips

**Files:**
- Create: `src/components/timeline/Lanes.test.tsx`
- Modify: `src/components/timeline/Lanes.tsx`, `src/components/timeline/useBottomLanes.ts`, `src/domain/spans.ts` (+ test, if `spanDescription` becomes unused), `src/styles/timeline.css`

**Interfaces:**
- Consumes: `formatDurationHMS`, `durationShowsMillis`, `displayName`, `spanHeader`, `spanEndName`, `isFavoriteNowSpan`.
- Produces:
  - Span chips show the duration only ("26:13").
  - A named span shows "Name · 26:13".
  - The selected span shows "Start → End · 26:13".
  - `BottomLane` loses its `tall` field, and every lane is `LANE_HEIGHT` tall.

- [ ] **Step 1: Write the failing tests**

Create `src/components/timeline/Lanes.test.tsx`:

```tsx
import { act, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { BottomLanes } from './Lanes.tsx'
import type { BottomLane } from './useBottomLanes.ts'
import { engine } from '../../engine/viewportEngine.ts'
import { entities, useEntities } from '../../store/entities.ts'
import { initialViewState, useView } from '../../store/view.ts'
import { resolveSpan } from '../../domain/spans.ts'
import { MINUTE, SECOND } from '../../domain/time.ts'

beforeEach(() => {
  engine.cancelTransition()
  useEntities.setState({ instants: [], spans: [] })
  useView.setState(initialViewState())
})

/** A saved span from 30 to 3m47s ago (26:13 long), as useBottomLanes would place it. */
function savedLane(label = ''): { lane: BottomLane; spanId: string } {
  const now = engine.getFrame().now
  const a = entities.createInstant(now - 30 * MINUTE, 'Rice')
  const b = entities.createInstant(now - 3 * MINUTE - 47 * SECOND, 'Done')
  const spanId = entities.createSpan(a, b, label, { visible: true })
  const byId = new Map(useEntities.getState().instants.map(i => [i.id, i]))
  const r = resolveSpan(entities.getSpan(spanId)!, byId)!
  return { spanId, lane: { key: spanId, kind: 'saved', span: { ...r, priority: 2, focused: false }, a: r.start.tsEpochMs, b: r.end!.tsEpochMs, top: 200 } }
}

describe('span chips', () => {
  it('show only the duration', () => {
    const { lane } = savedLane()
    render(<BottomLanes lanes={[lane]} />)
    expect(screen.getByText('26:13')).toBeInTheDocument()
    expect(screen.queryByText(/Rice/)).toBeNull()
  })

  it('show the name of a named span', () => {
    const { lane } = savedLane('Cooking')
    render(<BottomLanes lanes={[lane]} />)
    expect(screen.getByText('Cooking')).toBeInTheDocument()
  })

  it('show the endpoints when selected', () => {
    const { lane, spanId } = savedLane()
    render(<BottomLanes lanes={[lane]} />)
    act(() => useView.setState({ selectedSpanId: spanId }))
    expect(screen.getByText('Rice → Done')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run src/components/timeline/Lanes.test.tsx`
Expected: FAIL. TypeScript reports `tall` missing from the lane object, and the chip text is "Done 26:13 AFTER Rice", not "26:13".

- [ ] **Step 3: Implement short chips**

In `src/components/timeline/Lanes.tsx`:
- Replace the `Description` component with:

```tsx
/** Live length of a span ("26:13"); asks for continuous frames while showing ms. */
function Duration({ a, b }: { a: TimeRef; b: TimeRef }) {
  const live = a === 'now' || b === 'now' || a === 'center' || b === 'center'
  return (
    <LiveText
      compute={(f, ctx) => {
        const ms = Math.abs(resolveTimeRef(b, f.now, f.center) - resolveTimeRef(a, f.now, f.center))
        if (live && durationShowsMillis(ms)) ctx.fast()
        return formatDurationHMS(ms)
      }}
    />
  )
}
```

- Replace `SavedSpanChip` with:

```tsx
function SavedSpanChip({ r, a, b, editing, expanded }: { r: ResolvedSpan; a: TimeRef; b: TimeRef; editing: boolean; expanded: boolean }) {
  const header = spanHeader(r)
  const name = expanded ? `${displayName(r.start.label)} → ${spanEndName(r)}` : header
  return (
    <span className="span-chip__text">
      {editing ? (
        <InlineInput
          initial={r.span.label}
          ariaLabel="Span name"
          placeholder="Span name"
          onCommit={v => act.renameSpan(r.span.id, v)}
          onCancel={() => view.editSpan(null)}
        />
      ) : name ? (
        <>
          <span className="span-chip__name" title={name}>{name}</span>
          <span className="span-chip__sep" aria-hidden>·</span>
        </>
      ) : null}
      <Duration a={a} b={b} />
      {isFavoriteNowSpan(r) && <StarSolid className="span-chip__star" aria-label="Favorite" />}
    </span>
  )
}
```

- In `SavedSpanLane`, add `const expanded = useView(s => s.selectedSpanId === r.span.id)` next to `editing`, and pass `expanded={expanded}` to `SavedSpanChip`.
- In `BottomLanes`, change both implied-lane chips to `chip={<span className="span-chip__text"><Duration a={lane.a} b="now" /></span>}` for `selected-now` and `chip={<span className="span-chip__text"><Duration a={lane.a} b={lane.b} /></span>}` for `secondary`.
- Add `formatDurationHMS` to the format import and drop `spanDescription` from the spans import.

In `src/components/timeline/useBottomLanes.ts`:
- Remove `tall` from `LaneBase` and from every object pushed into `out`.
- Delete `LANE_LABELED`, rename `LANE_SHORT` to `LANE_HEIGHT`, and in the placement loop use `const h = LANE_HEIGHT`.
- Remove `spanHeader` and `editingSpanId` if they become unused. (`editingSpanId` was only used for `tall`; remove it from the `useShallow` selector too.)

Run `grep -rn "spanDescription" src`. If only `spans.ts` and `spans.test.ts` remain, delete `spanDescription` from `src/domain/spans.ts` and its test `'describes forward, backward and until-Now spans'` (along with its `describe` block if that empties it), and drop it from the test's import.

In `src/styles/timeline.css`, replace the `.span-chip__header` rule with:

```css
.span-chip__name { min-width: 0; max-width: 160px; overflow: hidden; text-overflow: ellipsis; font: 650 13.5px/1.1 var(--font-ui); }
.span-chip__sep { color: var(--ink-faint); }
```

- [ ] **Step 4: Run the tests and look at it**

Run: `npx vitest run src/components/timeline src/domain`. Expected: PASS.
Open http://localhost:5173:
- Span chips show the duration only.
- Clicking a span chip shows "Start → End · duration" with its tools.
- A named span shows its name.

- [ ] **Step 5: Run everything and commit**

Run: `npx vitest run && npx tsc -b && npx eslint .` (green). Then:

```bash
git add -A src
git commit -m "Span chips show their duration; names and endpoints on selection"
```

---

### Task 9: Quieter defaults for favorite lanes and the Secondary→Selected span

**Files:**
- Create: `src/store/migrations.ts`, `src/store/migrations.test.ts`
- Modify: `src/store/settings.ts`, `src/store/settings.test.ts`, `src/store/view.ts:61`, `src/domain/spans.ts`, `src/domain/spans.test.ts`, `src/components/timeline/useBottomLanes.ts`, `src/components/panels/SettingsPanel.tsx`, `src/main.tsx`, `docs/ARCHITECTURE.md` (state table)

**Interfaces:**
- Consumes: `view.setImpliedVisible`.
- Produces:
  - Settings: `FavoriteLanes = 'selected' | 'always'`, `useSettings` fields `favoriteLanes` and `layoutVersion`, and `settings.setFavoriteLanes` / `settings.setLayoutVersion`.
  - `runMigrations()`.
  - `savedSpanLanes` option `favoriteLanes`.

- [ ] **Step 1: Write the failing tests**

Create `src/store/migrations.test.ts`:

```ts
import { beforeEach, describe, expect, it } from 'vitest'
import { runMigrations } from './migrations.ts'
import { useSettings } from './settings.ts'
import { initialViewState, useView } from './view.ts'

beforeEach(() => {
  useView.setState({ ...initialViewState(), showImpliedSelectedPrev: true })
  useSettings.setState({ layoutVersion: 0 })
})

describe('runMigrations', () => {
  it('switches the Secondary→Selected span off once for layout v2', () => {
    runMigrations()
    expect(useView.getState().showImpliedSelectedPrev).toBe(false)
    expect(useSettings.getState().layoutVersion).toBe(2)
  })

  it('leaves a later choice alone', () => {
    runMigrations()
    useView.setState({ showImpliedSelectedPrev: true })
    runMigrations()
    expect(useView.getState().showImpliedSelectedPrev).toBe(true)
  })
})
```

In `src/store/settings.test.ts`, update the state expectations so they include the new fields:
- `{ glow: 1, tunables: {} }` becomes `{ glow: 1, tunables: {}, favoriteLanes: 'selected', layoutVersion: 0 }`. This happens twice: the defaults test and the unreadable-storage test.
- The loaded-values test becomes `toEqual({ glow: 1.5, tunables: { chipRowsMax: 2, chipGapPx: 40 }, favoriteLanes: 'selected', layoutVersion: 0 })`.
- The keep-glow test becomes `toEqual({ glow: 2, tunables: { chipGapPx: 10 }, favoriteLanes: 'selected', layoutVersion: 0 })`.

Then add:

```ts
  it('loads and saves the favorite-lanes choice and layout version', async () => {
    localStorage.setItem(KEY, JSON.stringify({ favoriteLanes: 'always', layoutVersion: 2 }))
    const { useSettings, settings } = await loadStore()
    expect(useSettings.getState()).toMatchObject({ favoriteLanes: 'always', layoutVersion: 2 })
    settings.setFavoriteLanes('selected')
    expect(saved().favoriteLanes).toBe('selected')
  })

  it('falls back on unknown favorite-lanes values', async () => {
    localStorage.setItem(KEY, JSON.stringify({ favoriteLanes: 'sometimes', layoutVersion: 'x' }))
    const { useSettings } = await loadStore()
    expect(useSettings.getState()).toMatchObject({ favoriteLanes: 'selected', layoutVersion: 0 })
  })
```

In `src/domain/spans.test.ts`, inside `describe('savedSpanLanes')`:
- Add `favoriteLanes: 'selected' as const` to `base`.
- Append:

```ts
  it('hides lanes for favorites to Now unless selected, or always on', () => {
    const fav: InstantRecord = { id: 'f', tsEpochMs: HOUR, label: 'Rice', favorite: true }
    const favById = new Map([...byId, ['f', fav]])
    const favSpan = resolveSpan({ id: 'fn', startInstantId: 'f', endInstantId: '__NOW__', label: '', visible: true, endIsNow: true }, favById)!
    const all = { ...base, resolved: [...resolved, favSpan] }
    expect(savedSpanLanes(all).map(s => s.span.id)).not.toContain('fn')
    expect(savedSpanLanes({ ...all, selectedInstantId: 'f' }).map(s => s.span.id)).toContain('fn')
    expect(savedSpanLanes({ ...all, favoriteLanes: 'always' }).map(s => s.span.id)).toContain('fn')
  })
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run src/store src/domain/spans.test.ts`
Expected: FAIL. `./migrations.ts` is missing, the settings shapes differ, and the favorite lane is still shown.

- [ ] **Step 3: Settings fields**

In `src/store/settings.ts`:
- Add after the imports:

```ts
/** When favorites and alarms get a lane to Now: only while selected (default), or always. */
export type FavoriteLanes = 'selected' | 'always'
```

- Extend `SettingsState` with:

```ts
  favoriteLanes: FavoriteLanes
  /** Last layout version whose one-time migrations ran (see store/migrations.ts). */
  layoutVersion: number
```

- Extend the initial state with:

```ts
  favoriteLanes: loaded.favoriteLanes === 'always' ? 'always' : 'selected',
  layoutVersion: typeof loaded.layoutVersion === 'number' && Number.isFinite(loaded.layoutVersion) ? loaded.layoutVersion : 0,
```

- Change the saver to `useSettings.subscribe(s => saveJson(SETTINGS_KEY, { glow: s.glow, tunables: s.tunables, favoriteLanes: s.favoriteLanes, layoutVersion: s.layoutVersion }))`.
- Add to `settings`:

```ts
  setFavoriteLanes: (favoriteLanes: FavoriteLanes) => useSettings.setState({ favoriteLanes }),
  setLayoutVersion: (layoutVersion: number) => useSettings.setState({ layoutVersion }),
```

- [ ] **Step 4: Migration, default and lane rule**

Create `src/store/migrations.ts`:

```ts
// One-time changes to saved state when a release changes a default. Runs at startup.
import { settings, useSettings } from './settings.ts'
import { view } from './view.ts'

export function runMigrations() {
  // Layout v2: the Secondary→Selected span becomes opt-in (spec C9).
  if (useSettings.getState().layoutVersion < 2) {
    view.setImpliedVisible('selected-prev', false)
    settings.setLayoutVersion(2)
  }
}
```

In `src/main.tsx`, add `import { runMigrations } from './store/migrations.ts'` and call `runMigrations()` right after `applySettingsToDocument()`.

In `src/store/view.ts`, change the default `showImpliedSelectedPrev: true,` to `showImpliedSelectedPrev: false,`.

In `src/domain/spans.ts`, add `favoriteLanes: 'selected' | 'always'` to `savedSpanLanes`'s options type and destructuring. Then, right before `if (priority === -1) continue`, add:

```ts
    // Favorites and alarms show time since/until on their chip; their lane to Now
    // appears only when selected or focused, unless the user wants it always.
    if (priority === 2 && isFavoriteNowSpan(r) && favoriteLanes === 'selected') continue
```

In `src/components/timeline/useBottomLanes.ts`:
- Add `import { useSettings } from '../../store/settings.ts'`.
- Add `const favoriteLanes = useSettings(s => s.favoriteLanes)`.
- Pass `favoriteLanes` into `savedSpanLanes({ … })`.
- Add `favoriteLanes` to that `useMemo`'s dependency list.

- [ ] **Step 5: Settings UI and docs**

In `src/components/panels/SettingsPanel.tsx`:
- Add `const favoriteLanes = useSettings(s => s.favoriteLanes)` next to `glow`.
- Insert after the Appearance section:

```tsx
          <section className="settings__group">
            <h3>Timeline</h3>
            <label className="settings__row">
              <span>Lanes for favorites and alarms</span>
              <select value={favoriteLanes} onChange={e => settings.setFavoriteLanes(e.target.value === 'always' ? 'always' : 'selected')}>
                <option value="selected">When selected</option>
                <option value="always">Always</option>
              </select>
            </label>
          </section>
```

In `docs/ARCHITECTURE.md`, change the `useSettings` row's notes to: `Glow, tunables (Settings > Advanced), favorite lanes, layout version for one-time migrations (store/migrations.ts).`

- [ ] **Step 6: Run the tests and look at it**

Run: `npx vitest run src/store src/domain`. Expected: PASS.
Open http://localhost:5173:
- A favorite's lane to Now is gone until you select the favorite.
- Settings > Timeline > "Always" brings the lanes back.
- Selecting an instant after another one doesn't draw the Secondary→Selected span. It can be switched on in the Agenda's spans list as before.

- [ ] **Step 7: Run everything and commit**

Run: `npx vitest run && npx tsc -b && npx eslint .` (green). Then:

```bash
git add -A src docs/ARCHITECTURE.md
git commit -m "Quieter defaults: favorite lanes when selected, Secondary span opt-in

Favorites and alarms show time since/until on their chip; their lane to Now
appears when selected (Settings > Timeline > Always to keep them). The
Secondary-to-Selected span is off by default, switched off once on upgrade."
```

---

## After this plan: phases 3–7 (separate plans)

Each gets its own plan once the previous phase has landed, so each plan is written against the code as it actually is.

- **Phase 3, overlap layout and clusters:**
  - `measureChip` (canvas `measureText`, cached per text) and `useSavedLayout()`, which runs `layoutLabels` inside `useFrameValue` with structural equality.
  - Chips get their `--row` from the layout.
  - "+N" cluster chips (tap zooms to fit their members) and "⟲N" fold badges.
  - Lanes start after the rows actually used.
  - Benchmark pan/zoom.
- **Phase 4, vertical orientation:**
  - Resolve `useLayout` from `shapeClass`, `resolveOrientation` and settings (Orientation, Future goes Down/Up), with a resize listener.
  - Cross-axis CSS keyed on `data-orientation`.
  - Vertical ticks, lanes and chip columns; arrow tags pointing at the axis from the left.
  - Main-axis drags and wheel mapping in `usePanZoom`.
  - Rotate button (bottom-right, `V` hotkey) and the vertical top bar with the date.
- **Phase 5, momentum and tick snap:**
  - Pointer sampling and the glide as an engine frame listener (`releaseVelocity`, `stepGlide`).
  - A touch during a glide stops it without tapping.
  - `nearestFinestTick` in `settleCursor` (setting on by default) with an ease; ± steps and typed times unsnapped.
- **Phase 6, Agenda:**
  - Rename `ListPanel` to `Agenda`.
  - Bottom dock, side dock and drawer from `resolveAgendaPlacement`.
  - ☰ button, the dock/drawer toggle in the tab bar, and the drawer as a focus-trapped dialog.
- **Phase 7, wrap-up:** benchmark both orientations, update ARCHITECTURE.md, and clean up the handoffs.
