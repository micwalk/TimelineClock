import { beforeEach, describe, expect, it } from 'vitest'
import { entities, useEntities } from './entities.ts'
import { initialViewState, useView } from './view.ts'
import { useAlarms } from './alarms.ts'
import * as act from './actions.ts'
import { engine } from '../engine/viewportEngine.ts'
import { HOUR, MINUTE } from '../domain/time.ts'
import { nearestFinestTick } from '../domain/ticks.ts'
import { settings, useSettings } from './settings.ts'
import { parseBackup } from '../domain/backup.ts'
import { useUi } from './ui.ts'
import { useQuick } from './quick.ts'
import { IDLE_STOPWATCH } from '../domain/quickCreate.ts'

beforeEach(() => {
  engine.cancelTransition()
  useEntities.setState({ instants: [], spans: [] })
  useView.setState(initialViewState())
  useAlarms.setState({ ringing: [] })
})

const instant = (id: string) => entities.getInstant(id)!
const view = () => useView.getState()

describe('Timer and Stopwatch buttons', () => {
  beforeEach(() => useQuick.setState({ stopwatch: IDLE_STOPWATCH, recentTimers: [] }))
  const spans = () => useEntities.getState().spans
  const sw = () => useQuick.getState().stopwatch

  it('a timer is an instant at Now, an alarmed instant later tracked to Now, and the span between', () => {
    const endId = act.startTimer(13 * MINUTE)
    const now = engine.sample().now
    const [start, end] = useEntities.getState().instants
    expect(end.id).toBe(endId)
    expect(start).toMatchObject({ label: '' })
    expect(Math.abs(start.tsEpochMs - now)).toBeLessThan(1000)
    expect(end).toMatchObject({ label: '13m timer', alarm: true, favorite: true, tsEpochMs: start.tsEpochMs + 13 * MINUTE })
    expect(entities.nowSpanOf(end.id)?.visible).toBe(true)
    expect(spans().find(sp => !sp.endIsNow)).toMatchObject({ startInstantId: start.id, endInstantId: end.id, label: '13m timer', visible: true })
    expect(useQuick.getState().recentTimers).toEqual([13 * MINUTE])
    // The view follows Now, zoomed so the end sits 80% of the way to the edge.
    expect(view().viewFocusMode).toBe('now')
    expect(view().timeWidth).toBeCloseTo((2 * 13 * MINUTE) / 0.8, -3)
  })

  it('a stopwatch focuses and selects its span to Now, starting at a 30 s view', () => {
    useView.setState({ timeWidth: 6 * HOUR })
    act.startStopwatch()
    const [s0] = sw().marks
    const tracked = entities.nowSpanOf(s0)!
    expect(view()).toMatchObject({ viewFocusMode: 'span', focusedSpanId: tracked.id, selectedSpanId: tracked.id, timeWidth: 30_000 })
    // A lap keeps the whole run in view (the start's span to Now); Stop focuses the span it closed.
    act.lapStopwatch()
    const [, l1] = sw().marks
    expect(view().focusedSpanId).toBe(tracked.id)
    act.stopStopwatch()
    const [, , stop] = sw().marks
    const closed = spans().find(sp => sp.startInstantId === l1 && sp.endInstantId === stop)!
    expect(view()).toMatchObject({ viewFocusMode: 'span', focusedSpanId: closed.id, selectedSpanId: closed.id })
  })

  it('a stopwatch tracks its start, moves tracking to each lap, and keeps each lap as a span', () => {
    act.startStopwatch()
    const [s0] = sw().marks
    expect(instant(s0)).toMatchObject({ label: 'Stopwatch', favorite: true })
    expect(entities.nowSpanOf(s0)?.visible).toBe(true)

    act.lapStopwatch()
    const [, l1] = sw().marks
    expect(instant(l1)).toMatchObject({ label: 'Lap 1', favorite: true })
    expect(entities.nowSpanOf(s0)?.visible).toBe(false)
    expect(entities.nowSpanOf(l1)?.visible).toBe(true)
    expect(spans().find(sp => sp.startInstantId === s0 && sp.endInstantId === l1)).toMatchObject({ label: 'Lap 1', visible: true })

    act.stopStopwatch()
    const [, , stop] = sw().marks
    expect(sw().stopped).toBe(true)
    expect(instant(stop).label).toBe('Stop')
    expect(entities.nowSpanOf(l1)?.visible).toBe(false)
    expect(spans().find(sp => sp.startInstantId === l1 && sp.endInstantId === stop)).toMatchObject({ label: 'Lap 2', visible: true })

    // Lap and Stop do nothing once stopped; Reset stops tracking and keeps the history.
    act.lapStopwatch()
    expect(sw().marks).toHaveLength(3)
    act.resetStopwatch()
    expect(sw()).toEqual(IDLE_STOPWATCH)
    expect(useEntities.getState().instants).toHaveLength(3)
  })

  it('stopping without laps saves the whole run as "Stopwatch"', () => {
    act.startStopwatch()
    act.stopStopwatch()
    const [s0, stop] = sw().marks
    expect(spans().find(sp => sp.startInstantId === s0 && sp.endInstantId === stop)?.label).toBe('Stopwatch')
  })

  it('reset while running stops tracking the current span', () => {
    act.startStopwatch()
    const [s0] = sw().marks
    act.resetStopwatch()
    expect(entities.nowSpanOf(s0)?.visible).toBe(false)
    expect(sw()).toEqual(IDLE_STOPWATCH)
  })

  it('deleting the stopwatch\'s instants makes it idle', () => {
    act.startStopwatch()
    act.deleteInstant(sw().marks[0])
    expect(sw()).toEqual(IDLE_STOPWATCH)
  })
})

