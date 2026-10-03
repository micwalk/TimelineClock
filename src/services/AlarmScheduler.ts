// Watches alarmed instants and rings them. Owns the side effects (timers, sound,
// notifications); the decision logic is in domain/alarms.
import { findDueAlarms, nextAlarmTime, snoozeBaseLabel, snoozeLabel } from '../domain/alarms.ts'
import { MINUTE } from '../domain/time.ts'
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
  const { ringing, autoDismissMs, unattended } = useAlarms.getState()

  // Alarms nobody answered: dismiss or snooze, per settings.
  const expired = ringing.filter(r => now - r.triggeredAt > autoDismissMs)
  for (const r of expired) {
    if (unattended === 'snooze') snooze(r.instantId)
    else dismiss(r.instantId)
  }

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

/**
 * Dismisses a ringing alarm and sets a new one `minutes` from now, labelled
 * "Snooze N: <original>" and linked to the original alarm by a hidden span.
 */
export function snooze(instantId: string, minutes = 5): string | undefined {
  const ringing = useAlarms.getState().ringing.find(r => r.instantId === instantId)
  if (!ringing) return
  const original = entities.getInstant(instantId)
  const originalId = original?.snoozeOriginalId ?? instantId
  const rootLabel = entities.getInstant(originalId)?.label ?? original?.label ?? ringing.label
  const count = entities.snoozeCount(originalId) + 1
  const newId = entities.createInstant(Date.now() + minutes * MINUTE, snoozeLabel(rootLabel, count), {
    alarm: true,
    snoozeOriginalId: originalId,
  })
  if (original) entities.createSpan(instantId, newId, `snooze ${count}: ${snoozeBaseLabel(rootLabel)}`, { visible: false })
  dismiss(instantId)
  return newId
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
