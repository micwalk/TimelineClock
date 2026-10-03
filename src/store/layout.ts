// Resolved layout: which way the timeline runs and which way time flows along it.
// Until the vertical layout lands (phase 4) the timeline stays horizontal; later
// phases resolve these from the window size and settings (domain/layoutMode.ts).
import { create } from 'zustand'
import type { Orientation } from '../domain/layoutMode.ts'
import type { Dir } from '../domain/viewport.ts'

export interface LayoutState {
  orientation: Orientation
  /** 1: later times further right (horizontal) or down (vertical). */
  dir: Dir
}

export const useLayout = create<LayoutState>(() => ({ orientation: 'horizontal', dir: 1 }))
