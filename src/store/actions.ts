// User-level operations that touch several stores and/or the viewport engine.
// Components and hotkeys call these; they are the app's behavior in one place.
import { engine } from '../engine/viewportEngine.ts'
import type { Frame } from '../engine/viewportEngine.ts'
import type { NavTarget } from '../domain/navigation.ts'
import { findAdjacent, stepFocusHistory } from '../domain/navigation.ts'
import { panCenterByPixels, widthToShow, zoomToFitRange } from '../domain/viewport.ts'
import type { TimeRef } from '../domain/spans.ts'
import { resolveTimeRef } from '../domain/spans.ts'
import { DAY, MINUTE, SECOND, TIME_INCREMENT_OPTIONS, incrementOption } from '../domain/time.ts'
import { atClockTimeOnDay, parseDurationInput, to24h } from '../domain/format.ts'
import { entities, useEntities } from './entities.ts'
import { useView, view } from './view.ts'
import { agendaFromSettings, recomputeLayout, useLayout } from './layout.ts'
import { resolveOrientation } from '../domain/layoutMode.ts'
import type { SettingsState } from './settings.ts'
import { getTunables, sanitizeSettings, useSettings } from './settings.ts'
import { labelSpacingPx, nearestFinestTick } from '../domain/ticks.ts'
import { ui, useUi } from './ui.ts'
import { sanitizeAlarmPrefs, useAlarms } from './alarms.ts'
import type { Backup, ImportMode } from '../domain/backup.ts'
import { BACKUP_FORMAT, BACKUP_VERSION, importedData } from '../domain/backup.ts'
import { syncFavorites } from '../domain/entities.ts'
import { NOW_TARGET, findCapture } from '../domain/capture.ts'
import type { NotificationKind } from '../domain/nativeNotifications.ts'
import { liveTapTarget } from '../domain/nativeNotifications.ts'
import { SNOOZE_MINUTES, cancelAlarms as cancelAlarmsNow, dismiss, dismissInstant, isAlarmRinging, primeNotifications, snoozeUntil } from '../services/AlarmScheduler.ts'
import type { Repeat, SeriesRecord } from '../domain/series.ts'
import {
  OCCURRENCE_HORIZON_MS, dateKey, newGroupId, newOccurrence, occurrenceTs, parseVirtualId, planOccurrences, refreshOccurrence, remakeable, ruleFromOccurrence, seriesFromInstant,
} from '../domain/series.ts'
import { newAlarmId, newInstantId } from '../domain/entities.ts'
import type { RingingChoices, SnoozeLanding } from '../domain/alarms.ts'
import { findAlarm, hasArmedAlarm, parseRingKey, ringKey, ringingChoices, snoozeLanding, syncAlarmVisibility } from '../domain/alarms.ts'
import { quick, useQuick } from './quick.ts'
import {
  closedSpanLabel, formatTimerLength, lapLabel, stopwatchPhase, stopwatchStartLabel, stopwatchStopLabel,
} from '../domain/quickCreate.ts'

const v = () => useView.getState()
// Sample the viewport at the moment of the action (not the last, possibly idle-old, frame).
const frame = () => engine.sample()

/** Time under the cursor (the view center) as currently displayed. */
export const cursorTime = () => frame().center

/** Now, as currently displayed. */
export const nowTime = () => frame().now

/** Keep a locked cursor's offset in sync after the cursor is moved by hand. */
function refreshLock() {
  if (v().cursorLocked) {
    const f = frame()
    view.setCursorLock(true, v().timeCenter, f.now)
  }
}

// ---------------------------------------------------------------------------
// Focus & navigation

export function focusNow(animate = true) {
  if (animate) engine.beginTransition()
  view.setFocus('now')
}

export function focusInstant(id: string, animate = true) {
  const inst = entities.getInstant(id)
  if (!inst) return
  if (animate) engine.beginTransition()
  view.setFocus('instant', { instantId: id })
  view.setTimeCenter(inst.tsEpochMs)
}

export const isInstantFocused = (id: string) => v().viewFocusMode === 'instant' && v().focusedInstantId === id

/**
 * Double-tap on an instant's chip: focus it; once focused, rename it (as activateSpan does for
 * spans). `wasFocused`: whether it was focused before the double-tap began (its first tap can
 * focus a chip under the cursor).
 */
export function activateInstant(id: string, wasFocused = isInstantFocused(id)) {
  if (v().moveMode) return
  if (wasFocused) view.editInstant(id)
  else focusInstant(id)
}

/** Double-tap on the Now tag: go to Now; once there, drop an instant at Now with its name editor open. */
export function activateNow() {
  if (v().viewFocusMode !== 'now') { focusNow(); return }
  view.editInstant(dropInstant())
}

/**
 * Goes to an instant from outside the timeline (an alarm notification): focus and select it,
 * and show the Agenda tab that lists it. Falls back to Now if it no longer exists.
 */
export function revealInstant(id: string, animate = true) {
  const inst = entities.getInstant(id)
  if (!inst) { focusNow(animate); return }
  focusInstant(id, animate)
  const tab = useUi.getState().listTab
  if (tab === 'spans' || (tab === 'favorites' && !inst.favorite)) ui.setListTab('instants')
}

/** A notification tap shows at least this much time, so a few seconds of overtime aren't blown up to fill the screen. */
const REVEAL_MIN_WIDTH = 2 * MINUTE

/**
 * A tap on one of the Android app's notifications (domain/nativeNotifications liveTapTarget):
 * the stopwatch's run, a running timer's span, or an alarm's overtime, focused and selected.
 */
