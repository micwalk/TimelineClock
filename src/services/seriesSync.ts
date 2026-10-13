// Keeps repeating series' occurrences made ahead (domain/series): on start, every hour, when a
// series changes, and when the view reaches further ahead than they have been made (so scrolling
// next month shows next month's occurrences). Store changes wait for the frame to end.
import { engine } from '../engine/viewportEngine.ts'
import { DAY, HOUR } from '../domain/time.ts'
import { syncSeries } from '../store/actions.ts'
import { useEntities } from '../store/entities.ts'

let started = false

export function startSeriesSync() {
  if (started) return
  started = true
  syncSeries()
  setInterval(() => syncSeries(), HOUR)
  useEntities.subscribe((s, prev) => { if (s.groups !== prev.groups) syncSeries() })
  let lastDay = 0
  let pending: ReturnType<typeof setTimeout> | null = null
  engine.onFrame(f => {
    const day = Math.floor(f.end / DAY)
    if (day <= lastDay) return
    lastDay = day
    if (pending) clearTimeout(pending)
    pending = setTimeout(() => { pending = null; syncSeries((day + 1) * DAY) }, 250)
  })
}
