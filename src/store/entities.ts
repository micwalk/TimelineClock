// Saved instants, spans, groups (repeating series) and collections (the groups you make; "Groups"
// in the app). Instants and spans persist to the same localStorage keys and record shapes the
// original app used, so existing data loads unchanged.
import { useMemo } from 'react'
import { create } from 'zustand'
import type { AlarmAnswer, AlarmRecord, InstantRecord, SpanRecord } from '../domain/entities.ts'
import type { AlarmSound } from '../domain/sounds.ts'
import { NOW_SENTINEL, newAlarmId, newInstantId, newSpanId, sanitizeInstants, sanitizeSpans, storedInstants, syncFavorites } from '../domain/entities.ts'
import { syncAlarmVisibility } from '../domain/alarms.ts'
import type { GroupRecord } from '../domain/series.ts'
import { sanitizeGroups } from '../domain/series.ts'
import type { CollectionRecord } from '../domain/collections.ts'
import { DEFAULT_COLLECTION, groupHiddenTest, sanitizeCollections } from '../domain/collections.ts'
import type { TodoLink, TodoRecord } from '../domain/todos.ts'
import { sanitizeTodos } from '../domain/todos.ts'
import { loadJson, saveJson } from './storage.ts'

const INSTANTS_KEY = 'timeline.saved.v1'
const SPANS_KEY = 'timeline.spans.v1'
const GROUPS_KEY = 'timeline.groups.v1'
const COLLECTIONS_KEY = 'timeline.collections.v1'
const TODOS_KEY = 'timeline.todos.v1'

export interface EntitiesState {
  instants: InstantRecord[]
  spans: SpanRecord[]
  /** Repeating series (domain/series); their occurrences are instants. */
  groups: GroupRecord[]
  /** Your groups (domain/collections), Default first. */
  collections: CollectionRecord[]
  /** Todos (domain/todos): records of things to do; their instants point at them. */
  todos: TodoRecord[]
}

const loadInstants = () => sanitizeInstants(loadJson<unknown>(INSTANTS_KEY, []))
const loadSpans = () => sanitizeSpans(loadJson<unknown>(SPANS_KEY, []))
const loadGroups = () => sanitizeGroups(loadJson<unknown>(GROUPS_KEY, []))
const loadCollections = () => sanitizeCollections(loadJson<unknown>(COLLECTIONS_KEY, []))
const loadTodos = () => sanitizeTodos(loadJson<unknown>(TODOS_KEY, []))

export const useEntities = create<EntitiesState>(() => {
  const { instants, spans } = syncFavorites(loadInstants(), loadSpans())
  return { instants: syncAlarmVisibility(instants, Date.now()), spans, groups: loadGroups(), collections: loadCollections(), todos: loadTodos() }
})

useEntities.subscribe((s, prev) => {
  // Virtual instants held while selected are never saved.
  if (s.instants !== prev.instants) saveJson(INSTANTS_KEY, storedInstants(s.instants))
  if (s.spans !== prev.spans) saveJson(SPANS_KEY, s.spans)
  if (s.groups !== prev.groups && s.groups) saveJson(GROUPS_KEY, s.groups)
  if (s.collections !== prev.collections && s.collections) saveJson(COLLECTIONS_KEY, s.collections)
  if (s.todos !== prev.todos && s.todos) saveJson(TODOS_KEY, s.todos)
})

/**
 * The instants not hidden by their group being switched off (domain/collections): the list
 * itself when no group is off. Memoized per state, so readers can compare by identity.
 */
const shownCache = new WeakMap<InstantRecord[], { key: unknown[]; list: InstantRecord[] }>()
export function shownInstants(s: EntitiesState = get(), now = Date.now()): InstantRecord[] {
  const test = groupHiddenTest(s.collections ?? [], s.groups ?? [], now)
  if (!test) return s.instants
  const hit = shownCache.get(s.instants)
  if (hit && hit.key[0] === s.collections && hit.key[1] === s.groups) return hit.list
  const list = s.instants.filter(i => !test(i))
  shownCache.set(s.instants, { key: [s.collections, s.groups], list })
  return list
}