export function revealLive(kind: NotificationKind, key: string) {
  const { instantId } = parseRingKey(key) // an alarm's tap names the alarm
  const { instants, spans } = useEntities.getState()
  const target = liveTapTarget(kind, instantId, instants, spans, nowTime())
  if (!target) { focusNow(); return }
  if ('instantId' in target) { revealInstant(target.instantId); return }
  focusSpan(target.spanId)
  if (v().timeWidth < REVEAL_MIN_WIDTH) view.setTimeWidth(REVEAL_MIN_WIDTH)
  view.selectSpan(target.spanId)
}

/** Free cursor at the given time (keeps zoom). */
export function focusCursorAt(ts: number, animate = true) {
  if (animate) engine.beginTransition()
  view.setFocus('cursor')
  view.setTimeCenter(ts)
  refreshLock()
}

/** Zoom to show all the given times (a "+N" chip or "⟲N" badge): free cursor at the middle, the span filling 60% of the axis, at least 2 minutes wide. */
export function zoomToTimes(times: readonly number[]) {
  if (times.length === 0) return
  const lo = Math.min(...times)
  const hi = Math.max(...times)
  focusCursorAt((lo + hi) / 2)
  view.setTimeWidth(Math.max((hi - lo) / 0.6, 2 * MINUTE))
}

export function focusSpan(spanId: string, zoomToFit = true) {
  const sp = entities.getSpan(spanId)
  if (!sp) return
  const a = entities.getInstant(sp.startInstantId)?.tsEpochMs
  const b = sp.endIsNow ? frame().now : entities.getInstant(sp.endInstantId)?.tsEpochMs
  engine.beginTransition()
  view.setFocus('span', { spanId })
  if (zoomToFit && typeof a === 'number' && typeof b === 'number') {
    const fit = zoomToFitRange(frame(), a, b)
    if (fit) view.setTimeWidth(fit.width)
  }
}

export function moveCursorBy(deltaMs: number) {
  engine.stopMomentum()
  endNaming()
  view.setTimeCenter(frame().center + deltaMs)
  if (v().viewFocusMode !== 'cursor') view.setFocus('cursor')
  refreshLock()
  landIfExact(false)
}

/**
 * Moves that target a precise time (± steps, typed times) land on Now or an instant only on
 * an essentially exact hit (domain/capture, the same rule as a cursor at rest), so a typed
 * time is never pulled to a nearby instant. px, capped at half a second when zoomed far out.
 */
const EXACT_LANDING_PX = 2
const EXACT_LANDING_MAX_MS = 500

/** What sits exactly at `ts` (Now too, with `withNow`), by the capture rule at rest. */
function exactHit(ts: number, withNow: boolean): LandingTarget | null {
  const f = frame()
  const id = findCapture({
    instants: useEntities.getState().instants.map(i => ({ id: i.id, ts: i.tsEpochMs, hidden: i.hidden })),
    now: withNow ? f.now : undefined, center: ts, pxPerMs: f.pxPerMs,
    radiusPx: Math.min(EXACT_LANDING_PX, EXACT_LANDING_MAX_MS * f.pxPerMs),
  })
  return id ? { id, kind: id === NOW_TARGET ? 'now' : 'instant' } : null
}

/** Lands a free cursor that came to rest exactly on Now or an instant: it focuses that instead. */
function landIfExact(animate: boolean): boolean {
  if (v().viewFocusMode !== 'cursor' || v().moveMode) return false
  const hit = exactHit(frame().center, true)
  if (hit) landOn(hit, animate)
  return !!hit
}

/** What a released drag lands on: what the cursor showed it was on (components/timeline/capture). */
export interface LandingTarget { id: string; kind: 'instant' | 'now' }

/** The cursor lands on Now or an instant: it focuses it (the cursor "becomes" it). */
function landOn(target: LandingTarget, animate: boolean) {
  if (target.kind === 'now') focusNow(animate)
  else focusInstant(target.id, animate)
}

/** Within this many px of the cursor, an instant counts as "under" it. */
const UNDER_CURSOR_PX = 20

export function moveCursorByIncrement(direction: 1 | -1) {
  moveCursorBy(direction * incrementOption(v().timeIncrement).milliseconds)
}

function navItems(f: Frame): NavTarget[] {
  const items: NavTarget[] = [{ kind: 'now', ts: f.now }]
  if (v().viewFocusMode === 'cursor') items.push({ kind: 'cursor', ts: f.center })
  for (const i of useEntities.getState().instants) if (!i.hidden) items.push({ kind: 'saved', id: i.id, ts: i.tsEpochMs })
  return items
}

function navAnchor(f: Frame): number {
  const s = v()
  if (s.viewFocusMode === 'instant' && s.focusedInstantId) return entities.getInstant(s.focusedInstantId)?.tsEpochMs ?? f.now
  if (s.viewFocusMode === 'cursor') return f.center
  if (s.viewFocusMode === 'span') return f.center
  return f.now
}

export function goToAdjacentInstant(direction: 1 | -1) {
  // One clock reading for both: read twice, Now could land a millisecond before itself and
  // "previous" would go to Now instead of the instant before it.
  const f = frame()
  const target = findAdjacent(navItems(f), navAnchor(f), direction)
  if (!target) return
  if (target.kind === 'saved') focusInstant(target.id)
  else if (target.kind === 'cursor') focusCursorAt(target.ts)
  else focusNow()
}

export function navigateFocusHistory(delta: -1 | 1) {
  const s = v()
  const index = stepFocusHistory(s, delta)
  if (index === null) return
  const id = s.focusHistory[index]
  const inst = entities.getInstant(id)
  if (!inst) return
  engine.beginTransition()
  useView.setState({ focusHistoryIndex: index })
  view.setFocus('instant', { instantId: id, skipHistory: true })
  view.setTimeCenter(inst.tsEpochMs)
}

