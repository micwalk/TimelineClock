// Where a saved chip (or a "+N" chip) is drawn each frame: at its line along the time axis,
// plus the overlap layout's offsets (its slide along time and its row or column), which glide
// to new values on critically damped springs. When the layout moves a chip out of a
// neighbour's way it is pushed smoothly, as if repelled; when it has to pop to another row it
// slides there quickly instead of jumping.
import { useRef } from 'react'
import type { RefObject } from 'react'
import { useFrameListener } from '../../engine/hooks.ts'
import type { Frame } from '../../engine/viewportEngine.ts'
import { engine, reducedMotion } from '../../engine/viewportEngine.ts'
import type { SpringState } from '../../domain/spring.ts'
import { omegaFor, springSettled, stepSpring } from '../../domain/spring.ts'
import { GEOMETRY } from './geometry.ts'
import { clusterAt, savedLayoutAt } from './savedLayout.ts'

/** Sliding along time (pushed by a neighbour), ms to settle. */
export const SHIFT_SETTLE_MS = 220
/** Popping to another row or column, ms to settle. */
export const CROSS_SETTLE_MS = 160
/** A frame gap longer than this (a stall, a hidden tab) jumps instead of animating. */
const MAX_STEP_MS = 64
/** Hard limit on transform offsets so far-off items never produce huge layer sizes. */
const POS_LIMIT = 100_000

const OMEGA_SHIFT = omegaFor(SHIFT_SETTLE_MS)
const OMEGA_CROSS = omegaFor(CROSS_SETTLE_MS)

export interface ChipOffsets {
  /** Slide along the time axis, px. */
  shift: number
  /** Across the axis: px below the first row (horizontal) or right of column 0 (vertical). */
  cross: number
}

/** The layout's offsets for a chip (`cluster`: a "+N" chip, by cluster id) this frame, or null once it has none. */
export function layoutOffsets(f: Frame, id: string, cluster: boolean): ChipOffsets | null {
  const l = savedLayoutAt(f)
  const vertical = f.orientation === 'vertical'
  if (cluster) {
    const c = clusterAt(l, id)
    return c ? { shift: c.shift, cross: vertical ? c.crossOffset : c.slot * GEOMETRY.chipRow } : null
  }
  const row = l.rows[id]
  if (row === undefined) return null
  return { shift: l.shifts[id] ?? 0, cross: vertical ? (l.crossOffsets[id] ?? 0) : row * GEOMETRY.chipRow }
}

/**
 * Positions `ref` at `base(f)` along the time axis plus the chip's animated layout offsets.
 * `onPlaced` gets the offsets the chip is heading to (e.g. to pull a tools row on screen).
 */
export function useChipPlacement(
  ref: RefObject<HTMLElement | null>,
  id: string,
  cluster: boolean,
  base: (f: Frame) => number,
  onPlaced?: (f: Frame, target: ChipOffsets) => void,
) {
  const st = useRef<{ shift: SpringState; cross: SpringState; perf: number; orientation: string; written: string; target: ChipOffsets } | null>(null)
  useFrameListener(f => {
    const el = ref.current
    if (!el) return
    const s = st.current
    const target = layoutOffsets(f, id, cluster) ?? s?.target ?? { shift: 0, cross: 0 }
    let shift: SpringState
    let cross: SpringState
    if (!s || s.orientation !== f.orientation || reducedMotion() || !(f.perf - s.perf <= MAX_STEP_MS)) {
      shift = { x: target.shift, v: 0 }
      cross = { x: target.cross, v: 0 }
    } else {
      const dt = f.perf - s.perf
      shift = stepSpring(s.shift, target.shift, dt, OMEGA_SHIFT)
      cross = stepSpring(s.cross, target.cross, dt, OMEGA_CROSS)
      const doneShift = springSettled(shift, target.shift)
      const doneCross = springSettled(cross, target.cross)
      if (doneShift) shift = { x: target.shift, v: 0 }
      if (doneCross) cross = { x: target.cross, v: 0 }
      if (!doneShift || !doneCross) engine.requestFrame()
    }
    const main = Math.max(-POS_LIMIT, Math.min(POS_LIMIT, base(f) + shift.x))
    const x = f.orientation === 'horizontal' ? main : cross.x
    const y = f.orientation === 'horizontal' ? cross.x : main
    const transform = `translate3d(${x.toFixed(2)}px,${y.toFixed(2)}px,0)`
    if (!s || transform !== s.written) el.style.transform = transform
    st.current = { shift, cross, perf: f.perf, orientation: f.orientation, written: transform, target }
    onPlaced?.(f, target)
  })
}
