// Behavior numbers the user can adjust (Settings > Advanced). Visual sizes are not
// here: they are CSS tokens in styles/theme.css, the style editor's territory.
// SPECS is the single source of truth: the keys, the Tunables type, the defaults
// and the Settings list all derive from it.

export type TunableGroup = 'Layout' | 'Gestures' | 'Glide' | 'Labels'

export interface TunableSpec {
  label: string
  default: number
  min: number
  max: number
  step: number
  group: TunableGroup
}

const SPECS = {
  chipRowsMax: { label: 'Chip rows (horizontal)', default: 3, min: 1, max: 8, step: 1, group: 'Layout' },
  chipColumnsMax: { label: 'Chip columns (vertical)', default: 4, min: 1, max: 8, step: 1, group: 'Layout' },
  chipGapPx: { label: 'Gap between chips (px)', default: 6, min: 0, max: 40, step: 1, group: 'Layout' },
  autoHysteresis: { label: 'Auto orientation margin', default: 0.1, min: 0, max: 0.5, step: 0.01, group: 'Layout' },
  sideDockMinWidthPx: { label: 'Side-docked Agenda needs width (px)', default: 900, min: 300, max: 3000, step: 10, group: 'Layout' },
  bottomDockMinHeightPx: { label: 'Bottom-docked Agenda needs height (px)', default: 600, min: 200, max: 3000, step: 10, group: 'Layout' },
  dragThresholdMousePx: { label: 'Drag starts after, mouse (px)', default: 3, min: 0, max: 30, step: 1, group: 'Gestures' },
  dragThresholdTouchPx: { label: 'Drag starts after, touch (px)', default: 8, min: 0, max: 40, step: 1, group: 'Gestures' },
  landingMousePx: { label: 'Land on Now/instants within, mouse (px)', default: 8, min: 0, max: 60, step: 1, group: 'Gestures' },
  landingTouchPx: { label: 'Land on Now/instants within, touch (px)', default: 12, min: 0, max: 80, step: 1, group: 'Gestures' },
  tickSnapPx: { label: 'Snap to a tick within (px)', default: 8, min: 0, max: 40, step: 1, group: 'Gestures' },
  snapMaxReleaseSpeed: { label: 'Snap only when released slower than (px/ms)', default: 0.05, min: 0, max: 1, step: 0.01, group: 'Gestures' },
  tickSnapEaseMs: { label: 'Ease into a snapped tick (ms)', default: 150, min: 0, max: 1000, step: 10, group: 'Gestures' },
  glideWindowMs: { label: 'Velocity sampling window (ms)', default: 100, min: 20, max: 500, step: 10, group: 'Glide' },
  glideStillMs: { label: 'Pause that cancels a glide (ms)', default: 50, min: 0, max: 500, step: 10, group: 'Glide' },
  glideMinSpeed: { label: 'Speed to start gliding (px/ms)', default: 0.3, min: 0, max: 5, step: 0.01, group: 'Glide' },
  glideStopSpeed: { label: 'Speed where a glide stops (px/ms)', default: 0.02, min: 0.001, max: 1, step: 0.001, group: 'Glide' },
  glideMaxSpeed: { label: 'Maximum glide speed (px/ms)', default: 8, min: 1, max: 30, step: 0.5, group: 'Glide' },
  glideTauMs: { label: 'Glide friction time constant (ms)', default: 325, min: 50, max: 2000, step: 5, group: 'Glide' },
  secondsBelowTickMs: { label: 'Show seconds when ticks are finer than (ms)', default: 60000, min: 1000, max: 3600000, step: 1000, group: 'Labels' },
} as const satisfies Record<string, TunableSpec>

export type TunableKey = keyof typeof SPECS
export type Tunables = Record<TunableKey, number>

export interface TunableDescriptor extends TunableSpec {
  key: TunableKey
}

const KEYS = Object.keys(SPECS) as TunableKey[]

/** Every tunable in display order, for the Settings list. */
export const TUNABLE_DESCRIPTORS: readonly TunableDescriptor[] = KEYS.map(key => ({ key, ...SPECS[key] }))

// Complete by construction: one entry per SPECS key.
export const DEFAULT_TUNABLES: Readonly<Tunables> = Object.freeze(
  Object.fromEntries(KEYS.map(key => [key, SPECS[key].default])) as Tunables,
)

const isKey = (k: string): k is TunableKey => Object.hasOwn(SPECS, k)

/** Clamps a value into the tunable's range. */
export function clampTunable(key: TunableKey, value: number): number {
  const { min, max } = SPECS[key]
  return Math.min(max, Math.max(min, value))
}

/**
 * Keeps only known keys with finite numbers, clamped into range. Use on anything
 * read from storage or typed by the user.
 */
export function sanitizeTunableOverrides(raw: unknown): Partial<Tunables> {
  const out: Partial<Tunables> = {}
  if (typeof raw !== 'object' || raw === null) return out
  for (const [k, v] of Object.entries(raw)) {
    if (isKey(k) && typeof v === 'number' && Number.isFinite(v)) out[k] = clampTunable(k, v)
  }
  return out
}

/** Defaults with the (sanitized) overrides applied. */
export function resolveTunables(overrides: unknown = {}): Tunables {
  return { ...DEFAULT_TUNABLES, ...sanitizeTunableOverrides(overrides) }
}
