// State behind the Stopwatch, Timer and Alarm buttons: which instants the stopwatch is following,
// recently used timer lengths and recently set alarms. Everything they create is ordinary
// instants, spans and series.
import { create } from 'zustand'
import type { StopwatchState } from '../domain/quickCreate.ts'
import { IDLE_STOPWATCH, pruneStopwatch, pushRecentTimer, sanitizeRecentTimers, sanitizeStopwatch } from '../domain/quickCreate.ts'
import type { RecentAlarm } from '../domain/alarmPicker.ts'
import { pushRecentAlarm, sanitizeRecentAlarms } from '../domain/alarmPicker.ts'
import { entities, useEntities } from './entities.ts'
import { loadJson, saveJson } from './storage.ts'

const QUICK_KEY = 'timeline.quick.v1'

export interface QuickState {
  stopwatch: StopwatchState
  /** Most recent first. */
  recentTimers: number[]
  /** Most recent first. */
  recentAlarms: RecentAlarm[]
}

const loaded = loadJson<Record<string, unknown>>(QUICK_KEY, {})

export const useQuick = create<QuickState>(() => ({
  stopwatch: sanitizeStopwatch(loaded.stopwatch),
  recentTimers: sanitizeRecentTimers(loaded.recentTimers),
  recentAlarms: sanitizeRecentAlarms(loaded.recentAlarms),
}))

useQuick.subscribe(s => saveJson(QUICK_KEY, { stopwatch: s.stopwatch, recentTimers: s.recentTimers, recentAlarms: s.recentAlarms }))

// A deleted mark leaves the stopwatch; deleting them all makes it idle.
const prune = () => {
  const s = useQuick.getState().stopwatch
  const next = pruneStopwatch(s, id => !!entities.getInstant(id))
  if (next !== s) useQuick.setState({ stopwatch: next })
}
useEntities.subscribe((s, prev) => { if (s.instants !== prev.instants) prune() })
prune()

export const quick = {
  setStopwatch: (stopwatch: StopwatchState) => useQuick.setState({ stopwatch }),
  resetStopwatch: () => useQuick.setState({ stopwatch: IDLE_STOPWATCH }),
  rememberTimer: (ms: number) => useQuick.setState(s => ({ recentTimers: pushRecentTimer(s.recentTimers, ms) })),
  rememberAlarm: (a: RecentAlarm) => useQuick.setState(s => ({ recentAlarms: pushRecentAlarm(s.recentAlarms ?? [], a) })),
}
