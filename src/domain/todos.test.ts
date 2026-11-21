import { describe, expect, it } from 'vitest'
import type { InstantRecord, SpanRecord } from './entities.ts'
import { NOW_SENTINEL, sanitizeInstants } from './entities.ts'
import type { TodoRecord } from './todos.ts'
import {
  doneFolds, instantsByTodo, makeTodo, nextOrder, nextPassTime, nowCount, parseTodoInput, passedTodos, plannedBlocks, quickChoices,
  sanitizeTodos, todoActual, todoInputAt, todoOccurrences, todoReading, todoSections, todoState,
} from './todos.ts'
import type { SeriesRecord } from './series.ts'
import { formatDurationShort } from './format.ts'
import { MINUTE } from './time.ts'

// Local times, so the tests read the same in any time zone.
const at = (h: number, m = 0, day = 21) => new Date(2026, 10, day, h, m).getTime()
const NOW = at(12)

const todo = (id: string, p: Partial<TodoRecord> = {}): TodoRecord => ({ id, label: id, createdAt: 0, status: 'open', order: 0, ...p })
const inst = (id: string, ts: number, p: Partial<InstantRecord> = {}): InstantRecord => ({ id, tsEpochMs: ts, label: '', ...p })
const nowSpan = (start: string): SpanRecord => ({ id: `s_${start}`, startInstantId: start, endInstantId: NOW_SENTINEL, label: '', visible: true, endIsNow: true })
const span = (a: string, b: string): SpanRecord => ({ id: `s_${a}_${b}`, startInstantId: a, endInstantId: b, label: '', visible: true })

describe('records', () => {
  it('keeps well-formed records and drops junk', () => {
    const list = sanitizeTodos([
      { id: 't1', label: 'Laundry', createdAt: 5, durationMs: 20 * MINUTE, status: 'open', order: 2 },
      { id: 't1', label: 'dupe' },
      { id: 't2', status: 'weird', durationMs: -3, collectionId: 'default', seriesId: 'g', occurrence: 'nope' },
      null, 'x', { label: 'no id' },
    ])
    expect(list).toEqual([
      { id: 't1', label: 'Laundry', createdAt: 5, durationMs: 20 * MINUTE, status: 'open', order: 2 },
      { id: 't2', label: '', createdAt: 0, status: 'open', order: 2 },
    ])
  })

  it('an instant keeps its todo link only when it is well formed', () => {
    const [a, b] = sanitizeInstants([
      { id: 'a', tsEpochMs: 1, label: '', todo: { id: 't1', role: 'at' } },
      { id: 'b', tsEpochMs: 1, label: '', todo: { id: 't1', role: 'boss' } },
    ])
    expect(a.todo).toEqual({ id: 't1', role: 'at' })
    expect(b.todo).toBeUndefined()
  })

  it('new todos go at the end of the list', () => {
    expect(nextOrder([todo('a', { order: 3 }), todo('b', { order: 1 })])).toBe(4)
    expect(makeTodo({ label: 'x', durationMs: 0 }, 't', 1, 0)).toEqual({ id: 't', label: 'x', createdAt: 1, status: 'open', order: 0 })
  })
})

describe('todoState', () => {
  const t = todo('t1')
  const link = { todo: { id: 't1', role: 'at' as const } }
  it('unscheduled without an at', () => expect(todoState(t, [], NOW)).toBe('unscheduled'))
  it('scheduled while its at is ahead', () => expect(todoState(t, [inst('a', at(15), link)], NOW)).toBe('scheduled'))
  it('waiting once its at has come', () => expect(todoState(t, [inst('a', at(7), link)], NOW)).toBe('waiting'))
  it('counting while its at is favorited and has come', () => expect(todoState(t, [inst('a', at(7), { ...link, favorite: true })], NOW)).toBe('counting'))
  it('a favorite ahead is a countdown, still scheduled', () => expect(todoState(t, [inst('a', at(15), { ...link, favorite: true })], NOW)).toBe('scheduled'))
  it('closed records say so', () => {
    expect(todoState(todo('t1', { status: 'done' }), [], NOW)).toBe('done')
    expect(todoState(todo('t1', { status: 'passed' }), [], NOW)).toBe('passed')
  })
})

