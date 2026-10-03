// "+N" chip standing in for instants that don't fit the chip rows. Their lines stay;
// tapping zooms in to show them.
import { useRef } from 'react'
import type { CSSProperties } from 'react'
import { BellIcon, StarIcon } from '@heroicons/react/24/solid'
import { usePositionMain } from '../../engine/hooks.ts'
import { chipName } from '../../domain/format.ts'
import type { InstantRecord } from '../../domain/entities.ts'
import { useLayout } from '../../store/layout.ts'
import * as act from '../../store/actions.ts'
import { GEOMETRY_VERTICAL } from './geometry.ts'
import type { ClusterInfo } from './savedLayout.ts'

/** Color class from the most important member's priority (see layoutItems). */
const accentClass = (priority: number) =>
  priority === 0 ? 'is-focused' : priority === 1 ? 'is-selected' : priority === 2 ? 'is-moving' : priority <= 4 ? 'is-alarm' : priority === 5 ? 'is-favorite' : ''

export function ClusterChip({ cluster, members }: { cluster: ClusterInfo; members: InstantRecord[] }) {
  const ref = useRef<HTMLDivElement>(null)
  const vertical = useLayout(s => s.orientation === 'vertical')
  const meanTs = members.reduce((sum, m) => sum + m.tsEpochMs, 0) / Math.max(1, members.length)
  usePositionMain(ref, f => f.pos(meanTs))

  const hasAlarm = members.some(m => m.alarm)
  const hasFavorite = members.some(m => m.favorite)
  const label = `${members.length} more instants: ${members.map(m => chipName(m.label)).join(', ')}`

  return (
    <div ref={ref} className={`tl-col tl-cluster ${accentClass(cluster.topPriority)}`}>
      <div className="tl-col__chip" style={{ '--row': cluster.slot, ...(vertical ? { left: GEOMETRY_VERTICAL.chipStart + cluster.crossOffset } : {}) } as CSSProperties}>
        <button type="button" className="chip chip--cluster glow-box glow-text" aria-label={label} title={label}
          onClick={() => act.zoomToTimes(members.map(m => m.tsEpochMs))}>
          {hasAlarm && <BellIcon aria-hidden />}
          {hasFavorite && <StarIcon aria-hidden />}
          +{members.length}
        </button>
      </div>
    </div>
  )
}
