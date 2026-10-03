// Resolved layout: which way the timeline runs and which way time flows along it.
// Resolved from the window shape, the user's settings and the rotate button's
// session override (domain/layoutMode.ts); startLayoutTracking keeps it current.
import { create } from 'zustand'
import type { AgendaOverride, AgendaPlacement, AgendaSetting, Orientation, OrientationOverride, OrientationSetting, ShapeClass } from '../domain/layoutMode.ts'
import { resolveAgendaPlacement, resolveOrientation, shapeClass } from '../domain/layoutMode.ts'
import type { Dir } from '../domain/viewport.ts'
import type { VerticalDir } from './settings.ts'
import { getTunables, useSettings } from './settings.ts'

export interface LayoutState {
  orientation: Orientation
  /** 1: later times further right (horizontal) or down (vertical, "future goes down"); -1: left or up. */
  dir: Dir
  shape: ShapeClass
  /** The rotate button's choice; lapses when the shape class changes. */
  override: OrientationOverride | null
  /** Where the Agenda is: a dock at the bottom or side, or the drawer. */
  agendaPlacement: AgendaPlacement
  /** The dock/drawer toggle's choice; lapses when the shape class changes. */
  agendaOverride: AgendaOverride | null
  /** Whether this screen has room to dock the Agenda (the dock/drawer toggle shows only then). */
  agendaCanDock: boolean
}

export interface ResolvedAgenda {
  placement: AgendaPlacement
  canDock: boolean
}

/** The Agenda placement for a resolved layout, the window size and the settings. */
export function resolveAgenda(
  orientation: Orientation,
  setting: AgendaSetting,
  override: AgendaOverride | null,
  shape: ShapeClass,
  w: number,
  h: number,
): ResolvedAgenda {
  const limits = getTunables()
  return {
    placement: resolveAgendaPlacement(orientation, setting, override, shape, w, h, limits),
    canDock: resolveAgendaPlacement(orientation, 'docked', null, shape, w, h, limits) !== 'drawer',
  }
}

/** The Agenda placement the settings alone give (no override) for the current window and layout. */
export function agendaFromSettings(): AgendaPlacement {
  const { orientation, shape } = useLayout.getState()
  const { w, h } = windowSize()
  return resolveAgenda(orientation, useSettings.getState().agendaPlacement, null, shape, w, h).placement
}

export interface ResolvedLayout {
  shape: ShapeClass
  orientation: Orientation
  dir: Dir
}

/** Pure: the layout for a window size, the settings and an optional override. */
export function resolveLayout(
  settings: { orientation: OrientationSetting; verticalDir: VerticalDir },
  override: OrientationOverride | null,
  prevShape: ShapeClass | null,
  w: number,
  h: number,
  hysteresis: number,
): ResolvedLayout {
  const shape = shapeClass(w, h, prevShape, hysteresis)
  const orientation = resolveOrientation(settings.orientation, override, shape)
  const dir: Dir = orientation === 'vertical' && settings.verticalDir === 'up' ? -1 : 1
  return { shape, orientation, dir }
}

const windowSize = () => (typeof window === 'undefined' ? { w: 1024, h: 768 } : { w: window.innerWidth, h: window.innerHeight })

function compute(prevShape: ShapeClass | null, override: OrientationOverride | null): ResolvedLayout {
  const { w, h } = windowSize()
  const s = useSettings.getState()
  return resolveLayout(s, override, prevShape, w, h, getTunables().autoHysteresis)
}

const initial = compute(null, null)
const initialAgenda = (() => {
  const { w, h } = windowSize()
  return resolveAgenda(initial.orientation, useSettings.getState().agendaPlacement, null, initial.shape, w, h)
})()
export const useLayout = create<LayoutState>(() => ({
  ...initial,
  override: null,
  agendaPlacement: initialAgenda.placement,
  agendaOverride: null,
  agendaCanDock: initialAgenda.canDock,
}))

/** Recomputes the store from the window and settings; an override from another shape class lapses. */
export function recomputeLayout() {
  const { shape: prev, override: current } = useLayout.getState()
  const base = compute(prev, null)
  const override = current && current.shape === base.shape ? current : null
  const next = override ? compute(prev, override) : base
  const agendaOverride = useLayout.getState().agendaOverride?.shape === next.shape ? useLayout.getState().agendaOverride : null
  const { w, h } = windowSize()
  const agenda = resolveAgenda(next.orientation, useSettings.getState().agendaPlacement, agendaOverride, next.shape, w, h)
  const s = useLayout.getState()
  if (
    s.shape === next.shape && s.orientation === next.orientation && s.dir === next.dir && s.override === override &&
    s.agendaOverride === agendaOverride && s.agendaPlacement === agenda.placement && s.agendaCanDock === agenda.canDock
  ) return
  useLayout.setState({ ...next, override, agendaOverride, agendaPlacement: agenda.placement, agendaCanDock: agenda.canDock })
}

/** Listens to window resizes and settings changes. Returns the cleanup. */
export function startLayoutTracking(): () => void {
  recomputeLayout()
  window.addEventListener('resize', recomputeLayout)
  window.addEventListener('orientationchange', recomputeLayout)
  const unsub = useSettings.subscribe(recomputeLayout)
  return () => {
    window.removeEventListener('resize', recomputeLayout)
    window.removeEventListener('orientationchange', recomputeLayout)
    unsub()
  }
}
