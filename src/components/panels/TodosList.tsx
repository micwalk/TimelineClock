// The Agenda's Todos tab (docs/prd_todos.md §6; domain/todos todoSections):
//   [ Add a todo… (laundry 4p 20m) ]
//   Now:          rang and not done: the counting one first ("25m", ✓), then waiting ones
//                 ("since 7:00a", Done, Later).
//   Today:        scheduled later today, in time order (time, length, ⟳ for repeats).
//   Upcoming:     after today (folded past a week, as the Alarms tab's are).
//   Unscheduled:  drag to reorder; Schedule on each.
//   Done:         the last day's done, won't do and passed, newest first, "4 done today".
// An open row has Schedule (or Move) and a green ▶ Start; a long-press on a todo chip's box finds its row here.
// A row's box is its Done (a done one's box opens it again); a tap on the row goes to its instant
// on the timeline, or, unscheduled, opens Schedule (the drawer stays). Its ⋯ has Rename, Won't do,
// Delete and its Duration (quick lengths, "—" for none, or typed). Copy states facts, never
// judgements (config/labels TODO_COPY): "since 7:00a", "passed", "31m · planned 20m"; no red for
// open todos.
import { memo, useEffect, useMemo, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent, ReactNode } from 'react'
import { Bars2Icon, ClockIcon, EllipsisHorizontalIcon, PauseIcon, PencilIcon, PlayIcon, PlusIcon, TrashIcon } from '@heroicons/react/20/solid'
import { LiveText } from '../../engine/LiveText.tsx'
import { useFrameValue } from '../../engine/hooks.ts'
import { MARKS, TODO_COPY, TODO_UI } from '../../config/labels.ts'
import type { TodoRow } from '../../domain/todos.ts'
import { doneOrigin } from '../common/doneOrigin.ts'
import { TODO_DURATIONS_MIN, instantsOf, parseTodoInput, parseWhen, quickChoices, todoActual, todoInputAt, todoReading, todoStretches, hasStretches } from '../../domain/todos.ts'
import { genieKeyframes, genieMs } from '../../domain/genie.ts'
import { todoIndex, useTodoSections } from '../../hooks/useTodos.ts'
import { describeRepeatShort } from '../../domain/series.ts'
import { formatClockCompact, formatDuration, formatDurationShort, formatMonthDay } from '../../domain/format.ts'
import { parseTimerInput } from '../../domain/quickCreate.ts'
import { DAY, MINUTE } from '../../domain/time.ts'
import { useEntities } from '../../store/entities.ts'
import { getTodoTimes } from '../../store/settings.ts'
import { useLayout } from '../../store/layout.ts'
import { ui, useUi } from '../../store/ui.ts'
import * as act from '../../store/actions.ts'
import { IconButton } from '../common/IconButton.tsx'
import { InlineInput } from '../common/InlineInput.tsx'
import { NotTodoIcon, StopwatchIcon, TodoBoxIcon } from '../common/TodoIcons.tsx'
import { TimeEntry } from '../timeline/TimeEntryPopover.tsx'
import { reducedMotion } from '../../engine/viewportEngine.ts'

const byMinute = (f: { now: number }) => Math.floor(f.now / 60_000)
/** When, plainly: the clock time today, else with its date ("Nov 22 9:00a"). */
const whenText = (ts: number, now: number) => (new Date(ts).toDateString() === new Date(now).toDateString() ? clock(ts) : `${formatMonthDay(ts, now)} ${clock(ts)}`)
const bySecond = (f: { now: number }) => Math.floor(f.now / 1000)
const clock = (ts: number) => formatClockCompact(ts, false)
const length = (ms: number) => formatDurationShort(ms)
/** Upcoming todos further off than this fold under "N later". */
const UPCOMING_SHOWN_MS = 7 * DAY

/** A row that goes somewhere: in the drawer, close it so the result is not hidden behind it. */
function go(todoId: string) {
  act.showTodo(todoId)
  if (useLayout.getState().agendaPlacement === 'drawer') ui.closeAgenda()
}

/** How long it takes: a stopwatch and the length ("⏱ 20m"). */
function Duration({ ms, exact }: { ms: number; exact?: boolean }) {
  const text = exact ? formatDuration(ms, { exact: true }) : length(ms)
  return <span className="todo-dur" aria-label={`takes ${text}`}><StopwatchIcon aria-hidden className="todo-dur__icon" />{text}</span>
}