// ---------------------------------------------------------------------------
// Zoom & pan

export function zoomBy(factor: number) {
  engine.stopMomentum()
  view.setTimeWidth(v().timeWidth * factor)
}

const ZOOM_STEP = 0.1
export const zoomIn = () => zoomBy(1 - ZOOM_STEP)
export const zoomOut = () => zoomBy(1 + ZOOM_STEP)

/** Start of a drag: detach from whatever was followed, keeping the current on-screen center. */
export function beginPan() {
  engine.cancelTransition()
  endNaming()
  const f = frame()
  view.setTimeCenter(f.center)
  if (v().viewFocusMode !== 'cursor') view.setFocus('cursor')
}

export function panByPixels(dx: number) {
  const f = frame()
  view.setTimeCenter(panCenterByPixels({ ...f, center: v().timeCenter }, dx))
  refreshLock()
}

/** Mouse wheel / trackpad scroll along the time axis: pans like a drag, without the landing snap. */
export function wheelPan(dPx: number) {
  endNaming()
  if (v().viewFocusMode !== 'cursor') beginPan()
  panByPixels(-dPx)
}

/** Rotate button: flips the orientation for this shape class; back to what the settings give clears the override. */
export function rotate() {
  engine.stopMomentum()
  const { orientation, shape } = useLayout.getState()
  const next = orientation === 'horizontal' ? 'vertical' : 'horizontal'
  const fromSettings = resolveOrientation(useSettings.getState().orientation, null, shape)
  useLayout.setState({ override: next === fromSettings ? null : { orientation: next, shape } })
  recomputeLayout()
}

/** Agenda dock/drawer button: switches this shape class between docked and drawer; back to what the settings give clears the override. */
export function toggleAgendaDock() {
  const { agendaPlacement, shape } = useLayout.getState()
  const placement = agendaPlacement === 'drawer' ? 'docked' : 'drawer'
  useLayout.setState({ agendaOverride: { placement, shape } })
  recomputeLayout()
  // Compare against the settings alone, now that the layout is resolved.
  if ((agendaFromSettings() === 'drawer') === (useLayout.getState().agendaPlacement === 'drawer')) {
    useLayout.setState({ agendaOverride: null })
    recomputeLayout()
  }
  ui.closeAgenda()
}

/**
 * End of a drag. It lands on what the cursor showed it was about to land on (`land`: the
 * capture, the one rule for "near enough"). Otherwise, released almost at rest (`snap`), it
 * eases to the nearest tick within `tickSnapPx` when the setting is on; `{ snap: false }` (a
 * release with speed) leaves the cursor exactly where the pan stopped.
 */
export function endPan({ snap = true, land = null }: { snap?: boolean; land?: LandingTarget | null } = {}) {
  if (v().viewFocusMode !== 'cursor' || v().moveMode) return
  if (land) { landOn(land, true); return }
  if (!snap || !useSettings.getState().tickSnap) return
  const f = frame()
  const tick = nearestFinestTick(f.center, f.pxPerMs, labelSpacingPx(f.orientation))
  if (tick === f.center || Math.abs(tick - f.center) * f.pxPerMs > getTunables().tickSnapPx) return
  engine.beginTransition(getTunables().tickSnapEaseMs)
  view.setTimeCenter(tick)
  refreshLock()
}

/** Folds the Cursor tag into its arrowhead and hides its line (or shows them again). Nothing else changes. */
export function setCursorHidden(hidden: boolean) {
  if (hidden) { ui.closeTagMenu(); ui.closeTimeInput(); endNaming() }
  useUi.setState({ cursorHidden: hidden })
}
export const toggleCursorHidden = () => setCursorHidden(!useUi.getState().cursorHidden)

export function toggleCursorLock() {
  const f = frame()
  const locking = !v().cursorLocked
  if (v().viewFocusMode !== 'cursor') {
    view.setTimeCenter(f.center)
    view.setFocus('cursor')
  }
  view.setCursorLock(locking, f.center, f.now)
}

// ---------------------------------------------------------------------------
// Selection & editing

/** Selects an instant; if it's under the free cursor, the cursor lands on it instead. */
export function selectInstant(id: string) {
  const inst = entities.getInstant(id)
  const s = v()
  if (inst && s.viewFocusMode === 'cursor' && !s.moveMode) {
    const f = frame()
    if (Math.abs(f.pos(inst.tsEpochMs) - f.mainSize / 2) <= UNDER_CURSOR_PX) {
      focusInstant(id)
      return
    }
  }
  view.selectInstant(id)
}
export const selectSpan = (id: string) => view.selectSpan(id)

/** A tap on empty timeline: clears both selected instants and the selected span, nothing else. */
export function clearSelection() {
  useView.setState({ currentSelectedInstantId: null, secondarySelectedInstantId: null, selectedSpanId: null })
}

export function escape() {
  const s = v()
  if (s.moveMode) cancelMove()
  else view.deselect()
}

// ---------------------------------------------------------------------------
// Instants

/**
 * The primary action: drop an unnamed instant at the cursor (cursor mode) or at Now.
 * Nothing else changes: no focus, selection, editing or view movement. The new id is
 * flagged for a one-time highlight; naming happens later, in one tap, on the chip.
 */
export function dropInstant(opts: { favorite?: boolean } = {}) {
  const ts = v().viewFocusMode === 'cursor' ? cursorTime() : nowTime()
  const id = entities.createInstant(ts, '')
  if (opts.favorite) setFavorite(id, true)
  ui.markDropped(id)
  return id
}