describe('typing the time while moving an instant', () => {
  it('puts the instant at an offset from Now and finishes the move', () => {
    const id = entities.createInstant(Date.now() - HOUR, 'Leave')
    act.enterMove(id)
    act.moveInstantFromNow(30 * MINUTE)
    expect(Math.abs(instant(id).tsEpochMs - (engine.sample().now + 30 * MINUTE))).toBeLessThan(1000)
    expect(view()).toMatchObject({ moveMode: null, viewFocusMode: 'instant', focusedInstantId: id })
  })

  it('puts the instant at a clock time on the same day', () => {
    const day = new Date(Date.now() + 2 * HOUR)
    const id = entities.createInstant(day.getTime(), 'Leave')
    act.enterMove(id)
    act.moveInstantToClock(9, 15, 0)
    const d = new Date(instant(id).tsEpochMs)
    expect([d.getDate(), d.getHours(), d.getMinutes()]).toEqual([day.getDate(), 9, 15])
  })
})

describe('hiding instants', () => {
  it('hides an instant, keeps its spans, and lets go of it if selected or focused', () => {
    const a = entities.createInstant(Date.now() - HOUR, 'A')
    const b = entities.createInstant(Date.now() - 30 * MINUTE, 'B')
    const sp = entities.createSpan(a, b, 'A→B', { visible: true })
    act.focusInstant(a, false)
    act.setInstantHidden(a, true)
    expect(instant(a).hidden).toBe(true)
    expect(entities.getSpan(sp)).toBeTruthy()
    expect(view()).toMatchObject({ viewFocusMode: 'cursor', currentSelectedInstantId: null })
    act.setInstantHidden(a, false)
    expect(instant(a).hidden).toBe(false)
  })

  it('previous / next skip hidden instants', () => {
    const now = Date.now()
    const a = entities.createInstant(now - 2 * HOUR, 'A')
    const b = entities.createInstant(now - HOUR, 'B')
    act.setInstantHidden(b, true)
    act.focusNow(false)
    act.goToAdjacentInstant(-1)
    expect(view().focusedInstantId).toBe(a)
  })
})

describe('revealInstant (alarm notification click)', () => {
  it('focuses and selects the instant and shows a tab that lists it', () => {
    const id = entities.createInstant(Date.now() - MINUTE, 'Rice')
    useUi.setState({ listTab: 'favorites' })
    act.revealInstant(id, false)
    expect(view()).toMatchObject({ viewFocusMode: 'instant', focusedInstantId: id, currentSelectedInstantId: id, timeCenter: instant(id).tsEpochMs })
    expect(useUi.getState().listTab).toBe('instants')
  })

  it('keeps the Favorites tab when the instant is a favorite', () => {
    const id = entities.createInstant(Date.now() - MINUTE, 'Rice', { favorite: true })
    useUi.setState({ listTab: 'favorites' })
    act.revealInstant(id, false)
    expect(useUi.getState().listTab).toBe('favorites')
  })

  it('goes to Now when the instant is gone', () => {
    act.focusCursorAt(Date.now() - HOUR, false)
    act.revealInstant('missing', false)
    expect(view().viewFocusMode).toBe('now')
  })
})

