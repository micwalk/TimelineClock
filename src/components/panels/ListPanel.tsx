// Tabbed list under the controls: all instants, favorites, and spans.
import { memo, useEffect, useMemo, useRef, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { StarIcon as StarOutline } from '@heroicons/react/24/outline'
import { StarIcon as StarSolid, BellAlertIcon } from '@heroicons/react/24/solid'
import { EyeIcon, EyeSlashIcon, PencilIcon, TrashIcon } from '@heroicons/react/20/solid'
import { useFrameValue } from '../../engine/hooks.ts'
import { LiveText } from '../../engine/LiveText.tsx'
import { formatDateTime, formatDurationCoarse, formatRelativeCoarse } from '../../domain/format.ts'
import type { InstantRecord } from '../../domain/entities.ts'
import { displayName } from '../../domain/entities.ts'
import type { ResolvedSpan } from '../../domain/spans.ts'
import { isFavoriteNowSpan, resolveSpan, spanEndName } from '../../domain/spans.ts'
import { useEntities } from '../../store/entities.ts'
import { useView, view } from '../../store/view.ts'
import type { ListTab } from '../../store/ui.ts'
import { ui, useUi } from '../../store/ui.ts'
import * as act from '../../store/actions.ts'
import { IconButton } from '../common/IconButton.tsx'
import { InlineInput } from '../common/InlineInput.tsx'
import { useFlip } from '../../hooks/useFlip.ts'
import { SettingsPanel } from './SettingsPanel.tsx'

const TABS: { key: ListTab; label: string }[] = [
  { key: 'instants', label: 'All Instants' },
  { key: 'favorites', label: 'Favorites' },
  { key: 'spans', label: 'All Spans' },
]

/** Scrolls the row marked data-focused into view whenever `focusKey` changes. */
function useScrollFocused(container: React.RefObject<HTMLElement | null>, focusKey: string) {
  useEffect(() => {
    const row = container.current?.querySelector<HTMLElement>('[data-focused="true"]')
    row?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [container, focusKey])
}

// ---------------------------------------------------------------------------
// Instants

function Relative({ ts }: { ts: number | 'now' | 'center' }) {
  return (
    <LiveText
      className="list-row__rel mono"
      compute={f => {
        if (ts === 'now') return '00:00'
        return formatRelativeCoarse((ts === 'center' ? f.center : ts) - f.now)
      }}
    />
  )
}

const SavedRow = memo(function SavedRow({ inst, focused, selected }: { inst: InstantRecord; focused: boolean; selected: boolean }) {
  const isPast = useFrameValue(f => inst.tsEpochMs < f.now)
  return (
    <div
      data-key={inst.id}
      data-focused={focused}
      className={`list-row list-row--instant glow-box${focused ? ' is-focused' : selected ? ' is-selected' : ''}${isPast ? ' is-past' : ' is-future'}`}
      onClick={() => act.focusInstant(inst.id)}
      role="button"
      tabIndex={0}
      onKeyDown={e => { if (e.key === 'Enter') act.focusInstant(inst.id) }}
    >
      <div className="list-row__name">
        <IconButton icon={inst.favorite ? StarSolid : StarOutline} label={inst.favorite ? 'Unfavorite' : 'Favorite'}
          color="var(--c-favorite)" bare pressed={!!inst.favorite} onClick={() => act.toggleFavorite(inst.id)} />
        <span className={inst.label ? '' : 'is-empty'}>{displayName(inst.label)}</span>
        {inst.alarm && <BellAlertIcon className="list-row__bell" aria-label="Alarm set" />}
      </div>
      <div className="list-row__dt mono">{formatDateTime(inst.tsEpochMs)}</div>
      <Relative ts={inst.tsEpochMs} />
    </div>
  )
})

function LiveRow({ kind, focused }: { kind: 'now' | 'cursor'; focused: boolean }) {
  return (
    <div
      data-key={kind}
      data-focused={focused}
      className={`list-row list-row--instant list-row--${kind} glow-box${focused ? ' is-focused' : ''}`}
      onClick={() => (kind === 'now' ? act.focusNow() : act.focusCursorAt(act.cursorTime()))}
      role="button"
      tabIndex={0}
    >
      <div className="list-row__name"><span className="list-row__spacer" />{kind === 'now' ? 'Now' : 'Cursor'}</div>
      <LiveText className="list-row__dt mono" compute={f => formatDateTime(kind === 'now' ? f.now : f.center)} />
      <Relative ts={kind === 'now' ? 'now' : 'center'} />
    </div>
  )
}

function lowerBound(sorted: InstantRecord[], ts: number) {
  let lo = 0
  let hi = sorted.length
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (sorted[mid].tsEpochMs < ts) lo = mid + 1
    else hi = mid
  }
  return lo
}

function InstantsList({ favoritesOnly }: { favoritesOnly: boolean }) {
  const instants = useEntities(s => s.instants)
  const v = useView(useShallow(s => ({ mode: s.viewFocusMode, focusedId: s.focusedInstantId, selectedId: s.currentSelectedInstantId })))
  const sorted = useMemo(
    () => instants.filter(i => !favoritesOnly || i.favorite).sort((a, b) => a.tsEpochMs - b.tsEpochMs),
    [instants, favoritesOnly],
  )
  const showLive = !favoritesOnly
  const showCursor = showLive && v.mode === 'cursor'
  // Where Now and the Cursor slot into the sorted list; changes only when they cross an instant.
  const nowIdx = useFrameValue(f => (showLive ? lowerBound(sorted, f.now) : -1))
  const cursorIdx = useFrameValue(f => (showCursor ? lowerBound(sorted, f.center) : -1))

  const rows: { key: string; node: React.ReactNode }[] = []
  const pushLive = (i: number) => {
    if (i === nowIdx) rows.push({ key: 'now', node: <LiveRow key="now" kind="now" focused={v.mode === 'now'} /> })
    if (i === cursorIdx) rows.push({ key: 'cursor', node: <LiveRow key="cursor" kind="cursor" focused /> })
  }
  sorted.forEach((inst, i) => {
    pushLive(i)
    rows.push({
      key: inst.id,
      node: <SavedRow key={inst.id} inst={inst} focused={v.mode === 'instant' && v.focusedId === inst.id} selected={v.selectedId === inst.id} />,
    })
  })
  pushLive(sorted.length)

  const ref = useRef<HTMLDivElement>(null)
  const orderKey = rows.map(r => r.key).join(',')
  useFlip(ref, orderKey)
  useScrollFocused(ref, `${v.mode}:${v.focusedId}`)

  if (rows.length === 0) {
    return <p className="list-empty">{favoritesOnly ? 'No favorites yet. Star an instant to pin it here.' : 'No instants yet.'}</p>
  }
  return <div ref={ref} className="list-rows">{rows.map(r => r.node)}</div>
}

// ---------------------------------------------------------------------------
// Spans

type SpanRowData =
  | { kind: 'saved'; key: string; r: ResolvedSpan; mid: number }
  | { kind: 'implied'; key: string; which: 'selected-now' | 'selected-prev'; label: string; start: InstantRecord; end: InstantRecord | null; visible: boolean; mid: number }

function SpanRow({ row, focused }: { row: SpanRowData; focused: boolean }) {
  // Local edit state: the timeline lane has its own editor bound to the store.
  const [editing, setEditing] = useState(false)
  const start = row.kind === 'saved' ? row.r.start : row.start
  const end = row.kind === 'saved' ? row.r.end ?? null : row.end
  const endName = row.kind === 'saved' ? spanEndName(row.r) : end ? displayName(end.label) : 'Now'
  const visible = row.kind === 'saved' ? row.r.span.visible !== false : row.visible
  const name = row.kind === 'saved' ? displayName(row.r.span.label, isFavoriteNowSpan(row.r) ? '★ Favorite' : '?') : row.label
  const toggleVisible = () => {
    if (row.kind === 'saved') act.toggleSpanVisible(row.r.span.id)
    else view.setImpliedVisible(row.which, !row.visible)
  }
  return (
    <div
      data-key={row.key}
      data-focused={focused}
      className={`list-row list-row--span glow-box${row.kind === 'implied' ? ' is-implied' : ''}${focused ? ' is-focused' : ''}`}
      onClick={row.kind === 'saved' ? () => act.focusSpan(row.r.span.id) : undefined}
      role={row.kind === 'saved' ? 'button' : undefined}
      tabIndex={row.kind === 'saved' ? 0 : undefined}
    >
      <div className="list-row__tools">
        <IconButton icon={visible ? EyeIcon : EyeSlashIcon} label={visible ? 'Hide on timeline' : 'Show on timeline'} bare
          color={visible ? 'var(--ink)' : 'var(--ink-faint)'} pressed={visible} onClick={toggleVisible} />
        {row.kind === 'saved' && (
          <IconButton icon={PencilIcon} label="Rename span" color="#a3e635" bare onClick={() => setEditing(true)} />
        )}
      </div>
      <div className="list-row__name">
        {editing && row.kind === 'saved' ? (
          <InlineInput
            initial={row.r.span.label}
            ariaLabel="Span name"
            onCommit={v => { act.renameSpan(row.r.span.id, v); setEditing(false) }}
            onCancel={() => setEditing(false)}
          />
        ) : (
          <span className={name === '?' ? 'is-empty' : ''}>{name}</span>
        )}
      </div>
      <div className="list-row__sname">{displayName(start.label)}</div>
      <div className="list-row__dt mono">{formatDateTime(start.tsEpochMs)}</div>
      <LiveText className="list-row__dur mono" compute={f => formatDurationCoarse((end ? end.tsEpochMs : f.now) - start.tsEpochMs)} />
      {end ? (
        <div className="list-row__dt mono">{formatDateTime(end.tsEpochMs)}</div>
      ) : (
        <LiveText className="list-row__dt mono" compute={f => formatDateTime(f.now)} />
      )}
      <div className="list-row__sname">{endName}</div>
      <div className="list-row__actions">
        {row.kind === 'saved' && (
          <IconButton icon={TrashIcon} label="Delete span" color="var(--c-danger)" bare onClick={() => act.deleteSpan(row.r.span.id)} />
        )}
      </div>
    </div>
  )
}

function SpansList() {
  const instants = useEntities(s => s.instants)
  const spans = useEntities(s => s.spans)
  const v = useView(useShallow(s => ({
    mode: s.viewFocusMode,
    focusedSpanId: s.focusedSpanId,
    selectedId: s.currentSelectedInstantId,
    secondaryId: s.secondarySelectedInstantId,
    showNow: s.showImpliedSelectedNow,
    showPrev: s.showImpliedSelectedPrev,
  })))
  const rows = useMemo(() => {
    const now = Date.now()
    const byId = new Map(instants.map(i => [i.id, i]))
    const out: SpanRowData[] = []
    for (const sp of spans) {
      const r = resolveSpan(sp, byId)
      if (r) out.push({ kind: 'saved', key: sp.id, r, mid: (r.start.tsEpochMs + (r.end?.tsEpochMs ?? now)) / 2 })
    }
    const selected = byId.get(v.selectedId ?? '')
    const secondary = byId.get(v.secondaryId ?? '')
    if (selected) {
      out.push({ kind: 'implied', key: 'implied-now', which: 'selected-now', label: 'Selected to Now', start: selected, end: null, visible: v.showNow, mid: (selected.tsEpochMs + now) / 2 })
      if (secondary) {
        out.push({ kind: 'implied', key: 'implied-prev', which: 'selected-prev', label: 'Selected to Secondary', start: secondary, end: selected, visible: v.showPrev, mid: (secondary.tsEpochMs + selected.tsEpochMs) / 2 })
      }
    }
    return out.sort((a, b) => a.mid - b.mid)
  }, [instants, spans, v.selectedId, v.secondaryId, v.showNow, v.showPrev])

  const ref = useRef<HTMLDivElement>(null)
  useFlip(ref, rows.map(r => r.key).join(','))
  useScrollFocused(ref, `${v.mode}:${v.focusedSpanId}`)

  if (rows.length === 0) return <p className="list-empty">No spans yet. Use the pin on a span to save it.</p>
  return (
    <div ref={ref} className="list-rows">
      <div className="list-head list-row--span" aria-hidden>
        <span /><span>Name</span><span>Start</span><span>Start time</span><span>Duration</span><span>End time</span><span>End</span><span />
      </div>
      {rows.map(row => (
        <SpanRow key={row.key} row={row} focused={row.kind === 'saved' && v.mode === 'span' && v.focusedSpanId === row.r.span.id} />
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------

export function ListPanel() {
  const tab = useUi(s => s.listTab)
  return (
    <section className="list-panel" aria-label="Agenda">
      <div className="list-header">
        <div className="list-tabs" role="tablist">
          {TABS.map(t => (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={tab === t.key}
              className={`list-tab${tab === t.key ? ' is-active' : ''}`}
              onClick={() => ui.setListTab(t.key)}
            >
              {t.label}
            </button>
          ))}
        </div>
        <SettingsPanel />
      </div>
      <div className="list-scroll" role="tabpanel">
        {tab === 'spans' ? <SpansList /> : <InstantsList favoritesOnly={tab === 'favorites'} />}
      </div>
    </section>
  )
}
