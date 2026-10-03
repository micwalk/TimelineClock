# Layout v2, Phase 5: momentum and tick snap (brief)

> Spec: `docs/superpowers/specs/2026-10-02-layout-v2-design.md`. Read §2 ("Gestures and momentum", "Snap to ticks") and §5.9.
> Already built and tested:
> - `src/domain/glide.ts`: `releaseVelocity`, `shouldGlide`, `stepGlide`.
> - `src/domain/ticks.ts`: `nearestFinestTick(t, pxPerMs)`.
> - Tunables `glideWindowMs`, `glideStillMs`, `glideMinSpeed`, `glideStopSpeed`, `glideMaxSpeed`, `glideTauMs`, `tickSnapEaseMs`.
> - `usePanZoom` already drags along the main axis.

## Glide

1. **Sampling:** `usePanZoom` records `{ t: performance.now(), pos }` on every drag move along the main axis and keeps only the last `glideWindowMs` (≥ 2 samples).
2. **On release:** after a real drag (not a tap or pinch), compute `v = releaseVelocity(samples, now, { windowMs, stillMs })`.
   - If `shouldGlide(v, glideMinSpeed)`, start a glide.
   - Otherwise call `endPan(landing)` as today.
3. **The glide** is a small controller (`src/hooks/glide.ts`) driven by engine frames:
   - `engine.onFrame` listener, `requestFrame()` while it runs.
   - Each frame: `dt` from `performance.now()`, then `{ v, dPos } = stepGlide(v, dt, tauMs, maxSpeed)`, then `act.panByPixels(dPos)`.
   - When `|v| < glideStopSpeed`, stop and call `act.endPan(landing)`, so the snap happens only where it comes to rest.
   - A second glide replaces the first. The listener is unsubscribed when the glide stops or the hook unmounts.
4. **Stopping a glide:** a `pointerdown` during a glide stops it immediately and marks that press "not a tap". If the press never becomes a drag, swallow its click with the existing one-event click guard. It can still start a new drag.
5. **Scope:** wheel and trackpad scrolling never glide. Glide stays on under prefers-reduced-motion.

## Tick snap

1. **Setting:** `tickSnap: boolean`, default `true`, persisted in `store/settings.ts`, with a toggle in Settings > Timeline: "Snap cursor to ticks".
2. **Where it applies:** in `store/actions.ts` `settleCursor`, which is only used at the end of drags and glides via `endPan`.
   - When the Now/instant landing check finds nothing and `tickSnap` is on, move the cursor to `nearestFinestTick(center, pxPerMs)`.
   - Animate with `engine.beginTransition(getTunables().tickSnapEaseMs)`, then `view.setTimeCenter(tick)`, then `refreshLock()`.
3. **Where it doesn't apply:** `moveCursorBy` (± steps) and typed times never snap. They call `settleCursor` with exact tolerance; give `settleCursor` a `snapToTicks` flag that only `endPan` sets.

## Tests

- Glide controller: a flick that is still moving at release produces several frames of panning that decay, then `endPan`. A release after a pause produces no glide. A `pointerdown` mid-glide stops it and no click reaches a button. Drive frames by calling the registered listener with fake times, or use `vi.useFakeTimers()` together with the engine's timer fallback.
- Actions:
  - `endPan` with no nearby instant lands on the nearest finest tick when `tickSnap` is on, and stays put when it's off.
  - An instant within the landing radius still wins over a tick.
  - `moveCursorBy` never snaps to ticks.
- Settings: `tickSnap` loads, saves and falls back to `true`.

## Done when

The suite, `tsc -b` and `eslint` are green. In the browser, a flick glides and decelerates; tapping during a glide stops it without selecting anything; and the cursor comes to rest on a tick, or on an instant or Now when close. Commit as "Momentum: flick to glide; cursor snaps to ticks at rest".
