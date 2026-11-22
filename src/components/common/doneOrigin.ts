// Where a Done animation (domain/doneBurst) plays: the box that was tapped, measured once on the
// tap (never in a frame listener). A todo box (components/common/TodoIcons TodoBoxIcon) is its
// SVG's drawn square; any other button is itself, round if it is round.
import type { DoneOrigin } from '../../domain/doneBurst.ts'

/** TodoBoxIcon's square in its 20-unit viewBox: 14.8 wide, corners of 3.6. */
const BOX_SHARE = 14.8 / 20
const RADIUS_SHARE = 3.6 / 20

export function doneOrigin(el: Element, opts: { box?: boolean } = {}): DoneOrigin {
  const svg = el.querySelector('svg')
  const css = getComputedStyle(el)
  // The todo's own colour (not a hover's green): the box greens from it.
  const color = css.getPropertyValue('--c-todo').trim() || css.color || 'currentColor'
  if (svg) {
    const r = svg.getBoundingClientRect()
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, size: r.width * BOX_SHARE, radius: r.width * RADIUS_SHARE, color, box: opts.box ?? true }
  }
  const r = el.getBoundingClientRect()
  const size = Math.min(r.width, r.height)
  const radius = Math.min(size / 2, parseFloat(css.borderTopLeftRadius) || 0)
  return { x: r.left + r.width / 2, y: r.top + r.height / 2, size, radius, color, box: opts.box ?? true }
}