/** shownInstants as a hook. */
export function useShownInstants(): InstantRecord[] {
  const instants = useEntities(s => s.instants)
  const groups = useEntities(s => s.groups)
  const collections = useEntities(s => s.collections)
  return useMemo(() => shownInstants({ instants, spans: [], groups, collections, todos: [] }), [instants, groups, collections])
}

const set = useEntities.setState
const get = useEntities.getState

/** A changed instant is real: a virtual one held while selected is saved from then on (same id). */
const real = (i: InstantRecord): InstantRecord => {
  if (!i.virtual) return i
  const { virtual: _v, ...rest } = i
  void _v
  return rest
}

const patchInstant = (id: string, patch: (i: InstantRecord) => Partial<InstantRecord>) =>
  set(s => ({ instants: s.instants.map(i => (i.id === id ? real({ ...i, ...patch(i) }) : i)) }))

/** Makes held virtual instants real (a span saved to one). */
const realize = (ids: readonly string[]) => {
  if (get().instants.some(i => i.virtual && ids.includes(i.id))) set(s => ({ instants: s.instants.map(i => (ids.includes(i.id) ? real(i) : i)) }))
}

/** Changes an instant's alarms; an empty list drops the field. */
const patchAlarms = (id: string, change: (list: AlarmRecord[]) => AlarmRecord[]) =>
  set(s => ({
    instants: s.instants.map(i => {
      if (i.id !== id) return i
      const { alarms, ...rest } = i
      const next = change(alarms ?? [])
      return real(next.length > 0 ? { ...rest, alarms: next } : rest)
    }),
  }))

/**
 * A repeating todo's record goes with its occurrence: once the instants being deleted leave an
 * occurrence's todo with none (its date skipped, the series ended), the record goes too. Other
 * todos stay (a plain todo whose `at` is deleted is just unscheduled again).
 */
function withoutOrphanOccurrences(todos: TodoRecord[] | undefined, instants: readonly InstantRecord[], gone: ReadonlySet<string>): TodoRecord[] {
  const list = todos ?? []
  const hit = new Set(instants.filter(i => gone.has(i.id) && i.todo).map(i => i.todo!.id))
  if (hit.size === 0) return list
  const left = new Set(instants.filter(i => !gone.has(i.id) && i.todo && hit.has(i.todo.id)).map(i => i.todo!.id))
  const drop = (t: TodoRecord) => hit.has(t.id) && !left.has(t.id) && !!t.seriesId && t.status === 'open'
  return list.some(drop) ? list.filter(t => !drop(t)) : list
}

const withoutCollection = <T extends { collectionId?: string }>(rec: T): T => {
  const { collectionId: _c, ...rest } = rec
  void _c
  return rest as T
}

const patchSpan = (id: string, patch: Partial<SpanRecord>) =>
  set(s => ({ spans: s.spans.map(sp => (sp.id === id ? { ...sp, ...patch } : sp)) }))