/** Parts of a line, " · " between them. */
const dotted = (parts: ReactNode[]) => parts.filter(Boolean).map((p, k) => <span key={k}>{k > 0 && ' · '}{p}</span>)

// ---------------------------------------------------------------------------
// Adding

/**
 * The Add box: a name and Enter makes a todo. A time and a length in it are read as the Alarm
 * picker reads times and Timer reads lengths ("book appt 3p", "laundry 20m", "feed cats 7a daily");
 * what it read shows under it as you type. `onAdded`: the capture box closes then.
 */
export function AddBox({ autoFocus, onAdded, onCancel }: { autoFocus?: boolean; onAdded?: () => void; onCancel?: () => void }) {
  const [text, setText] = useState('')
  const input = useMemo(() => parseTodoInput(text), [text])
  const at = text.trim() ? todoInputAt(input, Date.now(), getTodoTimes()) : null
  const read = [
    at !== null ? whenText(at, Date.now()) : '',
    input.durationMs ? <Duration ms={input.durationMs} exact /> : '',
    input.repeat && at !== null ? describeRepeatShort(input.repeat) : '',
  ].filter(Boolean)
  const submit = () => {
    if (!text.trim()) { onCancel?.(); return }
    act.addTodo(text)
    setText('')
    onAdded?.()
  }
  return (
    <form className="todo-add" onSubmit={e => { e.preventDefault(); submit() }}>
      <input
        className="todo-add__input glow-box"
        value={text}
        onChange={e => setText(e.target.value)}
        onKeyDown={e => { e.stopPropagation(); if (e.key === 'Escape') { setText(''); onCancel?.() } }}
        placeholder={TODO_UI.addPlaceholder}
        aria-label={TODO_UI.addLabel}
        autoFocus={autoFocus}
        enterKeyHint="done"
        autoComplete="off"
      />
      <button type="submit" className="todo-add__go glow-box" aria-label="Add todo" disabled={!text.trim()}><PlusIcon aria-hidden /></button>
      {read.length > 0 && <span className="todo-add__read" aria-live="polite">{dotted([input.label, ...read])}</span>}
    </form>
  )
}

// ---------------------------------------------------------------------------
// When: Schedule (an unscheduled or paused one) and Move (reschedule: one with a time)

/** Quick times (In 15m, In 1h, Tonight, Tomorrow), a typed "when" ("3p", "1h30", "tomorrow 9a"), or the time entry (a date). */
function WhenPanel({ todoId, verb: verbKey, onClose }: { todoId: string; verb: 'schedule' | 'reschedule'; onClose: () => void }) {
  const verb = TODO_UI[verbKey]
  const [text, setText] = useState('')
  const [picking, setPicking] = useState(false)
  const now = Date.now()
  const times = getTodoTimes()
  const typed = parseWhen(text, now, times)
  const put = (ts: number) => { act.scheduleTodo(todoId, ts); onClose() }
  return (
    <div className="todo-when" onClick={e => e.stopPropagation()}>
      <div className="todo-when__chips">
        {quickChoices(now, times).map(c => (
          <button key={c.key} type="button" className="alarm-link glow-box" onClick={() => put(c.ts)}>
            {c.label} <span className="alarm-link__at">{clock(c.ts)}</span>
          </button>
        ))}
        <IconButton icon={ClockIcon} label={TODO_UI.pickTime} color="var(--c-cursor)" bare pressed={picking} onClick={() => setPicking(p => !p)} />
        {verbKey === 'reschedule' && <button type="button" className="alarm-link glow-box" onClick={() => { act.backToList(todoId); onClose() }}>{TODO_UI.unschedule}</button>}
      </div>
      <form className="todo-when__typed" onSubmit={e => { e.preventDefault(); if (typed !== null) put(typed) }}>
        <input className="alarm-custom__input mono" value={text} onChange={e => setText(e.target.value)}
          onKeyDown={e => { e.stopPropagation(); if (e.key === 'Escape') onClose() }}
          placeholder={TODO_UI.whenPlaceholder} aria-label={`${verb}: when`} aria-invalid={text !== '' && typed === null} autoComplete="off" />
        <span className="alarm-custom__at mono" aria-live="polite">{typed !== null ? `→ ${whenText(typed, now)}` : ''}</span>
        <button type="submit" className="alarm-link alarm-link--go glow-box" disabled={typed === null}>{verb}</button>
      </form>
      {picking && (
        <TimeEntry
          title={`${verb}: when`}
          className="popover--inline"
          clock={{ initialTs: now + 60 * 60_000, onSubmit: (t, day) => { const d = new Date(day); put(new Date(d.getFullYear(), d.getMonth(), d.getDate(), t.h, t.m, t.s).getTime()) } }}
          offset={{ initialMs: 60 * 60_000, from: 'Now', unsigned: true, onSubmit: ms => put(Date.now() + ms) }}
          onCancel={() => setPicking(false)}
        />
      )}
    </div>
  )
}

