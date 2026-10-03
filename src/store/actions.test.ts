import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { entities, useEntities } from './entities.ts'
import { initialViewState, useView } from './view.ts'
import { useAlarms } from './alarms.ts'
import * as act from './actions.ts'
import { engine } from '../engine/viewportEngine.ts'
import { HOUR, MINUTE } from '../domain/time.ts'

/** Lets the viewport engine run a frame so actions see the updated on-screen center. */
const flushFrame = () => new Promise(r => setTimeout(r, 40))

beforeAll(() => engine.start())

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
  it('moves the instant to where the cursor ends up', async () => {
    const t = Date.now() - HOUR
    const id = entities.createInstant(t, 'Move me')
    act.enterMove(id)
    expect(view()).toMatchObject({ viewFocusMode: 'cursor', moveMode: { instantId: id } })
    await flushFrame()
    act.moveCursorBy(10 * MINUTE)
    await flushFrame()
    act.confirmMove()
    expect(instant(id).tsEpochMs).toBeCloseTo(t + 10 * MINUTE, -2)
    expect(view()).toMatchObject({ moveMode: null, viewFocusMode: 'instant', focusedInstantId: id })
  })

  it('cancel leaves the instant where it was', async () => {
    const t = Date.now() - HOUR
    const id = entities.createInstant(t, 'Stay')
    act.enterMove(id)
    await flushFrame()
    act.moveCursorBy(10 * MINUTE)
    act.cancelMove()
    expect(instant(id).tsEpochMs).toBe(t)
    expect(view().moveMode).toBeNull()
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
