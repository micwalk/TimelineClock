// An instant's Visibility (#10): its strip (Label | Mark | Hidden by zoom), Auto to go back to
// what it gets by itself (its group's, or its reach: domain/reach), and Hide everywhere. The same
// box opens from the eye on its chip and on its Agenda row. A recurring thing (a repeat's
// occurrence, a computed sunrise or sunset) always sets its whole series: one day of a repeat
// never shows differently from the rest. At the top, the group it is in (domain/collections; a
// repeat's sets its series'); a computed one (the sun) is in none.
import type { InstantRecord } from '../../domain/entities.ts'
import type { Visibility } from '../../domain/displayGroups.ts'
import { SUN_GROUP, defaultVisibility, describeVisibility, groupVisibility, recurringGroupOf } from '../../domain/displayGroups.ts'
import { HOUR } from '../../domain/time.ts'
import { displayName } from '../../domain/entities.ts'
import { instantVisibility, longestSpans } from '../../domain/reach.ts'
import { hasArmedAlarm } from '../../domain/alarms.ts'
import { useEntities } from '../../store/entities.ts'
import { getTunables, settings, useSettings } from '../../store/settings.ts'
import * as act from '../../store/actions.ts'
import { ZoomStrip } from './ZoomStrip.tsx'
import { GroupSelect } from './GroupSelect.tsx'
import { collectionOf, seriesGroupLookup } from '../../domain/collections.ts'

/** What a one-off instant gets by itself: its reach (domain/reach). */
function autoVisibility(inst: InstantRecord): Visibility {
  const { spans, instants } = useEntities.getState()
  const ts = new Map(instants.map(i => [i.id, i.tsEpochMs]))
  const now = act.nowTime()
  return instantVisibility({ ...inst, visibility: undefined }, {
    now, countdown: !!inst.favorite || hasArmedAlarm(inst, now), longestSpanMs: longestSpans(spans, id => ts.get(id)).get(inst.id) ?? 0,
    unnamedReachMs: getTunables().unnamedReachHours * HOUR, group: null,
  })
}

export function VisibilityEditor({ inst, onDone }: { inst: InstantRecord; onDone?: () => void }) {
  const groups = useSettings(s => s.groupVisibility)
  const recurring = recurringGroupOf(inst)
  const seriesName = useEntities(s => (inst.seriesId ? displayName(s.groups?.find(g => g.id === inst.seriesId)?.label ?? '', 'this repeat') : ''))
  const armed = hasArmedAlarm(inst, act.nowTime())
  const series = useEntities(s => s.groups)
  const group = collectionOf(inst, seriesGroupLookup(series ?? []))
  const groupPick = group !== null && (
    <GroupSelect value={group} label={inst.seriesId ? `Group (every ${seriesName})` : 'Group'} onChange={id => act.setInstantCollection(inst.id, id)} />
  )
  const hide = (
    <button type="button" className="alarm-link glow-box" disabled={!inst.hidden && armed}
      title={!inst.hidden && armed ? 'An alarm still to ring is never hidden' : undefined}
      onClick={() => { act.setInstantHidden(inst.id, !inst.hidden); onDone?.() }}>
      {inst.hidden ? 'Show' : 'Hide everywhere'}
    </button>
  )
  if (recurring) {
    // The series' (or the sun's) visibility, for every one of them.
    const custom = !!groups[recurring]
    const value = groupVisibility(recurring, groups)
    const whose = recurring === SUN_GROUP ? 'every sunrise and sunset' : `every ${seriesName}`
    return (
      <div className="visibility-editor">
        {groupPick}
        <p className="visibility-editor__scope">For {whose}</p>
        <ZoomStrip value={value} onChange={v => settings.setGroupVisibility(recurring, v)}
          note={custom ? undefined : `Auto: ${describeVisibility(defaultVisibility(recurring))}`} />
        <div className="visibility-editor__actions">
          {custom && <button type="button" className="alarm-link glow-box" onClick={() => settings.resetGroupVisibility(recurring)}>Auto</button>}
          {!inst.virtual && hide}
        </div>
      </div>
    )
  }
  const auto = inst.visibility ? null : autoVisibility(inst)
  return (
    <div className="visibility-editor">
      {groupPick}
      <ZoomStrip value={inst.visibility ?? auto!} onChange={v => act.setInstantVisibility(inst.id, v)}
        note={auto ? `Auto: ${describeVisibility(auto)}` : undefined} />
      <div className="visibility-editor__actions">
        {inst.visibility && <button type="button" className="alarm-link glow-box" onClick={() => act.setInstantVisibility(inst.id, null)}>Auto</button>}
        {hide}
      </div>
    </div>
  )
}