/** A row's other tools: rename, not a todo (not while it counts), won't do, delete (a second tap), and its duration. */
/** Sucks `el` into `target` (domain/genie): a counting todo's Done going into its checkbox. It stays gone (the row changes as the todo is done). */
function genieInto(el: HTMLElement, target: Element) {
  if (reducedMotion() || typeof el.animate !== 'function') return
  const a = el.getBoundingClientRect()
  const b = target.getBoundingClientRect()
  const dx = b.left + b.width / 2 - (a.left + a.width / 2)
  const dy = b.top + b.height / 2 - (a.top + a.height / 2)
  el.classList.add('is-genie')
  el.animate(genieKeyframes(dx, dy, { w: a.width, h: a.height }, { w: b.width, h: b.height }),
    { duration: genieMs(dx, dy), easing: 'cubic-bezier(0.4, 0, 0.75, 0.6)', fill: 'forwards' })
}

/** A todo's stretches (its ⋯): when each ran and how long; a tap goes to it on the timeline. */
function StretchList({ todoId, startedId }: { todoId: string; startedId?: string }) {
  const instants = useEntities(s => s.instants)
  const spans = useEntities(s => s.spans)
  const list = todoStretches(instantsOf(todoIndex(instants), todoId), spans, Date.now(), startedId)
  if (list.length === 0) return null
  const today = new Date().toDateString()
  // Seconds for a short one ("1:09:12p – 1:09:40p"), else to the minute; the date if not today.
  const when = (ts: number, short: boolean) => {
    const c = formatClockCompact(ts, short)
    return new Date(ts).toDateString() === today ? c : `${formatMonthDay(ts, Date.now())} ${c}`
  }
  return (
    <div className="todo-stretches" role="list" aria-label="Stretches">
      <span className="todo-dur-pick__label">{TODO_COPY.stretchesHead(list.length)}</span>
      {[...list].reverse().map((s, k) => (
        <button key={s.spanId ?? `live-${k}`} type="button" role="listitem" className="todo-stretch glow-box"
          onClick={() => { if (s.spanId) act.showStretch(s.spanId); else act.showTodo(todoId); if (useLayout.getState().agendaPlacement === 'drawer') ui.closeAgenda() }}>
          <span className="mono">{when(s.start, (s.end ?? Date.now()) - s.start < 10 * MINUTE)} – {s.end === null ? TODO_COPY.now : formatClockCompact(s.end, s.end - s.start < 10 * MINUTE)}</span>
          {s.end === null
            ? <LiveText className="todo-stretch__len mono" watch={bySecond} compute={f => length(f.now - s.start)} />
            : <span className="todo-stretch__len mono">{length(s.end - s.start)}</span>}
        </button>
      ))}
    </div>
  )
}

