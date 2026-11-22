// Watches alarmed instants and rings them. Owns the side effects (timers, sound,
// notifications); the decision logic is in domain/alarms.
import type { AlarmAnswer, AlarmRecord } from '../domain/entities.ts'
import { storedInstants } from '../domain/entities.ts'
import { alarmLabel, alarmsToCancel, findAlarm, findDueAlarms, nextAlarmTime, parseRingKey, ringKey, ringTime, snoozeLanding } from '../domain/alarms.ts'
import { timerSpanFor } from '../domain/nativeNotifications.ts'
import type { AlarmSound } from '../domain/sounds.ts'
import { isChime, soundOf } from '../domain/sounds.ts'
import { MINUTE, SECOND } from '../domain/time.ts'
import { getTunables, useSettings } from '../store/settings.ts'
import { useAlarms } from '../store/alarms.ts'
import { entities, useEntities } from '../store/entities.ts'
import { useShell } from '../store/shell.ts'
import { view } from '../store/view.ts'
import { AlarmAudioManager } from './AlarmAudioManager.ts'
import { FANFARE } from './tones.ts'
import { isNativeShell, requestNativeNotifications, silenceNativeAlarms } from './nativeShell.ts'
import { NotificationService } from './NotificationService.ts'

const IDLE_RECHECK_MS = 60_000
const MAX_WAIT_MS = 1000
const MIN_WAIT_MS = 50

// Keep one audio manager across HMR reloads so a ringing alarm doesn't cut out (one from before
// playOnce told when it ends is replaced).
const hmr = ((globalThis as unknown as { __TC_HMR__?: { audio?: AlarmAudioManager } }).__TC_HMR__ ??= {})
if (typeof hmr.audio?.playPreset !== 'function' || hmr.audio.playOnce.length < 2) hmr.audio = new AlarmAudioManager()
const audio = hmr.audio as AlarmAudioManager
const notifications = new NotificationService()

let timer: ReturnType<typeof setTimeout> | null = null
let started = false
/** Goes to an alarm's instant when its notification is clicked (set by startAlarmScheduler). */
let onNotificationClick: (instantId: string) => void = () => {}

function hasRinging() {
  return useAlarms.getState().ringing.length > 0
}

/** An alarm's sound: its own, else the default tone (Settings › Alarms). */
const soundFor = (alarm: AlarmRecord) => soundOf(alarm, useSettings.getState().alarmRings.sound)

/** The tone that plays while alarms ring: the latest to start ringing's. */
function ringingTone(): AlarmSound | null {
  const { ringing } = useAlarms.getState()
  const last = ringing[ringing.length - 1]
  if (!last) return null
  const alarm = findAlarm(entities.getInstant(last.instantId), last.alarmId)
  return alarm ? soundFor(alarm) : useSettings.getState().alarmRings.sound
}

/** Silence was asked for: quiet until another alarm comes due. */
let silenced = false

/** Rings the latest alarm's tone (the page's own sound: pageRings), or stops when none rings. */
function updateSound() {
  const tone = ringingTone()
  if (!tone) { silenced = false; audio.stopAlarmSound() }
  else if (pageRings() && !silenced) audio.startAlarmSound(isChime(tone) ? 'tone1' : tone, hasRinging)
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

  if (useAlarms.getState().chimes.some(c => now - c.triggeredAt > autoDismissMs)) {
    useAlarms.setState(s => ({ chimes: s.chimes.filter(c => now - c.triggeredAt <= autoDismissMs) }))
  }

  const ringingKeys = new Set(useAlarms.getState().ringing.map(r => ringKey(r.instantId, r.alarmId)))
  const due = findDueAlarms(storedInstants(useEntities.getState().instants), now, ringingKeys, autoDismissMs)
  // A chime sounds once and answers itself; the rest ring until answered. In the Android app the
  // native side chimes and reports it (services/native replays it): answered here first, the sync
  // would cancel it before it sounds.
  const chimes = due.filter(d => isChime(soundFor(d.alarm)))
  const rings = due.filter(d => !chimes.includes(d))
  if (!pageRings()) chimes.length = 0
  if (rings.length > 0) {
    useAlarms.setState(s => ({
      ringing: [...s.ringing, ...rings.map(({ inst, alarm }) => ({ instantId: inst.id, alarmId: alarm.id, label: alarmLabel(inst, alarm), tsEpochMs: inst.tsEpochMs, triggeredAt: now }))],
    }))
    silenced = false
    updateSound()
  }
  if (chimes.length > 0 && pageRings()) audio.playOnce('chime')
  for (const { inst, alarm } of [...rings, ...chimes]) {
    const instantId = inst.id
    const chime = chimes.some(c => c.alarm === alarm)
    if (chime) { answer(ringKey(instantId, alarm.id), 'chimed'); showChime(ringKey(instantId, alarm.id)) }
    void notifications.notifyAlarm(alarmLabel(inst, alarm), { instantId, key: ringKey(instantId, alarm.id), onClick: () => onNotificationClick(instantId) }, chime)
  }
  schedule()
}