describe('favorites and alarms', () => {
  it('favoriting adds a visible span to Now; unfavoriting hides it', () => {
    const id = entities.createInstant(Date.now() - HOUR, 'Start')
    act.toggleFavorite(id)
    const span = entities.nowSpanOf(id)!
    expect(instant(id).favorite).toBe(true)
    expect(span.visible).toBe(true)
    act.toggleFavorite(id)
    expect(entities.nowSpanOf(id)!.visible).toBe(false)
  })

  it('setting an alarm also favorites the instant', () => {
    const id = entities.createInstant(Date.now() + HOUR, 'Wake')
    act.toggleAlarm(id)
    expect(instant(id)).toMatchObject({ alarm: true, favorite: true })
    expect(entities.nowSpanOf(id)?.visible).toBe(true)
  })

  it('snoozing creates a numbered alarm, links it, and dismisses the original', () => {
    const id = entities.createInstant(Date.now() - 1000, 'Wake', { alarm: true })
    useAlarms.setState({ ringing: [{ instantId: id, label: 'Wake', tsEpochMs: Date.now(), triggeredAt: Date.now() }] })
    const first = act.snoozeAlarm(id, 5)!
    expect(instant(first)).toMatchObject({ label: 'Snooze 1: Wake', alarm: true, snoozeOriginalId: id })
    expect(instant(id).alarm).toBe(false)
    expect(useAlarms.getState().ringing).toEqual([])

    useAlarms.setState({ ringing: [{ instantId: first, label: 'Snooze 1: Wake', tsEpochMs: Date.now(), triggeredAt: Date.now() }] })
    const second = act.snoozeAlarm(first, 5)!
    expect(instant(second).label).toBe('Snooze 2: Wake')
    expect(instant(second).snoozeOriginalId).toBe(id)
  })
})

describe('dropInstant', () => {
  it('drops an unnamed instant at Now without touching focus, selection or editing', () => {
    const before = { ...view() }
    const id = act.dropInstant()
    const inst = instant(id)
    expect(inst.label).toBe('')
    expect(Math.abs(inst.tsEpochMs - Date.now())).toBeLessThan(2000)
    expect(view()).toMatchObject({
      viewFocusMode: 'now', focusedInstantId: before.focusedInstantId, currentSelectedInstantId: null, editingInstantId: null, timeCenter: before.timeCenter,
    })
  })

  it('drops at the cursor in cursor mode and stays in cursor mode', () => {
    const center = engine.getFrame().center - 10 * MINUTE
    useView.setState({ viewFocusMode: 'cursor', timeCenter: center })
    const id = act.dropInstant()
    expect(Math.abs(instant(id).tsEpochMs - center)).toBeLessThan(2000)
    expect(view()).toMatchObject({ viewFocusMode: 'cursor', currentSelectedInstantId: null, editingInstantId: null })
  })

  it('can drop a favorite', () => {
    const id = act.dropInstant({ favorite: true })
    expect(instant(id).favorite).toBe(true)
    expect(instant(id).label).toBe('')
  })
})

