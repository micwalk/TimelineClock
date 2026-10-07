// Placing elements along the time axis inside a container that the engine moves as a whole.
import type { Frame } from '../../engine/viewportEngine.ts'

export const translateMain = (orientation: Frame['orientation'], px: number): string =>
  orientation === 'horizontal' ? `translate3d(${px}px,0,0)` : `translate3d(0,${px}px,0)`

/**
 * Puts an element `px` along the main axis inside its container. A transform, not left/top:
 * the browser keeps a moved element's recorded paint, where a left/top change re-records it
 * (measured: three times the paint work while zooming).
 */
export function placeAlong(el: HTMLElement, orientation: Frame['orientation'], px: number) {
  el.style.transform = translateMain(orientation, px)
}