function MoreMenu({ row, onClose, onRename }: { row: TodoRow; onClose: () => void; onRename: () => void }) {
  // Worked on (a stretch saved, or counting): it can't stop being a todo.
  const worked = useEntities(s => hasStretches(instantsOf(todoIndex(s.instants), row.todo.id), s.spans, Date.now(), row.todo.startedId))
  const [lengthText, setLengthText] = useState('')
  const [confirm, setConfirm] = useState(false)
  const typed = lengthText.trim() ? parseTimerInput(lengthText) : null
  const id = row.todo.id
  const current = row.todo.durationMs ?? null
  const setLength = (ms: number | null) => { act.setTodoLength(id, ms); onClose() }
  return (
    <div className="todo-when todo-more" onClick={e => e.stopPropagation()}>
      <div className="todo-when__chips">
        <button type="button" className="alarm-link glow-box" onClick={() => { onRename(); onClose() }}><PencilIcon aria-hidden /> {TODO_UI.rename}</button>
        {/* Not a todo: its instant stays on the timeline as a plain one (alarms and all). */}
        {row.todo.status === 'open' && row.at && !worked && (
          <button type="button" className="alarm-link glow-box" onClick={() => { act.untodo(row.at!.id); onClose() }}
            title={TODO_UI.notTodoTitle}><NotTodoIcon aria-hidden /> {TODO_UI.notTodo}</button>
        )}
        {row.todo.status === 'open' && <button type="button" className="alarm-link alarm-link--wont glow-box" onClick={() => { act.wontDoTodo(id); onClose() }}>{TODO_UI.wontDo}</button>}
        {confirm
          ? <button type="button" className="alarm-link alarm-link--danger glow-box" onClick={() => act.deleteTodo(id)}>{TODO_UI.deleteTodo}</button>
          : <IconButton icon={TrashIcon} label={`${TODO_UI.deleteTodo} (tap again)`} color="var(--c-danger)" bare onClick={() => setConfirm(true)} />}
      </div>
      <StretchList todoId={id} startedId={row.todo.startedId} />
      {row.todo.status === 'open' && (
        <div className="todo-dur-pick" role="group" aria-labelledby={`dur-${id}`}>
          <span className="todo-dur-pick__label" id={`dur-${id}`}><StopwatchIcon aria-hidden className="todo-dur__icon" />{TODO_UI.duration}</span>
          <div className="todo-when__chips">
            <button type="button" className={`alarm-link glow-box${current === null ? ' is-on' : ''}`} aria-pressed={current === null}
              aria-label={TODO_UI.noDuration} title={TODO_UI.noDuration} onClick={() => setLength(null)}>—</button>
            {TODO_DURATIONS_MIN.map(min => (
              <button key={min} type="button" className={`alarm-link glow-box${current === min * MINUTE ? ' is-on' : ''}`} aria-pressed={current === min * MINUTE}
                onClick={() => setLength(min * MINUTE)}>{length(min * MINUTE)}</button>
            ))}
          </div>
          <form className="todo-when__typed" onSubmit={e => { e.preventDefault(); if (typed !== null) setLength(typed) }}>
            <label className="todo-dur-pick__typed">
              <span>{TODO_UI.duration}</span>
              <input className="alarm-custom__input mono" value={lengthText} onChange={e => setLengthText(e.target.value)}
                onKeyDown={e => { e.stopPropagation(); if (e.key === 'Escape') onClose() }}
                placeholder={current !== null && !TODO_DURATIONS_MIN.some(m => m * MINUTE === current) ? formatDuration(current, { exact: true }) : '25m, 1h15'}
                aria-invalid={lengthText.trim() !== '' && typed === null} autoComplete="off" />
            </label>
            <button type="submit" className="alarm-link alarm-link--go glow-box" disabled={typed === null}>{TODO_UI.set}</button>
          </form>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Rows

const TodoRowView = memo(function TodoRowView({ row, drag }: { row: TodoRow; drag?: (e: ReactPointerEvent) => void }) {
  const { todo, state, at } = row
  const [panel, setPanel] = useState<'when' | 'more' | null>(null)
  const [renaming, setRenaming] = useState(false)
  const series = useEntities(s => (todo.seriesId ? s.groups?.find(g => g.id === todo.seriesId) : undefined))
  // Its stretches, live while it counts ("25m"), and how it went once done ("31m · planned 20m").
  const spans = useEntities(s => s.spans)
  const instants = useEntities(s => s.instants)
  const mine = instantsOf(todoIndex(instants), todo.id)
  const flare = useUi(s => s.celebrating?.todoId === todo.id)
  // Its ✓ is springing out of a box drawn over this one (components/timeline/Celebration): this
  // one keeps out of it until that fades.
  const popping = useUi(s => s.celebrating?.todoId === todo.id && !!s.celebrating.origin?.box)
  const found = useUi(s => s.foundTodo?.id === todo.id)
  const open = todo.status === 'open'
  // On the list (no time): unscheduled, or paused (back on the list with its stretches).
  const offList = state === 'unscheduled' || state === 'paused'
  const checkRef = useRef<HTMLButtonElement>(null)
  // Done on a counting row: the button goes into the box, which charges and pops (as a tap on it does).
  const doneFromButton = (el: HTMLElement) => {
    const box = checkRef.current
    if (box) genieInto(el, box)
    act.completeTodo(todo.id, box ? doneOrigin(box) : undefined)
  }
  // Made from an unnamed instant: it reads as its time, as the instant does.
  const name = todo.label || (at ? clock(at.tsEpochMs) : '')
  const dur = todo.durationMs ? <Duration ms={todo.durationMs} /> : null
  const sub: ReactNode = (() => {
    if (state === 'waiting' && at) return dotted([TODO_COPY.since(clock(at.tsEpochMs)), dur])
    if (state === 'paused') return dotted([TODO_COPY.soFar(length(todoActual(mine, spans, Date.now()).ms)), todo.durationMs ? TODO_COPY.planned(length(todo.durationMs)) : ''])
    if (state === 'scheduled' && at) return dotted([whenText(at.tsEpochMs, Date.now()), dur, series ? `${MARKS.repeat} ${describeRepeatShort(series.repeat)}` : ''])
    if (state === 'unscheduled') return dur ?? ''
    return null
  })()
  // Nothing on the timeline to go to: a tap schedules it instead (and the drawer stays).
  const tap = () => {
    if (renaming) return
    if (state === 'unscheduled') setPanel(p => (p === 'when' ? null : 'when'))
    else go(todo.id)
  }
  return (
    <>
      <div className={`todo-row glow-box is-${state}${flare ? ' is-celebrating' : ''}${found ? ' is-found' : ''}${renaming ? ' is-renaming' : ''}`} role="button" tabIndex={0} data-todo={todo.id}
        onClick={tap} onKeyDown={e => { if (e.key === 'Enter' && e.target === e.currentTarget) tap() }}>
        {/* Its box: Done (a closed one's opens it again). */}
        <button ref={checkRef} type="button" className={`todo-check is-${open ? 'open' : todo.status}${popping ? ' is-popping' : ''}`}
          aria-label={open ? `${TODO_UI.done}: ${name}` : `Open ${name} again`} title={open ? TODO_UI.done : TODO_UI.openAgain}
          onClick={e => { e.stopPropagation(); if (open) act.completeTodo(todo.id, doneOrigin(e.currentTarget)); else act.reopenTodo(todo.id) }}>
          <TodoBoxIcon state={open ? 'open' : (todo.status as 'done' | 'passed' | 'dropped')} aria-hidden />
        </button>
        <span className="todo-row__main">
          {renaming ? (
            <span className="todo-row__rename" onClick={e => e.stopPropagation()}>
              <InlineInput initial={todo.label} ariaLabel="Todo name" multiline className="todo-row__input chip-input glow-box" onCommit={v => { act.renameTodo(todo.id, v); setRenaming(false) }} onCancel={() => setRenaming(false)} />
            </span>
          ) : <span className="todo-row__name" title={name}>{name}</span>}
          {state === 'counting' ? (
            <LiveText className="todo-row__sub mono" watch={bySecond}
              compute={f => [length(todoActual(mine, spans, f.now, todo.startedId).ms), todo.durationMs ? TODO_COPY.planned(length(todo.durationMs)) : ''].filter(Boolean).join(' · ')} />
          ) : sub !== null ? (
            sub && <span className="todo-row__sub">{sub}</span>
          ) : (
            <span className="todo-row__sub">{todoReading(todo, todoActual(mine, spans, Date.now()), length)}</span>
          )}
        </span>
        <span className="todo-row__tools" onClick={e => e.stopPropagation()}>
          {open && state !== 'counting' && (
            <button type="button" className={`todo-btn glow-box${panel === 'when' ? ' is-on' : ''}`} onClick={() => setPanel(p => (p === 'when' ? null : 'when'))}>
              {offList ? TODO_UI.schedule : TODO_UI.reschedule}
            </button>
          )}
          {/* ▶ Start: it counts until its ⏸ or ✓ (from now; one not due yet moves to Now; a paused one goes on). */}
          {open && state !== 'counting' && (
            <button type="button" className="todo-btn todo-btn--start glow-box" aria-label={`${TODO_UI.start}: ${name}`} title={state === 'paused' ? TODO_UI.startAgainTitle : TODO_UI.startTitle}
              onClick={() => act.startTodo(todo.id)}><PlayIcon aria-hidden /></button>
          )}
          {/* Counting: Done (as its box) and ⏸ Pause (the stretch saved, back on the list), where Schedule/Move and ▶ are. */}
          {state === 'counting' && (
            <button type="button" className="todo-btn todo-btn--done glow-box" onClick={e => doneFromButton(e.currentTarget)}>{TODO_UI.done}</button>
          )}
          {state === 'counting' && (
            <button type="button" className="todo-btn todo-btn--pause glow-box" aria-label={`${TODO_UI.pause}: ${name}`} title={TODO_UI.pauseTitle}
              onClick={() => act.pauseTodo(todo.id)}><PauseIcon aria-hidden /></button>
          )}
          <IconButton icon={EllipsisHorizontalIcon} label={TODO_UI.more} color="var(--ink-dim)" bare pressed={panel === 'more'} onClick={() => setPanel(p => (p === 'more' ? null : 'more'))} />
          {drag && <span className="todo-row__grip" aria-label="Drag to reorder" onPointerDown={drag} data-no-pan><Bars2Icon aria-hidden /></span>}
        </span>
      </div>
      {panel === 'when' && <WhenPanel todoId={todo.id} verb={offList ? 'schedule' : 'reschedule'} onClose={() => setPanel(null)} />}
      {panel === 'more' && <MoreMenu row={row} onClose={() => setPanel(null)} onRename={() => setRenaming(true)} />}
    </>
  )
})

/**
 * Unscheduled todos in their order, dragged by their grip to reorder: the row follows the
 * pointer and the others make room; let go and it takes that place (act.reorderTodo).
 */
function UnscheduledRows({ rows }: { rows: TodoRow[] }) {
  const listRef = useRef<HTMLDivElement>(null)
  const [drag, setDrag] = useState<{ id: string; dy: number; to: number; from: number; heights: number[] } | null>(null)
  useEffect(() => {
    if (!drag) return
    const startY = { y: NaN }
    const move = (e: PointerEvent) => {
      if (Number.isNaN(startY.y)) startY.y = e.clientY - drag.dy
      const dy = e.clientY - startY.y
      // Which place it is over: past half of each neighbour's height.
      let to = drag.from
      let acc = 0
      if (dy > 0) for (let k = drag.from + 1; k < drag.heights.length && dy > acc + drag.heights[k] / 2; k++) { acc += drag.heights[k]; to = k }
      else for (let k = drag.from - 1; k >= 0 && -dy > acc + drag.heights[k] / 2; k--) { acc += drag.heights[k]; to = k }
      setDrag(d => (d ? { ...d, dy, to } : d))
    }
    const up = () => {
      setDrag(d => {
        if (d && d.to !== d.from) {
          const others = rows.filter(r => r.todo.id !== d.id)
          act.reorderTodo(d.id, d.to >= others.length ? null : others[d.to].todo.id)
        }
        return null
      })
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up, { once: true })
    window.addEventListener('pointercancel', up, { once: true })
    return () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up) }
    // Only a new drag (its id) restarts the listeners.
  }, [drag?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const start = (id: string, from: number) => (e: ReactPointerEvent) => {
    e.preventDefault()
    e.stopPropagation()
    // Measured once, as the drag starts (not per move).
    const heights = [...(listRef.current?.querySelectorAll<HTMLElement>(':scope > .todo-drag') ?? [])].map(el => el.offsetHeight + 6)
    setDrag({ id, dy: 0, to: from, from, heights })
  }
  const offsetOf = (k: number) => {
    if (!drag) return 0
    if (k === drag.from) return drag.dy
    const h = drag.heights[drag.from] ?? 0
    if (drag.to > drag.from && k > drag.from && k <= drag.to) return -h
    if (drag.to < drag.from && k < drag.from && k >= drag.to) return h
    return 0
  }
  return (
    <div ref={listRef} className="todo-list">
      {rows.map((r, k) => (
        <div key={r.todo.id} className={`todo-drag${drag?.id === r.todo.id ? ' is-dragging' : ''}`} style={drag ? { transform: `translateY(${offsetOf(k)}px)` } : undefined}>
          <TodoRowView row={r} drag={rows.length > 1 ? start(r.todo.id, k) : undefined} />
        </div>
      ))}
    </div>
  )
}

export function TodosList() {
  const minute = useFrameValue(byMinute)
  const s = useTodoSections(minute)
  const [showAll, setShowAll] = useState(false)
  const now = minute * 60_000
  // A todo to find (a long-press on its chip's box): unfold the far ones if it is there, then scroll its row into view.
  const found = useUi(st => st.foundTodo)
  const listRef = useRef<HTMLDivElement>(null)
  const foundFar = !!found && s.upcoming.some(r => r.todo.id === found.id && (r.at?.tsEpochMs ?? 0) - now > UPCOMING_SHOWN_MS)
  if (foundFar && !showAll) setShowAll(true)
  useEffect(() => {
    if (!found) return
    const id = requestAnimationFrame(() => {
      const row = [...(listRef.current?.querySelectorAll<HTMLElement>('.todo-row') ?? [])].find(el => el.dataset.todo === found.id)
      row?.scrollIntoView({ block: 'center', behavior: reducedMotion() ? 'auto' : 'smooth' })
    })
    return () => cancelAnimationFrame(id)
  }, [found])
  const near = s.upcoming.filter(r => (r.at?.tsEpochMs ?? 0) - now <= UPCOMING_SHOWN_MS)
  const upcoming = showAll ? s.upcoming : near
  const empty = s.active.length + s.now.length + s.today.length + s.upcoming.length + s.unscheduled.length + s.done.length === 0
  return (
    <div ref={listRef} className="todos-list alarms-list">
      <AddBox />
      {empty && <p className="alarms-empty">No todos yet. Type one above and press Enter, or press <b>N</b> anywhere. Add a time ("3p") to be reminded, a length ("20m") to plan it.</p>}
      {/* Counting now, then what rang and waits. */}
      {s.active.length > 0 && <h3 className="alarms-list__head">{TODO_UI.sections.active}</h3>}
      {s.active.map(r => <TodoRowView key={r.todo.id} row={r} />)}
      {s.now.length > 0 && <h3 className="alarms-list__head">{TODO_UI.sections.now}</h3>}
      {s.now.map(r => <TodoRowView key={r.todo.id} row={r} />)}
      {s.today.length > 0 && <h3 className="alarms-list__head">{TODO_UI.sections.today}</h3>}
      {s.today.map(r => <TodoRowView key={r.todo.id} row={r} />)}
      {s.upcoming.length > 0 && <h3 className="alarms-list__head">{TODO_UI.sections.upcoming}</h3>}
      {upcoming.map(r => <TodoRowView key={r.todo.id} row={r} />)}
      {s.upcoming.length > near.length && (
        <button type="button" className="alarm-link todo-more-btn" onClick={() => setShowAll(v => !v)}>
          {showAll ? TODO_UI.fewer : TODO_UI.laterCount(s.upcoming.length - near.length)}
        </button>
      )}
      {s.unscheduled.length > 0 && <h3 className="alarms-list__head">{TODO_UI.sections.unscheduled}</h3>}
      {s.unscheduled.length > 0 && <UnscheduledRows rows={s.unscheduled} />}
      {s.done.length > 0 && <h3 className="alarms-list__head">{TODO_UI.sections.done}{s.doneToday > 0 ? ` · ${TODO_COPY.doneToday(s.doneToday)}` : ''}</h3>}
      {s.done.map(r => <TodoRowView key={r.todo.id} row={r} />)}
    </div>
  )
}

/** The capture box (N, or the Todos tab's ＋): a name and Enter, over whatever is on screen; nothing else moves. */
export function TodoCapture() {
  const open = useUi(s => s.captureOpen)
  if (!open) return null
  const close = () => ui.setCapture(false)
  return (
    <div className="todo-capture-scrim" onPointerDown={e => { if (e.target === e.currentTarget) close() }}>
      <div className="todo-capture glow-box" role="dialog" aria-label="Add a todo">
        <AddBox autoFocus onAdded={close} onCancel={close} />
      </div>
    </div>
  )
}