describe('selection and focus', () => {
  it('focusing an instant selects it and shifts the previous selection to secondary', () => {
    const a = entities.createInstant(Date.now() - HOUR, 'A')
    const b = entities.createInstant(Date.now() + HOUR, 'B')
    act.focusInstant(a)
    act.focusInstant(b)
    expect(view()).toMatchObject({ viewFocusMode: 'instant', focusedInstantId: b, currentSelectedInstantId: b, secondarySelectedInstantId: a })
    expect(view().focusHistory).toEqual([a, b])
  })

  it('Escape clears secondary, then primary selection', () => {
    const a = entities.createInstant(1, 'A')
    const b = entities.createInstant(2, 'B')
    act.selectInstant(a)
    act.selectInstant(b)
    act.escape()
    expect(view()).toMatchObject({ currentSelectedInstantId: b, secondarySelectedInstantId: null })
    act.escape()
    expect(view().currentSelectedInstantId).toBeNull()
  })

  it('focus history steps back without re-recording', () => {
    const a = entities.createInstant(1, 'A')
    const b = entities.createInstant(2, 'B')
    act.focusInstant(a)
    act.focusInstant(b)
    act.navigateFocusHistory(-1)
    expect(view()).toMatchObject({ focusedInstantId: a, focusHistoryIndex: 0, focusHistory: [a, b] })
  })

  it('focusing a span clears instant selection', () => {
    const a = entities.createInstant(1, 'A')
    const b = entities.createInstant(2, 'B')
    const s = entities.createSpan(a, b)
    act.selectInstant(a)
    act.focusSpan(s)
    expect(view()).toMatchObject({ viewFocusMode: 'span', focusedSpanId: s, currentSelectedInstantId: null })
  })
})

describe('deleting', () => {
  it('removes spans that reference the instant and clears focus/selection', () => {
    const a = entities.createInstant(Date.now(), 'A')
    const b = entities.createInstant(Date.now() + HOUR, 'B')
    entities.createSpan(a, b)
    entities.upsertNowSpan(a, true)
    act.focusInstant(a)
    act.deleteInstant(a)
    expect(useEntities.getState().spans).toEqual([])
    expect(view()).toMatchObject({ viewFocusMode: 'cursor', currentSelectedInstantId: null, focusedInstantId: null })
    expect(view().focusHistory).not.toContain(a)
  })
})

describe('saving spans', () => {
  it('reuses an instant at the same time and creates the other endpoint', () => {
    const t = Date.now() - HOUR
    const a = entities.createInstant(t, 'A')
    act.saveSpanBetween(t, t + 30 * MINUTE)
    const { instants, spans } = useEntities.getState()
    expect(instants).toHaveLength(2)
    expect(spans).toHaveLength(1)
    expect(spans[0]).toMatchObject({ startInstantId: a, visible: true })
    expect(view()).toMatchObject({ viewFocusMode: 'span', focusedSpanId: spans[0].id, editingSpanId: spans[0].id })
  })
})

describe('move mode', () => {
  it('moves the instant to where the cursor ends up', () => {
    const t = Date.now() - HOUR
    const id = entities.createInstant(t, 'Move me')
    act.enterMove(id)
    expect(view()).toMatchObject({ viewFocusMode: 'cursor', moveMode: { instantId: id } })
    act.moveCursorBy(10 * MINUTE)
    act.confirmMove()
    expect(instant(id).tsEpochMs).toBeCloseTo(t + 10 * MINUTE, -2)
    expect(view()).toMatchObject({ moveMode: null, viewFocusMode: 'instant', focusedInstantId: id })
  })

  it('cancel leaves the instant where it was', () => {
    const t = Date.now() - HOUR
    const id = entities.createInstant(t, 'Stay')
    act.enterMove(id)
    act.moveCursorBy(10 * MINUTE)
    act.cancelMove()
    expect(instant(id).tsEpochMs).toBe(t)
    expect(view().moveMode).toBeNull()
  })
})

describe('refocusing the most recent instant', () => {
  it('works after moving the cursor away (the reported snapping bug)', () => {
    const t = Date.now() - HOUR
    const id = entities.createInstant(t, 'Rice')
    act.focusInstant(id, false)
    act.moveCursorBy(30 * MINUTE)
    expect(view().viewFocusMode).toBe('cursor')
    act.moveCursorBy(-30 * MINUTE) // lands exactly back on Rice
    expect(view()).toMatchObject({ viewFocusMode: 'instant', focusedInstantId: id })
  })

  it('works when focused directly again (e.g. from the Agenda)', () => {
    const id = entities.createInstant(Date.now() - HOUR, 'Rice')
    act.focusInstant(id, false)
    act.focusNow(false)
    act.focusInstant(id, false)
    expect(view()).toMatchObject({ viewFocusMode: 'instant', focusedInstantId: id })
  })
})

