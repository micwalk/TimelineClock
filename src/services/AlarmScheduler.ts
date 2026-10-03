// Watches alarmed instants and rings them. Owns the side effects (timers, sound,
// notifications); the decision logic is in domain/alarms.
import { findDueAlarms, nextAlarmTime } from '../domain/alarms.ts'
import { useAlarms } from '../store/alarms.ts'
import { entities, useEntities } from '../store/entities.ts'
import { AlarmAudioManager } from './AlarmAudioManager.ts'
import { NotificationService } from './NotificationService.ts'

const IDLE_RECHECK_MS = 60_000
const MAX_WAIT_MS = 1000
const MIN_WAIT_MS = 50

// Keep one audio manager across HMR reloads so a ringing alarm doesn't cut out.
const hmr = ((globalThis as unknown as { __TC_HMR__?: { audio?: AlarmAudioManager } }).__TC_HMR__ ??= {})
const audio = (hmr.audio ??= new AlarmAudioManager())
const notifications = new NotificationService()

let timer: ReturnType<typeof setTimeout> | null = null
let started = false

function hasRinging() {
  return useAlarms.getState().ringing.length > 0
}

function check() {
  const now = Date.now()
  const { ringing, autoDismissMs } = useAlarms.getState()

  // Auto-dismiss alarms that have rung long enough.
  const expired = ringing.filter(r => now - r.triggeredAt > autoDismissMs)
  for (const r of expired) dismiss(r.instantId)

  const ringingIds = new Set(useAlarms.getState().ringing.map(r => r.instantId))
  const due = findDueAlarms(useEntities.getState().instants, now, ringingIds, autoDismissMs)
  if (due.length > 0) {
    useAlarms.setState(s => ({
      ringing: [...s.ringing, ...due.map(i => ({ instantId: i.id, label: i.label, tsEpochMs: i.tsEpochMs, triggeredAt: now }))],
    }))
    audio.startAlarmSound(hasRinging)
    for (const i of due) void notifications.notifyAlarm(i.label)
  }
  schedule()
}

function schedule() {
  if (timer) clearTimeout(timer)
  const now = Date.now()
  const next = nextAlarmTime(useEntities.getState().instants, now)
  let wait = IDLE_RECHECK_MS
  if (next !== null) wait = Math.max(MIN_WAIT_MS, Math.min(next - now, MAX_WAIT_MS))
  if (hasRinging()) wait = Math.min(wait, MAX_WAIT_MS) // for auto-dismiss
  timer = setTimeout(check, wait)
}

/** Stops ringing and turns the alarm off on the instant. */
export function dismiss(instantId: string) {
  useAlarms.setState(s => ({ ringing: s.ringing.filter(r => r.instantId !== instantId) }))
  entities.setAlarmFlag(instantId, false)
  if (!hasRinging()) audio.stopAlarmSound()
}

/** Stops the sound but keeps alarms on screen. */
export function silence() {
  audio.stopAlarmSound()
}

export function primeAudio() {
  audio.initializeAudioContext()
  audio.primeAudioContext()
}

export async function primeNotifications() {
  try {
    if ('Notification' in window && Notification.permission === 'default') await Notification.requestPermission()
  } catch (err) {
    console.warn('Notification permission request failed', err)
  }
}

export function startAlarmScheduler() {
  if (started) return
  started = true
  // Reschedule whenever instants change (new alarm, moved alarm, deleted alarm).
  useEntities.subscribe((s, prev) => { if (s.instants !== prev.instants) schedule() })
  // Audio and notification permission need a user gesture.
  const onGesture = () => {
    primeAudio()
    void primeNotifications()
  }
  document.addEventListener('pointerdown', onGesture, { once: true })
  document.addEventListener('keydown', onGesture, { once: true })
  if (hasRinging()) audio.startAlarmSound(hasRinging)
  check()
}
