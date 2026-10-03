import { beforeEach, describe, expect, it } from 'vitest'
import { entities, useEntities } from './entities.ts'
import { initialViewState, useView } from './view.ts'
import { useAlarms } from './alarms.ts'
import * as act from './actions.ts'
import { engine } from '../engine/viewportEngine.ts'
import { HOUR, MINUTE } from '../domain/time.ts'
import { nearestFinestTick } from '../domain/ticks.ts'
import { useSettings } from './settings.ts'

beforeEach(() => {
  engine.cancelTransition()
  useEntities.setState({ instants: [], spans: [] })
  useView.setState(initialViewState())
  useAlarms.setState({ ringing: [] })
})

const instant = (id: string) => entities.getInstant(id)!
const view = () => useView.getState()

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
