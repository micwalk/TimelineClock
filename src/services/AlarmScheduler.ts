// Watches alarmed instants and rings them. Owns the side effects (timers, sound,
// notifications); the decision logic is in domain/alarms.
import { findDueAlarms, nextAlarmTime, snoozeBaseLabel, snoozeLabel } from '../domain/alarms.ts'
import { timerSpanFor } from '../domain/nativeNotifications.ts'
import { MINUTE } from '../domain/time.ts'
import { useAlarms } from '../store/alarms.ts'
import { entities, useEntities } from '../store/entities.ts'
import { useShell } from '../store/shell.ts'
import { AlarmAudioManager } from './AlarmAudioManager.ts'
import { isNativeShell, requestNativeNotifications, silenceNativeAlarms } from './nativeShell.ts'
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
/** Goes to an alarm's instant when its notification is clicked (set by startAlarmScheduler). */
let onNotificationClick: (instantId: string) => void = () => {}

function hasRinging() {
  return useAlarms.getState().ringing.length > 0
}

/**
 * Whether the page plays the alarm sound. Not inside the Android app: there the alarm
 * notification rings (services/native), also with the app open, and Dismiss / Snooze in either
 * place stops it. The page only rings there if Android won't show notifications.
 */
const pageRings = () => !isNativeShell() || useShell.getState().status?.notifications === false

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
    if (pageRings()) audio.startAlarmSound(hasRinging)
    for (const i of due) {
      const instantId = i.id
      void notifications.notifyAlarm(i.label, { instantId, onClick: () => onNotificationClick(instantId) })
    }
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

/**
 * Stops ringing and turns the alarm off on the instant. A timer's end is done with, so it also
 * stops being a favorite (its span to Now goes).
 */
export function dismiss(instantId: string) {
  useAlarms.setState(s => ({ ringing: s.ringing.filter(r => r.instantId !== instantId) }))
  entities.setAlarmFlag(instantId, false)
  const { instants, spans } = useEntities.getState()
  if (timerSpanFor(instantId, instants, spans)) entities.setFavorite(instantId, false)
  if (!hasRinging()) audio.stopAlarmSound()
}

/** Snooze length (minutes); the Android app's Snooze button uses it too. */
export const SNOOZE_MINUTES = 5

/**
 * Dismisses a ringing alarm and sets a new one `minutes` from now (or at `at`: a snooze from
 * the Android app's notification), labelled "Snooze N: <original>" and linked to the original
 * alarm by a hidden span.
 */
export function snooze(instantId: string, minutes = SNOOZE_MINUTES, at?: number): string | undefined {
  const ringing = useAlarms.getState().ringing.find(r => r.instantId === instantId)
  const original = entities.getInstant(instantId)
  if (!ringing && !original?.alarm) return
  const originalId = original?.snoozeOriginalId ?? instantId
  const rootLabel = entities.getInstant(originalId)?.label ?? original?.label ?? ringing?.label ?? ''
  const count = entities.snoozeCount(originalId) + 1
  const newId = entities.createInstant(at ?? Date.now() + minutes * MINUTE, snoozeLabel(rootLabel, count), {
    alarm: true,
    snoozeOriginalId: originalId,
  })
  if (original) entities.createSpan(instantId, newId, `snooze ${count}: ${snoozeBaseLabel(rootLabel)}`, { visible: false })
  dismiss(instantId)
  return newId
}

/** Stops the sound but keeps alarms on screen (in the Android app, their notifications too). */
export function silence() {
  audio.stopAlarmSound()
  void silenceNativeAlarms()
}

export function primeAudio() {
  audio.initializeAudioContext()
  audio.primeAudioContext()
}

/**
 * Asks for notification permission, once, the first time the user sets something that
 * will ring (a bell on an instant, a timer). Call it from that tap: browsers only allow
 * the prompt during a user gesture. Never asked up front in a browser (the Android app
 * asks on its first start: services/native).
 */
export async function primeNotifications() {
  if (isNativeShell()) return requestNativeNotifications()
  try {
    if ('Notification' in window && Notification.permission === 'default') await Notification.requestPermission()
  } catch (err) {
    console.warn('Notification permission request failed', err)
  }
}

export function startAlarmScheduler(opts: { onNotificationClick?: (instantId: string) => void } = {}) {
  if (opts.onNotificationClick) onNotificationClick = opts.onNotificationClick
  if (started) return
  started = true
  // Reschedule whenever instants change (new alarm, moved alarm, deleted alarm).
  useEntities.subscribe((s, prev) => { if (s.instants !== prev.instants) schedule() })
  // Audio needs a user gesture to unlock. (Notification permission waits for the first
  // alarm or timer: see primeNotifications.)
  const onGesture = () => primeAudio()
  document.addEventListener('pointerdown', onGesture, { once: true })
  document.addEventListener('keydown', onGesture, { once: true })
  if (hasRinging() && pageRings()) audio.startAlarmSound(hasRinging)
  check()
}
