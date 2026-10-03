// View state: focus, selection, zoom, and interaction modes. Persisted fields use the
// same names as the original 'timeline.state' snapshot so it migrates for free.
import { create } from 'zustand'
import type { FocusMode, TargetInputs } from '../domain/viewport.ts'
import type { FocusHistory } from '../domain/navigation.ts'
import { pushFocusHistory } from '../domain/navigation.ts'
import type { TimeIncrement } from '../domain/time.ts'
import { DEFAULT_TIME_WIDTH_MS, TIME_INCREMENT_OPTIONS, clampTimeWidth } from '../domain/time.ts'
import { debouncedSaver, loadJson } from './storage.ts'

const VIEW_KEY = 'timeline.state'

export interface MoveMode {
  instantId: string
  /** View center before the move started; restored on cancel. */
  originalCenter: number
}

export interface ViewState extends TargetInputs, FocusHistory {
  currentSelectedInstantId: string | null
  secondarySelectedInstantId: string | null
  selectedSpanId: string | null
  showImpliedSelectedNow: boolean
  showImpliedSelectedPrev: boolean
  timeIncrement: TimeIncrement
  // Transient (not persisted)
  moveMode: MoveMode | null
  editingInstantId: string | null
  editingSpanId: string | null
}

const PERSISTED_KEYS = [
  'timeWidth', 'timeCenter', 'viewFocusMode', 'focusedInstantId', 'focusedSpanId',
  'currentSelectedInstantId', 'secondarySelectedInstantId', 'focusHistory', 'focusHistoryIndex',
  'selectedSpanId', 'showImpliedSelectedNow', 'showImpliedSelectedPrev', 'timeIncrement',
  'cursorLocked', 'cursorLockOffsetMs',
] as const satisfies readonly (keyof ViewState)[]

const defaults: ViewState = {
  timeWidth: DEFAULT_TIME_WIDTH_MS,
  timeCenter: Date.now(),
  viewFocusMode: 'now',
  focusedInstantId: null,
  focusedSpanId: null,
  cursorLocked: false,
  cursorLockOffsetMs: 0,
  currentSelectedInstantId: null,
  secondarySelectedInstantId: null,
  selectedSpanId: null,
  focusHistory: [],
  focusHistoryIndex: -1,
  showImpliedSelectedNow: true,
  showImpliedSelectedPrev: true,
  timeIncrement: '30m',
  moveMode: null,
  editingInstantId: null,
  editingSpanId: null,
}

function loadView(): ViewState {
  const saved = loadJson<Partial<ViewState> & Record<string, unknown>>(VIEW_KEY, {})
  const out: ViewState = { ...defaults }
  for (const k of PERSISTED_KEYS) {
    if (saved[k] !== undefined && saved[k] !== null) (out as unknown as Record<string, unknown>)[k] = saved[k]
    else if (saved[k] === null) (out as unknown as Record<string, unknown>)[k] = null
  }
  out.timeWidth = clampTimeWidth(Number(out.timeWidth) || DEFAULT_TIME_WIDTH_MS)
  if (!['now', 'cursor', 'instant', 'span'].includes(out.viewFocusMode)) out.viewFocusMode = 'now'
  if (!TIME_INCREMENT_OPTIONS.some(o => o.value === out.timeIncrement)) out.timeIncrement = '30m'
  if (!Array.isArray(out.focusHistory)) { out.focusHistory = []; out.focusHistoryIndex = -1 }
  return out
}

export const useView = create<ViewState>(() => loadView())

const saver = debouncedSaver(VIEW_KEY, 300)
useView.subscribe((s, prev) => {
  if (PERSISTED_KEYS.some(k => s[k] !== prev[k])) {
    saver.save(Object.fromEntries(PERSISTED_KEYS.map(k => [k, s[k]])))
  }
})

const set = useView.setState
const get = useView.getState

