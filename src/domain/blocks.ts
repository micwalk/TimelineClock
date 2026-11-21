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
  /** Its name, shown with its length ("Laundry · 20m"). */
  label: string
  look: BlockLook
  /** The instant a tap on it selects (a todo's `at`). */
  instantId?: string
}
