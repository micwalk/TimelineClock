// "+N" chip standing in for instants that don't fit the chip rows. Their lines stay;
// tapping zooms in to show them.
import { memo, useRef } from 'react'
import type { CSSProperties } from 'react'
import { BellIcon, StarIcon } from '@heroicons/react/24/solid'
import { endpointName } from '../../domain/spans.ts'
import type { InstantRecord } from '../../domain/entities.ts'
import { useLayout } from '../../store/layout.ts'
import * as act from '../../store/actions.ts'
import { GEOMETRY_VERTICAL } from './geometry.ts'
import { useChipPlacement } from './chipPlacement.ts'

/** Color class from the most important member's priority (see layoutItems). */
const accentClass = (priority: number) =>
  priority === 0 ? 'is-focused' : priority === 1 ? 'is-selected' : priority === 2 ? 'is-moving' : priority <= 4 ? 'is-alarm' : priority === 5 ? 'is-favorite' : ''

interface ClusterChipProps { id: string; topPriority: number; members: InstantRecord[] }

/** Same chip: re-rendering only when its members (or their records) change, not each time the list is rebuilt. */
const sameCluster = (a: ClusterChipProps, b: ClusterChipProps) =>
  a.id === b.id && a.topPriority === b.topPriority && a.members.length === b.members.length && a.members.every((m, k) => m === b.members[k])

export const ClusterChip = memo(function ClusterChip({ id, topPriority, members }: ClusterChipProps) {
  const ref = useRef<HTMLDivElement>(null)
  const vertical = useLayout(s => s.orientation === 'vertical')
  const meanTs = members.reduce((sum, m) => sum + m.tsEpochMs, 0) / Math.max(1, members.length)
  useChipPlacement(ref, id, true, f => f.pos(meanTs))

  const hasAlarm = members.some(m => m.alarm)
  const hasFavorite = members.some(m => m.favorite)
  const label = `${members.length} more instants: ${members.map(m => endpointName(m)).join(', ')}`

  return (
    <div ref={ref} className={`tl-col tl-col--label tl-cluster ${accentClass(topPriority)}`}>
      <div className="tl-col__chip" style={vertical ? ({ left: GEOMETRY_VERTICAL.chipStart } as CSSProperties) : undefined}>
        <button type="button" className="chip chip--cluster glow-box glow-text" aria-label={label} title={label}
          onClick={() => act.zoomToTimes(members.map(m => m.tsEpochMs))}>
          {hasAlarm && <BellIcon aria-hidden />}
          {hasFavorite && <StarIcon aria-hidden />}
          +{members.length}
        </button>
      </div>
    </div>
  )
}, sameCluster)
