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

const loaded = loadJson<Partial<AlarmsState>>(ALARMS_KEY, {})

export const useAlarms = create<AlarmsState>(() => ({
  ringing: Array.isArray(loaded.ringing) ? loaded.ringing : [],
  autoDismissMs: typeof loaded.autoDismissMs === 'number' ? loaded.autoDismissMs : 5 * MINUTE,
  unattended: loaded.unattended === 'snooze' ? 'snooze' : 'dismiss',
}))

useAlarms.subscribe(s => saveJson(ALARMS_KEY, { ringing: s.ringing, autoDismissMs: s.autoDismissMs, unattended: s.unattended }))
