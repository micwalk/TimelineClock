// What an instant gets by itself (#10, domain/displayGroups): its reach, the widest zoom (time on
// screen) at which it keeps its Label; a Mark out to MARK_FACTOR times that (at least 10 years); Hidden beyond. Used
// for instants with no visibility of their own and no group. Pure. The reach is the largest of:
//   - how far ahead you made it: 4x that, at least 3 days (tomorrow 4 days, in 3 days 12 days);
//     an unnamed one (a capture) at least a day instead (the unnamedReachHours tunable);
//   - a countdown (a favorite, or an alarm still to ring): 8x its distance from Now, so Christmas stays in view while it comes;
//   - its spans: 8x the longest span it starts or ends (a lifetime span keeps its ends in view for decades).
import type { InstantRecord } from './entities.ts'
import type { Visibility } from './displayGroups.ts'
import { recurringGroupOf } from './displayGroups.ts'
import { DAY } from './time.ts'

/** A Mark out to this many times the reach, and at least MIN_MARK_MS. */
export const MARK_FACTOR = 8
/** Every instant stays a Mark out to at least this much on screen. */
export const MIN_MARK_MS = 10 * 365 * DAY
/** The least reach (a capture you just made). */
export const MIN_REACH_MS = 3 * DAY
/** Reach per ms ahead of Now it was made. */
export const LEAD_FACTOR = 4
/** Reach per ms of distance from Now, for a countdown. */
export const COUNTDOWN_FACTOR = 8
/** Reach per ms of the longest span it ends. */
export const SPAN_FACTOR = 8

/** The least reach of an unnamed instant (a capture), unless the caller passes the tunable's. */
export const UNNAMED_REACH_MS = DAY

/** `countdown`: a favorite or an alarm still to ring; `unnamedReachMs`: an unnamed instant's least reach. */
export interface ReachOptions { now: number; countdown: boolean; longestSpanMs: number; unnamedReachMs?: number }

/** An instant's reach (ms of time on screen), from the rules above. */
export function autoReach(i: Pick<InstantRecord, 'tsEpochMs' | 'createdAt' | 'label'>, o: ReachOptions): number {
  let reach = i.label.trim() ? MIN_REACH_MS : (o.unnamedReachMs ?? UNNAMED_REACH_MS)
  if (i.createdAt !== undefined) reach = Math.max(reach, LEAD_FACTOR * Math.abs(i.tsEpochMs - i.createdAt))
  if (o.countdown) reach = Math.max(reach, COUNTDOWN_FACTOR * Math.abs(i.tsEpochMs - o.now))
  if (o.longestSpanMs > 0) reach = Math.max(reach, SPAN_FACTOR * o.longestSpanMs)
  return reach
}

/** The visibility a reach gives: a Label out to it, a Mark out to MARK_FACTOR times it (at least 10 years). */
export const reachVisibility = (reach: number): Visibility => ({ label: reach, mark: Math.max(MIN_MARK_MS, reach * MARK_FACTOR) })

/** The longest span each instant starts or ends (spans to Now don't count: they are countdowns). */
export function longestSpans(spans: readonly { startInstantId: string; endInstantId: string; endIsNow?: boolean }[], tsOf: (id: string) => number | undefined): Map<string, number> {
  const out = new Map<string, number>()
  for (const sp of spans) {
    if (sp.endIsNow) continue
    const a = tsOf(sp.startInstantId)
    const b = tsOf(sp.endInstantId)
    if (a === undefined || b === undefined) continue
    const len = Math.abs(b - a)
    for (const id of [sp.startInstantId, sp.endInstantId]) if ((out.get(id) ?? 0) < len) out.set(id, len)
  }
  return out
}

/**
 * How an instant shows by zoom: its own visibility, else its group's, else its reach's.
 * `group`: its display group and that group's visibility, if it has one.
 */
export function instantVisibility(i: InstantRecord, o: ReachOptions & { group: Visibility | null }): Visibility {
  // A recurring thing (a series, the sun) is always its group's: an occurrence has no visibility of its own.
  if (o.group && recurringGroupOf(i)) return o.group
  return i.visibility ?? o.group ?? reachVisibility(autoReach(i, o))
}
