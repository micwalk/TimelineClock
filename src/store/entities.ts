// Saved instants and spans. Persisted to the same localStorage keys and record
// shapes the original app used, so existing data loads unchanged.
import { create } from 'zustand'
import type { InstantRecord, SpanRecord } from '../domain/entities.ts'
import { NOW_SENTINEL, newInstantId, newSpanId, sanitizeInstants, sanitizeSpans } from '../domain/entities.ts'
import { loadJson, saveJson } from './storage.ts'

const INSTANTS_KEY = 'timeline.saved.v1'
const SPANS_KEY = 'timeline.spans.v1'

export interface EntitiesState {
  instants: InstantRecord[]
  spans: SpanRecord[]
}

const loadInstants = () => sanitizeInstants(loadJson<unknown>(INSTANTS_KEY, []))
const loadSpans = () => sanitizeSpans(loadJson<unknown>(SPANS_KEY, []))

export const useEntities = create<EntitiesState>(() => ({
  instants: loadInstants(),
  spans: loadSpans(),
}))

useEntities.subscribe((s, prev) => {
  if (s.instants !== prev.instants) saveJson(INSTANTS_KEY, s.instants)
  if (s.spans !== prev.spans) saveJson(SPANS_KEY, s.spans)
})

const set = useEntities.setState
const get = useEntities.getState

const patchInstant = (id: string, patch: (i: InstantRecord) => Partial<InstantRecord>) =>
  set(s => ({ instants: s.instants.map(i => (i.id === id ? { ...i, ...patch(i) } : i)) }))

const patchSpan = (id: string, patch: Partial<SpanRecord>) =>
  set(s => ({ spans: s.spans.map(sp => (sp.id === id ? { ...sp, ...patch } : sp)) }))

/** Low-level entity mutations. Cross-cutting behavior (focus, selection) lives in store/actions. */
export const entities = {
  getInstant: (id: string | null | undefined) => (id ? get().instants.find(i => i.id === id) : undefined),
  getSpan: (id: string | null | undefined) => (id ? get().spans.find(s => s.id === id) : undefined),

  createInstant(tsEpochMs: number, label = '', opts: { alarm?: boolean; favorite?: boolean; snoozeOriginalId?: string } = {}): string {
    const alarm = !!opts.alarm
    const rec: InstantRecord = {
      id: newInstantId(),
      tsEpochMs,
      label,
      favorite: alarm || !!opts.favorite, // alarmed instants are always favorites (PRD)
      alarm,
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
  setAlarmFlag: (id: string, alarm: boolean) => patchInstant(id, i => ({ alarm, favorite: alarm ? true : i.favorite })),

  createSpan(startInstantId: string, endInstantId: string, label = '', opts: { visible?: boolean } = {}): string {
    const rec: SpanRecord = { id: newSpanId(), startInstantId, endInstantId, label, visible: opts.visible ?? false, endIsNow: false }
    set(s => ({ spans: [...s.spans, rec] }))
    return rec.id
  },

  /** Ensures the instant has a span to Now (used for favorites); returns its id. */
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

  deleteSpan: (id: string) => set(s => ({ spans: s.spans.filter(sp => sp.id !== id) })),
  setSpanLabel: (id: string, label: string) => patchSpan(id, { label }),
  setSpanVisible: (id: string, visible: boolean) => patchSpan(id, { visible }),

  snoozeCount: (originalId: string) => get().instants.filter(i => i.snoozeOriginalId === originalId).length,
}
