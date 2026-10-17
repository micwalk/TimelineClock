// User preferences. Appearance settings are applied as CSS custom properties so the
// theme tokens in styles/theme.css stay the single source of styling.
import { create } from 'zustand'
import { loadJson, saveJson } from './storage.ts'
import type { AgendaSetting, OrientationSetting } from '../domain/layoutMode.ts'
import type { TunableKey, Tunables } from '../domain/tunables.ts'
import { clampTunable, resolveTunables, sanitizeTunableOverrides } from '../domain/tunables.ts'
import type { AlarmRingDefaults } from '../domain/alarmPicker.ts'
import type { SunEvent } from '../domain/sun.ts'
import { SUN_EVENTS } from '../domain/sun.ts'
import { sanitizeRingDefaults } from '../domain/alarmPicker.ts'

/** When favorites get their lane to Now: only while selected (default), or always. */
export type FavoriteLanes = 'selected' | 'always'

export type VerticalDir = 'down' | 'up'

/** The timeline's sky shading: Auto follows the sun at the location (else a fixed 6a–6p day), Fixed always uses 6a–6p. */
export type SkyMode = 'auto' | 'fixed' | 'off'

/** The sky's colours: the sky's own, or Rainbow road (the rainbow through the day, stars, a rainbow axis). */
export type SkyStyle = 'sky' | 'rainbow'

/** Where the sun is computed for; coordinates rounded to two places (about a kilometre). */
export interface SkyLocation {
  lat: number
  lon: number
  /** What the user looked up or picked ("94103, San Francisco, US"), shown in Settings. */
  name: string
}

/** A location from untrusted JSON, or null. */
export function sanitizeSkyLocation(raw: unknown): SkyLocation | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const { lat, lon } = r
  if (typeof lat !== 'number' || typeof lon !== 'number' || !Number.isFinite(lat) || !Number.isFinite(lon)) return null
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return null
  const round = (v: number) => Math.round(v * 100) / 100
  return { lat: round(lat), lon: round(lon), name: typeof r.name === 'string' ? r.name.slice(0, 80) : '' }
}

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
  /** Stopwatch laps keep the start favorited (its span to Now shows the total) alongside the latest lap. */
  stopwatchKeepStart: boolean
  /** Where the Agenda lives: Auto docks when there is room, Docked prefers a dock, Drawer always uses the drawer. */
  agendaPlacement: AgendaSetting
  /** The Alarm picker's rings: what a new alarm starts with, and the warnings it offers. */
  alarmRings: AlarmRingDefaults
  /** Sky shading behind the timeline (#11). */
  sky: SkyMode
  skyStyle: SkyStyle
  skyLocation: SkyLocation | null
  /** Which of sunrise and sunset show on the timeline (once a location is set); switched in the Agenda's Repeats tab. */
  sunEvents: SunEvent[]
  /** Clock changes (daylight saving) on the timeline. */
  dstShifts: boolean
  /** After you put words on the timeline, ask "Are you a sour lemon?" (the lemon log). */
  askLemon: boolean
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
    stopwatchKeepStart: r.stopwatchKeepStart !== false,
    agendaPlacement: r.agendaPlacement === 'docked' || r.agendaPlacement === 'drawer' ? r.agendaPlacement : 'auto',
    alarmRings: sanitizeRingDefaults(r.alarmRings),
    sky: r.sky === 'fixed' || r.sky === 'off' ? r.sky : 'auto',
    skyStyle: r.skyStyle === 'rainbow' ? 'rainbow' : 'sky',
    skyLocation: sanitizeSkyLocation(r.skyLocation),
    dstShifts: r.dstShifts !== false,
    askLemon: r.askLemon !== false,
    // Was one on/off switch for both.
    sunEvents: r.sunEvents === false ? [] : Array.isArray(r.sunEvents) ? SUN_EVENTS.filter(e => (r.sunEvents as unknown[]).includes(e)) : [...SUN_EVENTS],
    layoutVersion: typeof r.layoutVersion === 'number' && Number.isFinite(r.layoutVersion) ? r.layoutVersion : 0,
  }
}

export const useSettings = create<SettingsState>(() => sanitizeSettings(loadJson<unknown>(SETTINGS_KEY, {})))

useSettings.subscribe(s => saveJson(SETTINGS_KEY, { glow: s.glow, tunables: s.tunables, favoriteLanes: s.favoriteLanes, orientation: s.orientation, verticalDir: s.verticalDir, tickSnap: s.tickSnap, stopwatchKeepStart: s.stopwatchKeepStart, agendaPlacement: s.agendaPlacement, alarmRings: s.alarmRings, sky: s.sky, skyStyle: s.skyStyle, skyLocation: s.skyLocation, sunEvents: s.sunEvents, dstShifts: s.dstShifts, askLemon: s.askLemon, layoutVersion: s.layoutVersion }))

/** Mirrors appearance settings onto the document root. */
export function applySettingsToDocument() {
  const apply = (s: SettingsState) => {
    document.documentElement.style.setProperty('--glow', String(s.glow))
    // theme.css swaps the sky tokens (and the axis) for Rainbow road.
    if (s.skyStyle === 'rainbow') document.documentElement.dataset.sky = 'rainbow'
    else delete document.documentElement.dataset.sky
  }
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
  setStopwatchKeepStart: (stopwatchKeepStart: boolean) => useSettings.setState({ stopwatchKeepStart }),
  setAgendaPlacement: (agendaPlacement: AgendaSetting) => useSettings.setState({ agendaPlacement }),
  setSky: (sky: SkyMode) => useSettings.setState({ sky }),
  setSkyStyle: (skyStyle: SkyStyle) => useSettings.setState({ skyStyle }),
  setDstShifts: (dstShifts: boolean) => useSettings.setState({ dstShifts }),
  setAskLemon: (askLemon: boolean) => useSettings.setState({ askLemon }),
  /** Shows or hides sunrises (or sunsets) on the timeline. */
  setSunEventShown: (event: SunEvent, shown: boolean) =>
    useSettings.setState(s => ({ sunEvents: SUN_EVENTS.filter(e => (e === event ? shown : s.sunEvents.includes(e))) })),
  setSkyLocation: (loc: SkyLocation | null) => useSettings.setState({ skyLocation: loc && sanitizeSkyLocation(loc) }),
  setLayoutVersion: (layoutVersion: number) => useSettings.setState({ layoutVersion }),
  setAlarmRings: (alarmRings: AlarmRingDefaults) => useSettings.setState({ alarmRings: sanitizeRingDefaults(alarmRings) }),
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
