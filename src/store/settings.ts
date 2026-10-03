// User preferences. Appearance settings are applied as CSS custom properties so the
// theme tokens in styles/theme.css stay the single source of styling.
import { create } from 'zustand'
import { loadJson, saveJson } from './storage.ts'
import type { AgendaSetting, OrientationSetting } from '../domain/layoutMode.ts'
import type { TunableKey, Tunables } from '../domain/tunables.ts'
import { clampTunable, resolveTunables, sanitizeTunableOverrides } from '../domain/tunables.ts'

/** When favorites and alarms get a lane to Now: only while selected (default), or always. */
export type FavoriteLanes = 'selected' | 'always'

export type VerticalDir = 'down' | 'up'

const SETTINGS_KEY = 'timeline.settings.v1'

export interface SettingsState {
  /** Global glow intensity (CSS --glow): 0 = flat, 1 = default, 2 = extra neon. */
  glow: number
  /** The user's changes to behavior tunables; missing keys use the defaults. */
  tunables: Partial<Tunables>
  favoriteLanes: FavoriteLanes
  /** Which way the timeline runs; Auto follows the window's longer side. */
  orientation: OrientationSetting
  /** Vertical only: 'down' puts the future below Now. */
  verticalDir: VerticalDir
  /** Whether a drag or glide that comes to rest on empty time lands on the nearest tick. */
  tickSnap: boolean
  /** Where the Agenda lives: Auto docks when there is room, Docked prefers a dock, Drawer always uses the drawer. */
  agendaPlacement: AgendaSetting
  /** Last layout version whose one-time migrations ran (see store/migrations.ts). */
  layoutVersion: number
}

/** The settings in untrusted JSON (storage or an imported file), with junk replaced by defaults. */
export function sanitizeSettings(raw: unknown): SettingsState {
  const r = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  return {
    glow: typeof r.glow === 'number' && Number.isFinite(r.glow) ? Math.min(2, Math.max(0, r.glow)) : 1,
    tunables: sanitizeTunableOverrides(r.tunables),
    favoriteLanes: r.favoriteLanes === 'always' ? 'always' : 'selected',
    orientation: r.orientation === 'horizontal' || r.orientation === 'vertical' ? r.orientation : 'auto',
    verticalDir: r.verticalDir === 'up' ? 'up' : 'down',
    tickSnap: r.tickSnap !== false,
    agendaPlacement: r.agendaPlacement === 'docked' || r.agendaPlacement === 'drawer' ? r.agendaPlacement : 'auto',
    layoutVersion: typeof r.layoutVersion === 'number' && Number.isFinite(r.layoutVersion) ? r.layoutVersion : 0,
  }
}

export const useSettings = create<SettingsState>(() => sanitizeSettings(loadJson<unknown>(SETTINGS_KEY, {})))

useSettings.subscribe(s => saveJson(SETTINGS_KEY, { glow: s.glow, tunables: s.tunables, favoriteLanes: s.favoriteLanes, orientation: s.orientation, verticalDir: s.verticalDir, tickSnap: s.tickSnap, agendaPlacement: s.agendaPlacement, layoutVersion: s.layoutVersion }))

/** Mirrors appearance settings onto the document root. */
export function applySettingsToDocument() {
  const apply = (s: SettingsState) => document.documentElement.style.setProperty('--glow', String(s.glow))
  apply(useSettings.getState())
  useSettings.subscribe(apply)
}

/** Every tunable, with the user's changes applied. Read it when acting, not once at import. */
export const getTunables = (): Tunables => resolveTunables(useSettings.getState().tunables)

export const settings = {
  setGlow: (glow: number) => useSettings.setState({ glow }),
  setFavoriteLanes: (favoriteLanes: FavoriteLanes) => useSettings.setState({ favoriteLanes }),
  setOrientation: (orientation: OrientationSetting) => useSettings.setState({ orientation }),
  setVerticalDir: (verticalDir: VerticalDir) => useSettings.setState({ verticalDir }),
  setTickSnap: (tickSnap: boolean) => useSettings.setState({ tickSnap }),
  setAgendaPlacement: (agendaPlacement: AgendaSetting) => useSettings.setState({ agendaPlacement }),
  setLayoutVersion: (layoutVersion: number) => useSettings.setState({ layoutVersion }),
  setTunable: (key: TunableKey, value: number) => {
    if (!Number.isFinite(value)) return
    useSettings.setState(s => ({ tunables: { ...s.tunables, [key]: clampTunable(key, value) } }))
  },
  resetTunable: (key: TunableKey) =>
    useSettings.setState(s => {
      const next = { ...s.tunables }
      delete next[key]
      return { tunables: next }
    }),
}