/**
 * The Cursor tag's ＋: drop an unnamed instant at the cursor with its name box open (the ＋
 * turns into its chip). Leaving it empty keeps it unnamed; moving the cursor or tapping
 * elsewhere ends naming. Returns the new id.
 */
export function dropAndName(): string {
  const ts = cursorTime()
  const id = entities.createInstant(ts, '')
  view.editInstant(id)
  return id
}

/** Ends naming an instant (keeping what was typed): moving the cursor away does this. */
export function endNaming() {
  if (!v().editingInstantId) return
  const el = typeof document !== 'undefined' ? document.activeElement : null
  // The name box commits on blur.
  if (el instanceof HTMLInputElement && el.closest('.chip--saved')) el.blur()
  else view.editInstant(null)
}

// ---------------------------------------------------------------------------
// Timer and Stopwatch buttons: quick ways to make instants and spans (domain/quickCreate)

/**
 * Timer: an instant at Now, an alarmed instant `ms` later (its live lane to Now counts
 * down), and the saved span between them (the original length). Returns the end's id.
 */
export function startTimer(ms: number) {
  const now = nowTime()
  const label = `${formatTimerLength(ms)} timer`
  const start = entities.createInstant(now, '')
  const end = entities.createInstant(now + ms, label, { alarm: true })
  entities.setFavorite(end, true) // its span to Now is the countdown
  entities.createSpan(start, end, label, { visible: true })
  quick.rememberTimer(ms)
  ui.markDropped(end)
  void primeNotifications() // the first timer asks for notification permission
  showAroundNow([now, now + ms])
  return end
}

/** Narrowest view when showing a stopwatch's run: laps a few seconds apart still get their own chips. */
const STOPWATCH_MIN_WIDTH = 30 * SECOND

/**
 * Follow Now, zoomed so all of `times` are on screen and far enough apart that their chips
 * don't collapse into "+N". Used when a timer or stopwatch is set.
 */
function showAroundNow(times: readonly number[], minWidth = 0) {
  engine.beginTransition()
  view.setFocus('now')
  view.setTimeWidth(widthToShow(nowTime(), times, minWidth))
}

const stopwatch = () => useQuick.getState().stopwatch

/**
 * Focus and select a stopwatch span. For a span to Now the view starts narrow and, being
 * span focus, widens as the span grows, so the whole run stays in frame.
 */
function trackSpan(spanId: string | undefined, startWidth?: number) {
  if (!spanId) return
  engine.beginTransition()
  if (startWidth) view.setTimeWidth(startWidth)
  view.setFocus('span', { spanId })
  view.selectSpan(spanId)
}

/** Stopwatch start: an instant at Now, favorited, so its span to Now is tracked (focused and selected). */
export function startStopwatch() {
  if (stopwatchPhase(stopwatch()) !== 'idle') return
  const id = entities.createInstant(nowTime(), stopwatchStartLabel)
  setFavorite(id, true)
  ui.markDropped(id)
  quick.setStopwatch({ marks: [id], stopped: false })
  trackSpan(entities.nowSpanOf(id)?.id, STOPWATCH_MIN_WIDTH)
}

/** Closes the tracked span at a new instant at Now (a lap or the stop); returns the new instant's id. */
function closeStopwatchSpan(stopping: boolean) {
  const { marks } = stopwatch()
  const prev = marks[marks.length - 1]
  const id = entities.createInstant(nowTime(), stopping ? stopwatchStopLabel : lapLabel(marks.length))
  entities.createSpan(prev, id, closedSpanLabel(marks.length, stopping), { visible: true })
  // The lap just ended stops being tracked; the start stays favorited through laps (a setting)
  // until the stopwatch stops.
  const keepStart = useSettings.getState().stopwatchKeepStart && !stopping
  if (prev !== marks[0] || !keepStart) setFavorite(prev, false)
  if (stopping && marks[0] !== prev) setFavorite(marks[0], false)
  quick.setStopwatch({ marks: [...marks, id], stopped: stopping })
  return id
}

/** Lap: an instant at Now ends the current lap (saved as a span); tracking moves to the new lap, the view keeps the whole run. */
export function lapStopwatch() {
  if (stopwatchPhase(stopwatch()) !== 'running') return
  const id = closeStopwatchSpan(false)
  setFavorite(id, true)
  // Keep the whole run in view: focus the start's span to Now (the run's total, shown next
  // to the current lap's lane).
  trackSpan(entities.nowSpanOf(stopwatch().marks[0])?.id)
}

/**
 * Stop: an instant at Now ends the last lap (saved as a span), and the whole run, start to
 * stop, becomes a "Stopwatch" span that is focused and selected: the stopwatch's reading.
 * Without laps the span the stop closes is already that run.
 */
export function stopStopwatch() {
  if (stopwatchPhase(stopwatch()) !== 'running') return
  const { marks } = stopwatch()
  const start = marks[0]
  const stop = closeStopwatchSpan(true)
  const existing = useEntities.getState().spans.find(sp => sp.startInstantId === start && sp.endInstantId === stop)
  const run = existing?.id ?? entities.createSpan(start, stop, stopwatchStartLabel, { visible: true })
  focusSpan(run)
  view.selectSpan(run)
}

/** Reset: stop tracking. Everything the stopwatch made stays on the timeline. */
export function resetStopwatch() {
  const s = stopwatch()
  if (stopwatchPhase(s) === 'running') {
    setFavorite(s.marks[s.marks.length - 1], false)
    setFavorite(s.marks[0], false)
  }
  quick.resetStopwatch()
}

