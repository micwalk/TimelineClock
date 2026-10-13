// Watches alarmed instants and rings them. Owns the side effects (timers, sound,
// notifications); the decision logic is in domain/alarms.
import { alarmLabel, alarmsToCancel, findAlarm, findDueAlarms, nextAlarmTime, parseRingKey, ringKey, ringTime, snoozeLanding, warningsToCancel } from '../domain/alarms.ts'
import { timerSpanFor } from '../domain/nativeNotifications.ts'
import { MINUTE, SECOND } from '../domain/time.ts'
import { getTunables } from '../store/settings.ts'
import { useAlarms } from '../store/alarms.ts'
import { entities, useEntities } from '../store/entities.ts'
import { useShell } from '../store/shell.ts'
import { view } from '../store/view.ts'
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
    const key = ringKey(r.instantId, r.alarmId)
    if (unattended === 'snooze') snooze(key)
    else dismiss(key)
  }

  const ringingKeys = new Set(useAlarms.getState().ringing.map(r => ringKey(r.instantId, r.alarmId)))
  const due = findDueAlarms(useEntities.getState().instants, now, ringingKeys, autoDismissMs)
  if (due.length > 0) {
    useAlarms.setState(s => ({
      ringing: [...s.ringing, ...due.map(({ inst, alarm }) => ({ instantId: inst.id, alarmId: alarm.id, label: alarmLabel(inst, alarm), tsEpochMs: inst.tsEpochMs, triggeredAt: now }))],
    }))
    if (pageRings()) audio.startAlarmSound(hasRinging)
    for (const { inst, alarm } of due) {
      const instantId = inst.id
      void notifications.notifyAlarm(alarmLabel(inst, alarm), { instantId, key: ringKey(instantId, alarm.id), onClick: () => onNotificationClick(instantId) })
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

/** Whether an alarm (by ring key) is ringing. */
export const isAlarmRinging = (key: string) => useAlarms.getState().ringing.some(r => ringKey(r.instantId, r.alarmId) === key)

/** Stops alarms ringing (they may be answered already); the sound stops with the last one. */
function stopRinging(instantId: string, alarmIds: readonly string[]) {
  useAlarms.setState(s => ({ ringing: s.ringing.filter(r => !(r.instantId === instantId && alarmIds.includes(r.alarmId))) }))
  if (!hasRinging()) audio.stopAlarmSound()
}

/**
 * Answers an alarm (by ring key): stops it ringing and keeps it as history (it never rings
 * again). The last alarm at or after a timer's end (its own, or the last snooze of it) finishes
 * the timer, so its end also stops being a favorite (its span to Now goes).
 */
export function dismiss(key: string) {
  const { instantId, alarmId } = parseRingKey(key)
  const alarm = findAlarm(entities.getInstant(instantId), alarmId)
  if (alarm) entities.answerAlarms(instantId, [alarmId], 'dismissed')
  stopRinging(instantId, [alarmId])
  const inst = entities.getInstant(instantId)
  const { instants, spans } = useEntities.getState()
  const stillDue = inst?.alarms?.some(a => !a.answered && a.offsetMs <= 0)
  if ((!alarm || alarm.offsetMs <= 0) && !stillDue && timerSpanFor(instantId, instants, spans)) {
    const nowSpan = entities.nowSpanOf(instantId)
    if (nowSpan) view.forgetSpan(nowSpan.id)
    entities.setFavorite(instantId, false)
  }
}

/** Answers every ringing alarm of an instant (it is going away). */
export function dismissInstant(instantId: string) {
  for (const r of useAlarms.getState().ringing) if (r.instantId === instantId) dismiss(ringKey(r.instantId, r.alarmId))
}

/** Snooze length (minutes); the Android app's Snooze button uses it too. */
export const SNOOZE_MINUTES = 5

/**
 * Snoozes an alarm (by ring key) until `at`: it is answered 'snoozed' and another alarm on the
 * same instant rings then (domain/alarms snoozeLanding: a warning never lands past its instant;
 * it lands on it, or joins the alarm already there). Returns the ring key of the alarm that rings
 * next, or undefined when there was nothing to snooze.
 */
export function snoozeUntil(key: string, at: number, exact = false): string | undefined {
  const { instantId, alarmId } = parseRingKey(key)
  const inst = entities.getInstant(instantId)
  const alarm = findAlarm(inst, alarmId)
  if (!inst || !alarm || alarm.answered) { stopRinging(instantId, [alarmId]); return }
  const landing = snoozeLanding(inst, alarm, at, Date.now(), getTunables().snoozeJoinSec * SECOND, exact)
  entities.answerAlarms(instantId, [alarmId], 'snoozed')
  const nextId = 'joins' in landing ? landing.joins : entities.addAlarm(instantId, { offsetMs: landing.offsetMs, snoozeOf: alarmId })
  stopRinging(instantId, [alarmId])
  return ringKey(instantId, nextId)
}

/** Snoozes an alarm `minutes` from now (or until `at`: a snooze from the Android app's notification). */
export const snooze = (key: string, minutes = SNOOZE_MINUTES, at?: number): string | undefined =>
  snoozeUntil(key, at ?? Date.now() + minutes * MINUTE)

/**
 * Cancels an instant's alarms (the opposite of a snooze): its warnings (the alarm at the instant
 * stays), or all of them. Those that rang (ringing, or due already) are dismissed and stay as
 * history; those still to ring are deleted, as if never set.
 */
export function cancelAlarms(instantId: string, which: 'warnings' | 'all') {
  const inst = entities.getInstant(instantId)
  if (!inst) return
  const now = Date.now()
  const ringing = new Set(useAlarms.getState().ringing.filter(r => r.instantId === instantId).map(r => r.alarmId))
  for (const a of which === 'warnings' ? warningsToCancel(inst) : alarmsToCancel(inst)) {
    if (ringing.has(a.id) || ringTime(inst, a) <= now) dismiss(ringKey(instantId, a.id))
    else entities.removeAlarm(instantId, a.id)
  }
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