describe('actual time and readings', () => {
  const link = (role: 'at' | 'done') => ({ todo: { id: 't1', role } })
  const len = formatDurationShort
  it('a stretch from at to done', () => {
    const mine = [inst('a', at(16), link('at')), inst('d', at(16, 31), link('done'))]
    const actual = todoActual(mine, [span('a', 'd')], NOW)
    expect(actual).toEqual({ ms: 31 * MINUTE, stretches: 1, counting: false })
    expect(todoReading(todo('t1', { status: 'done', durationMs: 20 * MINUTE }), actual, len)).toBe('31m · planned 20m')
  })
  it('counting adds the time to Now', () => {
    const mine = [inst('a', at(11, 35), { ...link('at'), favorite: true })]
    expect(todoActual(mine, [nowSpan('a')], NOW)).toEqual({ ms: 25 * MINUTE, stretches: 1, counting: true })
  })
  it('several stretches add up', () => {
    const t = (id: string) => ({ todo: { id: 't1', role: id === 'a' ? 'at' as const : 'done' as const } })
    const mine = [inst('a', at(9), t('a')), inst('p', at(9, 12), t('p')), inst('s', at(10), t('s')), inst('d', at(10, 19), t('d'))]
    const actual = todoActual(mine, [span('a', 'p'), span('s', 'd')], NOW)
    expect(actual.ms).toBe(31 * MINUTE)
    expect(todoReading(todo('t1', { status: 'done' }), actual, len)).toBe('31m in 2 stretches')
  })
  it('done straight away reads done', () => {
    expect(todoReading(todo('t1', { status: 'done', durationMs: 20 * MINUTE }), { ms: 0, stretches: 0, counting: false }, len)).toBe('done · planned 20m')
    expect(todoReading(todo('t1', { status: 'passed' }), { ms: 0, stretches: 0, counting: false }, len)).toBe('passed')
  })
})

describe('todoSections', () => {
  const todos = [
    todo('wait'), todo('count'), todo('later'), todo('tomorrow'), todo('list2', { order: 2 }), todo('list1', { order: 1 }),
    todo('done', { status: 'done', closedAt: at(11) }), todo('old', { status: 'done', closedAt: at(11, 0, 19) }), todo('nope', { status: 'dropped', closedAt: at(10) }),
  ]
  const instants = [
    inst('w', at(7), { todo: { id: 'wait', role: 'at' } }),
    inst('c', at(8), { todo: { id: 'count', role: 'at' }, favorite: true }),
    inst('l', at(18), { todo: { id: 'later', role: 'at' } }),
    inst('m', at(9, 0, 22), { todo: { id: 'tomorrow', role: 'at' } }),
  ]
  const s = todoSections(todos, instantsByTodo(instants), NOW)
  it('sorts each section', () => {
    expect(s.now.map(r => r.todo.id)).toEqual(['count', 'wait'])
    expect(s.today.map(r => r.todo.id)).toEqual(['later'])
    expect(s.upcoming.map(r => r.todo.id)).toEqual(['tomorrow'])
    expect(s.unscheduled.map(r => r.todo.id)).toEqual(['list1', 'list2'])
    expect(s.done.map(r => r.todo.id)).toEqual(['done', 'nope'])
    expect(s.doneToday).toBe(1)
  })
  it('counts what rang and is not done', () => expect(nowCount(todos, instantsByTodo(instants), NOW)).toBe(2))
})

describe('repeating todos', () => {
  const series: SeriesRecord = { id: 'g1', kind: 'series', label: 'Feed cats', time: '07:00', repeat: { kind: 'interval', every: 1 }, alarms: [0], from: '2026-11-01', todo: { durationMs: 5 * MINUTE } }
  it('occurrences of a todo series get records', () => {
    const made = [inst('o1', at(7), { seriesId: 'g1', occurrence: '2026-11-21' }), inst('x', at(8), { seriesId: 'other', occurrence: '2026-11-21' })]
    let n = 0
    const r = todoOccurrences(made, [series], () => `t${++n}`, NOW)
    expect(r.todos).toEqual([{ id: 't1', label: 'Feed cats', createdAt: NOW, durationMs: 5 * MINUTE, status: 'open', order: 0, seriesId: 'g1', occurrence: '2026-11-21' }])
    expect(r.instants[0].todo).toEqual({ id: 't1', role: 'at' })
    expect(r.instants[1]).toBe(made[1])
  })
  it('an open one passes when the next occurrence arrives', () => {
    const todos = [todo('a', { seriesId: 'g1', occurrence: '2026-11-21' }), todo('b', { seriesId: 'g1', occurrence: '2026-11-22' })]
    const instants = [inst('o1', at(7), { seriesId: 'g1', occurrence: '2026-11-21' }), inst('o2', at(7, 0, 22), { seriesId: 'g1', occurrence: '2026-11-22' })]
    expect(passedTodos(todos, instants, NOW)).toEqual([])
    expect(nextPassTime(todos, instants, NOW)).toBe(at(7, 0, 22))
    expect(passedTodos(todos, instants, at(7, 0, 22))).toEqual(['a'])
    expect(passedTodos([{ ...todos[0], status: 'done' }], instants, at(8, 0, 22))).toEqual([])
  })
})

