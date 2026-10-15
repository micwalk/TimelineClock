// The instants the timeline draws: the stored ones, plus repeating series' occurrences past the
// horizon, computed for the days on screen (domain/series virtualOccurrences; shown only, never
// stored unless tapped). The chips' layout and the chips themselves read the same list. It
// changes only when the stored data does or the view moves onto other days, not every frame.
import { useMemo } from 'react'
import { useFrameValue } from '../../engine/hooks.ts'
import { engine } from '../../engine/viewportEngine.ts'
import type { InstantRecord } from '../../domain/entities.ts'
import { virtualOccurrences } from '../../domain/series.ts'
import { DAY } from '../../domain/time.ts'
import { useEntities } from '../../store/entities.ts'

/** The days on screen, a day either side ("first:last", in whole days since the epoch). */
const dayRange = (f: { start: number; end: number }) => `${Math.floor(f.start / DAY) - 1}:${Math.ceil(f.end / DAY) + 1}`

export function useTimelineInstants(): InstantRecord[] {
  const instants = useEntities(s => s.instants)
  const groups = useEntities(s => s.groups)
  const range = useFrameValue(dayRange)
  return useMemo(() => {
    if (!groups || groups.length === 0) return instants
    const [first, last] = range.split(':').map(Number)
    const computed = virtualOccurrences(groups, instants, engine.sample().now, first * DAY, last * DAY)
    return computed.length > 0 ? [...instants, ...computed] : instants
  }, [instants, groups, range])
}
