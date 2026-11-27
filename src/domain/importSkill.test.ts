// The import skill (docs/skills/timeline-clock-import.md) tells other agents how to write a file
// this app imports. Every JSON example in it must import exactly as written, using only the
// fields it documents, so the skill can't drift from the importer unnoticed (AGENTS.md: keep it
// current).
import { describe, expect, it } from 'vitest'
import doc from '../../docs/skills/timeline-clock-import.md?raw'
import { TODO_COPY } from '../config/labels.ts'
import { BACKUP_FORMAT, BACKUP_VERSION, parseBackup } from './backup.ts'
import { DEFAULT_COLLECTION } from './collections.ts'
import { NOW_SENTINEL, syncFavorites } from './entities.ts'

/** The fields the skill lets an agent write (instants and spans keep unknown fields, so they are checked by name). */
const INSTANT_KEYS = ['id', 'tsEpochMs', 'label', 'createdAt', 'favorite', 'alarms', 'collectionId', 'visibility', 'todo', 'hidden']
const ALARM_KEYS = ['id', 'offsetMs', 'sound', 'answered']
const SPAN_KEYS = ['id', 'startInstantId', 'endInstantId', 'label', 'visible', 'endIsNow']
const RESERVED = /^(v:|sun:|dst:|season:)/

type Rec = Record<string, unknown>
interface RawData { instants?: Rec[]; spans?: Rec[]; todos?: Rec[]; groups?: Rec[]; collections?: Rec[] }

const blocks = [...doc.matchAll(/```json\r?\n([\s\S]*?)```/g)].map(m => m[1])

/** A block as a whole file: a full one as it is, a fragment ({ instants, spans, … }) wrapped. */
function asFile(block: string): { format: string; version: number; data: RawData } {
  const obj = JSON.parse(block) as Rec
  if ('format' in obj) return obj as unknown as { format: string; version: number; data: RawData }
  return { format: BACKUP_FORMAT, version: BACKUP_VERSION, data: { instants: [], spans: [], ...(obj as RawData) } }
}

describe('the import skill', () => {
  it('has its examples, one of them a complete file', () => {
    expect(blocks.length).toBeGreaterThanOrEqual(6)
    expect(blocks.filter(b => 'format' in (JSON.parse(b) as Rec))).toHaveLength(1)
  })

  describe.each(blocks.map((b, k) => [k + 1, b] as const))('example %i', (_, block) => {
    const file = asFile(block)
    const raw = file.data
    const parsed = parseBackup(JSON.stringify(file))

    it('imports exactly as written', () => {
      expect(parsed.ok).toBe(true)
      if (!parsed.ok) return
      const data = parsed.backup.data!
      expect(data.instants).toEqual(raw.instants ?? [])
      expect(data.spans).toEqual(raw.spans ?? [])
      expect(data.todos ?? []).toEqual(raw.todos ?? [])
      expect(data.groups ?? []).toEqual(raw.groups ?? [])
      expect((data.collections ?? []).filter(c => c.id !== DEFAULT_COLLECTION)).toEqual(raw.collections ?? [])
      // It already keeps the favorite rule: the repair on import changes nothing.
      const synced = syncFavorites(data.instants, data.spans)
      expect(synced.instants).toEqual(data.instants)
      expect(synced.spans).toEqual(data.spans)
    })

    it('uses only the fields the skill documents, and ids it allows', () => {
      for (const i of raw.instants ?? []) {
        expect(Object.keys(i).filter(k => !INSTANT_KEYS.includes(k))).toEqual([])
        for (const a of (i.alarms as Rec[] | undefined) ?? []) expect(Object.keys(a).filter(k => !ALARM_KEYS.includes(k))).toEqual([])
      }
      for (const s of raw.spans ?? []) expect(Object.keys(s).filter(k => !SPAN_KEYS.includes(k))).toEqual([])
      for (const list of [raw.instants, raw.spans, raw.todos, raw.groups, raw.collections]) {
        for (const r of list ?? []) expect(String(r.id)).not.toMatch(RESERVED)
      }
    })

    it('refers only to records in the same file, as the skill says', () => {
      const instants = new Map((raw.instants ?? []).map(i => [i.id as string, i]))
      const todos = new Map((raw.todos ?? []).map(t => [t.id as string, t]))
      const groups = new Set((raw.collections ?? []).map(c => c.id as string))
      for (const s of raw.spans ?? []) {
        const a = instants.get(s.startInstantId as string)
        if (s.endIsNow) {
          // A favorite's span to Now, as the skill writes it.
          expect(s).toEqual({ id: s.id, startInstantId: a?.id, endInstantId: NOW_SENTINEL, label: '', visible: true, endIsNow: true })
          expect(a?.favorite).toBe(true)
          continue
        }
        const b = instants.get(s.endInstantId as string)
        expect(a && b && (a.tsEpochMs as number) < (b.tsEpochMs as number)).toBe(true)
      }
      for (const r of [...(raw.instants ?? []), ...(raw.todos ?? []), ...(raw.groups ?? [])]) {
        if (r.collectionId !== undefined) expect(groups.has(r.collectionId as string)).toBe(true)
      }
      // A todo's instants: its todo is in the file, at most one `at`, and the ▶ ⏸ ✓ names.
      const names: Record<string, (label: string) => string> = { at: l => l, start: TODO_COPY.startName, pause: TODO_COPY.pauseName, done: TODO_COPY.doneName }
      const ats = new Map<string, number>()
      for (const i of raw.instants ?? []) {
        const link = i.todo as { id: string; role: string } | undefined
        if (!link) continue
        const todo = todos.get(link.id)
        expect(todo).toBeDefined()
        expect(Object.keys(names)).toContain(link.role)
        expect(i.label).toBe(names[link.role](todo!.label as string))
        if (link.role === 'at') ats.set(link.id, (ats.get(link.id) ?? 0) + 1)
      }
      for (const n of ats.values()) expect(n).toBe(1)
    })
  })
})
