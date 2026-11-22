// The Agenda's Todos tab (docs/prd_todos.md §6; domain/todos todoSections):
//   [ Add a todo… (laundry 4p 20m) ]
//   Now:          rang and not done: the counting one first ("25m", ✓), then waiting ones
//                 ("since 7:00a", Done, Later).
//   Today:        scheduled later today, in time order (time, length, ⟳ for repeats).
//   Upcoming:     after today (folded past a week, as the Alarms tab's are).
//   Unscheduled:  drag to reorder; Schedule on each.
//   Done:         the last day's done, won't do and passed, newest first, "4 done today".
// A waiting row (its time came, not started) has ▶ Start; the ⋯ has Start now for one not due yet.
// A row's box is its Done (a done one's box opens it again); a tap on the row goes to its instant
// on the timeline, or, unscheduled, opens Schedule (the drawer stays). Its ⋯ has Rename, Won't do,
// Delete and its Duration (quick lengths, "—" for none, or typed). Copy states facts, never
// judgements (config/labels TODO_COPY): "since 7:00a", "passed", "31m · planned 20m"; no red for
// open todos.
import { memo, useEffect, useMemo, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent, ReactNode } from 'react'
import { Bars2Icon, ClockIcon, EllipsisHorizontalIcon, PencilIcon, PlayIcon, PlusIcon, TrashIcon } from '@heroicons/react/20/solid'
import { LiveText } from '../../engine/LiveText.tsx'
import { useFrameValue } from '../../engine/hooks.ts'
import { MARKS, TODO_COPY } from '../../config/labels.ts'
import type { TodoRow } from '../../domain/todos.ts'
import { TODO_DURATIONS_MIN, instantsOf, parseTodoInput, parseWhen, quickChoices, todoActual, todoInputAt, todoReading } from '../../domain/todos.ts'
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
        placeholder="Add a todo… (laundry 4p 20m)"
        aria-label="Add a todo: a name, and maybe a time, a length or a repeat"
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
// When: Schedule (an unscheduled one) and Later (one with a time)

