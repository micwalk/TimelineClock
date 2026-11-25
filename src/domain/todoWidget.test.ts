import { describe, expect, it } from 'vitest'
import type { InstantRecord } from './entities.ts'
import type { TodoRecord } from './todos.ts'
import { instantsByTodo } from './todos.ts'
import { sanitizeInbox, widgetSnapshot } from './todoWidget.ts'
import { DAY, HOUR, MINUTE } from './time.ts'

const NOW = new Date(2026, 10, 25, 12).getTime()
const todo = (id: string, p: Partial<TodoRecord> = {}): TodoRecord => ({ id, label: id, createdAt: 0, status: 'open', order: 0, ...p })
const at = (id: string, todoId: string, ts: number, p: Partial<InstantRecord> = {}): InstantRecord => ({ id, tsEpochMs: ts, label: '', todo: { id: todoId, role: 'at' }, ...p })
const clock = (ts: number) => `${new Date(ts).getHours()}h`

describe('the widgets’ snapshot', () => {
  it('has open todos (when, counting, paused) and those closed in the last two days, nearest first', () => {
    const todos = [
      todo('later', { order: 1 }),
      todo('soon', { durationMs: 20 * MINUTE }),
      todo('old', { status: 'done', closedAt: NOW - 3 * DAY }),
      todo('done', { status: 'done', closedAt: NOW - HOUR }),
      todo('running', { startedId: 'r' }),
    ]
    const instants = [at('s', 'soon', NOW + HOUR), at('r', 'running', NOW - 10 * MINUTE, { favorite: true })]
    const snap = widgetSnapshot(todos, instantsByTodo(instants), NOW, clock)
    expect(snap.todos.map(t => t.id)).toEqual(['running', 'soon', 'later', 'done'])
    expect(snap.todos[0]).toMatchObject({ counting: true, clock: '11h' })
    expect(snap.todos[1]).toEqual({ id: 'soon', label: 'soon', status: 'open', at: NOW + HOUR, clock: '13h', durationMs: 20 * MINUTE, order: 0 })
    expect(snap.todos[3]).toMatchObject({ status: 'done', closedAt: NOW - HOUR })
  })
})

describe('the widgets’ inbox', () => {
  it('keeps well-formed requests only', () => {
    expect(sanitizeInbox({ adds: [{ text: ' buy milk ' }, { text: '' }, 3], dones: [{ id: 't1', at: 5 }, { id: 't2' }], open: 't1' }))
      .toEqual({ adds: ['buy milk'], dones: [{ id: 't1', at: 5 }], open: 't1' })
    expect(sanitizeInbox(null)).toEqual({ adds: [], dones: [], open: null })
  })
})
