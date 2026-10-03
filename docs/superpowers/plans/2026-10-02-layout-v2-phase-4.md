# Layout v2, Phase 4: vertical orientation and the rotate button (brief)

> Spec: `docs/superpowers/specs/2026-10-02-layout-v2-design.md`. Read §2 (Orientation, Geometry, Gestures), §5.2–§5.5, §5.9 (drag and wheel only) and C10, C14, C17, C18.
> Phases 1–3 are done. Already built and tested:
> - Main-axis frames: `f.pos`, `f.mainSize`, `f.crossSize`, `f.orientation`, `f.dir`, and `usePositionMain`, which already translates along y in vertical.
> - `useLayout` store (`orientation`, `dir`, fixed to horizontal for now).
> - `domain/layoutMode.ts`: `shapeClass`, `resolveOrientation`.
> - `layoutLabels` supports `orientation: 'vertical'` (column packing within `crossBudget`).
> - Tunables `autoHysteresis` and `chipColumnsMax`.
>
> Two parts, committed separately. Part A makes orientation real and switchable; part B draws the vertical layout.

## Part A: orientation state, settings, rotate button, gestures

1. **Settings** (`store/settings.ts` and its tests):
   - `orientation: 'auto' | 'horizontal' | 'vertical'`, default `'auto'`.
   - `verticalDir: 'down' | 'up'`, default `'down'` ("future goes down").
   - Both persisted with safe fallbacks on load.
   - Setters `setOrientation` and `setVerticalDir`.
2. **Layout store** (`store/layout.ts`):
   - Add `shape: ShapeClass` and `override: OrientationOverride | null`.
   - A pure `resolveLayout(settings, override, prevShape, w, h, hysteresis)` returns `{ shape, orientation, dir }`. `dir` is 1 in horizontal, and in vertical it's 1 for `'down'` and −1 for `'up'`.
   - `startLayoutTracking()`, called from `main.tsx`, listens to `resize` and `orientationchange` on `window` and to settings changes, and recomputes the store.
   - The rotate action, `act.rotate()` in `store/actions.ts`, sets `override = { orientation: <opposite of current>, shape: <current shape> }`. If that equals what the settings alone would give, it clears the override instead.
   - Switching keeps the center time and the visible time span; the engine does this already because `width` is in ms.
3. **Rotate button** (`components/timeline/RotateButton.tsx`):
   - A round 44px glowing button inside `.timeline` at the bottom-right corner, `data-no-pan`.
   - Heroicons `ArrowPathIcon`, `aria-label="Rotate timeline"`, title "Rotate (V)".
   - Calls `act.rotate`.
   - Hotkey `V` in `hooks/useHotkeys.ts`.
