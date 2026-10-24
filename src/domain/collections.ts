// Groups you make (TLC-9; "collections" in code, since `groups` are repeating series): each
// instant is in exactly one, Default when it names none. A group is shown or hidden as a whole,
// like a calendar you switch off; hidden, its instants leave the timeline, the lanes, Previous/Next
// and the Agenda's lists, except one with an alarm still to ring (it rings and shows anyway). A
// repeat's occurrences are in their series' group. Computed instants (sunrises and sunsets, clock
// changes) are in none. Export picks groups; import maps each group in the file to a new group,
// one of yours, or nothing. Pure.
import type { InstantRecord, SpanRecord } from './entities.ts'
import type { GroupRecord } from './series.ts'
import { hasArmedAlarm } from './alarms.ts'
import { LABELS } from '../config/labels.ts'

export interface CollectionRecord {
  id: string
  label: string
  /** Switched off: its instants are hidden (see above). */
  hidden?: boolean
}

/** The group an instant is in when it names none. It always exists and can't be deleted. */
export const DEFAULT_COLLECTION = 'default'

const randomId = () => Math.random().toString(36).slice(2, 11)
export const newCollectionId = () => `c_${randomId()}`

export const defaultCollection = (): CollectionRecord => ({ id: DEFAULT_COLLECTION, label: LABELS.defaultGroup })

/** The well-formed groups in untrusted JSON (storage or a file), Default first and always there. */
export function sanitizeCollections(data: unknown): CollectionRecord[] {
  const out: CollectionRecord[] = []
  const seen = new Set<string>()
  for (const x of Array.isArray(data) ? data : []) {
    if (!x || typeof x !== 'object') continue
    const r = x as Record<string, unknown>
    if (typeof r.id !== 'string' || !r.id || seen.has(r.id)) continue
    seen.add(r.id)
    out.push({ id: r.id, label: typeof r.label === 'string' ? r.label : '', ...(r.hidden === true ? { hidden: true } : {}) })
  }
  const def = out.findIndex(c => c.id === DEFAULT_COLLECTION)
  if (def < 0) return [defaultCollection(), ...out]
  return def === 0 ? out : [out[def], ...out.filter((_, k) => k !== def)]
}

/** The series a repeat's occurrence follows, by id: only its group matters here. */
export type SeriesGroupOf = (seriesId: string) => string | undefined

/** A series' group, by series id. */
export const seriesGroupLookup = (series: readonly GroupRecord[]): SeriesGroupOf => {
  const m = new Map(series.map(s => [s.id, s.collectionId]))
  return id => m.get(id)
}

/** The group an instant is in: its series' for an occurrence, else its own, else Default; null for a computed one (the sun, a clock change). */
export function collectionOf(i: Pick<InstantRecord, 'collectionId' | 'seriesId' | 'virtual'>, seriesGroup: SeriesGroupOf): string | null {
  if (i.seriesId) return seriesGroup(i.seriesId) ?? DEFAULT_COLLECTION
  if (i.virtual) return null
  return i.collectionId ?? DEFAULT_COLLECTION
}

/**
 * Whether an instant is hidden by its group being switched off. An alarm still to ring is never
 * hidden. Returns a constant false when no group is off, so callers can skip filtering.
 */
export function groupHiddenTest(collections: readonly CollectionRecord[], series: readonly GroupRecord[], now: number): ((i: InstantRecord) => boolean) | null {
  const off = new Set(collections.filter(c => c.hidden).map(c => c.id))
  if (off.size === 0) return null
  const seriesGroup = seriesGroupLookup(series)
  return i => {
    const c = collectionOf(i, seriesGroup)
    return c !== null && off.has(c) && !hasArmedAlarm(i, now)
  }
}

/** How many instants each group holds (stored ones). */
export function collectionCounts(instants: readonly InstantRecord[], series: readonly GroupRecord[]): Map<string, number> {
  const seriesGroup = seriesGroupLookup(series)
  const out = new Map<string, number>()
  for (const i of instants) {
    const c = collectionOf(i, seriesGroup)
    if (c !== null) out.set(c, (out.get(c) ?? 0) + 1)
  }
  return out
}

// ---------------------------------------------------------------------------
// Export and import

export interface CollectionData {
  instants: InstantRecord[]
  spans: SpanRecord[]
  groups?: GroupRecord[]
  collections?: CollectionRecord[]
}

