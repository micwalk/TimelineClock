// Where an axis tick's line and label are drawn (components/timeline/TickLayer paints them on
// a canvas): the same boxes the tick elements had, in px, with `along` the tick's place on the
// time axis and `axis` the axis' place across it. Pure.

/** A label's pill: the gap from its line's end, its padding and corner radius, px. */
export const TICK_LABEL = { gap: 7, padX: 4, padY: 2, radius: 5 } as const

export interface Box { x: number; y: number; w: number; h: number }

type Orientation = 'horizontal' | 'vertical'

/** The line: 1px wide, `halfHeight` each way across the axis. */
export function tickLineBox(orientation: Orientation, along: number, axis: number, halfHeight: number): Box {
  return orientation === 'horizontal'
    ? { x: along - 0.5, y: axis - halfHeight, w: 1, h: halfHeight * 2 }
    : { x: axis - halfHeight, y: along - 0.5, w: halfHeight * 2, h: 1 }
}

/**
 * The label's pill: above the line's end, centered on it (horizontal); left of it, its right edge
 * `gap` from the line, centered on it (vertical). The text fills it, one line of `fontSize`.
 */
export function tickLabelBox(orientation: Orientation, along: number, axis: number, halfHeight: number, textWidth: number, fontSize: number): Box {
  const w = textWidth + TICK_LABEL.padX * 2
  const h = fontSize + TICK_LABEL.padY * 2
  const off = halfHeight + TICK_LABEL.gap
  return orientation === 'horizontal'
    ? { x: along - w / 2, y: axis - off - h, w, h }
    : { x: axis - off - w, y: along - h / 2, w, h }
}
