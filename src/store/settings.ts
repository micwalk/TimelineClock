// User preferences. Appearance settings are applied as CSS custom properties so the
// theme tokens in styles/theme.css stay the single source of styling.
import { create } from 'zustand'
import { loadJson, saveJson } from './storage.ts'

const SETTINGS_KEY = 'timeline.settings.v1'

export interface SettingsState {
  /** Global glow intensity (CSS --glow): 0 = flat, 1 = default, 2 = extra neon. */
  glow: number
}

const loaded = loadJson<Partial<SettingsState>>(SETTINGS_KEY, {})

export const useSettings = create<SettingsState>(() => ({
  glow: typeof loaded.glow === 'number' ? loaded.glow : 1,
}))

useSettings.subscribe(s => saveJson(SETTINGS_KEY, { glow: s.glow }))

/** Mirrors appearance settings onto the document root. */
export function applySettingsToDocument() {
  const apply = (s: SettingsState) => document.documentElement.style.setProperty('--glow', String(s.glow))
  apply(useSettings.getState())
  useSettings.subscribe(apply)
}

export const settings = {
  setGlow: (glow: number) => useSettings.setState({ glow }),
}
