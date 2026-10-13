// Keeps repeating series' occurrences made 14 days ahead (domain/series; as far as the Android
// app gets alarms ahead): on start, every hour, and when a series changes. Further ahead the
// timeline computes them as it shows them (components/timeline/timelineInstants).
import { HOUR } from '../domain/time.ts'
import { syncSeries } from '../store/actions.ts'
import { useEntities } from '../store/entities.ts'

let started = false

export function startSeriesSync() {
  if (started) return
  started = true
  syncSeries()
  setInterval(() => syncSeries(), HOUR)
  useEntities.subscribe((s, prev) => { if (s.groups !== prev.groups) syncSeries() })
}
