// Blocks: a stretch of time drawn as one thing on the saved side, a lane with its name and length
// in its chip, rather than two instants and a span between them. Pure.
//
// Today the only block is a todo's plan (domain/todos plannedBlocks): computed from the record,
// never stored, drawn in the planned look. It is kept general on purpose: first-class spans
// (#12: a meeting, Work, PTO drawn as one block) are meant to become blocks too, with a solid look.

/** How a block draws: `planned` is hollow and dashed (a plan, not something that happened). */
export type BlockLook = 'planned'

export interface TimeBlock {
  /** Stable key (lane slots and React keys): "plan:<todo id>". */
  key: string
  start: number
  end: number
  /** Its name (for screen readers: its chip shows its length alone, its instant's chip names it). */
  label: string
  look: BlockLook
  /** The instant a tap on it selects (a todo's `at`). */
  instantId?: string
}

/**
 * A plan close to its start folds its length into its instant's chip (a todo's `at`: "☐ Laundry
 * 4:00p · ⏱ 20m"), as a ✓ or a bell folds into its chip; its bar then draws alone. Instant id →
 * the plan's length, ms. `always` (vertical: the plan's chip would sit at the screen's edge,
 * right where its instant's chip runs): every plan; else those shorter on screen than `maxPx`.
 */
export function planFolds(blocks: readonly TimeBlock[], pos: (ts: number) => number, maxPx: number, always: boolean): Record<string, number> {
  const out: Record<string, number> = {}
  for (const b of blocks) {
    if (!b.instantId) continue
    if (always || Math.abs(pos(b.end) - pos(b.start)) < maxPx) out[b.instantId] = b.end - b.start
  }
  return out
}

/** How a todo's plan draws: its own chip (its length) on its bar, its bar alone, or not at all. */
export type PlanLook = 'chip' | 'bar' | 'hidden'

/**
 * A plan follows its todo's chip (its `at`). That chip showing: folded into it, the plan's bar
 * draws alone, else the plan's chip sits on its bar. That chip a Mark, or not drawn while its
 * time is on screen (zoomed out, hidden): no plan either; it comes back with the chip. Its time
 * off screen (a long plan running onto the screen): the plan's own chip, on its bar.
 */
export function planLook(todo: { chip: boolean; folded: boolean; mark: boolean; onScreen: boolean }): PlanLook {
  if (todo.chip) return todo.folded ? 'bar' : 'chip'
  return todo.mark || todo.onScreen ? 'hidden' : 'chip'
}
