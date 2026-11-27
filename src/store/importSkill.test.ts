// The import skill's complete example (docs/skills/timeline-clock-import.md) combined into a
// device's data the way the import dialog does it: its group comes in as a new group, the race
// gets its countdown, the series makes its occurrences, the todos read as the skill says.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import doc from '../../docs/skills/timeline-clock-import.md?raw'
import type { Backup } from '../domain/backup.ts'
import { parseBackup } from '../domain/backup.ts'
import { defaultImportRows, sanitizeCollections } from '../domain/collections.ts'
import { instantsByTodo, instantsOf, todoActual, todoState } from '../domain/todos.ts'
import { MINUTE } from '../domain/time.ts'
import { engine } from '../engine/viewportEngine.ts'
import * as act from './actions.ts'
import { useEntities } from './entities.ts'
import { initialViewState, useView } from './view.ts'

const complete = [...doc.matchAll(/```json\r?\n([\s\S]*?)```/g)].map(m => m[1]).find(b => b.includes('"format"'))!
const file = (parseBackup(complete) as { ok: true; backup: Backup }).backup

beforeEach(() => {
  // When the example was written: Nov 26, 2026, 8:00 PM in New York.
  vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-11-27T01:00:00Z') })
  engine.cancelTransition()
  useEntities.setState({ instants: [{ id: 'mine', tsEpochMs: Date.now() - MINUTE, label: 'Already here' }], spans: [], groups: [], todos: [], collections: sanitizeCollections([]) })
  useView.setState(initialViewState())
})
afterEach(() => { vi.useRealTimers() })

describe('the import skill’s complete file', () => {
  it('combines into a device’s data in a group of its own', () => {
    const rows = defaultImportRows(file.data!, useEntities.getState().collections)
    expect(rows.map(r => r.target)).toEqual([{ kind: 'new', label: 'Half marathon training' }])
    act.importBackup(file, { settings: false, data: true, mode: 'combine', groups: rows })
    act.syncSeries()

    const { instants, spans, todos, groups, collections } = useEntities.getState()
    const group = collections.find(c => c.label === 'Half marathon training')!
    expect(instants.find(i => i.id === 'mine')).toBeDefined()
    // Everything it brought is in its group, the series' occurrences included.
    for (const i of instants.filter(i => i.id !== 'mine' && !i.seriesId)) expect(i.collectionId).toBe(group.id)
    for (const t of todos ?? []) expect(t.collectionId).toBe(group.id)
    expect(groups?.map(g => g.collectionId)).toEqual([group.id])
    // The race is a countdown: the app made its span to Now.
    expect(spans.some(s => s.startInstantId === 'i_race' && s.endIsNow)).toBe(true)
    expect(spans.filter(s => !s.endIsNow).map(s => s.id)).toEqual(['s_long_run', 's_plan_1'])
    // Tuesdays and Thursdays from Nov 30 to Dec 10.
    expect(instants.filter(i => i.seriesId === 'g_easy_run').map(i => i.occurrence).sort()).toEqual(['2026-12-01', '2026-12-03', '2026-12-08', '2026-12-10'])
    // The todos: unscheduled, scheduled, and done in 25 minutes.
    const now = Date.now()
    const byTodo = instantsByTodo(instants)
    const state = (id: string) => todoState(todos!.find(t => t.id === id)!, instantsOf(byTodo, id), now)
    expect(['t_shoes', 't_bib', 't_plan'].map(state)).toEqual(['unscheduled', 'scheduled', 'done'])
    expect(todoActual(instantsOf(byTodo, 't_plan'), spans, now).ms).toBe(25 * MINUTE)
  })
})
