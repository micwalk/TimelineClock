// Domain types for timeline instants and focus

// Persisted/saved instant record
export interface InstantRecord {
	id: string
	tsEpochMs: number
	label: string
}

// View-only kinds
export type InstantKind = 'saved' | 'cursor' | 'now'

export interface NowInstant {
	kind: 'now'
	tsEpochMs: number // evaluated when read (e.g., Date.now() at call site)
}

export interface CursorInstant {
	kind: 'cursor'
	tsEpochMs: number
	visible: boolean
}

export interface SavedInstantView {
	kind: 'saved'
	id: string
	tsEpochMs: number
	label: string
}

export type InstantView = NowInstant | CursorInstant | SavedInstantView

// View focus (UI/renderer shared)
export type ViewFocus =
	| { mode: 'now' }
	| { mode: 'cursor' }
	| { mode: 'instant'; focusedInstantId: string }

// Type guards and helpers
export function isSavedInstant(i: InstantView): i is SavedInstantView {
	return i.kind === 'saved'
}

export function compareByTsAsc(a: { tsEpochMs: number }, b: { tsEpochMs: number }) {
	return a.tsEpochMs - b.tsEpochMs
}

export function createSavedInstant(tsEpochMs: number, label = ''): InstantRecord {
	return { id: `i_${Math.random().toString(36).slice(2, 9)}`, tsEpochMs, label }
}

export function toViewSaved(r: InstantRecord): SavedInstantView {
	return { kind: 'saved', id: r.id, tsEpochMs: r.tsEpochMs, label: r.label }
}

export function toCursor(tsEpochMs: number, visible: boolean): CursorInstant {
	return { kind: 'cursor', tsEpochMs, visible }
}

export function toNow(nowTs: number): NowInstant {
	return { kind: 'now', tsEpochMs: nowTs }
}

// Temporary compatibility shape used by current renderer/UI before we rename ts→tsEpochMs
export interface SavedInstantCompat {
	id: string
	ts: number
	label: string
}


