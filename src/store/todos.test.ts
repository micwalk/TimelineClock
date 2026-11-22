// Todos end to end through the stores (docs/prd_todos.md Phase 1).
import { beforeEach, describe, expect, it } from 'vitest'
import { entities, useEntities } from './entities.ts'
import { initialViewState, useView } from './view.ts'
import { useAlarms } from './alarms.ts'
import { useUi } from './ui.ts'
import { useSettings } from './settings.ts'
import { DEFAULT_RING_DEFAULTS } from '../domain/alarmPicker.ts'
import { ringKey } from '../domain/alarms.ts'
import { instantsByTodo, todoState } from '../domain/todos.ts'
import { parseBackup } from '../domain/backup.ts'
import * as act from './actions.ts'
import { engine } from '../engine/viewportEngine.ts'
import { DAY, HOUR, MINUTE } from '../domain/time.ts'
import { dateKey } from '../domain/series.ts'
import { nextSeasonEvent, seasonVirtualId } from '../domain/seasons.ts'

beforeEach(() => {
  engine.cancelTransition()
  useEntities.setState({ instants: [], spans: [], groups: [], todos: [] })
  useView.setState(initialViewState())
  useAlarms.setState({ ringing: [] })
  useSettings.setState({ alarmRings: DEFAULT_RING_DEFAULTS })
})

const todos = () => useEntities.getState().todos
const instantsOf = (todoId: string) => useEntities.getState().instants.filter(i => i.todo?.id === todoId)
const atOf = (todoId: string) => instantsOf(todoId).find(i => i.todo?.role === 'at')
const stateOf = (todoId: string) => todoState(entities.getTodo(todoId)!, instantsByTodo(useEntities.getState().instants).get(todoId) ?? [], Date.now())

/** A todo whose `at` was `ago` ms back, its alarm ringing now. */
function ringingTodo(label = 'Feed cats', ago = 25 * MINUTE) {
  const id = act.addTodo(label)!
  act.scheduleTodo(id, Date.now() + HOUR)
  const at = atOf(id)!
  entities.setInstantTime(at.id, Date.now() - ago)
  const alarmId = entities.getInstant(at.id)!.alarms![0].id
  useAlarms.setState({ ringing: [{ instantId: at.id, alarmId, label, tsEpochMs: Date.now() - ago, triggeredAt: Date.now() }] })
  return { id, atId: at.id, key: ringKey(at.id, alarmId) }
}

describe('adding todos', () => {
  it('a name alone is an unscheduled todo: nothing in time, nothing else changes', () => {
    const before = useView.getState()
    const id = act.addTodo('Book appointment')!
    expect(todos()).toMatchObject([{ id, label: 'Book appointment', status: 'open' }])
    expect(useEntities.getState().instants).toEqual([])
    expect(stateOf(id)).toBe('unscheduled')
    expect(useView.getState()).toEqual(before)
  })

  it('a time schedules it: an `at` instant named for it, with an alarm at its time', () => {
    const id = act.addTodo('laundry 11:59pm 20m')!
    expect(entities.getTodo(id)).toMatchObject({ label: 'laundry', durationMs: 20 * MINUTE })
    const at = atOf(id)!
    expect(at).toMatchObject({ label: 'laundry', alarms: [{ offsetMs: 0 }] })
    expect(new Date(at.tsEpochMs).getHours()).toBe(23)
    expect(stateOf(id)).toBe('scheduled')
  })

  it('a repeat makes a repeating todo: each occurrence a todo of its own', () => {
    act.addTodo('feed cats 7a daily 5m')
    const series = useEntities.getState().groups[0]
    expect(series).toMatchObject({ label: 'feed cats', time: '07:00', todo: { durationMs: 5 * MINUTE } })
    const occurrences = useEntities.getState().instants.filter(i => i.seriesId === series.id)
    expect(occurrences.length).toBeGreaterThan(10)
    expect(occurrences.every(i => i.todo?.role === 'at')).toBe(true)
    expect(new Set(occurrences.map(i => i.todo!.id)).size).toBe(occurrences.length)
    expect(todos().filter(t => t.seriesId === series.id)).toHaveLength(occurrences.length)
  })

  it('Schedule puts an unscheduled one in time', () => {
    const id = act.addTodo('Call the vet')!
    act.scheduleTodo(id, Date.now() + HOUR)
    expect(stateOf(id)).toBe('scheduled')
  })
})