/** A favorite is an instant whose span to Now is tracked: unfavoriting deletes that span. */
export function setFavorite(id: string, favorite: boolean) {
  const sp = favorite ? undefined : entities.nowSpanOf(id)
  if (sp) view.forgetSpan(sp.id)
  entities.setFavorite(id, favorite)
}

export function toggleFavorite(id: string) {
  const inst = entities.getInstant(id)
  if (inst) setFavorite(id, !inst.favorite)
}

/** Adds an alarm at the instant (its bell can then be dragged earlier); returns its id. */
export function addAlarm(id: string): string | undefined {
  if (!entities.getInstant(id)) return
  const alarmId = entities.addAlarm(id)
  touchOccurrence(id)
  void primeNotifications() // the first bell asks for notification permission
  return alarmId
}

/** Deletes one alarm; a ringing one is answered first (it was heard). */
export function removeAlarm(id: string, alarmId: string) {
  const key = ringKey(id, alarmId)
  if (isAlarmRinging(key)) dismiss(key)
  entities.removeAlarm(id, alarmId)
  touchOccurrence(id)
  if (useUi.getState().selectedBell === alarmId) ui.selectBell(null)
}

/**
 * Sets how long before its instant an alarm rings. It never rings in the past: an offset that
 * would is cut back to Now. Only a snooze already after its instant may stay after it; others
 * stop at the instant. Answered alarms stay as they were (history).
 */
export function setAlarmOffset(id: string, alarmId: string, offsetMs: number) {
  const inst = entities.getInstant(id)
  const alarm = findAlarm(inst, alarmId)
  if (!inst || !alarm || alarm.answered) return
  const earliest = alarm.offsetMs < 0 ? -Infinity : 0
  const latest = Math.max(earliest === 0 ? 0 : -Infinity, inst.tsEpochMs - nowTime())
  entities.setAlarmOffset(id, alarmId, Math.min(Math.max(earliest, offsetMs), latest))
  if (!alarm.snoozeOf) touchOccurrence(id)
}

/** Taps a bell: selects it (its tools show), or lets go of it on a second tap. */
export function selectBell(alarmId: string | null) {
  ui.selectBell(useUi.getState().selectedBell === alarmId ? null : alarmId)
}

/**
 * Hides an instant from the timeline (or shows it again). Its spans stay; it stays in the
 * Agenda. Hiding the selected or focused instant lets go of it so it actually disappears.
 */
export function setInstantHidden(id: string, hidden: boolean) {
  const inst = entities.getInstant(id)
  if (!inst) return
  // An alarm still to ring is never hidden.
  if (hidden && hasArmedAlarm(inst, nowTime())) return
  entities.setHiddenFlag(id, hidden)
  if (!hidden) return
  const s = v()
  if (s.viewFocusMode === 'instant' && s.focusedInstantId === id) focusCursorAt(inst.tsEpochMs, false)
  const after = v()
  useView.setState({
    currentSelectedInstantId: after.currentSelectedInstantId === id ? null : after.currentSelectedInstantId,
    secondarySelectedInstantId: after.secondarySelectedInstantId === id ? null : after.secondarySelectedInstantId,
  })
}

export function renameInstant(id: string, label: string) {
  if (entities.getInstant(id)?.label !== label) touchOccurrence(id)
  entities.setInstantLabel(id, label)
  view.editInstant(null)
}

export function deleteInstant(id: string) {
  const inst = entities.getInstant(id)
  // An occurrence deleted on its own: its date is skipped, so the series doesn't make it again.
  const series = inst?.occurrence ? entities.getGroup(inst.seriesId) : undefined
  if (series && inst?.occurrence) entities.putGroup({ ...series, skips: [...(series.skips ?? []), inst.occurrence] })
  const wasFocused = v().viewFocusMode === 'instant' && v().focusedInstantId === id
  dismissInstant(id)
  for (const sp of useEntities.getState().spans) {
    if (sp.startInstantId === id || sp.endInstantId === id) view.forgetSpan(sp.id)
  }
  view.forgetInstant(id)
  entities.deleteInstant(id)
  if (wasFocused) {
    if (inst) focusCursorAt(inst.tsEpochMs)
    else focusNow()
  }
}

export function createTestAlarm(delayMs = 3000) {
  void primeNotifications()
  entities.createInstant(Date.now() + delayMs, 'Test Alarm', { alarm: true })
}

// ---------------------------------------------------------------------------
// Move mode: the instant follows the cursor until confirmed or cancelled.

export function enterMove(id: string) {
  const inst = entities.getInstant(id)
  if (!inst) return
  const f = frame()
  view.setMoveMode({ instantId: id, originalCenter: f.center })
  view.setTimeCenter(inst.tsEpochMs)
  view.setFocus('cursor')
}

export function confirmMove() {
  const mm = v().moveMode
  if (!mm) return
  entities.setInstantTime(mm.instantId, frame().center)
  touchOccurrence(mm.instantId)
  view.setMoveMode(null)
  focusInstant(mm.instantId, false)
}

/** Move mode, typed: put the moving instant at `ts` and finish the move. */
export function moveInstantTo(ts: number) {
  const mm = v().moveMode
  if (!mm) return
  view.setTimeCenter(ts)
  entities.setInstantTime(mm.instantId, ts)
  touchOccurrence(mm.instantId)
  view.setMoveMode(null)
  focusInstant(mm.instantId)
}

/** Move mode, typed as a clock time: same day as where the instant is being moved to. */
export function moveInstantToClock(hours24: number, minutes: number, seconds: number) {
  moveInstantTo(atClockTimeOnDay(frame().center, hours24, minutes, seconds))
}

