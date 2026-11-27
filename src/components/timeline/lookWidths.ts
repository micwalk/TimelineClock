// Measured widths of span chips and label boxes that have two looks: whole (their name and
// reading) and compact (their reading alone, crowded: `is-compact` on the measured element hides
// the name, out of the flow, still laid out). The name is measured on its own, so both widths are
// known whichever look shows, and the layout can pick one without measuring the other. One
// ResizeObserver per store: no layout reads mid-frame.

/** The gap between a box's name and its reading (.span-read and .tl-nowflag gap), px. */
const NAME_GAP = 5
/** What holds a box's name (SpanReading). */
const NAME = '.span-read__name'

export interface LookWidths {
  /** Registers a box while it is mounted (its name too, whatever it is renamed to); returns the cleanup. */
  observe: (key: string, el: HTMLElement) => () => void
  /** A box's width whole (`compact`: its reading alone), if it has been measured. */
  width: (key: string, compact: boolean) => number | undefined
}

/** `changed` runs after any width changes (bump a version, ask for a frame). */
export function createLookWidths(changed: () => void): LookWidths {
  const boxes = new Map<string, { w: number; compact: boolean }>()
  const names = new Map<string, number>()
  const watched = new Map<Element, { key: string; part: 'box' | 'name' }>()
  let dirty = false

  const watchName = (key: string, box: Element) => {
    const name = box.querySelector(NAME)
    for (const [el, seen] of watched) {
      if (seen.key !== key || seen.part !== 'name' || el === name) continue
      observer?.unobserve(el)
      watched.delete(el)
    }
    if (!name) { if (names.delete(key)) dirty = true; return }
    if (watched.has(name)) return
    watched.set(name, { key, part: 'name' })
    observer?.observe(name)
  }

  const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(entries => {
    for (const e of entries) {
      const seen = watched.get(e.target)
      if (seen === undefined) continue
      const size = e.borderBoxSize?.[0]
      const w = Math.round(size ? size.inlineSize : (e.target as HTMLElement).offsetWidth)
      if (seen.part === 'name') {
        if (names.get(seen.key) !== w) { names.set(seen.key, w); dirty = true }
        continue
      }
      const compact = e.target.classList.contains('is-compact')
      const old = boxes.get(seen.key)
      if (w > 0 && (!old || old.w !== w || old.compact !== compact)) { boxes.set(seen.key, { w, compact }); dirty = true }
      // A rename can add or drop the name: watch whichever it has now.
      watchName(seen.key, e.target)
    }
    if (dirty) { dirty = false; changed() }
  })

  return {
    observe(key, el) {
      watched.set(el, { key, part: 'box' })
      observer?.observe(el)
      watchName(key, el)
      if (dirty) { dirty = false; changed() }
      return () => {
        for (const [o, seen] of watched) {
          if (seen.key !== key || (o !== el && seen.part === 'box')) continue
          observer?.unobserve(o)
          watched.delete(o)
        }
        if ([...watched.values()].some(v => v.key === key)) return
        const hadBox = boxes.delete(key)
        if (names.delete(key) || hadBox) changed()
      }
    },
    width(key, compact) {
      const box = boxes.get(key)
      if (!box) return undefined
      const name = names.get(key)
      const named = name ? name + NAME_GAP : 0
      return box.compact === compact ? box.w : compact ? box.w - named : box.w + named
    },
  }
}