/** Quick times (In 15m, In 1h, Tonight, Tomorrow), a typed "when" ("3p", "1h30", "tomorrow 9a"), or the time entry (a date). */
function WhenPanel({ todoId, verb, onClose }: { todoId: string; verb: 'Schedule' | 'Later'; onClose: () => void }) {
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
        <IconButton icon={ClockIcon} label="Pick a time and date" color="var(--c-cursor)" bare pressed={picking} onClick={() => setPicking(p => !p)} />
        {verb === 'Later' && <button type="button" className="alarm-link glow-box" onClick={() => { act.backToList(todoId); onClose() }}>Back to the list</button>}
      </div>
      <form className="todo-when__typed" onSubmit={e => { e.preventDefault(); if (typed !== null) put(typed) }}>
        <input className="alarm-custom__input mono" value={text} onChange={e => setText(e.target.value)}
          onKeyDown={e => { e.stopPropagation(); if (e.key === 'Escape') onClose() }}
          placeholder="When… 3p, 1h30, tomorrow 9a" aria-label={`${verb}: when`} aria-invalid={text !== '' && typed === null} autoComplete="off" />
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

/** A row's other tools: rename, start now, not a todo, won't do, delete (a second tap), and its duration. */
function MoreMenu({ row, onClose, onRename }: { row: TodoRow; onClose: () => void; onRename: () => void }) {
  const [lengthText, setLengthText] = useState('')
  const [confirm, setConfirm] = useState(false)
  const typed = lengthText.trim() ? parseTimerInput(lengthText) : null
  const id = row.todo.id
  const current = row.todo.durationMs ?? null
  const setLength = (ms: number | null) => { act.setTodoLength(id, ms); onClose() }
  return (
    <div className="todo-when todo-more" onClick={e => e.stopPropagation()}>
      <div className="todo-when__chips">
        <button type="button" className="alarm-link glow-box" onClick={() => { onRename(); onClose() }}><PencilIcon aria-hidden /> Rename</button>
        {/* Start it early (a waiting one has ▶ Start on its row). */}
        {(row.state === 'scheduled' || row.state === 'unscheduled') && (
          <button type="button" className="alarm-link alarm-link--start glow-box" onClick={() => { act.startTodo(id); onClose() }}><PlayIcon aria-hidden /> Start now</button>
        )}
        {/* Not a todo: its instant stays on the timeline as a plain one (alarms and all). */}
        {row.todo.status === 'open' && row.at && (
          <button type="button" className="alarm-link glow-box" onClick={() => { act.untodo(row.at!.id); onClose() }}
            title="Keep it on the timeline as a plain instant, with its alarms"><NotTodoIcon aria-hidden /> Not a todo</button>
        )}
        {row.todo.status === 'open' && <button type="button" className="alarm-link alarm-link--wont glow-box" onClick={() => { act.wontDoTodo(id); onClose() }}>{TODO_COPY.dropped[0].toUpperCase() + TODO_COPY.dropped.slice(1)}</button>}
        {confirm
          ? <button type="button" className="alarm-link alarm-link--danger glow-box" onClick={() => act.deleteTodo(id)}>Delete todo</button>
          : <IconButton icon={TrashIcon} label="Delete todo (tap again)" color="var(--c-danger)" bare onClick={() => setConfirm(true)} />}
      </div>
      {row.todo.status === 'open' && (
        <div className="todo-dur-pick" role="group" aria-labelledby={`dur-${id}`}>
          <span className="todo-dur-pick__label" id={`dur-${id}`}><StopwatchIcon aria-hidden className="todo-dur__icon" />Duration</span>
          <div className="todo-when__chips">
            <button type="button" className={`alarm-link glow-box${current === null ? ' is-on' : ''}`} aria-pressed={current === null}
              aria-label="No duration" title="No duration" onClick={() => setLength(null)}>—</button>
            {TODO_DURATIONS_MIN.map(min => (
              <button key={min} type="button" className={`alarm-link glow-box${current === min * MINUTE ? ' is-on' : ''}`} aria-pressed={current === min * MINUTE}
                onClick={() => setLength(min * MINUTE)}>{length(min * MINUTE)}</button>
            ))}
          </div>
          <form className="todo-when__typed" onSubmit={e => { e.preventDefault(); if (typed !== null) setLength(typed) }}>
            <label className="todo-dur-pick__typed">
              <span>Duration</span>
              <input className="alarm-custom__input mono" value={lengthText} onChange={e => setLengthText(e.target.value)}
                onKeyDown={e => { e.stopPropagation(); if (e.key === 'Escape') onClose() }}
                placeholder={current !== null && !TODO_DURATIONS_MIN.some(m => m * MINUTE === current) ? formatDuration(current, { exact: true }) : '25m, 1h15'}
                aria-invalid={lengthText.trim() !== '' && typed === null} autoComplete="off" />
            </label>
            <button type="submit" className="alarm-link alarm-link--go glow-box" disabled={typed === null}>Set</button>
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
  const open = todo.status === 'open'
  // Made from an unnamed instant: it reads as its time, as the instant does.
  const name = todo.label || (at ? clock(at.tsEpochMs) : '')
  const dur = todo.durationMs ? <Duration ms={todo.durationMs} /> : null
  const sub: ReactNode = (() => {
    if (state === 'waiting' && at) return dotted([TODO_COPY.since(clock(at.tsEpochMs)), dur])
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
      <div className={`todo-row glow-box is-${state}${flare ? ' is-celebrating' : ''}`} role="button" tabIndex={0} data-todo={todo.id}
        onClick={tap} onKeyDown={e => { if (e.key === 'Enter' && e.target === e.currentTarget) tap() }}>
        {/* Its box: Done (a closed one's opens it again). */}
        <button type="button" className={`todo-check is-${open ? 'open' : todo.status}`}
          aria-label={open ? `Done: ${name}` : `Open ${name} again`} title={open ? 'Done' : 'Open it again'}
          onClick={e => { e.stopPropagation(); if (open) act.doneTodo(todo.id); else act.reopenTodo(todo.id) }}>
          <TodoBoxIcon state={open ? 'open' : (todo.status as 'done' | 'passed' | 'dropped')} aria-hidden />
        </button>
        <span className="todo-row__main">
          {renaming ? (
            <span onClick={e => e.stopPropagation()}>
              <InlineInput initial={todo.label} ariaLabel="Todo name" onCommit={v => { act.renameTodo(todo.id, v); setRenaming(false) }} onCancel={() => setRenaming(false)} />
            </span>
          ) : <span className="todo-row__name">{name}</span>}
          {state === 'counting' ? (
            <LiveText className="todo-row__sub mono" watch={bySecond}
              compute={f => [length(todoActual(mine, spans, f.now).ms), todo.durationMs ? TODO_COPY.planned(length(todo.durationMs)) : ''].filter(Boolean).join(' · ')} />
          ) : sub !== null ? (
            sub && <span className="todo-row__sub">{sub}</span>
          ) : (
            <span className="todo-row__sub">{todoReading(todo, todoActual(mine, spans, Date.now()), length)}</span>
          )}
        </span>
        <span className="todo-row__tools" onClick={e => e.stopPropagation()}>
          {/* Its time came and it isn't counting (silenced, unanswered, or no alarm): ▶ Start counts from now. */}
          {state === 'waiting' && (
            <button type="button" className="todo-btn todo-btn--start glow-box" aria-label={`Start: ${name}`} title="Start: it counts from now until you tap ✓"
              onClick={() => act.startTodo(todo.id)}><PlayIcon aria-hidden /> Start</button>
          )}
          {open && state !== 'counting' && (
            <button type="button" className={`todo-btn glow-box${panel === 'when' ? ' is-on' : ''}`} onClick={() => setPanel(p => (p === 'when' ? null : 'when'))}>
              {state === 'unscheduled' ? 'Schedule' : 'Later'}
            </button>
          )}
          <IconButton icon={EllipsisHorizontalIcon} label="More" color="var(--ink-dim)" bare pressed={panel === 'more'} onClick={() => setPanel(p => (p === 'more' ? null : 'more'))} />
          {drag && <span className="todo-row__grip" aria-label="Drag to reorder" onPointerDown={drag} data-no-pan><Bars2Icon aria-hidden /></span>}
        </span>
      </div>
      {panel === 'when' && <WhenPanel todoId={todo.id} verb={state === 'unscheduled' ? 'Schedule' : 'Later'} onClose={() => setPanel(null)} />}
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
  const near = s.upcoming.filter(r => (r.at?.tsEpochMs ?? 0) - now <= UPCOMING_SHOWN_MS)
  const upcoming = showAll ? s.upcoming : near
  const empty = s.now.length + s.today.length + s.upcoming.length + s.unscheduled.length + s.done.length === 0
  return (
    <div className="todos-list alarms-list">
      <AddBox />
      {empty && <p className="alarms-empty">No todos yet. Type one above and press Enter, or press <b>N</b> anywhere. Add a time ("3p") to be reminded, a length ("20m") to plan it.</p>}
      {s.now.length > 0 && <h3 className="alarms-list__head">Now</h3>}
      {s.now.map(r => <TodoRowView key={r.todo.id} row={r} />)}
      {s.today.length > 0 && <h3 className="alarms-list__head">Today</h3>}
      {s.today.map(r => <TodoRowView key={r.todo.id} row={r} />)}
      {s.upcoming.length > 0 && <h3 className="alarms-list__head">Upcoming</h3>}
      {upcoming.map(r => <TodoRowView key={r.todo.id} row={r} />)}
      {s.upcoming.length > near.length && (
        <button type="button" className="alarm-link todo-more-btn" onClick={() => setShowAll(v => !v)}>
          {showAll ? 'Fewer' : `${s.upcoming.length - near.length} later`}
        </button>
      )}
      {s.unscheduled.length > 0 && <h3 className="alarms-list__head">Unscheduled</h3>}
      {s.unscheduled.length > 0 && <UnscheduledRows rows={s.unscheduled} />}
      {s.done.length > 0 && <h3 className="alarms-list__head">Done{s.doneToday > 0 ? ` · ${TODO_COPY.doneToday(s.doneToday)}` : ''}</h3>}
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