describe('when its alarm rings', () => {
  it('Dismiss starts it counting from its time: its at is favorited', () => {
    const { id, atId, key } = ringingTodo()
    act.dismissAlarm(key)
    expect(entities.getInstant(atId)!.favorite).toBe(true)
    expect(entities.nowSpanOf(atId)).toBeDefined()
    expect(stateOf(id)).toBe('counting')
    expect(useAlarms.getState().ringing).toEqual([])
  })

  it('a warning before its time only answers the warning', () => {
    const id = act.addTodo('Meeting')!
    act.scheduleTodo(id, Date.now() + 10 * MINUTE)
    const at = atOf(id)!
    const warn = entities.addAlarm(at.id, { offsetMs: 15 * MINUTE })
    useAlarms.setState({ ringing: [{ instantId: at.id, alarmId: warn, label: 'Meeting in 15m', tsEpochMs: at.tsEpochMs, triggeredAt: Date.now() }] })
    act.dismissAlarm(ringKey(at.id, warn))
    expect(entities.getInstant(at.id)!.favorite).toBeFalsy()
    expect(stateOf(id)).toBe('scheduled')
  })

  it('Start now on a warning moves the plan to Now and counts; its alarms still to ring go', () => {
    const id = act.addTodo('Laundry')!
    act.scheduleTodo(id, Date.now() + 10 * MINUTE)
    const at = atOf(id)!
    const warn = entities.addAlarm(at.id, { offsetMs: 15 * MINUTE })
    useAlarms.setState({ ringing: [{ instantId: at.id, alarmId: warn, label: 'Laundry in 15m', tsEpochMs: at.tsEpochMs, triggeredAt: Date.now() }] })
    act.startTodoNow(id)
    const moved = entities.getInstant(at.id)!
    expect(Math.abs(moved.tsEpochMs - Date.now())).toBeLessThan(1000)
    expect(moved.favorite).toBe(true)
    expect(moved.alarms!.every(a => a.answered)).toBe(true)
    expect(useAlarms.getState().ringing).toEqual([])
    expect(stateOf(id)).toBe('counting')
  })

  it('✓ Done on the lane (the favorite\'s stop) saves the stretch to a ✓ instant and celebrates', () => {
    const { id, atId, key } = ringingTodo()
    act.dismissAlarm(key)
    const spanId = entities.nowSpanOf(atId)!.id
    act.stopNowSpan(atId)
    const done = instantsOf(id).find(i => i.todo?.role === 'done')!
    expect(done.label).toBe('✓ Feed cats')
    expect(entities.getSpan(spanId)).toMatchObject({ startInstantId: atId, endInstantId: done.id, endIsNow: false, label: 'Feed cats' })
    expect(entities.getInstant(atId)!.favorite).toBe(false)
    expect(entities.getTodo(id)).toMatchObject({ status: 'done' })
    expect(useUi.getState().celebrating).toMatchObject({ instantId: done.id, todoId: id })
  })

  it('Done from the ringing card: a ✓ at Now, no span, and no count starts', () => {
    const { id, atId } = ringingTodo('Take pills')
    act.doneTodo(id)
    expect(useAlarms.getState().ringing).toEqual([])
    expect(entities.getInstant(atId)!.favorite).toBeFalsy()
    expect(useEntities.getState().spans).toEqual([])
    expect(instantsOf(id).map(i => i.todo!.role).sort()).toEqual(['at', 'done'])
    expect(entities.getTodo(id)!.status).toBe('done')
  })

  it('Later moves its at and re-arms its alarm; nothing counts', () => {
    const { id, atId } = ringingTodo('Laundry')
    const later = Date.now() + 3 * HOUR
    act.laterTodo(id, later)
    const at = entities.getInstant(atId)!
    expect(at.tsEpochMs).toBe(later)
    expect(at.favorite).toBeFalsy()
    expect(at.alarms!.filter(a => !a.answered && a.offsetMs === 0)).toHaveLength(1)
    expect(useAlarms.getState().ringing).toEqual([])
    expect(stateOf(id)).toBe('scheduled')
  })

  it('a lap does nothing on a todo (Phase 3 makes it Pause)', () => {
    const { atId, key } = ringingTodo()
    act.dismissAlarm(key)
    act.lapNowSpan(atId)
    expect(entities.getInstant(atId)!.favorite).toBe(true)
  })
})