4. **Settings UI:** in Settings > Timeline add "Orientation" (Auto / Horizontal / Vertical) and "Future goes" (Down / Up; applies in vertical).
5. **Gestures** (`hooks/usePanZoom.ts` and its tests):
   - Drags use the main-axis coordinate: `clientX` when `useLayout` says horizontal, `clientY` when vertical. This applies to the threshold and to deltas; the touch rules stay unchanged.
   - Wheel, vertical:
     - `deltaY` pans through a new `act.wheelPan(dPx)` (enter cursor mode if needed, like `beginPan`, then `panByPixels(-dPx)`; no landing snap).
     - Ctrl+wheel zooms; trackpad pinch arrives this way.
   - Wheel, horizontal:
     - `deltaY` zooms (today's behavior).
     - `deltaX` pans through `act.wheelPan`.
     - Ctrl+wheel zooms.
   - Pinch stays unchanged.
6. **Tests:**
   - `resolveLayout` cases: auto portrait → vertical; override lapses on a shape change; `'up'` gives dir −1 in vertical only.
   - `act.rotate` flips the orientation, and a second rotate clears the override.
   - A vertical drag uses `clientY`.
   - Wheel mapping in both orientations.
   - Settings persistence.

   Commit: "Orientation: Auto/Horizontal/Vertical, rotate button (V), main-axis gestures".

## Part B: vertical rendering

The vertical layout is the horizontal one rotated: the live side is on the left, the axis is a vertical line, and saved chips and lanes are on the right. Mockup reference (approved): the axis at x ≈ 84 on a phone, two-line tags right-aligned against the axis with their arrowheads pointing right at it, and chips starting just right of the axis, vertically centered on their horizontal marker lines.

1. **Orientation flag:** `.timeline` gets `data-orientation`. Every cross-axis rule in `timeline.css` gets a vertical variant under `.timeline[data-orientation='vertical']`, where cross offsets map to `left` instead of `top`.
2. **Geometry:** `geometry.ts` gains a vertical set, written by `Timeline` according to orientation:
   - `axis` 84: x of the axis.
   - `tagArrow` 14.
   - `chipStart` 96: x where chip column 0 starts.
   - `laneGap` 18: spacing of span lanes from the right edge inward.
   - `tagSlotV` 64: how far the Cursor tag box moves along the time axis when it collides with Now.

   Keep the horizontal values as they are.
3. **Sizing:**
   - Vertical `.timeline` fills the remaining height (`flex: 1 1 auto; min-height: 0`) at full width.
   - Its height no longer comes from the lanes. `useBottomLanes`'s height only applies in horizontal.
   - The Agenda stays below for now; phase 6 turns it into a drawer on phones. In vertical, cap the Agenda at 30vh so the timeline gets most of the height.
4. **Markers** (`Marker`): in vertical the line is horizontal, across the full width, with the same fade at both ends. `usePositionMain` already moves markers along y.
5. **Ticks** (`TickLayer`): translate along y in vertical. A tick mark is a short horizontal line across the axis, and its label sits left of the axis, right-aligned, under the tags.
6. **Live tags** (`ArrowTag`/`LiveTags`):
   - In vertical, the box sits left of the axis, right-aligned to `axis − tagArrow`, and the arrowhead (the same path, rotated so it points right) touches the axis.
   - Collision in vertical: when the Cursor and Now tags are closer than `tagSlotV` along y, the Cursor box shifts away from Now along y by `tagSlotV`, while its arrowhead stays on its line.
   - Menus and popovers open to the right of the tag, over the chips.
7. **Saved chips:**
   - In vertical, run `layoutLabels` with `orientation: 'vertical'`, `mainExtent` 28 (chip height), `crossExtent` = the measured chip width, `crossBudget` = `crossSize − chipStart − (lanes × laneGap) − 8`, and `maxSlots` = `chipColumnsMax`.
   - A chip's left is `chipStart + crossOffset`, and it's vertically centered on its line.
   - Tools and fold badges sit to the right of the chip.
   - The "+N" chip is placed the same way.
8. **Span lanes:**
   - In vertical, a lane is a vertical bar at `x = crossSize − 12 − i × laneGap`, stacked inward from the right edge.
   - The line's geometry is written along y (`translate3d(0, start)` plus `height`).
   - The chip sits on the inner (left) side of the bar, centered on the visible part of the span.
   - The chevrons point up and down.
   - `spanGeometry` already works in main-axis terms.
9. **Date (C17):** in vertical, the date label sits in a slim top strip above the timeline content.
10. **Tests:**
    - `Timeline` renders `data-orientation="vertical"` when the store says so (use the stubbed `ResizeObserver` pattern from `Timeline.test.tsx`).
    - `SpanLane` writes y transforms in vertical.
    - A vertical chip gets `left = chipStart + crossOffset`.
    - Keep everything existing green.

    Commit: "Vertical layout: axis on the left, tags pointing at it, chips and lanes on the right".

## Done when

The suite, `tsc -b` and `eslint` are green. In a browser at 390×844 (phone portrait) the timeline is vertical on Auto. The rotate button switches to horizontal and back, and a resize past the hysteresis threshold clears the override. Dragging up and down moves through time. The Now and Cursor tags point at the axis from the left. Chips sit right of the axis without overlapping, and lanes run as vertical bars at the right edge. At 1400×900 the app is horizontal and unchanged.
