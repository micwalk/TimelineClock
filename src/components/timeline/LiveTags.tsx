// Now and the Cursor as arrow tags on the live side of the axis. A tap opens the
// tag's tools; a double-tap saves an instant there.
import { StarIcon as StarOutline } from '@heroicons/react/24/outline'
import { ClockIcon, LockClosedIcon, LockOpenIcon, MapPinIcon, PlusSmallIcon } from '@heroicons/react/20/solid'
import { useFrameValue } from '../../engine/hooks.ts'
import { LiveText } from '../../engine/LiveText.tsx'
import type { LiveTextContext } from '../../engine/LiveText.tsx'
import { SECOND } from '../../domain/time.ts'
import { chipName, durationShowsMillis, formatClockCompact, formatSignedDuration } from '../../domain/format.ts'
import { useEntities } from '../../store/entities.ts'
import { useView } from '../../store/view.ts'
import { ui, useUi } from '../../store/ui.ts'
import * as act from '../../store/actions.ts'
import { ArrowTag } from './ArrowTag.tsx'
import { Marker } from './Marker.tsx'
import { TagMenu } from './TagMenu.tsx'
import type { TagMenuItem } from './TagMenu.tsx'
import { ClockPopover, DurationPopover } from './TimeEntryPopover.tsx'
import { GEOMETRY, GEOMETRY_VERTICAL } from './geometry.ts'

/** The Cursor tag moves out a slot when it would overlap the Now tag (spec C14). */
// eslint-disable-next-line react-refresh/only-export-components
export const liveTagsCollide = (nowPos: number, cursorPos: number, clearancePx: number) => Math.abs(nowPos - cursorPos) < clearancePx

/** Longest name shown in the Cursor tag's offset line. */
const NAME_MAX = 10
const shortName = (name: string) => (name.length > NAME_MAX ? `${name.slice(0, NAME_MAX - 1)}…` : name)

function offsetText(name: string, ms: number, ctx: LiveTextContext) {
  if (durationShowsMillis(ms)) ctx.fast()
  return `${name} ${formatSignedDuration(ms)}`
}

function clockPopover(anchor: 'now' | 'cursor') {
  return (
    <ClockPopover
      initialTs={anchor === 'now' ? act.nowTime() : act.cursorTime()}
      onCancel={ui.closeTimeInput}
      onSubmit={(h, m, s, pm) => { act.applyClockInput(h, m, s, pm); ui.closeTimeInput() }}
    />
  )
}

export function NowTag() {
  const focused = useView(s => s.viewFocusMode === 'now')
  const menuOpen = useUi(s => s.tagMenu === 'now')
  const clockOpen = useUi(s => s.timeInput?.kind === 'clock' && s.timeInput.anchor === 'now')
  const items: TagMenuItem[] = [
    { label: 'Save as favorite', icon: StarOutline, onSelect: () => act.createInstantAndEdit(act.nowTime(), { favorite: true }) },
    { label: 'Set cursor to a time…', icon: ClockIcon, onSelect: () => ui.openTimeInput({ kind: 'clock', anchor: 'now' }) },
  ]
  return (
    <Marker className={`is-now${focused ? ' is-focused' : ''}${menuOpen || clockOpen ? ' has-popover' : ''}`} ariaLabel="Now" getPos={f => f.pos(f.now)}>
      <ArrowTag
        hint="Tap for tools; double-tap to save an instant at Now"
        slot={0}
        onClick={() => ui.toggleTagMenu('now')}
        onDoubleClick={() => { ui.closeTagMenu(); act.createInstantAndEdit(act.nowTime()) }}
        menuOpen={menuOpen}
        onDismissMenu={ui.closeTagMenu}
        menu={<TagMenu label="Now tools" items={items} onClose={ui.closeTagMenu} />}
        popover={clockOpen ? clockPopover('now') : undefined}
      >
        {/* The spaces keep words apart in the accessible name; flex layout ignores them. */}
        <span className="tl-tag__caption">NOW</span>{' '}
        <LiveText compute={f => formatClockCompact(f.now, true)} />
      </ArrowTag>
    </Marker>
  )
}