/** Just the chosen groups: their instants and series, and spans with both ends kept (a span to Now with its instant). */
export function dataForCollections<D extends CollectionData>(data: D, chosen: ReadonlySet<string>): D {
  const series = data.groups ?? []
  const seriesGroup = seriesGroupLookup(series)
  const instants = data.instants.filter(i => chosen.has(collectionOf(i, seriesGroup) ?? DEFAULT_COLLECTION))
  const ids = new Set(instants.map(i => i.id))
  return {
    ...data,
    instants,
    spans: data.spans.filter(sp => ids.has(sp.startInstantId) && (sp.endIsNow || ids.has(sp.endInstantId))),
    groups: series.filter(s => chosen.has(s.collectionId ?? DEFAULT_COLLECTION)),
    collections: (data.collections ?? [defaultCollection()]).filter(c => chosen.has(c.id)),
  }
}

/** What happens to one of the file's groups: a new group of yours, into one you have, or left out. */
export type ImportTarget = { kind: 'new'; label: string } | { kind: 'into'; id: string } | { kind: 'skip' }

export interface ImportGroupRow {
  /** The group's id in the file. */
  id: string
  label: string
  count: number
  target: ImportTarget
}

/** A file's groups (a file from before groups is one, "Imported"), each with its count. */
export function fileCollections(data: CollectionData): { id: string; label: string; count: number }[] {
  const counts = collectionCounts(data.instants, data.groups ?? [])
  const list = data.collections ?? [{ id: DEFAULT_COLLECTION, label: LABELS.importedGroup }]
  return list.map(c => ({ id: c.id, label: c.label, count: counts.get(c.id) ?? 0 })).filter(c => c.count > 0 || (data.groups ?? []).some(s => (s.collectionId ?? DEFAULT_COLLECTION) === c.id))
}

const sameName = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase()

/**
 * Where each of the file's groups goes by default: into your group of the same name, else a new
 * one. The file's Default is someone else's everything, so it becomes a new group ("Imported"),
 * unless you've imported it before under that name.
 */
export function defaultImportRows(data: CollectionData, mine: readonly CollectionRecord[]): ImportGroupRow[] {
  return fileCollections(data).map(c => {
    const label = c.id === DEFAULT_COLLECTION && c.label === LABELS.defaultGroup ? LABELS.importedGroup : c.label
    const same = mine.find(m => sameName(m.label, label))
    return { ...c, label, target: same ? { kind: 'into', id: same.id } : { kind: 'new', label } }
  })
}

/**
 * The file's data with each group mapped as chosen: instants and series moved into their target
 * group (left out with a skipped one, and spans that lose an end), and the new groups to add.
 */
export function mapImport<D extends CollectionData>(data: D, rows: readonly ImportGroupRow[], newId = newCollectionId): { data: D; added: CollectionRecord[] } {
  const target = new Map<string, string | null>()
  const added: CollectionRecord[] = []
  for (const r of rows) {
    if (r.target.kind === 'skip') target.set(r.id, null)
    else if (r.target.kind === 'into') target.set(r.id, r.target.id)
    else {
      const id = newId()
      added.push({ id, label: r.target.label.trim() || r.label })
      target.set(r.id, id)
    }
  }
  const seriesGroup = seriesGroupLookup(data.groups ?? [])
  const where = (c: string) => (target.has(c) ? target.get(c)! : c)
  const into = <T extends { collectionId?: string }>(rec: T, to: string): T => {
    const { collectionId: _c, ...rest } = rec
    void _c
    return (to === DEFAULT_COLLECTION ? rest : { ...rest, collectionId: to }) as T
  }
  const instants: InstantRecord[] = []
  for (const i of data.instants) {
    const to = where(collectionOf(i, seriesGroup) ?? DEFAULT_COLLECTION)
    if (to === null) continue
    // An occurrence follows its series (moved below); a plain instant carries its group.
    instants.push(i.seriesId ? i : into(i, to))
  }
  const groups = (data.groups ?? []).flatMap(s => {
    const to = where(s.collectionId ?? DEFAULT_COLLECTION)
    return to === null ? [] : [into(s, to)]
  })
  const ids = new Set(instants.map(i => i.id))
  const spans = data.spans.filter(sp => ids.has(sp.startInstantId) && (sp.endIsNow || ids.has(sp.endInstantId)))
  const { collections: _drop, ...rest } = data
  void _drop
  return { data: { ...rest, instants, spans, groups } as D, added }
}
