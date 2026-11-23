// Todos as the Agenda shows them (domain/todos): the Todos tab's sections and the count of what
// rang and isn't done (the badge on its tab and on the ☰).
import { useMemo } from 'react'
import { useFrameValue } from '../engine/hooks.ts'
import type { InstantRecord } from '../domain/entities.ts'
import type { TodoSections } from '../domain/todos.ts'
import { instantsByTodo, todoSections } from '../domain/todos.ts'
import { DEFAULT_COLLECTION } from '../domain/collections.ts'
import { useEntities } from '../store/entities.ts'

/** Each todo's instants (domain/todos instantsByTodo), worked out once per change of the instants. */
const indexCache = new WeakMap<InstantRecord[], Map<string, InstantRecord[]>>()
export function todoIndex(instants: InstantRecord[]): Map<string, InstantRecord[]> {
  let index = indexCache.get(instants)
  if (!index) { index = instantsByTodo(instants); indexCache.set(instants, index) }
  return index
}

/** The Todos tab's sections at `minute` (minutes since the epoch); todos in a group you switched off are left out, as their instants are. */
export function useTodoSections(minute: number): TodoSections {
  const todos = useEntities(s => s.todos)
  const instants = useEntities(s => s.instants)
  const collections = useEntities(s => s.collections)
  return useMemo(() => {
    const off = new Set((collections ?? []).filter(c => c.hidden).map(c => c.id))
    const shown = off.size === 0 ? todos ?? [] : (todos ?? []).filter(t => !off.has(t.collectionId ?? DEFAULT_COLLECTION))
    // Worked out again each minute and on every change, then at the real time: something made at
    // Now this minute (a ▶ start, a plan moved to Now) has come, not ahead.
    return todoSections(shown, todoIndex(instants), Math.max(minute * 60_000, Date.now()))
  }, [todos, instants, collections, minute])
}

const byMinute = (f: { now: number }) => Math.floor(f.now / 60_000)

/** How many todos rang and aren't done (the Todos tab's badge, and the ☰'s). */
export function useTodoNowCount(): number {
  const s = useTodoSections(useFrameValue(byMinute))
  return s.active.length + s.now.length
}