describe('on the timeline', () => {
  it('a scheduled todo with a length draws its planned block until it is done', () => {
    const t = todo('t1', { label: 'Laundry', durationMs: 20 * MINUTE })
    const instants = [inst('a', at(16), { todo: { id: 't1', role: 'at' } })]
    expect(plannedBlocks([t], instantsByTodo(instants), NOW)).toEqual([{ key: 'plan:t1', start: at(16), end: at(16, 20), label: 'Laundry', look: 'planned', instantId: 'a' }])
    expect(plannedBlocks([{ ...t, status: 'done' }], instantsByTodo(instants), NOW)).toEqual([])
    expect(plannedBlocks([{ ...t, durationMs: undefined }], instantsByTodo(instants), NOW)).toEqual([])
  })
  it('a ✓ close to its todo folds into it', () => {
    const shown = [inst('a', at(7), { todo: { id: 't1', role: 'at' } }), inst('d', at(7, 2), { todo: { id: 't1', role: 'done' } })]
    const pos = (ts: number) => ts / MINUTE // 1px a minute
    expect(doneFolds(shown, pos, 10, () => false)).toEqual({ a: 'd' })
    expect(doneFolds(shown, pos, 1, () => false)).toEqual({})
    expect(doneFolds(shown, pos, 10, id => id === 'd')).toEqual({})
  })
})

describe('the Add box', () => {
  it('reads a name alone', () => expect(parseTodoInput('Book appointment')).toEqual({ label: 'Book appointment' }))
  it('reads a time', () => expect(parseTodoInput('book appt 3p')).toEqual({ label: 'book appt', time: { h: 3, m: 0, meridiem: 'pm' } }))
  it('reads a length', () => expect(parseTodoInput('laundry 20m')).toEqual({ label: 'laundry', durationMs: 20 * MINUTE }))
  it('reads a time and a length in either order', () => {
    expect(parseTodoInput('laundry 4p 20m')).toEqual({ label: 'laundry', time: { h: 4, m: 0, meridiem: 'pm' }, durationMs: 20 * MINUTE })
    expect(parseTodoInput('laundry 1h30 at 4:15pm')).toEqual({ label: 'laundry', time: { h: 4, m: 15, meridiem: 'pm' }, durationMs: 90 * MINUTE })
  })
  it('reads a repeat with a time', () => {
    expect(parseTodoInput('feed cats 7a daily')).toEqual({ label: 'feed cats', time: { h: 7, m: 0, meridiem: 'am' }, repeat: { kind: 'weekly', days: [0, 1, 2, 3, 4, 5, 6] } })
    expect(parseTodoInput('water plants every 3 days 9a').repeat).toEqual({ kind: 'interval', every: 3 })
  })
  it('a repeat without a time stays in the name', () => expect(parseTodoInput('feed cats daily')).toEqual({ label: 'feed cats daily' }))
  it('numbers that could be anything stay in the name', () => {
    expect(parseTodoInput('buy 2 eggs')).toEqual({ label: 'buy 2 eggs' })
    expect(parseTodoInput('call mom at 7').time).toEqual({ h: 7, m: 0, meridiem: null })
  })
  it('reads day words', () => expect(parseTodoInput('dentist tomorrow 10a')).toEqual({ label: 'dentist', day: 'tomorrow', time: { h: 10, m: 0, meridiem: 'am' } }))
  it('nothing left for a name: the whole text is the name', () => expect(parseTodoInput('20m')).toEqual({ label: '20m' }))
})

describe('when a typed todo is for', () => {
  it('a time today, or tomorrow once passed', () => {
    expect(todoInputAt({ time: { h: 3, m: 0, meridiem: 'pm' } }, NOW)).toBe(at(15))
    expect(todoInputAt({ time: { h: 9, m: 0, meridiem: 'am' } }, NOW)).toBe(at(9, 0, 22))
  })
  it('an ambiguous hour takes the sooner', () => expect(todoInputAt({ time: { h: 7, m: 0, meridiem: null } }, NOW)).toBe(at(19)))
  it('day words', () => {
    expect(todoInputAt({ day: 'tomorrow' }, NOW)).toBe(at(9, 0, 22))
    expect(todoInputAt({ day: 'tonight' }, NOW)).toBe(at(19))
    expect(todoInputAt({ day: 'tomorrow', time: { h: 7, m: 0, meridiem: null } }, NOW)).toBe(at(7, 0, 22))
    expect(todoInputAt({}, NOW)).toBeNull()
  })
  it('quick choices leave out Tonight once it is near', () => {
    expect(quickChoices(NOW).map(c => c.label)).toEqual(['In 15m', 'In 1h', 'Tonight', 'Tomorrow'])
    expect(quickChoices(at(18, 50)).map(c => c.key)).toEqual(['in15', 'in1h', 'tomorrow'])
  })
})

describe('a typed when', () => {
  it('reads lengths, times and day words', async () => {
    const { parseWhen } = await import('./todos.ts')
    expect(parseWhen('10', NOW)).toBe(NOW + 10 * MINUTE)
    expect(parseWhen('1h30', NOW)).toBe(NOW + 90 * MINUTE)
    expect(parseWhen('45m', NOW)).toBe(NOW + 45 * MINUTE)
    expect(parseWhen('3p', NOW)).toBe(at(15))
    expect(parseWhen('tomorrow', NOW)).toBe(at(9, 0, 22))
    expect(parseWhen('tomorrow 10a', NOW)).toBe(at(10, 0, 22))
    expect(parseWhen('soon', NOW)).toBeNull()
    expect(parseWhen('', NOW)).toBeNull()
  })
})
