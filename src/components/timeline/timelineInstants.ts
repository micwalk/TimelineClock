// The instants the timeline draws: the stored ones (less those in a group you switched off:
// domain/collections), plus repeating series' occurrences past the
// horizon and (once a location is set, until the sun group's zoom hides them) sunrises and sunsets, computed for the
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
import { virtualSeasons } from '../../domain/seasons.ts'
import { DAY } from '../../domain/time.ts'
import { useEntities } from '../../store/entities.ts'
import { useSettings } from '../../store/settings.ts'
import { SUN_GROUP, groupVisibility, stageAt } from '../../domain/displayGroups.ts'
import { groupHiddenTest } from '../../domain/collections.ts'

/**
 * Sunrises, sunsets and clock changes are computed only while this much time is on screen at most
 * (zoomed out to decades they would be tens of thousands of chips).
 */
const COMPUTED_MAX_MS = 2 * 365 * DAY

/** The days on screen, a day either side ("first:last", in whole days since the epoch). */
const dayRange = (f: { start: number; end: number }) => `${Math.floor(f.start / DAY) - 1}:${Math.ceil(f.end / DAY) + 1}`

export function useTimelineInstants(): InstantRecord[] {
  const instants = useEntities(s => s.instants)
  const groups = useEntities(s => s.groups)
  const collections = useEntities(s => s.collections)
  const range = useFrameValue(dayRange)
  const loc = useSettings(s => (s.sunEvents.length > 0 ? s.skyLocation : null))
  const sunEvents = useSettings(s => s.sunEvents)
  // Zoomed out, sun chips gather into a rhythm and fade (savedLayout, domain/displayGroups); past
  // the sun group's zoom they are gone: the sky shows it.
  const visibilities = useSettings(s => s.groupVisibility)
  const wide = useFrameValue(f => f.end - f.start <= COMPUTED_MAX_MS && stageAt(groupVisibility(SUN_GROUP, visibilities), f.end - f.start) !== 'hidden')
  // Clock changes, solstices and equinoxes: a few a year, shown while no more than 2 years are on screen.
  const dstNear = useFrameValue(f => f.end - f.start <= COMPUTED_MAX_MS)
  const dst = useSettings(s => s.dstShifts)
  const seasons = useSettings(s => s.seasons)
  const lat = useSettings(s => s.skyLocation?.lat ?? null)
  return useMemo(() => {
    const hidden = groupHiddenTest(collections ?? [], groups ?? [], engine.sample().now)
    const shown = (list: InstantRecord[]) => (hidden ? list.filter(i => !hidden(i)) : list)
    const sun = loc && wide
    if ((!groups || groups.length === 0) && !sun && !((dst || seasons) && dstNear)) return shown(instants)
    const [first, last] = range.split(':').map(Number)
    const occurrences = groups && groups.length > 0 ? virtualOccurrences(groups, instants, engine.sample().now, first * DAY, last * DAY) : []
    const withOccurrences = shown(occurrences.length > 0 ? [...instants, ...occurrences] : instants)
    const suns = sun ? virtualSunEvents(loc, withOccurrences, first * DAY, last * DAY, sunEvents) : []
    // Clock changes (daylight saving): a few a year, always shown while switched on.
    const shifts = dst && dstNear ? virtualDstShifts(withOccurrences, first * DAY, last * DAY) : []
    // Solstices and equinoxes: four a year, the same moment everywhere.
    const turns = seasons && dstNear ? virtualSeasons(withOccurrences, first * DAY, last * DAY, lat) : []
    return suns.length + shifts.length + turns.length > 0 ? [...withOccurrences, ...suns, ...shifts, ...turns] : withOccurrences
  }, [instants, groups, collections, range, loc, wide, sunEvents, dst, seasons, lat, dstNear])
}
