// Ringing alarms. Persisted so a reload (or HMR) keeps an active alarm on screen.
import { create } from 'zustand'
import type { RingingAlarm } from '../domain/alarms.ts'
import { MINUTE } from '../domain/time.ts'
import { loadJson, saveJson } from './storage.ts'

const ALARMS_KEY = 'timeline.alarms.v1'

export interface AlarmsState {
  ringing: RingingAlarm[]
  /** How long an unanswered alarm rings before `unattended` kicks in. */
  autoDismissMs: number
  /** What happens to an alarm nobody answered. */
  unattended: 'dismiss' | 'snooze'
}

/** The alarm preferences in untrusted JSON (storage or an imported file), with junk replaced by defaults. */
export function sanitizeAlarmPrefs(raw: unknown): Pick<AlarmsState, 'autoDismissMs' | 'unattended'> {
  const r = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  return {
    autoDismissMs: typeof r.autoDismissMs === 'number' && Number.isFinite(r.autoDismissMs) && r.autoDismissMs > 0 ? r.autoDismissMs : 5 * MINUTE,
    unattended: r.unattended === 'snooze' ? 'snooze' : 'dismiss',
  }
}

const loaded = loadJson<Partial<AlarmsState>>(ALARMS_KEY, {})

export const useAlarms = create<AlarmsState>(() => ({
  ringing: Array.isArray(loaded.ringing) ? loaded.ringing : [],
  ...sanitizeAlarmPrefs(loaded),
}))

useAlarms.subscribe(s => saveJson(ALARMS_KEY, { ringing: s.ringing, autoDismissMs: s.autoDismissMs, unattended: s.unattended }))