/** Move mode, typed as an offset from Now. */
export const moveInstantFromNow = (offsetMs: number) => moveInstantTo(nowTime() + offsetMs)

export function cancelMove() {
  const mm = v().moveMode
  if (!mm) return
  view.setMoveMode(null)
  focusInstant(mm.instantId)
}

// ---------------------------------------------------------------------------
// Spans

/**
 * Saves an implied span. Endpoints reuse an instant at exactly that time if one
 * exists; otherwise new instants are created. The new span is focused and its
 * label editor opened.
 */
export function saveSpanBetween(aTs: number, bTs: number) {
  const ensure = (ts: number) =>
    useEntities.getState().instants.find(i => i.tsEpochMs === ts)?.id ?? entities.createInstant(ts, '')
  const aId = ensure(aTs)
  const bId = ensure(bTs)
  const spanId = entities.createSpan(aId, bId, '', { visible: true })
  focusSpan(spanId, false)
  view.editSpan(spanId)
}

/** Saves a span between two possibly-live times, resolved at the moment of the click. */
export function saveSpanRefs(a: TimeRef, b: TimeRef) {
  const now = Date.now()
  const center = frame().center
  saveSpanBetween(resolveTimeRef(a, now, center), resolveTimeRef(b, now, center))
}

export function renameSpan(id: string, label: string) {
  entities.setSpanLabel(id, label)
  view.editSpan(null)
}

export function deleteSpan(id: string) {
  view.forgetSpan(id)
  entities.deleteSpan(id)
}

export function toggleSpanVisible(id: string) {
  const sp = entities.getSpan(id)
  if (!sp) return
  // A span to Now is shown exactly while its instant is a favorite.
  if (sp.endIsNow) setFavorite(sp.startInstantId, !sp.visible)
  else entities.setSpanVisible(id, !sp.visible)
}

/** Double-click on a span: focus and fit it, or rename if it's already focused. */
/**
 * Types a saved span's length: its end moves to that far from its start (the same side as
 * before). A timer's end is its alarm, so this sets the timer's length.
 */
export function setSpanLength(spanId: string, ms: number) {
  const sp = entities.getSpan(spanId)
  if (!sp || sp.endIsNow) return
  const start = entities.getInstant(sp.startInstantId)
  const end = entities.getInstant(sp.endInstantId)
  if (!start || !end) return
  const dir = end.tsEpochMs >= start.tsEpochMs ? 1 : -1
  entities.setInstantTime(end.id, start.tsEpochMs + dir * Math.max(0, ms))
  if (v().viewFocusMode === 'span' && v().focusedSpanId === spanId) focusSpan(spanId)
}

export function activateSpan(id: string) {
  const s = v()
  if (s.viewFocusMode === 'span' && s.focusedSpanId === id) view.editSpan(id)
  else focusSpan(id)
}

// ---------------------------------------------------------------------------
// Time entry

/** Applies an "±hh:mm:ss" offset relative to Now or the selected instant. */
export function applyDurationInput(text: string, reference: 'now' | 'selected'): boolean {
  let delta: number
  try {
    delta = parseDurationInput(text)
  } catch {
    return false
  }
  const base = reference === 'now' ? frame().now : entities.getInstant(v().currentSelectedInstantId)?.tsEpochMs
  if (typeof base !== 'number') return false
  landCursorAt(base + delta)
  return true
}

/** Moves the cursor to a wall-clock time on the cursor's current day. */
export function applyClockInput(hour12: number, minutes: number, seconds: number, pm: boolean) {
  landCursorAt(atClockTimeOnDay(frame().center, to24h(hour12, pm), minutes, seconds))
}

/** Sends the cursor to a typed time, landing on an instant only if one is exactly there. */
function landCursorAt(ts: number) {
  const hit = v().moveMode ? null : exactHit(ts, false)
  if (hit) focusInstant(hit.id)
  else focusCursorAt(ts)
}

// ---------------------------------------------------------------------------
// Alarms

export {
  dismiss as dismissAlarm,
  silence as silenceAlarms,
} from '../services/AlarmScheduler.ts'

/**
 * Snooze from the app (by ring key): another alarm on the same instant rings `minutes` from now
 * (a warning never past its instant), and the view goes to the instant, where its bell now is.
 * Returns the ring key of the alarm that rings next.
 */
export function snoozeAlarm(key: string, minutes = SNOOZE_MINUTES): string | undefined {
  return snoozeAlarmUntil(key, nowTime() + minutes * MINUTE)
}

/**
 * Snoozes an alarm until `at` (a ringing bell dragged later), and goes to its instant. `exact` (a
 * typed length): exactly then, even past the instant (domain/alarms snoozeLanding).
 */
export function snoozeAlarmUntil(key: string, at: number, exact = false): string | undefined {
  const next = snoozeUntil(key, at, exact)
  if (next) revealInstant(parseRingKey(key).instantId)
  return next
}

/** Where snoozing an alarm (by ring key) until `at` would land, for the snooze buttons' labels. */
export function snoozeLandingFor(key: string, at: number, exact = false): SnoozeLanding | null {
  const { instantId, alarmId } = parseRingKey(key)
  const inst = entities.getInstant(instantId)
  const alarm = findAlarm(inst, alarmId)
  return inst && alarm ? snoozeLanding(inst, alarm, at, nowTime(), getTunables().snoozeJoinSec * SECOND, exact) : null
}

/** Cancels an instant's warnings or all its alarms (services/AlarmScheduler); on an occurrence, that one only. */
export function cancelAlarms(instantId: string, which: 'warnings' | 'all') {
  cancelAlarmsNow(instantId, which)
  touchOccurrence(instantId, false) // that day's alarms only: nothing to apply to the rule
}