/** Low-level entity mutations. Cross-cutting behavior (focus, selection) lives in store/actions. */
export const entities = {
  getInstant: (id: string | null | undefined) => (id ? get().instants.find(i => i.id === id) : undefined),
  getSpan: (id: string | null | undefined) => (id ? get().spans.find(s => s.id === id) : undefined),

  /** A new instant, never a favorite yet (setFavorite adds the span to Now that makes one). */
  createInstant(tsEpochMs: number, label = '', opts: { alarm?: boolean } = {}): string {
    const rec: InstantRecord = {
      id: newInstantId(),
      tsEpochMs,
      label,
      favorite: false,
      createdAt: Date.now(),
      ...(opts.alarm ? { alarms: [{ id: newAlarmId(), offsetMs: 0 }] } : {}),
    }
    set(s => ({ instants: [...s.instants, rec] }))
    return rec.id
  },

  getGroup: (id: string | null | undefined) => (id ? (get().groups ?? []).find(g => g.id === id) : undefined),
  /** Adds or replaces a group. */
  putGroup: (g: GroupRecord) => set(s => ({ groups: [...(s.groups ?? []).filter(x => x.id !== g.id), g] })),
  removeGroup: (id: string) => set(s => ({ groups: (s.groups ?? []).filter(g => g.id !== id) })),

  /** Adds or replaces one of your groups (domain/collections). */
  putCollection: (c: CollectionRecord) => set(s => ({ collections: s.collections.some(x => x.id === c.id) ? s.collections.map(x => (x.id === c.id ? c : x)) : [...s.collections, c] })),
  /** Removes a group (never Default); what was in it moves to Default. */
  removeCollection(id: string) {
    if (id === DEFAULT_COLLECTION) return
    set(s => ({
      collections: s.collections.filter(c => c.id !== id),
      instants: s.instants.map(i => (i.collectionId === id ? withoutCollection(i) : i)),
      groups: (s.groups ?? []).map(g => (g.collectionId === id ? withoutCollection(g) : g)),
      todos: (s.todos ?? []).map(t => (t.collectionId === id ? withoutCollection(t) : t)),
    }))
  },
  /** Puts an instant in a group (Default: none named). */
  setInstantCollection: (id: string, collectionId: string) =>
    patchInstant(id, i => (collectionId === DEFAULT_COLLECTION ? { ...withoutCollection(i), collectionId: undefined } : { collectionId })),
  /** Adds ready-made instants (a series' occurrences). */
  addInstants: (list: readonly InstantRecord[]) => { if (list.length > 0) set(s => ({ instants: [...s.instants, ...list] })) },
  /** Deletes instants (and spans that reference them). */
  deleteInstants(ids: readonly string[]) {
    if (ids.length === 0) return
    const gone = new Set(ids)
    set(s => ({
      instants: s.instants.filter(i => !gone.has(i.id)),
      spans: s.spans.filter(sp => !gone.has(sp.startInstantId) && !gone.has(sp.endInstantId)),
      todos: withoutOrphanOccurrences(s.todos, s.instants, gone),
    }))
  },
  patchInstant,

  /** Holds a virtual instant (selected or focused) in the list, so everything finds it; it isn't saved. */
  holdInstant: (rec: InstantRecord) => { if (!get().instants.some(i => i.id === rec.id)) set(s => ({ instants: [...s.instants, { ...rec, virtual: true }] })) },
  /** Lets go of held virtual instants nothing refers to any more. */
  releaseInstants(keep: ReadonlySet<string>) {
    if (get().instants.some(i => i.virtual && !keep.has(i.id))) set(s => ({ instants: s.instants.filter(i => !i.virtual || keep.has(i.id)) }))
  },

  /** Deletes the instant and any spans that reference it. */
  deleteInstant(id: string) {
    set(s => ({
      instants: s.instants.filter(i => i.id !== id),
      spans: s.spans.filter(sp => sp.startInstantId !== id && sp.endInstantId !== id),
      todos: withoutOrphanOccurrences(s.todos, s.instants, new Set([id])),
    }))
  },

  setInstantLabel: (id: string, label: string) => patchInstant(id, () => ({ label })),
  setInstantTime: (id: string, tsEpochMs: number) => patchInstant(id, () => ({ tsEpochMs })),
  setFavoriteFlag: (id: string, favorite: boolean) => patchInstant(id, () => ({ favorite })),
  setHiddenFlag: (id: string, hidden: boolean) => patchInstant(id, () => ({ hidden })),

  /**
   * Adds an alarm (at the instant, or `offsetMs` before it; a snooze names the alarm it snoozed);
   * returns its id. An alarm still to ring is never hidden, so this shows the instant.
   */
  addAlarm(id: string, opts: { offsetMs?: number; snoozeOf?: string; sound?: AlarmSound } = {}): string {
    const alarm: AlarmRecord = { id: newAlarmId(), offsetMs: Math.round(opts.offsetMs ?? 0), ...(opts.snoozeOf ? { snoozeOf: opts.snoozeOf } : {}), ...(opts.sound ? { sound: opts.sound } : {}) }
    patchInstant(id, i => ({ alarms: [...(i.alarms ?? []), alarm], ...(i.hidden ? { hidden: false } : {}) }))
    return alarm.id
  },
  removeAlarm: (id: string, alarmId: string) => patchAlarms(id, list => list.filter(a => a.id !== alarmId)),
  setAlarmOffset: (id: string, alarmId: string, offsetMs: number) =>
    patchAlarms(id, list => list.map(a => (a.id === alarmId ? { ...a, offsetMs: Math.round(offsetMs) } : a))),
  setAlarmSound: (id: string, alarmId: string, sound: AlarmSound) =>
    patchAlarms(id, list => list.map(a => (a.id === alarmId ? { ...a, sound } : a))),
  /** Answers alarms that rang (dismissed, snoozed): they stay as history and never ring again. */
  answerAlarms: (id: string, alarmIds: readonly string[], answer: AlarmAnswer) =>
    patchAlarms(id, list => list.map(a => (alarmIds.includes(a.id) && !a.answered ? { ...a, answered: answer } : a))),

  createSpan(startInstantId: string, endInstantId: string, label = '', opts: { visible?: boolean } = {}): string {
    realize([startInstantId, endInstantId])
    const rec: SpanRecord = { id: newSpanId(), startInstantId, endInstantId, label, visible: opts.visible ?? false, endIsNow: false }
    set(s => ({ spans: [...s.spans, rec] }))
    return rec.id
  },

  /** Ensures the instant has a span to Now (a favorite's); returns its id. */
  upsertNowSpan(startInstantId: string, visible: boolean): string {
    realize([startInstantId])
    const found = get().spans.find(sp => sp.startInstantId === startInstantId && sp.endIsNow)
    if (found) {
      patchSpan(found.id, { visible })
      return found.id
    }
    const rec: SpanRecord = { id: newSpanId(), startInstantId, endInstantId: NOW_SENTINEL, label: '', visible, endIsNow: true }
    set(s => ({ spans: [...s.spans, rec] }))
    return rec.id
  },

  /**
   * Ends the instant's span to Now at `endInstantId`: the same record becomes a saved span
   * (same id, so its lane flows from the live side to the saved side), or a new one when it has
   * none. Unfavoriting afterwards then deletes nothing. Returns the span's id.
   */
  closeNowSpan(startInstantId: string, endInstantId: string, label = ''): string {
    const found = entities.nowSpanOf(startInstantId)
    if (!found) return entities.createSpan(startInstantId, endInstantId, label, { visible: true })
    patchSpan(found.id, { endIsNow: false, endInstantId, label, visible: true })
    return found.id
  },

  nowSpanOf: (startInstantId: string) => get().spans.find(sp => sp.startInstantId === startInstantId && sp.endIsNow),

  /**
   * A favorite is an instant whose span to Now is tracked: favoriting adds that span,
   * unfavoriting deletes it (domain/entities syncFavorites keeps stored data to that rule).
   */
  setFavorite(id: string, favorite: boolean) {
    entities.setFavoriteFlag(id, favorite)
    if (favorite) entities.upsertNowSpan(id, true)
    else {
      const sp = entities.nowSpanOf(id)
      if (sp) entities.deleteSpan(sp.id)
    }
  },

  deleteSpan: (id: string) => set(s => ({ spans: s.spans.filter(sp => sp.id !== id) })),

  // Todos (domain/todos)
  getTodo: (id: string | null | undefined) => (id ? (get().todos ?? []).find(t => t.id === id) : undefined),
  /** Adds or replaces a todo record. */
  putTodo: (t: TodoRecord) => set(s => ({ todos: (s.todos ?? []).some(x => x.id === t.id) ? s.todos.map(x => (x.id === t.id ? t : x)) : [...(s.todos ?? []), t] })),
  /** Adds todo records (a series' occurrences'). */
  addTodos: (list: readonly TodoRecord[]) => { if (list.length > 0) set(s => ({ todos: [...(s.todos ?? []), ...list] })) },
  patchTodo: (id: string, patch: Partial<TodoRecord>) => set(s => ({ todos: (s.todos ?? []).map(t => (t.id === id ? { ...t, ...patch } : t)) })),
  removeTodo: (id: string) => set(s => ({ todos: (s.todos ?? []).filter(t => t.id !== id) })),
  /** Sets or clears which todo an instant belongs to, and its part. */
  setInstantTodo: (id: string, link: TodoLink | null) => patchInstant(id, () => ({ todo: link ?? undefined })),
  setSpanLabel: (id: string, label: string) => patchSpan(id, { label }),
  setSpanVisible: (id: string, visible: boolean) => patchSpan(id, { visible }),

}
