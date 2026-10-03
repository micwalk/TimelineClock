// Backup files: one JSON blob holding the settings and/or the saved instants and spans.
// Parsing never trusts the file; merging keeps the "one span to Now per instant" rule.
import type { InstantRecord, SpanRecord } from './entities.ts'
import { NOW_SENTINEL, sanitizeInstants, sanitizeSpans } from './entities.ts'

export const BACKUP_FORMAT = 'timeline-clock-backup'
export const BACKUP_VERSION = 1

export interface BackupData {
  instants: InstantRecord[]
  spans: SpanRecord[]
}

/** Settings sections, kept as raw records here; the stores sanitize them on import. */
export interface BackupSettings {
  /** The settings store (glow, tunables, orientation, ...). */
  preferences: Record<string, unknown>
  /** Alarm preferences (ring duration, unattended behavior). */
  alarms: Record<string, unknown>
  /** Persisted view preferences (implied lanes, step size). */
  view: Record<string, unknown>
}

export interface Backup {
  format: typeof BACKUP_FORMAT
  version: number
  exportedAt: string
  settings?: BackupSettings
  data?: BackupData
}

export type ImportMode = 'replace' | 'combine'

export type ParseResult = { ok: true; backup: Backup } | { ok: false; error: string }

const asRecord = (x: unknown): Record<string, unknown> =>
  x && typeof x === 'object' && !Array.isArray(x) ? (x as Record<string, unknown>) : {}

/** Drops duplicate ids (last wins) and spans whose instants are missing. */
export function cleanData(data: BackupData): BackupData {
  const instants = [...new Map(data.instants.map(i => [i.id, i])).values()]
  const ids = new Set(instants.map(i => i.id))
  const spans = [...new Map(data.spans.map(s => [s.id, s])).values()].filter(s =>
    ids.has(s.startInstantId) && (s.endIsNow ? s.endInstantId === NOW_SENTINEL : ids.has(s.endInstantId)),
  )
  // At most one span to Now per instant (the last one).
  const nowSpanByStart = new Map<string, string>()
  for (const s of spans) if (s.endIsNow) nowSpanByStart.set(s.startInstantId, s.id)
  return { instants, spans: spans.filter(s => !s.endIsNow || nowSpanByStart.get(s.startInstantId) === s.id) }
}

/** Reads a backup file's text. Accepts files with settings, data or both. */
export function parseBackup(text: string): ParseResult {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    return { ok: false, error: 'Not a JSON file.' }
  }
  const r = asRecord(raw)
  if (r.format !== BACKUP_FORMAT) return { ok: false, error: 'Not a Timeline Clock backup.' }
  if (typeof r.version !== 'number' || r.version > BACKUP_VERSION) {
    return { ok: false, error: 'This backup is from a newer version of the app.' }
  }
  const backup: Backup = {
    format: BACKUP_FORMAT,
    version: r.version,
    exportedAt: typeof r.exportedAt === 'string' ? r.exportedAt : '',
  }
  if (r.settings && typeof r.settings === 'object') {
    const s = asRecord(r.settings)
    backup.settings = { preferences: asRecord(s.preferences), alarms: asRecord(s.alarms), view: asRecord(s.view) }
  }
  if (r.data && typeof r.data === 'object') {
    const d = asRecord(r.data)
    backup.data = cleanData({ instants: sanitizeInstants(d.instants), spans: sanitizeSpans(d.spans) })
  }
  if (!backup.settings && !backup.data) return { ok: false, error: 'The backup has no settings or data.' }
  return { ok: true, backup }
}

/**
 * Combines imported data into the current data. Records with the same id are taken
 * from the import (it is the newer copy); everything else is kept from both. An
 * instant ends up with at most one span to Now, the imported one if both have one.
 */
export function combineData(current: BackupData, incoming: BackupData): BackupData {
  const incomingNowStarts = new Set(incoming.spans.filter(s => s.endIsNow).map(s => s.startInstantId))
  return cleanData({
    instants: [...current.instants, ...incoming.instants],
    spans: [...current.spans.filter(s => !(s.endIsNow && incomingNowStarts.has(s.startInstantId))), ...incoming.spans],
  })
}

/** The data after an import in the given mode. */
export const importedData = (current: BackupData, incoming: BackupData, mode: ImportMode): BackupData =>
  mode === 'replace' ? cleanData(incoming) : combineData(current, incoming)

/** A file name like "timeline-clock-2026-10-03.json" (local date). */
export function backupFileName(date: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `timeline-clock-${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}.json`
}

/** One-line summary of a backup's contents, for the import dialog. */
export function describeBackup(b: Backup): string {
  const parts: string[] = []
  if (b.settings) parts.push('settings')
  if (b.data) parts.push(`${b.data.instants.length} instant${b.data.instants.length === 1 ? '' : 's'}, ${b.data.spans.length} span${b.data.spans.length === 1 ? '' : 's'}`)
  return parts.join(' + ')
}