describe('cursor landing on instants', () => {
  it('stepping exactly onto an instant focuses it (the cursor becomes the instant)', () => {
    const t = Date.now() - HOUR
    const id = entities.createInstant(t, 'Rice')
    act.focusCursorAt(t - 30 * MINUTE, false)
    act.moveCursorBy(30 * MINUTE)
    expect(view()).toMatchObject({ viewFocusMode: 'instant', focusedInstantId: id })
  })

  it('stepping near, but not onto, an instant leaves the cursor where it was sent', () => {
    const t = Date.now() - HOUR
    entities.createInstant(t, 'Rice')
    act.focusCursorAt(t - 40 * MINUTE, false)
    act.moveCursorBy(30 * MINUTE)
    expect(view().viewFocusMode).toBe('cursor')
  })

  it('tapping the instant under the cursor focuses it', () => {
    const t = Date.now() - HOUR
    const id = entities.createInstant(t, 'Rice')
    act.focusCursorAt(t + MINUTE, false) // a few px away at the default zoom
    act.selectInstant(id)
    expect(view()).toMatchObject({ viewFocusMode: 'instant', focusedInstantId: id })
  })

  it('tapping an instant away from the cursor only selects it', () => {
    const t = Date.now() - HOUR
    const id = entities.createInstant(t, 'Rice')
    act.focusCursorAt(t + HOUR, false)
    act.selectInstant(id)
    expect(view()).toMatchObject({ viewFocusMode: 'cursor', currentSelectedInstantId: id })
  })
})

describe('tick snap', () => {
  const offTick = () => {
    const pxPerMs = engine.sample().pxPerMs
    const tick = nearestFinestTick(Date.now() - 3 * HOUR, pxPerMs)
    return { pxPerMs, tick, t: tick + 0.3 / pxPerMs } // a few px off the tick
  }

  it('endPan lands on the nearest finest tick when tickSnap is on', () => {
    useSettings.setState({ tickSnap: true })
    const { tick, t } = offTick()
    act.focusCursorAt(t, false)
    act.endPan(20)
    expect(view().viewFocusMode).toBe('cursor')
    expect(view().timeCenter).toBe(tick)
  })

  it('endPan snaps only to a tick within tickSnapPx', () => {
    useSettings.setState({ tickSnap: true })
    const { t, pxPerMs } = offTick()
    settings.setTunable('tickSnapPx', 0.1) // the cursor is 0.3px off the tick
    act.focusCursorAt(t, false)
    act.endPan(20)
    expect(view().timeCenter).toBe(t)
    settings.setTunable('tickSnapPx', 0.5)
    act.endPan(20)
    expect(view().timeCenter).not.toBe(t)
    expect(Math.abs(view().timeCenter - t) * pxPerMs).toBeLessThan(0.5)
    settings.resetTunable('tickSnapPx')
  })

  it('endPan with snap: false leaves the cursor and does not land on Now or an instant', () => {
    useSettings.setState({ tickSnap: true })
    const { t } = offTick()
    entities.createInstant(t + 1000, 'Rice')
    act.focusCursorAt(t, false)
    act.endPan(20, { snap: false })
    expect(view()).toMatchObject({ viewFocusMode: 'cursor', timeCenter: t })
  })

  it('endPan leaves the cursor put when tickSnap is off', () => {
    useSettings.setState({ tickSnap: false })
    const { t } = offTick()
    act.focusCursorAt(t, false)
    act.endPan(20)
    expect(view().timeCenter).toBe(t)
    useSettings.setState({ tickSnap: true })
  })

  it('an instant within the landing radius wins over a tick', () => {
    useSettings.setState({ tickSnap: true })
    const { t } = offTick()
    const id = entities.createInstant(t + 1000, 'Rice')
    act.focusCursorAt(t, false)
    act.endPan(20)
    expect(view()).toMatchObject({ viewFocusMode: 'instant', focusedInstantId: id })
  })

  it('moveCursorBy never snaps to ticks', () => {
    useSettings.setState({ tickSnap: true })
    const { t } = offTick()
    act.focusCursorAt(t - 7000, false)
    act.moveCursorBy(7000)
    expect(view().timeCenter).toBe(t)
  })
})