function schedule() {
  if (timer) clearTimeout(timer)
  const now = Date.now()
  const next = nextAlarmTime(storedInstants(useEntities.getState().instants), now)
  let wait = IDLE_RECHECK_MS
  if (next !== null) wait = Math.max(MIN_WAIT_MS, Math.min(next - now, MAX_WAIT_MS))
  if (hasRinging()) wait = Math.min(wait, MAX_WAIT_MS) // for auto-dismiss
  const { chimes, autoDismissMs } = useAlarms.getState()
  for (const c of chimes) wait = Math.min(wait, Math.max(MIN_WAIT_MS, c.triggeredAt + autoDismissMs - now + 1)) // cards going
  timer = setTimeout(check, wait)
}

/** Whether an alarm (by ring key) is ringing. */
export const isAlarmRinging = (key: string) => useAlarms.getState().ringing.some(r => ringKey(r.instantId, r.alarmId) === key)

/** Stops alarms ringing (they may be answered already); the sound stops with the last one. */
function stopRinging(instantId: string, alarmIds: readonly string[]) {
  useAlarms.setState(s => ({ ringing: s.ringing.filter(r => !(r.instantId === instantId && alarmIds.includes(r.alarmId))) }))
  updateSound()
}

/**
 * Answers an alarm (by ring key): stops it ringing and keeps it as history (it never rings
 * again). The last alarm at or after a timer's end (its own, or the last snooze of it) finishes
 * the timer, so its end also stops being a favorite (its span to Now goes).
 */
export const dismiss = (key: string) => answer(key, 'dismissed')

/** A chime at `key` sounded (from the Android app, which chimes there itself). */
export function chimed(key: string) {
  answer(key, 'chimed')
  showChime(key)
}

/**
 * Shows a chime that sounded as a card in the app (RingingAlarms), until OK'd or as long as an
 * alarm rings unanswered (`autoDismissMs`); one reported later than that (the app was closed) shows none.
 */
function showChime(key: string) {
  const { instantId, alarmId } = parseRingKey(key)
  const inst = entities.getInstant(instantId)
  const alarm = findAlarm(inst, alarmId)
  if (!inst || !alarm) return
  const at = ringTime(inst, alarm)
  const { chimes, autoDismissMs } = useAlarms.getState()
  if (Date.now() - at > autoDismissMs || chimes.some(c => c.instantId === instantId && c.alarmId === alarmId)) return
  useAlarms.setState({ chimes: [...chimes, { instantId, alarmId, label: alarmLabel(inst, alarm), tsEpochMs: inst.tsEpochMs, triggeredAt: at }] })
  schedule()
}

/** Takes a chime's card away (its OK). */
export function clearChime(key: string) {
  useAlarms.setState(s => ({ chimes: s.chimes.filter(c => ringKey(c.instantId, c.alarmId) !== key) }))
}

/**
 * Dismisses an alarm, or records that it chimed: either way it is over (see dismiss). `todo`: a
 * todo's alarm at its time starts it counting (startTodoCount); the app's own stops (Later, Done,
 * Unschedule: store/actions) pass false.
 */
