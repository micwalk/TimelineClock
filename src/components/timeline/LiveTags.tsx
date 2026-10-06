// Now and the Cursor as arrow tags on the live side of the axis. A tap opens the tag's tools.
// A double-tap on the Cursor tag drops a nameless instant there (it also has a ＋ button); on
// the Now tag it goes to Now, then drops an instant at Now with its name editor open.
import { useMemo, useRef } from 'react'
import type { CSSProperties } from 'react'
import { StarIcon as StarOutline } from '@heroicons/react/24/outline'
import { ClockIcon, EyeSlashIcon, LockClosedIcon, LockOpenIcon, MapPinIcon, PlusSmallIcon } from '@heroicons/react/20/solid'
import { useFrameValue } from '../../engine/hooks.ts'
import { LiveText } from '../../engine/LiveText.tsx'
import { SECOND } from '../../domain/time.ts'
import { chipName, formatClockCompact, formatRelativeShort, formatSignedDuration } from '../../domain/format.ts'
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
import { dropFromPlus, usePlusButton } from './plusMorph.ts'
import { CHIP_HEIGHT, estimateChipWidth, savedLayoutAt, useChipWidths } from './savedLayout.ts'
import type { Frame } from '../../engine/viewportEngine.ts'
import type { InstantRecord } from '../../domain/entities.ts'

/** Vertical: the Cursor tag's ＋ (30px round) starts this far right of the axis (.tl-tag__drop). */
const PLUS_LEFT = GEOMETRY_VERTICAL.axis - GEOMETRY_VERTICAL.tagArrow + 1 + 2 * GEOMETRY_VERTICAL.tagArrow + 4
const PLUS_SIZE = 30

/**
 * Vertical: how far the ＋ steps right to clear the chips on the cursor line (it sits on the
 * saved side, where a chip dropped at the cursor lands), so it never covers one: it comes to
 * rest just past the chip it was pulled out of.
 */
function plusPush(f: Frame, byId: ReadonlyMap<string, InstantRecord>): number {
  if (f.orientation !== 'vertical') return 0
  const l = savedLayoutAt(f)
  const widths = useChipWidths.getState().widths
  const y = f.mainSize / 2
  let right = PLUS_LEFT
  for (const id of l.visibleIds) {
    if (l.rows[id] === undefined) continue
    const inst = byId.get(id)
    if (!inst) continue
    const mid = f.pos(inst.tsEpochMs) + (l.shifts[id] ?? 0)
    if (Math.abs(mid - y) >= (CHIP_HEIGHT + PLUS_SIZE) / 2) continue
    const left = GEOMETRY_VERTICAL.chipStart + (l.crossOffsets[id] ?? 0)
    const end = left + (widths[id] ?? estimateChipWidth(inst.label))
    if (left < right + PLUS_SIZE && end + 6 > right) right = end + 6
  }
  return Math.round(right - PLUS_LEFT)
}

/** The Cursor tag moves out a slot when it would overlap the Now tag (spec C14). */
// eslint-disable-next-line react-refresh/only-export-components
export const liveTagsCollide = (nowPos: number, cursorPos: number, clearancePx: number) => Math.abs(nowPos - cursorPos) < clearancePx

/** Longest name shown in the Cursor tag's offset line. */
const NAME_MAX = 10
const shortName = (name: string) => (name.length > NAME_MAX ? `${name.slice(0, NAME_MAX - 1)}…` : name)