describe('not now', () => {
  it('Back to the list deletes an at that never rang', () => {
    const id = act.addTodo('Book appointment')!
    act.scheduleTodo(id, Date.now() + HOUR)
    act.backToList(id)
    expect(instantsOf(id)).toEqual([])
    expect(stateOf(id)).toBe('unscheduled')
  })

  it('Back to the list keeps an at that rang, as was', () => {
    const { id, atId } = ringingTodo()
    act.backToList(id)
    expect(entities.getInstant(atId)!.todo).toEqual({ id, role: 'was' })
    expect(stateOf(id)).toBe('unscheduled')
  })

  it('Unschedule is the bell-slash on a scheduled todo: the same as Back to the list', () => {
    const id = act.addTodo('Dentist')!
    act.scheduleTodo(id, Date.now() + HOUR)
    act.backToList(id)
    expect(atOf(id)).toBeUndefined()
  })

  it("Won't do drops it: counting stops with nothing saved", () => {
    const { id, atId, key } = ringingTodo()
    act.dismissAlarm(key)
    act.wontDoTodo(id)
    expect(entities.getTodo(id)!.status).toBe('dropped')
    expect(entities.getInstant(atId)!.favorite).toBe(false)
    expect(useEntities.getState().spans).toEqual([])
  })

  it('done early, a plan that never rang is let go', () => {
    const id = act.addTodo('Book appointment')!
    act.scheduleTodo(id, Date.now() + HOUR)
    act.doneTodo(id)
    expect(instantsOf(id).map(i => i.todo!.role)).toEqual(['done'])
  })

  it('deleting a todo keeps what happened, its links cleared', () => {
    const { id, atId, key } = ringingTodo()
    act.dismissAlarm(key)
    act.stopNowSpan(atId)
    const doneId = instantsOf(id).find(i => i.todo?.role === 'done')!.id
    act.deleteTodo(id)
    expect(entities.getTodo(id)).toBeUndefined()
    expect(entities.getInstant(atId)!.todo).toBeUndefined()
    expect(entities.getInstant(doneId)!.todo).toBeUndefined()
    expect(useEntities.getState().spans).toHaveLength(1)
  })

  it('renaming its at renames the todo', () => {
    const id = act.addTodo('Laundry 11:59pm')!
    act.renameInstant(atOf(id)!.id, 'Fold laundry')
    expect(entities.getTodo(id)!.label).toBe('Fold laundry')
  })
})

describe('repeating todos pass', () => {
  it('an open occurrence is passed when the next one arrives, and stops counting', () => {
    const now = Date.now()
    const series = { id: 'g1', kind: 'series' as const, label: 'Feed cats', time: '07:00', repeat: { kind: 'interval' as const, every: 1 }, alarms: [0], from: dateKey(now - 2 * DAY), todo: {} }
    useEntities.setState({
      groups: [series],
      instants: [
        { id: 'o1', tsEpochMs: now - 2 * HOUR, label: 'Feed cats', seriesId: 'g1', occurrence: dateKey(now - DAY), todo: { id: 't1', role: 'at' }, favorite: true },
        { id: 'o2', tsEpochMs: now - HOUR, label: 'Feed cats', seriesId: 'g1', occurrence: dateKey(now), todo: { id: 't2', role: 'at' } },
      ],
      spans: [{ id: 's1', startInstantId: 'o1', endInstantId: '__NOW__', label: '', visible: true, endIsNow: true }],
      todos: [
        { id: 't1', label: 'Feed cats', createdAt: 0, status: 'open', order: 0, seriesId: 'g1', occurrence: dateKey(now - DAY) },
        { id: 't2', label: 'Feed cats', createdAt: 0, status: 'open', order: 0, seriesId: 'g1', occurrence: dateKey(now) },
      ],
    })
    act.passTodos()
    expect(entities.getTodo('t1')!.status).toBe('passed')
    expect(entities.getTodo('t2')!.status).toBe('open')
    expect(entities.getInstant('o1')!.favorite).toBe(false)
    expect(useEntities.getState().spans).toEqual([])
  })
})

describe('backups', () => {
  it('todos travel in data.todos and come back', () => {
    const id = act.addTodo('laundry 11:59pm 20m')!
    const file = JSON.stringify(act.exportBackup())
    const parsed = parseBackup(file)
    expect(parsed.ok && parsed.backup.data?.todos).toMatchObject([{ id, label: 'laundry', durationMs: 20 * MINUTE }])
    useEntities.setState({ instants: [], spans: [], groups: [], todos: [] })
    if (parsed.ok) act.importBackup(parsed.backup, { settings: false, data: true, mode: 'replace' })
    expect(entities.getTodo(id)).toBeDefined()
    expect(atOf(id)).toBeDefined()
  })
})

