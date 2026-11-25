import { beforeEach, describe, expect, it, vi } from 'vitest'

const fake = vi.hoisted(() => ({ snaps: [] as string[], inbox: {} as unknown }))
vi.mock('./todoWidgetPlugin.ts', () => ({
  TodoWidget: {
    setSnapshot: vi.fn(async ({ json }: { json: string }) => { fake.snaps.push(json) }),
    drain: vi.fn(async () => { const inbox = fake.inbox; fake.inbox = {}; return { inbox } }),
  },
}))

import { drainTodoWidget, syncTodoWidget } from './todoWidgetSync.ts'
import { useEntities } from '../../store/entities.ts'
import { useUi } from '../../store/ui.ts'

beforeEach(() => {
  fake.snaps = []
  useEntities.setState({ instants: [], spans: [], groups: [], todos: [] })
  useUi.setState({ todoDraft: null, listTab: 'all' as never })
})

describe('todo widgets', () => {
  it('writes the snapshot when the todos change, not again when they did not', async () => {
    useEntities.setState({ todos: [{ id: 't1', label: 'Laundry', createdAt: 0, status: 'open', order: 0 }] })
    await syncTodoWidget()
    await syncTodoWidget()
    expect(fake.snaps).toHaveLength(1)
    expect(JSON.parse(fake.snaps[0]).todos).toMatchObject([{ id: 't1', label: 'Laundry', status: 'open' }])
  })

  it('a todo ticked on the widget is done when it was ticked; quick add text goes to the Add box on the Todos tab', async () => {
    useEntities.setState({ todos: [{ id: 't1', label: 'Laundry', createdAt: 0, status: 'open', order: 0 }] })
    const tapped = Date.now() - 60_000
    fake.inbox = { dones: [{ id: 't1', at: tapped }], adds: [{ text: 'buy milk then call mom' }, { text: 'feed cats' }] }
    await drainTodoWidget()
    expect(useEntities.getState().todos[0]).toMatchObject({ status: 'done' })
    expect(useEntities.getState().instants.find(i => i.todo?.role === 'done')?.tsEpochMs).toBe(tapped)
    expect(useUi.getState().todoDraft).toBe('buy milk\ncall mom\nfeed cats')
    expect(useUi.getState().listTab).toBe('todos')
  })
})