export function CursorTag() {
  const visible = useView(s => s.viewFocusMode === 'cursor' && !s.moveMode)
  const locked = useView(s => s.cursorLocked)
  const selectedId = useView(s => s.currentSelectedInstantId)
  const selected = useEntities(s => s.instants.find(i => i.id === selectedId))
  const menuOpen = useUi(s => s.tagMenu === 'cursor')
  const timeInput = useUi(s => s.timeInput)
  const slot = useFrameValue(f => {
    const now = f.pos(f.now)
    const cursor = f.mainSize / 2
    if (f.orientation === 'vertical') {
      // Shift along the time axis, away from Now; the arrowhead stays on the line.
      return liveTagsCollide(now, cursor, GEOMETRY_VERTICAL.tagSlotV) ? (cursor < now ? -1 : 1) : 0
    }
    return liveTagsCollide(now, cursor, GEOMETRY.tagClearance) ? 1 : 0
  })
  // The selected-offset line only shows once the selected instant is a second or more from the cursor (never "+00:00.000" under it).
  const selectedTs = selected?.tsEpochMs
  const selectedAway = useFrameValue(f => selectedTs !== undefined && Math.abs(f.center - selectedTs) >= SECOND)
  if (!visible) return null

  const name = selected ? shortName(chipName(selected.label)) : ''
  const items: TagMenuItem[] = [
    { label: locked ? 'Unlock from Now' : 'Lock offset to Now', icon: locked ? LockClosedIcon : LockOpenIcon, onSelect: act.toggleCursorLock },
    { label: 'Save span to Now', icon: MapPinIcon, onSelect: () => act.saveSpanRefs('center', 'now') },
    ...(selected ? [{ label: `Save span to ${name}`, icon: MapPinIcon, onSelect: () => act.saveSpanRefs(selected.tsEpochMs, 'center') }] : []),
    { label: 'Type a time…', icon: ClockIcon, onSelect: () => ui.openTimeInput({ kind: 'clock', anchor: 'cursor' }) },
    { label: 'Offset from Now…', icon: PlusSmallIcon, onSelect: () => ui.openTimeInput({ kind: 'duration', reference: 'now' }) },
    ...(selected ? [{ label: `Offset from ${name}…`, icon: PlusSmallIcon, onSelect: () => ui.openTimeInput({ kind: 'duration', reference: 'selected' }) }] : []),
    { label: 'Save as favorite', icon: StarOutline, onSelect: () => act.saveInstantAtCursor({ favorite: true }) },
  ]

  let popover = null
  if (timeInput?.kind === 'clock' && timeInput.anchor === 'cursor') popover = clockPopover('cursor')
  else if (timeInput?.kind === 'duration' && (timeInput.reference === 'now' || selected)) {
    const reference = timeInput.reference
    popover = (
      <DurationPopover
        title={reference === 'now' ? 'Offset from Now' : `Offset from ${name}`}
        initialMs={act.cursorTime() - (reference === 'now' ? act.nowTime() : selected!.tsEpochMs)}
        onCancel={ui.closeTimeInput}
        onSubmit={text => { if (act.applyDurationInput(text, reference)) ui.closeTimeInput() }}
      />
    )
  }

  return (
    <Marker className={`is-cursor${menuOpen || popover ? ' has-popover' : ''}`} ariaLabel="Cursor" getPos={f => f.mainSize / 2}>
      <ArrowTag
        srName="Cursor"
        hint="Tap for tools; double-tap to save an instant here"
        slot={slot}
        onClick={() => ui.toggleTagMenu('cursor')}
        onDoubleClick={() => { ui.closeTagMenu(); act.saveInstantAtCursor() }}
        menuOpen={menuOpen}
        onDismissMenu={ui.closeTagMenu}
        menu={<TagMenu label="Cursor tools" items={items} onClose={ui.closeTagMenu} />}
        popover={popover ?? undefined}
      >
        <LiveText compute={f => formatClockCompact(f.center, true)} />{' '}
        <LiveText className="tl-tag__sub" compute={(f, ctx) => offsetText('Now', f.center - f.now, ctx)} />
        {selected && selectedAway && (
          <>
            {' '}
            <LiveText className="tl-tag__sub" compute={(f, ctx) => offsetText(name, f.center - selected.tsEpochMs, ctx)} />
          </>
        )}
      </ArrowTag>
    </Marker>
  )
}