describe('making an instant a todo', () => {
  it('an instant ahead becomes its `at`, named for it, with an alarm at its time', () => {
    const iid = entities.createInstant(Date.now() + HOUR, 'Water plants')
    const id = act.makeInstantTodo(iid)!
    expect(entities.getTodo(id)).toMatchObject({ label: 'Water plants', status: 'open' })
    expect(entities.getInstant(iid)).toMatchObject({ todo: { id, role: 'at' }, alarms: [{ offsetMs: 0 }] })
    expect(stateOf(id)).toBe('scheduled')
    expect(act.makeInstantTodo(iid)).toBeUndefined()
  })

  it('a past one is waiting, or counting if it is a favorite; no alarm is added', () => {
    const plain = entities.createInstant(Date.now() - HOUR, 'Rice on')
    const fav = entities.createInstant(Date.now() - HOUR, 'Laundry on')
    act.toggleFavorite(fav)
    expect(stateOf(act.makeInstantTodo(plain)!)).toBe('waiting')
    expect(stateOf(act.makeInstantTodo(fav)!)).toBe('counting')
    expect(entities.getInstant(plain)!.alarms).toBeUndefined()
  })

  it('a ringing alarm made a todo: Dismiss then starts it counting', () => {
    const iid = entities.createInstant(Date.now() - MINUTE, 'Take out trash')
    const alarmId = entities.addAlarm(iid)
    useAlarms.setState({ ringing: [{ instantId: iid, alarmId, label: 'Take out trash', tsEpochMs: Date.now() - MINUTE, triggeredAt: Date.now() }] })
    const id = act.makeInstantTodo(iid)!
    act.dismissAlarm(ringKey(iid, alarmId))
    expect(stateOf(id)).toBe('counting')
  })

  it('an unnamed one opens its name box (from the chip); its name becomes the todo name', () => {
    const iid = entities.createInstant(Date.now() + HOUR, '')
    const id = act.makeInstantTodo(iid, { name: true })!
    expect(useView.getState().editingInstantId).toBe(iid)
    act.renameInstant(iid, 'Stretch')
    expect(entities.getTodo(id)!.label).toBe('Stretch')
  })

  it("an occurrence makes its series a repeating todo: each occurrence ahead a todo of its own", () => {
    const at = act.setAlarm({ time: '7:00', at: Date.now() + HOUR, repeat: { kind: 'interval', every: 1 }, warnings: [], label: 'Meds' })!
    const first = entities.getInstant(at)!
    act.makeInstantTodo(first.id)
    const series = entities.getGroup(first.seriesId)!
    expect(series.todo).toEqual({})
    const ahead = useEntities.getState().instants.filter(i => i.seriesId === series.id)
    expect(ahead.length).toBeGreaterThan(1)
    expect(ahead.every(i => i.todo?.role === 'at')).toBe(true)
  })

  it('a fixed time (a sunrise, a clock change, a season) never becomes one', () => {
    const season = nextSeasonEvent(Date.now())
    const id = seasonVirtualId(season.kind, season.ts)
    useEntities.setState({ instants: [{ id, tsEpochMs: season.ts, label: 'Solstice', favorite: false }] })
    expect(act.makeInstantTodo(id)).toBeUndefined()
  })
})

describe("a scheduled todo's trash", () => {
  it('deletes the schedule, not the todo, and a toast offers to delete the todo too', () => {
    const id = act.addTodo('Laundry')!
    act.scheduleTodo(id, Date.now() + HOUR)
    act.deleteTodoSchedule(id)
    expect(atOf(id)).toBeUndefined()
    expect(stateOf(id)).toBe('unscheduled')
    const toast = useUi.getState().toast!
    expect(toast.text).toBe('Laundry is back on the list')
    toast.action!.run()
    expect(entities.getTodo(id)).toBeUndefined()
  })

  it('one that rang stays as history (`was`)', () => {
    const { id, atId } = ringingTodo()
    act.deleteTodoSchedule(id)
    expect(entities.getInstant(atId)!.todo).toEqual({ id, role: 'was' })
    expect(stateOf(id)).toBe('unscheduled')
  })
})
