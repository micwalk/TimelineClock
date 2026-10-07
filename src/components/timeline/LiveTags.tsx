// Now and the Cursor as arrow tags on the live side of the axis. A tap opens the tag's tools.
// A double-tap on the Cursor tag drops a nameless instant there (it also has a ＋ button); on
// the Now tag it goes to Now, then drops an instant at Now with its name editor open.
import { useRef } from 'react'
import { StarIcon as StarOutline } from '@heroicons/react/24/outline'
import { ClockIcon, EyeSlashIcon, LockClosedIcon, LockOpenIcon, MapPinIcon, PlusSmallIcon } from '@heroicons/react/20/solid'
import { useFrameValue } from '../../engine/hooks.ts'
import { LiveText } from '../../engine/LiveText.tsx'
import { SECOND } from '../../domain/time.ts'
import { formatClockCompact, formatRelativeShort, formatSignedDuration } from '../../domain/format.ts'
import { endpointName } from '../../domain/spans.ts'
import { useEntities } from '../../store/entities.ts'
import { useView } from '../../store/view.ts'
import { ui, useUi } from '../../store/ui.ts'
import * as act from '../../store/actions.ts'
import { ArrowTag } from './ArrowTag.tsx'
import { Marker } from './Marker.tsx'
import { TagMenu } from './TagMenu.tsx'
import type { TagMenuItem } from './TagMenu.tsx'
import { ClockPopover, DurationPopover } from './TimeEntryPopover.tsx'
import { dropFromPlus, usePlusButton } from './plusMorph.ts'
import { captureAt, captureFlowAt } from './capture.ts'
import { cursorTagPos, liveTagSizes } from './rightSideLayout.ts'
import type { Frame } from '../../engine/viewportEngine.ts'
import { engine, reducedMotion } from '../../engine/viewportEngine.ts'
import type { SpringState } from '../../domain/spring.ts'
import { omegaFor, springSettled, stepSpring } from '../../domain/spring.ts'
import { cursorLift } from '../../domain/tagAvoid.ts'

/** Where the Cursor tag's push out of the Now tag's way flips sides (vertical, a fast pan across Now that doesn't merge), the jump eases out over this, ms. */
const FLIP_SETTLE_MS = 200
const OMEGA_FLIP = omegaFor(FLIP_SETTLE_MS)

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
  /** The time the tag shows: where the cursor would land (an instant it is about to land on), else the cursor's. */
  const shownTime = (f: Frame) => {
    const cap = captureAt(f)
    return cap?.preview ? cap.ts : f.center
  }
  // The selected-offset line only shows once the selected instant is a second or more from the cursor (never "+00:00.000" under it).
  const selectedTs = selected?.tsEpochMs
  const selectedAway = useFrameValue(f => selectedTs !== undefined && Math.abs(shownTime(f) - selectedTs) >= SECOND)
  // The ＋ never moves. While the cursor is on an instant it is inside that instant's chip
  // (plusMorph.ts): still here, measurable, but not drawn.
  const plusRef = useRef<HTMLButtonElement>(null)
  const plusAway = useUi(s => s.plusHidden)
  const hidden = useUi(s => s.cursorHidden)
  usePlusButton(plusRef, visible && !hidden)
  // On an instant or Now, or about to land on it (capture.ts): the cursor glides onto its line on
  // the capture flow, the same motion that takes the ＋ into an instant's chip and the tag into
  // Now's. The tag keeps clear of the Now tag as a continuous function of the distance between
  // them (domain/tagAvoid): it arcs over Now in horizontal and is pushed along the time axis in
  // vertical; there the push flips sides where the cursor crosses Now, which the merge into Now
  // hides (or, on a fast pan that doesn't merge, eases out).
  const cursorPos = (f: Frame) => f.mainSize / 2 + captureFlowAt(f).lean
  const avoid = useRef<{ seq: number; last: number; res: SpringState; perf: number; written: string; plus: string; merging: boolean }>(
    { seq: -1, last: 0, res: { x: 0, v: 0 }, perf: NaN, written: '', plus: '', merging: false })
  const placeTag = (f: Frame, label: HTMLDivElement) => {
    const a = avoid.current
    if (a.seq === f.seq) return
    a.seq = f.seq
    const flow = captureFlowAt(f)
    const merge = flow.kind === 'now' ? flow.s : 0
    const mid = f.mainSize / 2 + flow.lean
    let lift = 0
    if (!hidden) {
      if (f.orientation === 'horizontal') {
        const { now, cursor } = liveTagSizes('horizontal')
        lift = cursorLift(mid - f.pos(f.now), now, cursor) * (1 - merge)
      } else {
        const raw = cursorTagPos(f) - mid
        // The push flips sides as the cursor crosses Now: carry the jump and let it ease out.
        if (raw * a.last < 0) a.res = { x: a.res.x + a.last - raw, v: a.res.v }
        a.last = raw
        if (a.res.x !== 0 && !reducedMotion()) {
          const dt = Number.isNaN(a.perf) ? 16 : Math.min(32, Math.max(0, f.perf - a.perf))
          a.res = stepSpring(a.res, 0, dt, OMEGA_FLIP)
          if (springSettled(a.res, 0, 0.1)) a.res = { x: 0, v: 0 }
          else engine.requestFrame()
        } else a.res = { x: 0, v: 0 }
        lift = raw + a.res.x
      }
    }
    a.perf = f.perf
    const written = `${lift.toFixed(2)}|${merge.toFixed(3)}`
    if (written !== a.written) {
      a.written = written
      label.style.setProperty('--lift', lift.toFixed(2))
      label.style.setProperty('--merge', merge.toFixed(3))
    }
    const merging = merge > 0.5
    if (merging !== a.merging || label.classList.contains('is-merging') !== merging) { a.merging = merging; label.classList.toggle('is-merging', merging) }
    // The ＋ never moves: it stays put while the tag leans onto a line or moves out of Now's way.
    const plus = plusRef.current
    const pin = f.orientation === 'horizontal' ? `${(-flow.lean).toFixed(2)}px ${lift.toFixed(2)}px` : `0 ${(-flow.lean - lift).toFixed(2)}px`
    if (plus && (pin !== a.plus || plus.style.translate !== pin)) { a.plus = pin; plus.style.translate = pin }
  }
  if (!visible) return null

  const name = selected ? shortName(endpointName(selected)) : ''
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
    <Marker className={`is-cursor${onInstant ? ' is-on-instant' : ''}${menuOpen || popover ? ' has-popover' : ''}${hidden ? ' is-collapsed' : ''}`}
      ariaLabel="Cursor" getPos={cursorPos} frameStyle={placeTag}
      frameClass={f => { const c = captureAt(f); return !onInstant && c?.preview && c.kind === 'instant' ? 'is-capturing' : null }}>
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
        action={{
          label: 'Drop an instant at the cursor and name it',
          ref: plusRef,
          hidden: plusAway || !!onInstant,
          onClick: () => (plusRef.current ? dropFromPlus(plusRef.current) : act.dropAndName()),
        }}
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
            <LiveText compute={f => formatClockCompact(shownTime(f), true)} />{' '}
            <LiveText className="tl-tag__sub" compute={f => offsetText('Now', shownTime(f) - f.now)} />
          </>
        )}
        {!onInstant && selected && selectedAway && (
          <>
            {' '}
            <LiveText className="tl-tag__sub" compute={f => offsetText(name, shownTime(f) - selected.tsEpochMs)} />
          </>
        )}
      </ArrowTag>
    </Marker>
  )
}
