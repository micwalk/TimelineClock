// Saved instants and spans. Persisted to the same localStorage keys and record
// shapes the original app used, so existing data loads unchanged.
import { create } from 'zustand'
import type { AlarmRecord, InstantRecord, SpanRecord } from '../domain/entities.ts'
import { NOW_SENTINEL, newAlarmId, newInstantId, newSpanId, sanitizeInstants, sanitizeSpans, syncFavorites } from '../domain/entities.ts'
import { syncAlarmVisibility } from '../domain/alarms.ts'
import { loadJson, saveJson } from './storage.ts'

const INSTANTS_KEY = 'timeline.saved.v1'
const SPANS_KEY = 'timeline.spans.v1'

export interface EntitiesState {
  instants: InstantRecord[]
  spans: SpanRecord[]
}

const loadInstants = () => sanitizeInstants(loadJson<unknown>(INSTANTS_KEY, []))
const loadSpans = () => sanitizeSpans(loadJson<unknown>(SPANS_KEY, []))

export const useEntities = create<EntitiesState>(() => {
  const { instants, spans } = syncFavorites(loadInstants(), loadSpans())
  return { instants: syncAlarmVisibility(instants, Date.now()), spans }
})

useEntities.subscribe((s, prev) => {
  if (s.instants !== prev.instants) saveJson(INSTANTS_KEY, s.instants)
  if (s.spans !== prev.spans) saveJson(SPANS_KEY, s.spans)
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
  createInstant(tsEpochMs: number, label = '', opts: { alarm?: boolean; snoozeOriginalId?: string } = {}): string {
    const rec: InstantRecord = {
      id: newInstantId(),
      tsEpochMs,
      label,
      favorite: false,
      ...(opts.alarm ? { alarms: [{ id: newAlarmId(), offsetMs: 0 }] } : {}),
      ...(opts.snoozeOriginalId ? { snoozeOriginalId: opts.snoozeOriginalId } : {}),
    }
    set(s => ({ instants: [...s.instants, rec] }))
    return rec.id
  },

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

  /** Adds an alarm at the instant (offset 0); returns its id. An alarm still to ring is never hidden, so this shows the instant. */
  addAlarm(id: string): string {
    const alarm: AlarmRecord = { id: newAlarmId(), offsetMs: 0 }
    patchInstant(id, i => ({ alarms: [...(i.alarms ?? []), alarm], ...(i.hidden ? { hidden: false } : {}) }))
    return alarm.id
  },
  removeAlarm: (id: string, alarmId: string) => patchAlarms(id, list => list.filter(a => a.id !== alarmId)),
  setAlarmOffset: (id: string, alarmId: string, offsetMs: number) =>
    patchAlarms(id, list => list.map(a => (a.id === alarmId ? { ...a, offsetMs: Math.max(0, Math.round(offsetMs)) } : a))),
  /** Answered (dismissed or snoozed): it stays as history and never rings again. */
  markAlarmDone: (id: string, alarmId: string) => patchAlarms(id, list => list.map(a => (a.id === alarmId ? { ...a, done: true } : a))),

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

  snoozeCount: (originalId: string) => get().instants.filter(i => i.snoozeOriginalId === originalId).length,
}
