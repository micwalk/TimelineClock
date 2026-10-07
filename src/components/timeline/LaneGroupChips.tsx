// Horizontal: "N spans" chips standing in for span names that would crowd a lane (laneChipLayout).
// Tapping one zooms to show those spans, where their own chips have room.
import { memo, useRef } from 'react'
import { useFrameListener, useFrameValue } from '../../engine/hooks.ts'
import type { LabelGroup } from '../../domain/labelGroups.ts'
import { sameLabelGroups } from '../../domain/labelGroups.ts'
import { resolveTimeRef } from '../../domain/spans.ts'
import * as act from '../../store/actions.ts'
import type { BottomLane } from './useBottomLanes.ts'
import { laneName } from './useBottomLanes.ts'
import { laneChipLayout } from './laneChipLayout.ts'

const GroupChip = memo(function GroupChip({ group, members }: { group: LabelGroup; members: BottomLane[] }) {
  const anchorRef = useRef<HTMLDivElement>(null)
  const last = useRef(NaN)
  useFrameListener(f => {
    const el = anchorRef.current
    const c = laneChipLayout(f).groups.find(g => g.key === group.key)?.center
    if (!el || c === undefined || Math.abs(c - last.current) <= 0.01) return
    last.current = c
    el.style.transform = `translate3d(${c}px,0,0)`
  })
  const names = members.map(laneName)
  const label = `${members.length} spans: ${names.join(', ')}`
  const zoom = () => {
    const now = act.nowTime()
    const center = act.cursorTime()
    act.zoomToTimes(members.flatMap(l => [resolveTimeRef(l.a, now, center), resolveTimeRef(l.b, now, center)]))
  }
  return (
    <div className="tl-lane tl-lane--span tl-lane--labels tl-lane--group" style={{ top: members[0]?.top ?? 0 }}>
      <div ref={anchorRef} className="tl-lane__anchor">
        <div className="tl-lane__chip-wrap">
          <button type="button" className="span-chip span-chip--group glow-box glow-text" aria-label={`${label}. Zoom in to show them`} title={label} onClick={zoom}>
            <span className="span-chip__text">{members.length} spans</span>
          </button>
        </div>
      </div>
    </div>
  )
})

export function LaneGroupChips({ lanes }: { lanes: BottomLane[] }) {
  const groups = useFrameValue(f => laneChipLayout(f).groups, sameLabelGroups)
  const byKey = new Map(lanes.map(l => [l.key, l]))
  return (
    <>
      {groups.map(g => {
        const members = g.members.map(k => byKey.get(k)).filter((l): l is BottomLane => !!l)
        return members.length > 1 ? <GroupChip key={g.key} group={g} members={members} /> : null
      })}
    </>
  )
}