// ---------------------------------------------------------------------------
// Repeating series (TLC-2; domain/series). Occurrences are ordinary instants made a rolling
// window ahead; editing one edits that one (and offers "Apply to all future").

/** Marks an occurrence as edited on its own (rule changes leave it alone) and offers to apply the edit to all future ones. */
function touchOccurrence(id: string, offerApply = true) {
  const inst = entities.getInstant(id)
  if (!inst?.seriesId) return
  if (!inst.seriesEdited) entities.patchInstant(id, () => ({ seriesEdited: true }))
  if (offerApply) ui.showSeriesHint(id)
}

/**
 * Makes the occurrences due within the horizon (14 days, as far as the Android app gets alarms
 * ahead): called on start, hourly and when series change. Further ahead they are only computed,
 * for the timeline (components/timeline/timelineInstants).
 */
export function syncSeries() {
  const now = Date.now()
  const { groups, instants } = useEntities.getState()
  if (!groups || groups.length === 0) return
  entities.addInstants(planOccurrences(groups, instants, now, now + OCCURRENCE_HORIZON_MS, { instant: newInstantId, alarm: newAlarmId }))
}

/**
 * After a series' rule changed: its untouched occurrences ahead take the new time, name and
 * alarms in place (keeping their ids, so a selected one stays selected); those the rule no longer
 * has, or whose new time has passed, go; then any new dates are made.
 */
function refreshSeries(seriesId: string) {
  const series = entities.getGroup(seriesId)
  if (!series) return
  const now = Date.now()
  const gone: string[] = []
  for (const inst of remakeable(series, useEntities.getState().instants, now)) {
    const next = refreshOccurrence(series, inst, now, newAlarmId)
    if (next) entities.patchInstant(inst.id, () => next)
    else gone.push(inst.id)
  }
  for (const id of gone) { dismissInstant(id); view.forgetInstant(id) }
  entities.deleteInstants(gone)
  syncSeries()
}

/**
 * Stores a computed occurrence (past the horizon, shown only) when it is tapped: anything done
 * to it from then on is kept. Returns its instant's id (the id itself for a stored one).
 */
export function materializeOccurrence(id: string): string | undefined {
  const v = parseVirtualId(id)
  if (!v) return entities.getInstant(id) ? id : undefined
  const series = entities.getGroup(v.seriesId)
  if (!series) return
  const have = useEntities.getState().instants.find(i => i.seriesId === series.id && i.occurrence === v.date)
  if (have) return have.id
  const inst = newOccurrence(series, v.date, { instant: newInstantId, alarm: newAlarmId })
  entities.addInstants([inst])
  return inst.id
}

/**
 * Repeats an instant (it becomes its series' first occurrence), or, on an occurrence, changes
 * how its series repeats from now on.
 */
export function repeatInstant(id: string, repeat: Repeat) {
  const inst = entities.getInstant(id)
  if (!inst) return
  if (inst.seriesId && entities.getGroup(inst.seriesId)) {
    const series = entities.getGroup(inst.seriesId)!
    entities.putGroup({ ...series, repeat })
    refreshSeries(series.id)
    return
  }
  // The instant is the first occurrence before the series exists: saving the series makes its
  // occurrences at once (services/seriesSync), and this date must already be taken.
  const series = seriesFromInstant(inst, repeat)
  entities.patchInstant(id, () => ({ seriesId: series.id, occurrence: dateKey(inst.tsEpochMs), seriesEdited: false }))
  entities.putGroup(series)
  syncSeries()
}

/** "Apply to all future": an edited occurrence's name, time of day and alarms become its series' rule. */
export function applyToFutureOccurrences(id: string) {
  const inst = entities.getInstant(id)
  const series = entities.getGroup(inst?.seriesId)
  if (!inst || !series) return
  entities.putGroup({ ...series, ...ruleFromOccurrence(inst) })
  entities.patchInstant(id, () => ({ seriesEdited: false }))
  ui.showSeriesHint(null)
  refreshSeries(series.id)
}

/** Pauses a series (its untouched occurrences ahead go; none are made) or runs it again. */
export function setSeriesPaused(seriesId: string, paused: boolean) {
  const series = entities.getGroup(seriesId)
  if (!series) return
  entities.putGroup({ ...series, paused })
  if (paused) refreshSeries(seriesId)
  else syncSeries()
}

/**
 * Deletes an occurrence on its own (its date is skipped), or it and all later ones (the series
 * ends the day before; earlier occurrences stay as history).
 */
export function deleteOccurrences(id: string, which: 'this' | 'later') {
  const inst = entities.getInstant(id)
  const series = entities.getGroup(inst?.seriesId)
  if (!inst?.occurrence || !series || which === 'this') { deleteInstant(id); return }
  const date = inst.occurrence
  const prev = dateKey(occurrenceTs(series, date) - DAY)
  entities.putGroup({ ...series, until: series.until && series.until < prev ? series.until : prev })
  for (const i of useEntities.getState().instants) {
    if (i.seriesId === series.id && i.occurrence && i.occurrence >= date) deleteInstant(i.id)
  }
}

/**
 * The Alarm button (TLC-3): an alarm at a wall-clock time, with warnings before it, once (an
 * instant at `at`) or repeating (a series from today). Remembered as a recent alarm. Goes to it.
 * Returns the instant (the first occurrence of a series).
 */
