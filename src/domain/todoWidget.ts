// What the Android app's todo widgets get (docs/prd_todo_import_widgets.md §3–4). Pure.
//
// The page owns the todos, so it writes a snapshot to the app (services/native/todoWidgetSync)
// whenever they change; the list widget filters it itself (TodoWidgetFilter.java: by status and
// how many days ahead), so it stays right across midnight and as its settings change without
// the page running. What a widget asks for in return (a todo ticked done, text to add, a todo to
// open) waits in the app until the page drains it (`sanitizeInbox`).
import type { InstantRecord } from './entities.ts'
import type { TodoRecord } from './todos.ts'
import { countingInstant, instantsOf, todoAt, todoState } from './todos.ts'
import { DAY } from './time.ts'

export interface WidgetTodo {
  id: string
  label: string
  /** open, done, dropped (won't do), passed. */
  status: TodoRecord['status']
  /** Its `at` (when), for an open one with a time. */
  at?: number
  /** Its time as the app writes it ("4:00p", "16:00"), so the widget follows the 12/24-hour setting. */
  clock?: string
  /** Counting now (▶ started, not ⏸ or ✓). */
  counting?: boolean
  /** Back on the list with time worked (⏸). */
  paused?: boolean
  durationMs?: number
  /** Its place in the Unscheduled list. */
  order: number
  closedAt?: number
  /** A repeat's occurrence. */
  repeats?: boolean
}

export interface WidgetSnapshot {
  v: 1
  /** When it was written. */
  written: number
  todos: WidgetTodo[]
}

/** Closed todos stay in the snapshot this long (the widget's Done shows today's). */
const DONE_KEPT_MS = 2 * DAY
/** At most this many go to the app (a widget shows a screenful). */
const MAX_TODOS = 400

/** The snapshot for the widgets: open todos, and those closed in the last two days. */
export function widgetSnapshot(
  todos: readonly TodoRecord[], byTodo: ReadonlyMap<string, readonly InstantRecord[]>, now: number, clock: (ts: number) => string,
): WidgetSnapshot {
  const out: WidgetTodo[] = []
  for (const t of todos) {
    if (t.status !== 'open' && (t.closedAt ?? 0) < now - DONE_KEPT_MS) continue
    const mine = instantsOf(byTodo, t.id)
    const state = todoState(t, mine, now)
    const at = t.status === 'open' ? todoAt(mine) : undefined
    out.push({
      id: t.id,
      label: t.label || (at ? clock(at.tsEpochMs) : ''),
      status: t.status,
      ...(at ? { at: at.tsEpochMs, clock: clock(at.tsEpochMs) } : {}),
      ...(t.status === 'open' && countingInstant(mine, now, t.startedId) ? { counting: true } : {}),
      ...(state === 'paused' ? { paused: true } : {}),
      ...(t.durationMs ? { durationMs: t.durationMs } : {}),
      order: t.order,
      ...(t.closedAt !== undefined && t.status !== 'open' ? { closedAt: t.closedAt } : {}),
      ...(t.seriesId ? { repeats: true } : {}),
    })
  }
  // Nearest first, so a long list keeps what a widget shows.
  out.sort((a, b) => rank(a) - rank(b))
  return { v: 1, written: now, todos: out.slice(0, MAX_TODOS) }
}

const rank = (t: WidgetTodo) => (t.status !== 'open' ? 3e15 - (t.closedAt ?? 0) : t.at ?? 2e15 + t.order)

/** What the widgets asked for while the page wasn't looking. */
export interface WidgetInbox {
  /** Text from quick add, oldest first. */
  adds: string[]
  /** Todos ticked done on the list widget, when. */
  dones: { id: string; at: number }[]
  /** A todo to open ('' for the Todos tab), from a tap on a widget. */
  open: string | null
}

/** The inbox as the app hands it over (untrusted shape). */
export function sanitizeInbox(raw: unknown): WidgetInbox {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const list = (v: unknown) => (Array.isArray(v) ? v : [])
  const adds = list(r.adds).flatMap(a => {
    const text = a && typeof a === 'object' ? (a as Record<string, unknown>).text : a
    return typeof text === 'string' && text.trim() ? [text.trim().slice(0, 5000)] : []
  })
  const dones = list(r.dones).flatMap(d => {
    const o = (d && typeof d === 'object' ? d : {}) as Record<string, unknown>
    return typeof o.id === 'string' && o.id && typeof o.at === 'number' && Number.isFinite(o.at) ? [{ id: o.id, at: o.at }] : []
  })
  return { adds, dones, open: typeof r.open === 'string' ? r.open : null }
}
