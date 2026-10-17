// The instants the timeline draws: the stored ones, plus repeating series' occurrences past the
// horizon and (once a location is set, until days get narrower than the sunHideDayPx tunable) sunrises and sunsets, computed for the
// days on screen (domain/series virtualOccurrences, domain/sunEvents; shown only, never stored
// unless tapped). The chips' layout and the chips themselves read the same list. It
// changes only when the stored data does or the view moves onto other days, not every frame.
import { useMemo } from 'react'
import { useFrameValue } from '../../engine/hooks.ts'
import { engine } from '../../engine/viewportEngine.ts'
import type { InstantRecord } from '../../domain/entities.ts'
import { virtualOccurrences } from '../../domain/series.ts'
import { virtualSunEvents } from '../../domain/sunEvents.ts'
import { virtualDstShifts } from '../../domain/dst.ts'
import { DAY } from '../../domain/time.ts'
import { useEntities } from '../../store/entities.ts'
import { getTunables, useSettings } from '../../store/settings.ts'

/** The days on screen, a day either side ("first:last", in whole days since the epoch). */
const dayRange = (f: { start: number; end: number }) => `${Math.floor(f.start / DAY) - 1}:${Math.ceil(f.end / DAY) + 1}`

export function useTimelineInstants(): InstantRecord[] {
  const instants = useEntities(s => s.instants)
  const groups = useEntities(s => s.groups)
  const range = useFrameValue(dayRange)
  const loc = useSettings(s => (s.sunEvents.length > 0 ? s.skyLocation : null))
  const sunEvents = useSettings(s => s.sunEvents)
  const dst = useSettings(s => s.dstShifts)
  // Zoomed out, sun chips collapse into a rhythm (savedLayout) and fade (--sun-fade); once days are
  // narrower than the tunable, they are gone: the sky shows it.
  const wide = useFrameValue(f => f.pxPerMs * DAY >= getTunables().sunHideDayPx)
  return useMemo(() => {
    const sun = loc && wide
    if ((!groups || groups.length === 0) && !sun && !dst) return instants
    const [first, last] = range.split(':').map(Number)
    const occurrences = groups && groups.length > 0 ? virtualOccurrences(groups, instants, engine.sample().now, first * DAY, last * DAY) : []
    const withOccurrences = occurrences.length > 0 ? [...instants, ...occurrences] : instants
    const suns = sun ? virtualSunEvents(loc, withOccurrences, first * DAY, last * DAY, sunEvents) : []
    // Clock changes (daylight saving): a few a year, always shown while switched on.
    const shifts = dst ? virtualDstShifts(withOccurrences, first * DAY, last * DAY) : []
    return suns.length + shifts.length > 0 ? [...withOccurrences, ...suns, ...shifts] : withOccurrences
  }, [instants, groups, range, loc, wide, sunEvents, dst])
}