export function setAlarm(a: { time: string; at: number; repeat: Repeat | null; warnings: number[]; label: string }): string | undefined {
  void primeNotifications()
  quick.rememberAlarm({ time: a.time, repeat: a.repeat, warnings: a.warnings, label: a.label })
  const offsets = [...new Set(a.warnings.filter(w => w > 0))].sort((x, y) => y - x).concat(0)
  if (!a.repeat) {
    const id = entities.createInstant(a.at, a.label)
    entities.patchInstant(id, () => ({ alarms: offsets.map(offsetMs => ({ id: newAlarmId(), offsetMs })) }))
    revealInstant(id)
    return id
  }
  const series: SeriesRecord = { id: newGroupId(), kind: 'series', label: a.label, time: a.time, repeat: a.repeat, alarms: offsets, from: dateKey(Date.now()) }
  entities.putGroup(series)
  syncSeries()
  const first = useEntities.getState().instants
    .filter(i => i.seriesId === series.id && i.tsEpochMs > Date.now())
    .sort((x, y) => x.tsEpochMs - y.tsEpochMs)[0]
  if (first) revealInstant(first.id)
  return first?.id
}

/**
 * Edits a series from the Alarms tab: its name, time of day, repeat and alarms. Its untouched
 * occurrences ahead take the change in place (refreshSeries); ones changed on their own keep
 * theirs.
 */
export function updateSeries(seriesId: string, patch: Partial<Pick<SeriesRecord, 'label' | 'time' | 'repeat' | 'alarms'>>) {
  const series = entities.getGroup(seriesId)
  if (!series) return
  entities.putGroup({ ...series, ...patch })
  refreshSeries(seriesId)
}

/** Ends a series now: its occurrences ahead go (those that passed stay as history). */
export function endSeries(seriesId: string) {
  const series = entities.getGroup(seriesId)
  if (!series) return
  const next = useEntities.getState().instants
    .filter(i => i.seriesId === seriesId && i.occurrence && i.tsEpochMs > Date.now())
    .sort((a, b) => a.tsEpochMs - b.tsEpochMs)[0]
  if (next) deleteOccurrences(next.id, 'later')
  else entities.putGroup({ ...series, until: dateKey(Date.now()) })
}

/** What a ringing alarm's card offers (by ring key). */
export function ringingChoicesFor(key: string): RingingChoices | null {
  const { instantId, alarmId } = parseRingKey(key)
  const inst = entities.getInstant(instantId)
  const alarm = findAlarm(inst, alarmId)
  return inst && alarm ? ringingChoices(inst, alarm, nowTime(), SNOOZE_MINUTES * MINUTE, getTunables().snoozeJoinSec * SECOND) : null
}

// ---------------------------------------------------------------------------
// Backup: export and import

/** Everything worth keeping as one backup: the settings and the saved instants and spans. */
export function exportBackup(date = new Date()): Backup {
  // The migration marker is per device, not a preference.
  const preferences: Partial<SettingsState> = { ...useSettings.getState() }
  delete preferences.layoutVersion
  const { autoDismissMs, unattended } = useAlarms.getState()
  const { showImpliedSelectedNow, showImpliedSelectedPrev, timeIncrement } = v()
  const { instants, spans, groups } = useEntities.getState()
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: date.toISOString(),
    settings: {
      preferences,
      alarms: { autoDismissMs, unattended },
      view: { showImpliedSelectedNow, showImpliedSelectedPrev, timeIncrement },
    },
    data: { instants, spans, groups: groups ?? [] },
  }
}

export interface ImportChoice {
  settings: boolean
  data: boolean
  /** Data only: replace everything, or combine with what is here. */
  mode: ImportMode
}

/** Applies the chosen parts of a (parsed) backup. */
export function importBackup(backup: Backup, choice: ImportChoice) {
  if (choice.settings && backup.settings) {
    const { preferences, alarms, view: viewPrefs } = backup.settings
    // The migration marker stays this device's: its one-time migrations already ran here.
    useSettings.setState({ ...sanitizeSettings(preferences), layoutVersion: useSettings.getState().layoutVersion })
    useAlarms.setState(sanitizeAlarmPrefs(alarms))
    if (typeof viewPrefs.showImpliedSelectedNow === 'boolean') view.setImpliedVisible('selected-now', viewPrefs.showImpliedSelectedNow)
    if (typeof viewPrefs.showImpliedSelectedPrev === 'boolean') view.setImpliedVisible('selected-prev', viewPrefs.showImpliedSelectedPrev)
    const inc = TIME_INCREMENT_OPTIONS.find(o => o.value === viewPrefs.timeIncrement)
    if (inc) view.setTimeIncrement(inc.value)
  }
  if (choice.data && backup.data) {
    const before = useEntities.getState()
    const merged = importedData(before, backup.data, choice.mode)
    const synced = syncFavorites(merged.instants, merged.spans)
    const next = { instants: syncAlarmVisibility(synced.instants, nowTime()), spans: synced.spans, groups: merged.groups ?? [] }
    const instantIds = new Set(next.instants.map(i => i.id))
    const spanIds = new Set(next.spans.map(sp => sp.id))
    const lostFocus = v().viewFocusMode === 'instant' && !!v().focusedInstantId && !instantIds.has(v().focusedInstantId!)
    for (const r of useAlarms.getState().ringing) if (!instantIds.has(r.instantId)) dismiss(ringKey(r.instantId, r.alarmId))
    for (const sp of before.spans) if (!spanIds.has(sp.id)) view.forgetSpan(sp.id)
    for (const i of before.instants) if (!instantIds.has(i.id)) view.forgetInstant(i.id)
    if (lostFocus) focusCursorAt(v().timeCenter, false)
    useEntities.setState(next)
  }
}
