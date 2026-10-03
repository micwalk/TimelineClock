// Ringing alarms. Persisted so a reload (or HMR) keeps an active alarm on screen.
import { create } from 'zustand'
import type { RingingAlarm } from '../domain/alarms.ts'
import { MINUTE } from '../domain/time.ts'
import { loadJson, saveJson } from './storage.ts'

const ALARMS_KEY = 'timeline.alarms.v1'

export interface AlarmsState {
  ringing: RingingAlarm[]
  /** Ringing alarms are dismissed automatically after this long. */
  autoDismissMs: number
}

const loaded = loadJson<Partial<AlarmsState>>(ALARMS_KEY, {})

export const useAlarms = create<AlarmsState>(() => ({
  ringing: Array.isArray(loaded.ringing) ? loaded.ringing : [],
  autoDismissMs: typeof loaded.autoDismissMs === 'number' ? loaded.autoDismissMs : 5 * MINUTE,
}))

useAlarms.subscribe(s => saveJson(ALARMS_KEY, { ringing: s.ringing, autoDismissMs: s.autoDismissMs }))
