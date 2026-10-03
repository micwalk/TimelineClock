import { describe, expect, it } from 'vitest'
import type { InstantRecord, SpanRecord } from './entities.ts'
import { NOW_SENTINEL } from './entities.ts'
import { BACKUP_FORMAT, backupFileName, cleanData, combineData, describeBackup, importedData, parseBackup } from './backup.ts'

const inst = (id: string, ts = 1000, label = ''): InstantRecord => ({ id, tsEpochMs: ts, label })
const span = (id: string, a: string, b: string, label = ''): SpanRecord => ({ id, startInstantId: a, endInstantId: b, label })
const nowSpan = (id: string, a: string): SpanRecord => ({ id, startInstantId: a, endInstantId: NOW_SENTINEL, label: '', endIsNow: true, visible: true })

describe('parseBackup', () => {
  it('rejects non-JSON, foreign JSON, newer versions and empty backups', () => {
    expect(parseBackup('{oops')).toEqual({ ok: false, error: 'Not a JSON file.' })
    expect(parseBackup('[1,2]').ok).toBe(false)
    expect(parseBackup(JSON.stringify({ format: 'other', version: 1 })).ok).toBe(false)
    expect(parseBackup(JSON.stringify({ format: BACKUP_FORMAT, version: 99, data: { instants: [], spans: [] } })).ok).toBe(false)
    expect(parseBackup(JSON.stringify({ format: BACKUP_FORMAT, version: 1 })).ok).toBe(false)
  })

  it('reads settings-only and data-only files', () => {
    const s = parseBackup(JSON.stringify({ format: BACKUP_FORMAT, version: 1, settings: { preferences: { glow: 2 } } }))
    expect(s.ok && s.backup.settings).toEqual({ preferences: { glow: 2 }, alarms: {}, view: {} })
    expect(s.ok && s.backup.data).toBeUndefined()
    const d = parseBackup(JSON.stringify({ format: BACKUP_FORMAT, version: 1, data: { instants: [inst('a')], spans: [] } }))
    expect(d.ok && d.backup.settings).toBeUndefined()
    expect(d.ok && d.backup.data).toEqual({ instants: [inst('a')], spans: [] })
  })

  it('drops malformed records and spans whose instants are missing', () => {
    const r = parseBackup(JSON.stringify({
      format: BACKUP_FORMAT,
      version: 1,
      data: {
        instants: [inst('a'), { id: 'b' }, null, { id: 'c', tsEpochMs: 5 }],
        spans: [span('s1', 'a', 'c'), span('s2', 'a', 'zzz'), nowSpan('s3', 'a'), { id: 's4' }],
      },
    }))
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.backup.data!.instants.map(i => i.id)).toEqual(['a', 'c'])
    expect(r.backup.data!.instants[1].label).toBe('')
    expect(r.backup.data!.spans.map(s => s.id)).toEqual(['s1', 's3'])
  })
})

describe('combining and replacing data', () => {
  const current = { instants: [inst('a', 1, 'old'), inst('b', 2)], spans: [span('s1', 'a', 'b'), nowSpan('n1', 'a')] }
  const incoming = { instants: [inst('a', 1, 'new'), inst('c', 3)], spans: [span('s2', 'b', 'c'), nowSpan('n2', 'a')] }

  it('combine keeps both sides, takes matching ids from the import, and keeps one span to Now per instant', () => {
    const out = combineData(current, incoming)
    expect(out.instants).toEqual([inst('a', 1, 'new'), inst('b', 2), inst('c', 3)])
    expect(out.spans.map(s => s.id)).toEqual(['s1', 's2', 'n2'])
  })

  it('combining a backup into the data it came from changes nothing', () => {
    expect(combineData(current, current)).toEqual(current)
  })

  it('replace takes only the import', () => {
    expect(importedData(current, incoming, 'replace')).toEqual({ instants: incoming.instants, spans: [nowSpan('n2', 'a')] })
  })

  it('cleanData keeps the last of duplicate spans to Now', () => {
    const out = cleanData({ instants: [inst('a')], spans: [nowSpan('n1', 'a'), nowSpan('n2', 'a')] })
    expect(out.spans.map(s => s.id)).toEqual(['n2'])
  })
})

describe('helpers', () => {
  it('names files by local date', () => {
    expect(backupFileName(new Date(2026, 0, 5, 23, 59))).toBe('timeline-clock-2026-01-05.json')
  })

  it('describes contents', () => {
    expect(describeBackup({ format: BACKUP_FORMAT, version: 1, exportedAt: '', settings: { preferences: {}, alarms: {}, view: {} }, data: { instants: [inst('a')], spans: [] } }))
      .toBe('settings + 1 instant, 0 spans')
  })
})