/** "Rice +00:10": whole seconds, so it only changes once a second. */
const offsetText = (name: string, ms: number) => `${name} ${formatSignedDuration(ms)}`

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
    { label: 'Save as favorite', icon: StarOutline, onSelect: () => act.dropInstant({ favorite: true }) },
    { label: 'Set cursor to a time…', icon: ClockIcon, onSelect: () => ui.openTimeInput({ kind: 'clock', anchor: 'now' }) },
  ]
  return (
    <Marker className={`is-now${focused ? ' is-focused' : ''}${menuOpen || clockOpen ? ' has-popover' : ''}`} ariaLabel="Now" getPos={f => f.pos(f.now)}>
      <ArrowTag
        hint={focused ? 'Tap for tools; double-tap to add a named instant at Now' : 'Tap for tools; double-tap to go to Now'}
        measure="now"
        slot={0}
        onClick={() => ui.toggleTagMenu('now')}
        onDoubleClick={() => { ui.closeTagMenu(); act.activateNow() }}
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
  // Shown for the free cursor and while the cursor sits on a focused instant (then in the "on an instant" colour); never in Now or move mode.
  const freeCursor = useView(s => s.viewFocusMode === 'cursor' && !s.moveMode)
  const focusedId = useView(s => (s.viewFocusMode === 'instant' && !s.moveMode ? s.focusedInstantId : null))
  const focusedInst = useEntities(s => (focusedId ? s.instants.find(i => i.id === focusedId) : undefined))
  const visible = freeCursor || !!focusedInst
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
  // The ＋ is hidden while it is (morphing into) a chip being named.
  const plusRef = useRef<HTMLButtonElement>(null)
  const morphing = useUi(s => s.plusMorph !== null)
  usePlusButton(plusRef, freeCursor)
  const instants = useEntities(s => s.instants)
  const byId = useMemo(() => new Map(instants.map(i => [i.id, i])), [instants])
  const push = useFrameValue(f => (freeCursor ? plusPush(f, byId) : 0))
  const hidden = useUi(s => s.cursorHidden)
  if (!visible) return null

  const name = selected ? shortName(chipName(selected.label)) : ''
  const onInstant = !freeCursor && focusedInst ? focusedInst : null
  const items: TagMenuItem[] = onInstant ? [
    { label: 'Save span to Now', icon: MapPinIcon, onSelect: () => act.saveSpanRefs(onInstant.tsEpochMs, 'now') },
    { label: 'Type a time…', icon: ClockIcon, onSelect: () => ui.openTimeInput({ kind: 'clock', anchor: 'cursor' }) },
    { label: 'Offset from Now…', icon: PlusSmallIcon, onSelect: () => ui.openTimeInput({ kind: 'duration', reference: 'now' }) },
  ] : [
    { label: locked ? 'Unlock from Now' : 'Lock offset to Now', icon: locked ? LockClosedIcon : LockOpenIcon, onSelect: act.toggleCursorLock },
    { label: 'Save span to Now', icon: MapPinIcon, onSelect: () => act.saveSpanRefs('center', 'now') },
    ...(selected ? [{ label: `Save span to ${name}`, icon: MapPinIcon, onSelect: () => act.saveSpanRefs(selected.tsEpochMs, 'center') }] : []),
    { label: 'Type a time…', icon: ClockIcon, onSelect: () => ui.openTimeInput({ kind: 'clock', anchor: 'cursor' }) },
    { label: 'Offset from Now…', icon: PlusSmallIcon, onSelect: () => ui.openTimeInput({ kind: 'duration', reference: 'now' }) },
    ...(selected ? [{ label: `Offset from ${name}…`, icon: PlusSmallIcon, onSelect: () => ui.openTimeInput({ kind: 'duration', reference: 'selected' }) }] : []),
    { label: 'Save as favorite', icon: StarOutline, onSelect: () => act.dropInstant({ favorite: true }) },
  ]

  let popover = null
  if (timeInput?.kind === 'clock' && timeInput.anchor === 'cursor') popover = clockPopover('cursor')
  else if (timeInput?.kind === 'duration' && (timeInput.reference === 'now' || (selected && !onInstant))) {
    const reference = timeInput.reference
    popover = (
      <DurationPopover
        title={reference === 'now' ? 'Offset from Now' : `Offset from ${name}`}
        from={reference === 'now' ? 'Now' : name}
        initialMs={act.cursorTime() - (reference === 'now' ? act.nowTime() : selected!.tsEpochMs)}
        onCancel={ui.closeTimeInput}
        onSubmit={text => { if (act.applyDurationInput(text, reference)) ui.closeTimeInput() }}
      />
    )
  }

  return (
    <Marker className={`is-cursor${onInstant ? ' is-on-instant' : ''}${menuOpen || popover ? ' has-popover' : ''}${hidden ? ' is-collapsed' : ''}`} ariaLabel="Cursor" getPos={f => f.mainSize / 2}
      style={push ? ({ '--plus-push': `${push}px` } as CSSProperties) : undefined}>
      {/* Folded away: the arrowhead stays on the axis, and tapping it brings the tag back. */}
      {hidden && (
        <button type="button" className="tl-tag__show" data-no-pan aria-label="Show the cursor" title="Show the cursor (H)"
          onClick={() => act.setCursorHidden(false)} />
      )}
      <ArrowTag
        className={hidden ? 'is-collapsed' : undefined}
        inert={hidden}
        extra={(
          <button type="button" className="tl-tag__hide glow-box" data-no-pan aria-label="Hide the cursor" title="Hide the cursor (H)"
            onClick={() => act.setCursorHidden(true)}>
            <EyeSlashIcon aria-hidden />
          </button>
        )}
        srName="Cursor"
        measure="cursor"
        hint={onInstant ? 'Tap for tools' : 'Tap for tools; double-tap to drop an instant here'}
        action={onInstant ? undefined : {
          label: 'Drop an instant at the cursor and name it',
          ref: plusRef,
          hidden: morphing,
          onClick: () => (plusRef.current ? dropFromPlus(plusRef.current) : act.dropAndName()),
        }}
        slot={slot}
        onClick={() => ui.toggleTagMenu('cursor')}
        onDoubleClick={() => { if (onInstant) return; ui.closeTagMenu(); act.dropInstant() }}
        menuOpen={menuOpen}
        onDismissMenu={ui.closeTagMenu}
        menu={<TagMenu label="Cursor tools" items={items} onClose={ui.closeTagMenu} />}
        popover={popover ?? undefined}
      >
        {onInstant ? (
          <>
            {formatClockCompact(onInstant.tsEpochMs, true)}{' '}
            <LiveText className="tl-tag__sub" compute={f => formatRelativeShort(onInstant.tsEpochMs - f.now)} />
          </>
        ) : (
          <>
            <LiveText compute={f => formatClockCompact(f.center, true)} />{' '}
            <LiveText className="tl-tag__sub" compute={f => offsetText('Now', f.center - f.now)} />
          </>
        )}
        {!onInstant && selected && selectedAway && (
          <>
            {' '}
            <LiveText className="tl-tag__sub" compute={f => offsetText(name, f.center - selected.tsEpochMs)} />
          </>
        )}
      </ArrowTag>
    </Marker>
  )
}
