// Saved instants, spans and groups (repeating series). Instants and spans persist to the same
// localStorage keys and record shapes the original app used, so existing data loads unchanged.
import { create } from 'zustand'
import type { AlarmAnswer, AlarmRecord, InstantRecord, SpanRecord } from '../domain/entities.ts'
import { NOW_SENTINEL, newAlarmId, newInstantId, newSpanId, sanitizeInstants, sanitizeSpans, syncFavorites } from '../domain/entities.ts'
import { syncAlarmVisibility } from '../domain/alarms.ts'
import type { GroupRecord } from '../domain/series.ts'
import { sanitizeGroups } from '../domain/series.ts'
import { loadJson, saveJson } from './storage.ts'

const INSTANTS_KEY = 'timeline.saved.v1'
const SPANS_KEY = 'timeline.spans.v1'
const GROUPS_KEY = 'timeline.groups.v1'

export interface EntitiesState {
  instants: InstantRecord[]
  spans: SpanRecord[]
  /** Repeating series (domain/series); their occurrences are instants. */
  groups: GroupRecord[]
}

const loadInstants = () => sanitizeInstants(loadJson<unknown>(INSTANTS_KEY, []))
const loadSpans = () => sanitizeSpans(loadJson<unknown>(SPANS_KEY, []))
const loadGroups = () => sanitizeGroups(loadJson<unknown>(GROUPS_KEY, []))

export const useEntities = create<EntitiesState>(() => {
  const { instants, spans } = syncFavorites(loadInstants(), loadSpans())
  return { instants: syncAlarmVisibility(instants, Date.now()), spans, groups: loadGroups() }
})

useEntities.subscribe((s, prev) => {
  if (s.instants !== prev.instants) saveJson(INSTANTS_KEY, s.instants)
  if (s.spans !== prev.spans) saveJson(SPANS_KEY, s.spans)
  if (s.groups !== prev.groups && s.groups) saveJson(GROUPS_KEY, s.groups)
})

const set = useEntities.setState
const get = useEntities.getState

const patchInstant = (id: string, patch: (i: InstantRecord) => Partial<InstantRecord>) =>
  set(s => ({ instants: s.instants.map(i => (i.id === id ? { ...i, ...patch(i) } : i)) }))

/** Changes an instant's alarms; an empty list drops the field. */
const patchAlarms = (id: string, change: (list: AlarmRecord[]) => AlarmRecord[]) =>
  set(s => ({
    instants: s.instants.map(i => {
      if (i.id !== id) return i
      const { alarms, ...rest } = i
      const next = change(alarms ?? [])
      return next.length > 0 ? { ...rest, alarms: next } : rest
    }),
  }))

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
      ...(opts.alarm ? { alarms: [{ id: newAlarmId(), offsetMs: 0 }] } : {}),
    }
    set(s => ({ instants: [...s.instants, rec] }))
    return rec.id
  },

  getGroup: (id: string | null | undefined) => (id ? (get().groups ?? []).find(g => g.id === id) : undefined),
  /** Adds or replaces a group. */
  putGroup: (g: GroupRecord) => set(s => ({ groups: [...(s.groups ?? []).filter(x => x.id !== g.id), g] })),
  removeGroup: (id: string) => set(s => ({ groups: (s.groups ?? []).filter(g => g.id !== id) })),
  /** Adds ready-made instants (a series' occurrences). */
  addInstants: (list: readonly InstantRecord[]) => { if (list.length > 0) set(s => ({ instants: [...s.instants, ...list] })) },
  /** Deletes instants (and spans that reference them). */
  deleteInstants(ids: readonly string[]) {
    if (ids.length === 0) return
    const gone = new Set(ids)
    set(s => ({
      instants: s.instants.filter(i => !gone.has(i.id)),
      spans: s.spans.filter(sp => !gone.has(sp.startInstantId) && !gone.has(sp.endInstantId)),
    }))
  },
  patchInstant,

  /** Deletes the instant and any spans that reference it. */
  deleteInstant(id: string) {
    set(s => ({
      instants: s.instants.filter(i => i.id !== id),
      spans: s.spans.filter(sp => sp.startInstantId !== id && sp.endInstantId !== id),
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
  addAlarm(id: string, opts: { offsetMs?: number; snoozeOf?: string } = {}): string {
    const alarm: AlarmRecord = { id: newAlarmId(), offsetMs: Math.round(opts.offsetMs ?? 0), ...(opts.snoozeOf ? { snoozeOf: opts.snoozeOf } : {}) }
    patchInstant(id, i => ({ alarms: [...(i.alarms ?? []), alarm], ...(i.hidden ? { hidden: false } : {}) }))
    return alarm.id
  },
  removeAlarm: (id: string, alarmId: string) => patchAlarms(id, list => list.filter(a => a.id !== alarmId)),
  setAlarmOffset: (id: string, alarmId: string, offsetMs: number) =>
    patchAlarms(id, list => list.map(a => (a.id === alarmId ? { ...a, offsetMs: Math.round(offsetMs) } : a))),
  /** Answers alarms that rang (dismissed, snoozed): they stay as history and never ring again. */
  answerAlarms: (id: string, alarmIds: readonly string[], answer: AlarmAnswer) =>
    patchAlarms(id, list => list.map(a => (alarmIds.includes(a.id) && !a.answered ? { ...a, answered: answer } : a))),

  createSpan(startInstantId: string, endInstantId: string, label = '', opts: { visible?: boolean } = {}): string {
    const rec: SpanRecord = { id: newSpanId(), startInstantId, endInstantId, label, visible: opts.visible ?? false, endIsNow: false }
    set(s => ({ spans: [...s.spans, rec] }))
    return rec.id
  },

  /** Ensures the instant has a span to Now (a favorite's); returns its id. */
  upsertNowSpan(startInstantId: string, visible: boolean): string {
    const found = get().spans.find(sp => sp.startInstantId === startInstantId && sp.endIsNow)
    if (found) {
      patchSpan(found.id, { visible, label: '' })
      return found.id
    }
    const rec: SpanRecord = { id: newSpanId(), startInstantId, endInstantId: NOW_SENTINEL, label: '', visible, endIsNow: true }
    set(s => ({ spans: [...s.spans, rec] }))
    return rec.id
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
  setSpanLabel: (id: string, label: string) => patchSpan(id, { label }),
  setSpanVisible: (id: string, visible: boolean) => patchSpan(id, { visible }),

}