function answer(key: string, how: Exclude<AlarmAnswer, 'snoozed'>, todo = true) {
  const { instantId, alarmId } = parseRingKey(key)
  const alarm = findAlarm(entities.getInstant(instantId), alarmId)
  if (alarm) entities.answerAlarms(instantId, [alarmId], how)
  stopRinging(instantId, [alarmId])
  if (todo && alarm) startTodoCount(instantId, alarm)
  const inst = entities.getInstant(instantId)
  const { instants, spans } = useEntities.getState()
  const stillDue = inst?.alarms?.some(a => !a.answered && a.offsetMs <= 0)
  if ((!alarm || alarm.offsetMs <= 0) && !stillDue && timerSpanFor(instantId, instants, spans)) {
    const nowSpan = entities.nowSpanOf(instantId)
    if (nowSpan) view.forgetSpan(nowSpan.id)
    entities.setFavorite(instantId, false)
  }
}

/**
 * A todo's alarm at (or after) its time was dismissed, or chimed: it can't disappear, it starts
 * counting (docs/prd_todos.md §4.3). Its `at` instant is favorited, so its span to Now counts on
 * the live side from the scheduled time, and its other alarms still to ring are cancelled (it is
 * under way). A warning before its time only answers the warning.
 */
function startTodoCount(instantId: string, alarm: AlarmRecord) {
  const inst = entities.getInstant(instantId)
  if (inst?.todo?.role !== 'at' || alarm.offsetMs > 0) return
  if (entities.getTodo(inst.todo.id)?.status !== 'open') return
  const now = Date.now()
  for (const a of inst.alarms ?? []) if (!a.answered && a.id !== alarm.id && ringTime(inst, a) > now) entities.removeAlarm(instantId, a.id)
  if (!inst.favorite && inst.tsEpochMs <= now) entities.setFavorite(instantId, true)
}

/**
 * Stops an alarm ringing without starting a todo's count: the app's own answers, when it is about
 * to do something else with the todo (Later moves it, Done finishes it, Unschedule puts it back).
 */
export const dismissQuietly = (key: string) => answer(key, 'dismissed', false)

/** Answers every ringing alarm of an instant (it is going away). */
export function dismissInstant(instantId: string) {
  for (const r of useAlarms.getState().ringing) if (r.instantId === instantId) dismissQuietly(ringKey(r.instantId, r.alarmId))
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
  const nextId = 'joins' in landing ? landing.joins : entities.addAlarm(instantId, { offsetMs: landing.offsetMs, snoozeOf: alarmId, ...(alarm.sound ? { sound: alarm.sound } : {}) })
  stopRinging(instantId, [alarmId])
  return ringKey(instantId, nextId)
}

/** Snoozes an alarm `minutes` from now (or until `at`: a snooze from the Android app's notification). */
export const snooze = (key: string, minutes = SNOOZE_MINUTES, at?: number): string | undefined =>
  snoozeUntil(key, at ?? Date.now() + minutes * MINUTE)

/**
 * Cancels all of an instant's alarms (the opposite of a snooze). Those that rang (ringing, or due
 * already) are dismissed and stay as history; those still to ring are deleted, as if never set.
 */
export function cancelAlarms(instantId: string) {
  const inst = entities.getInstant(instantId)
  if (!inst) return
  const now = Date.now()
  const ringing = new Set(useAlarms.getState().ringing.filter(r => r.instantId === instantId).map(r => r.alarmId))
  for (const a of alarmsToCancel(inst)) {
    // Cancelling isn't answering it to get on with a todo: no count starts.
    if (ringing.has(a.id) || ringTime(inst, a) <= now) dismissQuietly(ringKey(instantId, a.id))
    else entities.removeAlarm(instantId, a.id)
  }
}

/** Stops the sound but keeps alarms on screen (in the Android app, their notifications too). */
export function silence() {
  silenced = true
  audio.stopAlarmSound()
  void silenceNativeAlarms()
}

/**
 * Plays a sound once to hear what it is (services/soundPreview); the web presets (the Android app
 * plays its own: services/native). `onEnded` when it has played out or been cut; returns whether it plays.
 */
export const previewSound = (sound: AlarmSound, onEnded?: () => void) => audio.playOnce(sound, onEnded)

/** The Done fanfare (services/tones FANFARE), at `volume` (0–1). Only while the page is on screen. */
export function playFanfare(volume: number) {
  if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return
  audio.playPreset(FANFARE, volume)
}

/** Stops a preview. */
export const stopPreview = () => audio.stopOnce()

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
  if (hasRinging()) updateSound()
  check()
}