/** Low-level view mutations with the original TimelineState semantics. */
export const view = {
  /**
   * Changes what the view follows. Focusing an instant also selects it (shifting the
   * previous selection to secondary) and records it in focus history; focusing a span
   * clears instant selection.
   */
  setFocus(mode: FocusMode, opts: { instantId?: string | null; spanId?: string | null; skipHistory?: boolean } = {}) {
    const s = get()
    const instantId = opts.instantId ?? null
    const patch: Partial<ViewState> = {
      viewFocusMode: mode,
      focusedInstantId: instantId,
      focusedSpanId: opts.spanId ?? null,
    }
    if (mode === 'instant' && instantId) {
      if (s.currentSelectedInstantId && s.currentSelectedInstantId !== instantId) {
        patch.secondarySelectedInstantId = s.currentSelectedInstantId
      }
      patch.currentSelectedInstantId = instantId
      if (!opts.skipHistory) Object.assign(patch, pushFocusHistory(s, instantId))
    } else if (!opts.skipHistory) {
      // Leaving instant focus: park the index past the end so "back" returns to the last instant.
      patch.focusHistoryIndex = s.focusHistory.length
    }
    if (mode === 'span') {
      patch.currentSelectedInstantId = null
      patch.secondarySelectedInstantId = null
    }
    set(patch)
  },

  setTimeCenter: (timeCenter: number) => set({ timeCenter }),
  setTimeWidth: (w: number) => set({ timeWidth: clampTimeWidth(w) }),

  /** Selecting a different instant pushes the old selection to secondary. */
  selectInstant(id: string | null) {
    const s = get()
    if (s.currentSelectedInstantId === id) return
    set({ secondarySelectedInstantId: s.currentSelectedInstantId, currentSelectedInstantId: id })
  },

  selectSpan: (id: string | null) => set({ selectedSpanId: id }),

  /** Esc: clears the secondary selection first, then the primary. */
  deselect() {
    const s = get()
    if (s.secondarySelectedInstantId) set({ secondarySelectedInstantId: null })
    else if (s.currentSelectedInstantId) set({ currentSelectedInstantId: null })
    else if (s.selectedSpanId) set({ selectedSpanId: null })
  },

  setCursorLock(locked: boolean, center: number, now: number) {
    set(locked ? { cursorLocked: true, cursorLockOffsetMs: center - now } : { cursorLocked: false })
  },

  setTimeIncrement: (timeIncrement: TimeIncrement) => set({ timeIncrement }),
  setImpliedVisible(which: 'selected-now' | 'selected-prev', value: boolean) {
    set(which === 'selected-now' ? { showImpliedSelectedNow: value } : { showImpliedSelectedPrev: value })
  },

  editInstant: (id: string | null) => set({ editingInstantId: id }),
  editSpan: (id: string | null) => set({ editingSpanId: id }),

  setMoveMode: (moveMode: MoveMode | null) => set({ moveMode }),

  /** Clears references to a deleted instant. */
  forgetInstant(id: string) {
    const s = get()
    const patch: Partial<ViewState> = {}
    if (s.currentSelectedInstantId === id) patch.currentSelectedInstantId = null
    if (s.secondarySelectedInstantId === id) patch.secondarySelectedInstantId = null
    if (s.focusedInstantId === id) patch.focusedInstantId = null
    if (s.editingInstantId === id) patch.editingInstantId = null
    if (s.moveMode?.instantId === id) patch.moveMode = null
    if (s.focusHistory.includes(id)) {
      const focusHistory = s.focusHistory.filter(x => x !== id)
      patch.focusHistory = focusHistory
      patch.focusHistoryIndex = Math.min(s.focusHistoryIndex, focusHistory.length)
    }
    if (Object.keys(patch).length) set(patch)
  },

  forgetSpan(id: string) {
    const s = get()
    const patch: Partial<ViewState> = {}
    if (s.selectedSpanId === id) patch.selectedSpanId = null
    if (s.focusedSpanId === id) patch.focusedSpanId = null
    if (s.editingSpanId === id) patch.editingSpanId = null
    if (Object.keys(patch).length) set(patch)
  },
}
