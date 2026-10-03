// User preferences. Appearance settings are applied as CSS custom properties so the
// theme tokens in styles/theme.css stay the single source of styling.
import { create } from 'zustand'
import { loadJson, saveJson } from './storage.ts'
import { resolveTunables, TUNABLE_DESCRIPTORS, type Tunables } from '../domain/tunables.ts'

const SETTINGS_KEY = 'timeline.settings.v1'

export interface SettingsState {
  /** Global glow intensity (CSS --glow): 0 = flat, 1 = default, 2 = extra neon. */
  glow: number
  /** Overrides of the behavior tunables; missing keys use defaults. */
  tunables: Partial<Tunables>
}

function sanitizeTunables(raw: unknown): Partial<Tunables> {
  const out: Partial<Tunables> = {}
  if (typeof raw !== 'object' || raw === null) return out
  const src = raw as Record<string, unknown>
  for (const t of TUNABLE_DESCRIPTORS) {
    const v = src[t.key]
    if (typeof v === 'number' && Number.isFinite(v)) out[t.key] = v
  }
  return out
}

const loaded = loadJson<Record<string, unknown>>(SETTINGS_KEY, {})

export const useSettings = create<SettingsState>(() => ({
  glow: typeof loaded.glow === 'number' ? loaded.glow : 1,
  tunables: sanitizeTunables(loaded.tunables),
}))

useSettings.subscribe(s => saveJson(SETTINGS_KEY, { glow: s.glow, tunables: s.tunables }))

/** Mirrors appearance settings onto the document root. */
export function applySettingsToDocument() {
  const apply = (s: SettingsState) => document.documentElement.style.setProperty('--glow', String(s.glow))
  apply(useSettings.getState())
  useSettings.subscribe(apply)
}

/** Tunables with defaults merged and values clamped. */
export function getTunables(): Tunables {
  return resolveTunables(useSettings.getState().tunables)
}

export const settings = {
  setGlow: (glow: number) => useSettings.setState({ glow }),
  setTunable: (key: keyof Tunables, value: number) => {
    if (!Number.isFinite(value)) return
    useSettings.setState(s => ({ tunables: { ...s.tunables, [key]: value } }))
  },
  resetTunable: (key: keyof Tunables) =>
    useSettings.setState(s => {
      const next = { ...s.tunables }
      delete next[key]
      return { tunables: next }
    }),
}
