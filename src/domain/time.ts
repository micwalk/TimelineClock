// Time constants and small numeric helpers shared across the app.

export const SECOND = 1000
export const MINUTE = 60 * SECOND
export const HOUR = 60 * MINUTE
export const DAY = 24 * HOUR

export const MIN_TIME_WIDTH_MS = SECOND
export const MAX_TIME_WIDTH_MS = 30 * DAY
export const DEFAULT_TIME_WIDTH_MS = 6 * HOUR

export const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t
export const smoothstep = (edge0: number, edge1: number, x: number) => {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1)
  return t * t * (3 - 2 * t)
}
export const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)

export const clampTimeWidth = (w: number) => clamp(w, MIN_TIME_WIDTH_MS, MAX_TIME_WIDTH_MS)

export type TimeIncrement =
  | '1s' | '5s' | '30s'
  | '1m' | '5m' | '15m' | '30m'
  | '1h' | '2h' | '6h' | '24h'

export interface TimeIncrementOption {
  value: TimeIncrement
  label: string
  milliseconds: number
}

export const TIME_INCREMENT_OPTIONS: TimeIncrementOption[] = [
  { value: '1s', label: '1 second', milliseconds: SECOND },
  { value: '5s', label: '5 seconds', milliseconds: 5 * SECOND },
  { value: '30s', label: '30 seconds', milliseconds: 30 * SECOND },
  { value: '1m', label: '1 minute', milliseconds: MINUTE },
  { value: '5m', label: '5 minutes', milliseconds: 5 * MINUTE },
  { value: '15m', label: '15 minutes', milliseconds: 15 * MINUTE },
  { value: '30m', label: '30 minutes', milliseconds: 30 * MINUTE },
  { value: '1h', label: '1 hour', milliseconds: HOUR },
  { value: '2h', label: '2 hours', milliseconds: 2 * HOUR },
  { value: '6h', label: '6 hours', milliseconds: 6 * HOUR },
  { value: '24h', label: '24 hours', milliseconds: DAY },
]

export function incrementOption(value: TimeIncrement): TimeIncrementOption {
  return TIME_INCREMENT_OPTIONS.find(o => o.value === value) ?? TIME_INCREMENT_OPTIONS[6]
}
