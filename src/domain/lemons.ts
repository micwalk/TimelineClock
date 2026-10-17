// The lemon log: after you put words on the timeline (a name, a timer, an alarm), the app asks
// "Are you a sour lemon?" and keeps each answer, so there is a log of your mood. Pure.

/** What you had just written when it asked. */
export type LemonKind = 'name' | 'span' | 'timer' | 'alarm'

export interface LemonEntry {
  id: string
  /** When you answered. */
  ts: number
  /** Yes: a sour lemon. */
  sour: boolean
  /** The words you had just put on the timeline ("Rice", "13m timer"). */
  text: string
  kind: LemonKind
}

/** A question waiting for an answer. */
export interface LemonAsk {
  text: string
  kind: LemonKind
}

const KINDS: readonly string[] = ['name', 'span', 'timer', 'alarm'] satisfies LemonKind[]

export const newLemonId = () => `l_${Math.random().toString(36).slice(2, 11)}`

/** The entries in untrusted JSON (storage, a backup), junk dropped, oldest first. */
export function sanitizeLemons(raw: unknown): LemonEntry[] {
  if (!Array.isArray(raw)) return []
  const out: LemonEntry[] = []
  for (const x of raw) {
    if (!x || typeof x !== 'object') continue
    const r = x as Record<string, unknown>
    if (typeof r.id !== 'string' || typeof r.ts !== 'number' || !Number.isFinite(r.ts) || typeof r.sour !== 'boolean') continue
    out.push({ id: r.id, ts: r.ts, sour: r.sour, text: typeof r.text === 'string' ? r.text.slice(0, 200) : '', kind: KINDS.includes(r.kind as string) ? (r.kind as LemonKind) : 'name' })
  }
  return out.sort((a, b) => a.ts - b.ts)
}

/** Two logs as one (an import combined with what is here): same id once, oldest first. */
export function mergeLemons(a: readonly LemonEntry[], b: readonly LemonEntry[]): LemonEntry[] {
  return [...new Map([...a, ...b].map(e => [e.id, e])).values()].sort((x, y) => x.ts - y.ts)
}

/** Yes and no counts. */
export function lemonTally(log: readonly LemonEntry[]): { sour: number; sweet: number } {
  let sour = 0
  for (const e of log) if (e.sour) sour++
  return { sour, sweet: log.length - sour }
}
