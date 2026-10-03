// Typed table of behavior tunables (spec 5.1). Visual sizes stay CSS tokens.
export interface TunableDescriptor {
  key: keyof Tunables
  label: string
  default: number
  min: number
  max: number
  step: number
  group: string
}

export interface Tunables {
  chipRowsMax: number
  chipColumnsMax: number
  chipGapPx: number
  autoHysteresis: number
  sideDockMinWidthPx: number
  bottomDockMinHeightPx: number
  dragThresholdMousePx: number
  dragThresholdTouchPx: number
  landingMousePx: number
  landingTouchPx: number
  glideWindowMs: number
  glideStillMs: number
  glideMinSpeed: number
  glideStopSpeed: number
  glideMaxSpeed: number
  glideTauMs: number
  tickSnapEaseMs: number
  secondsBelowTickMs: number
}

const d = (
  key: keyof Tunables, label: string, def: number, min: number, max: number, step: number, group: string,
): TunableDescriptor => ({ key, label, default: def, min, max, step, group })

export const TUNABLE_DESCRIPTORS: readonly TunableDescriptor[] = [
  d('chipRowsMax', 'Chip rows (horizontal)', 3, 1, 8, 1, 'Layout'),
  d('chipColumnsMax', 'Chip columns (vertical)', 4, 1, 8, 1, 'Layout'),
  d('chipGapPx', 'Chip gap (px)', 6, 0, 40, 1, 'Layout'),
  d('autoHysteresis', 'Auto orientation hysteresis', 0.1, 0, 0.5, 0.01, 'Layout'),
  d('sideDockMinWidthPx', 'Side dock min width (px)', 900, 300, 3000, 10, 'Layout'),
  d('bottomDockMinHeightPx', 'Bottom dock min height (px)', 600, 200, 3000, 10, 'Layout'),
  d('dragThresholdMousePx', 'Drag threshold, mouse (px)', 3, 0, 30, 1, 'Gestures'),
  d('dragThresholdTouchPx', 'Drag threshold, touch (px)', 8, 0, 40, 1, 'Gestures'),
  d('landingMousePx', 'Landing radius, mouse (px)', 12, 0, 60, 1, 'Gestures'),
  d('landingTouchPx', 'Landing radius, touch (px)', 20, 0, 80, 1, 'Gestures'),
  d('glideWindowMs', 'Glide velocity window (ms)', 100, 20, 500, 10, 'Glide'),
  d('glideStillMs', 'Glide cancel pause (ms)', 50, 0, 500, 10, 'Glide'),
  d('glideMinSpeed', 'Glide min speed (px/ms)', 0.3, 0, 5, 0.01, 'Glide'),
  d('glideStopSpeed', 'Glide stop speed (px/ms)', 0.02, 0.001, 1, 0.001, 'Glide'),
  d('glideMaxSpeed', 'Glide max speed (px/ms)', 8, 1, 30, 0.5, 'Glide'),
  d('glideTauMs', 'Glide friction (ms)', 325, 50, 2000, 5, 'Glide'),
  d('tickSnapEaseMs', 'Tick snap ease (ms)', 150, 0, 1000, 10, 'Glide'),
  d('secondsBelowTickMs', 'Show seconds below tick (ms)', 60000, 1000, 3600000, 1000, 'Labels'),
]

export const DEFAULT_TUNABLES: Tunables = Object.fromEntries(
  TUNABLE_DESCRIPTORS.map(t => [t.key, t.default]),
) as unknown as Tunables

/** Merge defaults with overrides: non-finite and unknown values are ignored, values clamped. */
export function resolveTunables(overrides: Partial<Tunables> = {}): Tunables {
  const out: Tunables = { ...DEFAULT_TUNABLES }
  const src = overrides as Record<string, unknown>
  for (const t of TUNABLE_DESCRIPTORS) {
    const v = src[t.key]
    if (typeof v === 'number' && Number.isFinite(v)) out[t.key] = Math.min(t.max, Math.max(t.min, v))
  }
  return out
}
