// A long column of rows that mounts only those near what is on screen (domain/listWindow):
// spacers stand in for the rest, sized from the rows as they were measured, so opening a long
// Agenda costs what is on screen, not the whole history. Each item's first element carries
// data-key={key}. Rows keep their FLIP animation (useFlip), and the focused row is scrolled into
// view (from anywhere in the list, mounted or not).
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { listWindow, scrollToShow } from '../../domain/listWindow.ts'
import { useFlip } from '../../hooks/useFlip.ts'

export interface ListItem {
  key: string
  render: () => ReactNode
}

/** A row's slot (its height and the gap after it) before any row has been measured, px. */
const ESTIMATE_PX = 56
/** Room kept around a row scrolled into view, px. */
const FOCUS_MARGIN_PX = 8

export function WindowedList({ items, focusKey, head, className = 'list-rows' }: {
  items: readonly ListItem[]
  /** The row to scroll into view whenever this changes (null: none). */
  focusKey: string | null
  /** Rendered first, above the rows (a header row). */
  head?: ReactNode
  className?: string
}) {
  const ref = useRef<HTMLDivElement>(null)
  const beforeRef = useRef<HTMLDivElement>(null)
  const afterRef = useRef<HTMLDivElement>(null)
  /** Each measured row's slot, by key. */
  const heights = useRef(new Map<string, number>())
  /** The viewport, px from the first row's top. Until it is measured: the window's height. */
  const view = useRef({ top: 0, height: typeof window === 'undefined' ? 0 : window.innerHeight })
  const [, rerender] = useState(0)

  const estimate = () => {
    const h = heights.current
    if (h.size === 0) return ESTIMATE_PX
    let sum = 0
    for (const v of h.values()) sum += v
    return sum / h.size
  }
  const slotsFor = (list: readonly ListItem[]) => {
    const e = estimate()
    return list.map(it => heights.current.get(it.key) ?? e)
  }
  const slots = slotsFor(items)
  const win = listWindow(slots, view.current.top, view.current.height)
  const shown = useRef(win)
  shown.current = win

  const scroller = () => (ref.current?.closest('.list-scroll') ?? ref.current?.parentElement ?? null) as HTMLElement | null
  /** The first row's top, in the scroller's content (scrollTop) coordinates. */
  const origin = (sc: HTMLElement) => {
    const b = beforeRef.current
    return b ? b.getBoundingClientRect().top - sc.getBoundingClientRect().top + sc.scrollTop : 0
  }
  const latest = useRef({ items, slotsFor })
  latest.current = { items, slotsFor }

  // Follow the scroller: re-render only when the rows to mount change.
  useLayoutEffect(() => {
    const sc = scroller()
    if (!sc) return
    let raf = 0
    const update = () => {
      raf = 0
      view.current = { top: sc.scrollTop - origin(sc), height: sc.clientHeight }
      const w = listWindow(latest.current.slotsFor(latest.current.items), view.current.top, view.current.height)
      if (w.start !== shown.current.start || w.end !== shown.current.end) rerender(n => n + 1)
    }
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(update) }
    update()
    sc.addEventListener('scroll', onScroll, { passive: true })
    const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(onScroll)
    ro?.observe(sc)
    return () => { sc.removeEventListener('scroll', onScroll); ro?.disconnect(); if (raf) cancelAnimationFrame(raf) }
  }, [])

  // Measure the mounted rows' slots; once they differ from what the spacers assumed, lay out again.
  const measure = () => {
    const list = ref.current
    const after = afterRef.current
    if (!list || !after) return
    const gap = parseFloat(getComputedStyle(list).rowGap) || 0
    const byKey = new Map<string, HTMLElement>()
    for (const child of Array.from(list.children) as HTMLElement[]) {
      const k = child.dataset.key
      if (k) byKey.set(k, child)
    }
    const { start, end } = shown.current
    const rows = latest.current.items
    let changed = false
    let next: number | null = null
    for (let i = Math.min(end, rows.length) - 1; i >= start; i--) {
      const el = byKey.get(rows[i].key)
      if (!el) continue
      const top = el.getBoundingClientRect().top
      const slot = next === null ? after.getBoundingClientRect().top + gap - top : next - top
      next = top
      if (!(slot > 0)) continue
      const old = heights.current.get(rows[i].key)
      if (old === undefined || Math.abs(old - slot) > 0.5) { heights.current.set(rows[i].key, slot); changed = true }
    }
    if (changed) rerender(n => n + 1)
  }
  const measureRef = useRef(measure)
  measureRef.current = measure
  // After every render (rows come and go), and when a row changes size on its own (a row's box opens).
  useLayoutEffect(() => measureRef.current())
  useLayoutEffect(() => {
    const list = ref.current
    if (!list || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(() => measureRef.current())
    ro.observe(list)
    return () => ro.disconnect()
  }, [])

  const orderKey = useMemo(() => items.map(it => it.key).join(','), [items])
  useFlip(ref, orderKey)

  // Scroll the focused row into view: at once when the list opens, smoothly after.
  const scrolledOnce = useRef(false)
  useEffect(() => {
    const sc = scroller()
    const first = !scrolledOnce.current
    scrolledOnce.current = true
    if (!sc || focusKey === null) return
    const index = items.findIndex(it => it.key === focusKey)
    if (index < 0) return
    const o = origin(sc)
    const target = scrollToShow(slotsFor(items), index, sc.scrollTop - o, sc.clientHeight, FOCUS_MARGIN_PX)
    if (target === null) return
    if (typeof sc.scrollTo === 'function') sc.scrollTo({ top: o + target, behavior: first ? 'auto' : 'smooth' })
    else sc.scrollTop = o + target
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusKey])

  return (
    <div ref={ref} className={className}>
      {head}
      <div ref={beforeRef} className="list-spacer list-spacer--before" style={{ height: win.before }} aria-hidden />
      {items.slice(win.start, win.end).map(it => it.render())}
      <div ref={afterRef} className="list-spacer list-spacer--after" style={{ height: win.after }} aria-hidden />
    </div>
  )
}