describe('time entry', () => {
  it('moves the cursor relative to Now', () => {
    const before = Date.now()
    expect(act.applyDurationInput('-01:30:00', 'now')).toBe(true)
    expect(view().viewFocusMode).toBe('cursor')
    expect(view().timeCenter).toBeGreaterThanOrEqual(before - 90 * MINUTE)
    expect(view().timeCenter).toBeLessThanOrEqual(Date.now() - 90 * MINUTE)
  })
  it('rejects malformed input without changing the view', () => {
    expect(act.applyDurationInput('nope', 'now')).toBe(false)
    expect(view().viewFocusMode).toBe('now')
  })
})

describe('zoomToTimes', () => {
  it('centers a free cursor on the middle and fits the span into 60% of the axis', () => {
    const a = Date.now() - 20 * MINUTE
    const b = a + 10 * MINUTE
    act.zoomToTimes([b, a])
    expect(view()).toMatchObject({ viewFocusMode: 'cursor', timeCenter: (a + b) / 2 })
    expect(view().timeWidth).toBeCloseTo((10 * MINUTE) / 0.6, 0)
  })

  it('never zooms in past 2 minutes of width', () => {
    const a = Date.now() - HOUR
    act.zoomToTimes([a, a + 1000])
    expect(view().timeWidth).toBe(2 * MINUTE)
  })

  it('does nothing for an empty list', () => {
    const before = view().timeWidth
    act.zoomToTimes([])
    expect(view().timeWidth).toBe(before)
  })
})

describe('backup export and import', () => {
  const roundTrip = () => {
    const r = parseBackup(JSON.stringify(act.exportBackup()))
    if (!r.ok) throw new Error(r.error)
    return r.backup
  }

  it('exports settings and data, and a settings import restores them (not the migration marker)', () => {
    settings.setGlow(1.7)
    settings.setTunable('chipRowsMax', 2)
    useAlarms.setState({ unattended: 'snooze', autoDismissMs: 2 * MINUTE })
    useView.setState({ timeIncrement: '1h', showImpliedSelectedNow: true })
    settings.setLayoutVersion(3)
    const backup = roundTrip()
    expect(backup.settings!.preferences).not.toHaveProperty('layoutVersion')

    settings.setGlow(0.2)
    settings.resetTunable('chipRowsMax')
    useAlarms.setState({ unattended: 'dismiss', autoDismissMs: MINUTE })
    useView.setState({ timeIncrement: '30m', showImpliedSelectedNow: false })
    act.importBackup(backup, { settings: true, data: false, mode: 'combine' })

    expect(useSettings.getState()).toMatchObject({ glow: 1.7, tunables: { chipRowsMax: 2 }, layoutVersion: 3 })
    expect(useAlarms.getState()).toMatchObject({ unattended: 'snooze', autoDismissMs: 2 * MINUTE })
    expect(view()).toMatchObject({ timeIncrement: '1h', showImpliedSelectedNow: true })
  })

  it('replace swaps the data and clears selection and focus on instants that are gone', () => {
    const keep = entities.createInstant(Date.now() - HOUR, 'Keep')
    const backup = roundTrip()
    const gone = entities.createInstant(Date.now() - 2 * HOUR, 'Gone')
    act.focusInstant(gone, false)
    act.importBackup(backup, { settings: false, data: true, mode: 'replace' })
    expect(useEntities.getState().instants.map(i => i.id)).toEqual([keep])
    expect(view()).toMatchObject({ currentSelectedInstantId: null, focusedInstantId: null, viewFocusMode: 'cursor' })
  })

  it('combine adds the imported data to what is here', () => {
    const a = entities.createInstant(Date.now() - HOUR, 'A')
    const backup = roundTrip()
    useEntities.setState({ instants: [], spans: [] })
    const b = entities.createInstant(Date.now(), 'B')
    act.importBackup(backup, { settings: false, data: true, mode: 'combine' })
    expect(useEntities.getState().instants.map(i => i.id).sort()).toEqual([a, b].sort())
  })

  it('a data import leaves settings alone', () => {
    settings.setGlow(1.3)
    const backup = roundTrip()
    settings.setGlow(0.5)
    act.importBackup(backup, { settings: false, data: true, mode: 'combine' })
    expect(useSettings.getState().glow).toBe(0.5)
  })
})
