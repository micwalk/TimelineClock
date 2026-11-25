// Todos (docs/prd_todos.md, Phase 1). Pure.
//
// A todo is a record of a thing to do: a name, maybe a length (its estimate), open or done. It
// holds no times. What it puts in time is ordinary instants (and the spans between them), each
// carrying the todo's id and its part (`InstantRecord.todo`): `at` (when it is to be done; holds
// the alarms), `was` (an earlier `at` that rang before it went back to the list), `done` (where
// it was finished, "✓ ‹name›"). Phase 3 adds `start` and `pause`. Nothing on the record points
// back, so moving or deleting an instant never leaves it out of step (as a series' occurrences
// point at their series).
//
// The record is the plan; what is saved is what happened. A scheduled todo with a length draws a
// planned block (domain/blocks) computed from the record, never stored. Its stretches (time
// actually worked) are the spans between its own instants, made by the favorite's stop.
import { TODO_COPY } from '../config/labels.ts'
import type { InstantRecord, SpanRecord } from './entities.ts'
import type { TimeBlock } from './blocks.ts'
import type { GroupRecord, Repeat } from './series.ts'
import { EVERY_DAY, WEEKDAYS, WEEKENDS, dateKey } from './series.ts'
import type { AlarmTime } from './alarmPicker.ts'
import { hour24, isAmbiguous, nextAt, parseAlarmTime, soonerIsPm } from './alarmPicker.ts'
import { parseTimerInput } from './quickCreate.ts'
import { DAY, MINUTE } from './time.ts'

export type TodoStatus = 'open' | 'done' | 'dropped' | 'passed'

export type { TodoLink, TodoRole } from './entities.ts'
export { sanitizeTodoLink } from './entities.ts'
const STATUSES: readonly string[] = ['open', 'done', 'dropped', 'passed'] satisfies TodoStatus[]

export interface TodoRecord {
  id: string
  label: string
  createdAt: number
  /** The estimate: the plan. Drawn as a planned block once scheduled; never stored as a span. */
  durationMs?: number
  status: TodoStatus
  /** Its place in the Unscheduled list. */
  order: number
  /** When it stopped being open (done, won't do, passed), for the Todos tab's Done list. */
  closedAt?: number
  /** Its group (domain/collections); absent = Default. Its instants follow it. */
  collectionId?: string
  /** An occurrence of a repeating todo: the series and its date. */
  seriesId?: string
  occurrence?: string
  /**
   * The instant it counts from (its `at` or a ▶ `start`; act.startTodo), until ⏸ or ✓. It counts
   * on if that instant's favorite is taken off (its lane hidden; owner, 2026-11-22), so ✓ or ⏸
   * still saves the stretch.
   */
  startedId?: string
  /**
   * Time worked that isn't on the timeline (owner 2026-11-25): typed into its panel ("Worked
   * [25m]") without saying when. It counts in what it took; "Put on the timeline" turns it into a
   * stretch (a ▶ and a ⏸ instant and the span between them) at the cursor or a typed time.
   */
  extraMs?: number
}

/** The most extra time a todo holds (a typo's 999h stays out). */
export const MAX_EXTRA_MS = 1000 * 60 * MINUTE

/** Its extra time after adding `ms` (negative takes some away); undefined once none is left. */
export function addExtra(current: number | undefined, ms: number): number | undefined {
  const next = Math.min(MAX_EXTRA_MS, Math.max(0, (current ?? 0) + ms))
  return next > 0 ? Math.round(next) : undefined
}

const randomId = () => Math.random().toString(36).slice(2, 11)
export const newTodoId = () => `t_${randomId()}`

/** The longest length a todo takes (as a timer's). */
const MAX_LENGTH_MS = 100 * 60 * MINUTE

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/

/** The well-formed todo records in untrusted JSON (storage or an imported file), with distinct ids. */
export function sanitizeTodos(data: unknown): TodoRecord[] {
  if (!Array.isArray(data)) return []
  const seen = new Set<string>()
  return data.flatMap((x, k): TodoRecord[] => {
    if (!x || typeof x !== 'object') return []
    const r = x as Record<string, unknown>
    if (typeof r.id !== 'string' || !r.id || seen.has(r.id)) return []
    seen.add(r.id)
    const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined)
    const length = num(r.durationMs)
    const extra = num(r.extraMs)
    const closedAt = num(r.closedAt)
    const series = typeof r.seriesId === 'string' && r.seriesId && typeof r.occurrence === 'string' && DATE_KEY.test(r.occurrence)
    return [{
      id: r.id,
      label: typeof r.label === 'string' ? r.label : '',
      createdAt: num(r.createdAt) ?? 0,
      ...(length !== undefined && length > 0 ? { durationMs: Math.min(length, MAX_LENGTH_MS) } : {}),
      status: typeof r.status === 'string' && STATUSES.includes(r.status) ? r.status as TodoStatus : 'open',
      order: num(r.order) ?? k,
      ...(closedAt !== undefined ? { closedAt } : {}),
      ...(typeof r.collectionId === 'string' && r.collectionId && r.collectionId !== 'default' ? { collectionId: r.collectionId } : {}),
      ...(series ? { seriesId: r.seriesId as string, occurrence: r.occurrence as string } : {}),
      ...(typeof r.startedId === 'string' && r.startedId ? { startedId: r.startedId } : {}),
      ...(extra !== undefined && extra > 0 ? { extraMs: Math.min(extra, MAX_EXTRA_MS) } : {}),
    }]
  })
}

/** A new open todo. */
export function makeTodo(p: { label: string; durationMs?: number; collectionId?: string; seriesId?: string; occurrence?: string }, id: string, now: number, order: number): TodoRecord {
  return {
    id,
    label: p.label,
    createdAt: now,
    ...(p.durationMs && p.durationMs > 0 ? { durationMs: Math.min(p.durationMs, MAX_LENGTH_MS) } : {}),
    status: 'open',
    order,
    ...(p.collectionId && p.collectionId !== 'default' ? { collectionId: p.collectionId } : {}),
    ...(p.seriesId && p.occurrence ? { seriesId: p.seriesId, occurrence: p.occurrence } : {}),
  }
}

/** The next place at the end of the Unscheduled list. */
export const nextOrder = (todos: readonly TodoRecord[]) => todos.reduce((m, t) => Math.max(m, t.order + 1), 0)

/** An order before every other (a paused todo goes back to the top of the list). */
export const firstOrder = (todos: readonly TodoRecord[]) => todos.reduce((m, t) => Math.min(m, t.order - 1), 0)

// ---------------------------------------------------------------------------
// A todo's instants and what they say

/** Each todo's instants (by todo id), in time order. */
export function instantsByTodo(instants: readonly InstantRecord[]): Map<string, InstantRecord[]> {
  const out = new Map<string, InstantRecord[]>()
  for (const i of instants) {
    if (!i.todo) continue
    const list = out.get(i.todo.id)
    if (list) list.push(i)
    else out.set(i.todo.id, [i])
  }
  for (const list of out.values()) list.sort((a, b) => a.tsEpochMs - b.tsEpochMs)
  return out
}

const NONE: readonly InstantRecord[] = []
/** A todo's instants from the index. */
export const instantsOf = (byTodo: ReadonlyMap<string, readonly InstantRecord[]>, id: string): readonly InstantRecord[] => byTodo.get(id) ?? NONE

/** When it is to be done: its `at` instant (at most one). */
export const todoAt = (mine: readonly InstantRecord[]) => mine.find(i => i.todo?.role === 'at')

/** Where it was done. */
export const todoDoneInstant = (mine: readonly InstantRecord[]) => [...mine].reverse().find(i => i.todo?.role === 'done')

/**
 * The instant the todo is counting from, if any: its `startedId` (favorited or not), else (a
 * todo started before `startedId` was kept) its favorited `at` or `start`, its time come.
 */
export function countingInstant(mine: readonly InstantRecord[], now: number, startedId?: string): InstantRecord | undefined {
  const role = (i: InstantRecord) => i.todo?.role === 'at' || i.todo?.role === 'start'
  // Started counts whatever the clock says (the Todos tab reads the time to the minute, and a
  // start is made at Now).
  const started = startedId ? mine.find(i => i.id === startedId) : undefined
  if (started && role(started)) return started
  return mine.find(i => role(i) && !!i.favorite && i.tsEpochMs <= now)
}

/**
 * Where a todo stands, from the record and its instants:
 * - unscheduled: open, no `at`;
 * - scheduled: open, its `at` still ahead;
 * - counting: open, its `at` favorited (dismissed: its span to Now counts);
 * - paused: open, ⏸ paused, back on the list (no `at`; owner, 2026-11-22: at the top of Unscheduled);
 * - waiting: open, its `at` has come, not counting (rang and silenced, or unfavorited);
 * - done / dropped / passed: the record's status.
 */
export type TodoState = 'unscheduled' | 'scheduled' | 'counting' | 'paused' | 'waiting' | 'done' | 'dropped' | 'passed'

export function todoState(todo: TodoRecord, mine: readonly InstantRecord[], now: number): TodoState {
  if (todo.status !== 'open') return todo.status
  if (countingInstant(mine, now, todo.startedId)) return 'counting'
  const at = todoAt(mine)
  if (at) return at.tsEpochMs > now ? 'scheduled' : 'waiting'
  return mine.some(i => i.todo?.role === 'pause') ? 'paused' : 'unscheduled'
}

/** Open todos that rang and aren't done: counting or waiting (the Todos tab's Now, and its badge). */
export const isNowState = (s: TodoState) => s === 'counting' || s === 'waiting'

/**
 * One stretch of time worked on a todo: a span between two of its own instants (▶ or its `at`
 * to ⏸ or ✓), or the one counting now (`end` null, `spanId` its span to Now if it has one).
 */
export interface TodoStretch { spanId?: string; start: number; end: number | null }

/** Its stretches, in time order (the one counting now last). */
export function todoStretches(mine: readonly InstantRecord[], spans: readonly SpanRecord[], now: number, startedId?: string): TodoStretch[] {
  const byId = new Map(mine.map(i => [i.id, i]))
  const counting = countingInstant(mine, now, startedId)
  const out: TodoStretch[] = []
  for (const sp of spans) {
    const a = byId.get(sp.startInstantId)
    if (!a || sp.endIsNow) continue
    const b = byId.get(sp.endInstantId)
    if (!b) continue
    out.push({ spanId: sp.id, start: Math.min(a.tsEpochMs, b.tsEpochMs), end: Math.max(a.tsEpochMs, b.tsEpochMs) })
  }
  out.sort((x, y) => x.start - y.start)
  if (counting) {
    const live = spans.find(sp => sp.endIsNow && sp.startInstantId === counting.id)
    out.push({ ...(live ? { spanId: live.id } : {}), start: counting.tsEpochMs, end: null })
  }
  return out
}

/** Whether it has been worked on: a stretch saved, or one counting now (owner, 2026-11-22: then it can't stop being a todo). */
export const hasStretches = (mine: readonly InstantRecord[], spans: readonly SpanRecord[], now: number, startedId?: string) =>
  todoStretches(mine, spans, now, startedId).length > 0

/**
 * Time actually worked: its stretches (spans between its own instants), the one counting now, and
 * its extra time (worked, not on the timeline; `extraMs` only when there is some).
 */
export interface TodoActual { ms: number; stretches: number; counting: boolean; extraMs?: number }

export function todoActual(mine: readonly InstantRecord[], spans: readonly SpanRecord[], now: number, startedId?: string, extraMs?: number): TodoActual {
  const list = todoStretches(mine, spans, now, startedId)
  const extra = extraMs && extraMs > 0 ? extraMs : 0
  return {
    ms: list.reduce((sum, s) => sum + Math.max(0, (s.end ?? now) - s.start), 0) + extra,
    stretches: list.length,
    counting: list.some(s => s.end === null),
    ...(extra > 0 ? { extraMs: extra } : {}),
  }
}

/**
 * Where extra time goes on the timeline, typed in its panel: a clock time ("2p", "1430") is where
 * it starts, the latest such time at or before `now` (it is history); "until 3p" (or "to", "till",
 * "ending") is where it ends. Returns the stretch, or null when it doesn't read.
 */
export function parsePlaceTime(text: string, extraMs: number, now: number): { start: number; end: number } | null {
  let t = text.trim().toLowerCase()
  const until = /^(until|till|til|to|ending|ends?)\b\s*/.exec(t)
  if (until) t = t.slice(until[0].length)
  t = t.replace(/^(from|at|start(s|ed)?)\b\s*/, '')
  const time = parseAlarmTime(t)
  if (!time || extraMs <= 0) return null
  // An ambiguous 1–12 takes whichever of AM/PM was latest before now.
  const latest = (pm: boolean) => {
    const d = new Date(now)
    const at = new Date(d.getFullYear(), d.getMonth(), d.getDate(), hour24(time, pm), time.m).getTime()
    return at <= now ? at : new Date(d.getFullYear(), d.getMonth(), d.getDate() - 1, hour24(time, pm), time.m).getTime()
  }
  const at = isAmbiguous(time) ? Math.max(latest(false), latest(true)) : latest(false)
  return until ? { start: at - extraMs, end: at } : { start: at, end: at + extraMs }
}

/**
 * How it went, in words: "31m", "31m in 2 stretches", "31m · planned 20m", "done · planned 20m"
 * (done straight away), "passed", "won't do". `length` formats a length ("31m").
 */
export function todoReading(todo: TodoRecord, actual: TodoActual, length: (ms: number) => string): string {
  const parts: string[] = []
  if (actual.stretches > 0 || actual.extraMs) parts.push(actual.stretches > 1 ? `${length(actual.ms)} ${TODO_COPY.stretches(actual.stretches)}` : length(actual.ms))
  else if (todo.status === 'done') parts.push(TODO_COPY.done)
  if (todo.status === 'passed') parts.push(TODO_COPY.passed)
  if (todo.status === 'dropped') parts.push(TODO_COPY.dropped)
  if (todo.durationMs) parts.push(TODO_COPY.planned(length(todo.durationMs)))
  return parts.join(' · ')
}

// ---------------------------------------------------------------------------
// The Todos tab

export interface TodoRow {
  todo: TodoRecord
  state: TodoState
  at?: InstantRecord
}

export interface TodoSections {
  /** Counting now (owner, 2026-11-22: "Active"), the earliest begun first. */
  active: TodoRow[]
  /** Rang and not done, not counting: waiting. */
  now: TodoRow[]
  /** Scheduled later today, in time order. */
  today: TodoRow[]
  /** Scheduled after today. */
  upcoming: TodoRow[]
  /** No time yet (paused ones too), in their order. */
  unscheduled: TodoRow[]
  /** Done, won't do and passed in the last day, newest first. */
  done: TodoRow[]
  /** Done today (the Done section's head). */
  doneToday: number
}

/** The Todos tab's sections. Day boundaries are local (the device's calendar). */
export function todoSections(todos: readonly TodoRecord[], byTodo: ReadonlyMap<string, readonly InstantRecord[]>, now: number): TodoSections {
  const out: TodoSections = { active: [], now: [], today: [], upcoming: [], unscheduled: [], done: [], doneToday: 0 }
  const today = dateKey(now)
  for (const todo of todos) {
    const mine = instantsOf(byTodo, todo.id)
    const state = todoState(todo, mine, now)
    const at = todoAt(mine)
    const row: TodoRow = { todo, state, ...(at ? { at } : {}) }
    if (state === 'counting') out.active.push(row)
    else if (state === 'waiting') out.now.push(row)
    else if (state === 'scheduled') (at && dateKey(at.tsEpochMs) === today ? out.today : out.upcoming).push(row)
    else if (state === 'unscheduled' || state === 'paused') out.unscheduled.push(row)
    else {
      const closed = todo.closedAt ?? todo.createdAt
      if (closed >= now - DAY) out.done.push(row)
      if (state === 'done' && dateKey(closed) === today) out.doneToday++
    }
  }
  const atTs = (r: TodoRow) => r.at?.tsEpochMs ?? Infinity
  out.active.sort((a, b) => atTs(a) - atTs(b))
  out.now.sort((a, b) => atTs(a) - atTs(b))
  out.today.sort((a, b) => atTs(a) - atTs(b))
  out.upcoming.sort((a, b) => atTs(a) - atTs(b))
  out.unscheduled.sort((a, b) => a.todo.order - b.todo.order)
  out.done.sort((a, b) => (b.todo.closedAt ?? 0) - (a.todo.closedAt ?? 0))
  return out
}

/** How many todos rang and aren't done (the badge on the Todos tab and the ☰). */
export function nowCount(todos: readonly TodoRecord[], byTodo: ReadonlyMap<string, readonly InstantRecord[]>, now: number): number {
  let n = 0
  for (const t of todos) if (t.status === 'open' && isNowState(todoState(t, instantsOf(byTodo, t.id), now))) n++
  return n
}

/** The moment the Now count can next change by itself (an `at` arriving), or null. */
export function nextNowChange(todos: readonly TodoRecord[], byTodo: ReadonlyMap<string, readonly InstantRecord[]>, now: number): number | null {
  let best: number | null = null
  for (const t of todos) {
    if (t.status !== 'open') continue
    const at = todoAt(instantsOf(byTodo, t.id))
    if (at && at.tsEpochMs > now && (best === null || at.tsEpochMs < best)) best = at.tsEpochMs
  }
  return best
}

// ---------------------------------------------------------------------------
// Repeating todos: a series marked as todos (SeriesRecord.todo) gives each occurrence it makes a
// record of its own. An occurrence still open when the series' next one arrives is passed.

/** Occurrences just made: those of a todo series get their own record and become its `at`. */
export function todoOccurrences(made: readonly InstantRecord[], groups: readonly GroupRecord[], newId: () => string, now: number):
  { instants: InstantRecord[]; todos: TodoRecord[] } {
  const byId = new Map(groups.map(g => [g.id, g]))
  const todos: TodoRecord[] = []
  const instants = made.map(i => {
    const s = i.seriesId ? byId.get(i.seriesId) : undefined
    if (!s?.todo || !i.occurrence || i.todo) return i
    const t = makeTodo({ label: s.label, durationMs: s.todo.durationMs, collectionId: s.collectionId, seriesId: s.id, occurrence: i.occurrence }, newId(), now, 0)
    todos.push(t)
    return { ...i, todo: { id: t.id, role: 'at' as const } }
  })
  return { instants, todos }
}

/** The arrival times of each series' stored occurrences, by series, in date order. */
function occurrenceTimes(instants: readonly InstantRecord[]): Map<string, { date: string; ts: number }[]> {
  const out = new Map<string, { date: string; ts: number }[]>()
  for (const i of instants) {
    if (!i.seriesId || !i.occurrence || i.virtual) continue
    const list = out.get(i.seriesId)
    if (list) list.push({ date: i.occurrence, ts: i.tsEpochMs })
    else out.set(i.seriesId, [{ date: i.occurrence, ts: i.tsEpochMs }])
  }
  for (const list of out.values()) list.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
  return out
}

/** When an open repeating todo's next occurrence arrives (it is passed then), or undefined. */
function nextArrival(todo: TodoRecord, times: Map<string, { date: string; ts: number }[]>): number | undefined {
  if (todo.status !== 'open' || !todo.seriesId || !todo.occurrence) return undefined
  return times.get(todo.seriesId)?.find(o => o.date > todo.occurrence!)?.ts
}

/** Open repeating todos whose series' next occurrence has arrived: they are passed. */
export function passedTodos(todos: readonly TodoRecord[], instants: readonly InstantRecord[], now: number): string[] {
  const times = occurrenceTimes(instants)
  return todos.filter(t => { const ts = nextArrival(t, times); return ts !== undefined && ts <= now }).map(t => t.id)
}

/** When the next open repeating todo is passed (to check again then), or null. */
export function nextPassTime(todos: readonly TodoRecord[], instants: readonly InstantRecord[], now: number): number | null {
  const times = occurrenceTimes(instants)
  let best: number | null = null
  for (const t of todos) {
    const ts = nextArrival(t, times)
    if (ts !== undefined && ts > now && (best === null || ts < best)) best = ts
  }
  return best
}

// ---------------------------------------------------------------------------
// On the timeline

/** A plan still to come or under way: scheduled, waiting or counting (a plan that is over isn't history). */
const planShows = (s: TodoState) => s === 'scheduled' || s === 'waiting' || s === 'counting' || s === 'paused'

/** Each open todo with a length and a time: its planned block, from `at` for its length (computed, never stored). */
export function plannedBlocks(todos: readonly TodoRecord[], byTodo: ReadonlyMap<string, readonly InstantRecord[]>, now: number): TimeBlock[] {
  const out: TimeBlock[] = []
  for (const t of todos) {
    if (!t.durationMs || t.status !== 'open') continue
    const mine = instantsOf(byTodo, t.id)
    const at = todoAt(mine)
    if (!at || !planShows(todoState(t, mine, now))) continue
    out.push({ key: `plan:${t.id}`, start: at.tsEpochMs, end: at.tsEpochMs + t.durationMs, label: t.label, look: 'planned', instantId: at.id })
  }
  return out
}

/**
 * A ✓ close to its todo folds into it (as a bell folds into its chip): `at` instant id → the
 * `done` instant drawn in its chip, for pairs both in `shown` closer than `maxPx` along the
 * time axis. `keep`: instants that always keep their own chip (selected, focused, ...).
 */
export function doneFolds(shown: readonly InstantRecord[], pos: (ts: number) => number, maxPx: number, keep: (id: string) => boolean): Record<string, string> {
  if (maxPx <= 0) return {}
  const ats = new Map<string, InstantRecord>()
  for (const i of shown) if (i.todo?.role === 'at') ats.set(i.todo.id, i)
  const out: Record<string, string> = {}
  for (const d of shown) {
    if (d.todo?.role !== 'done' || keep(d.id)) continue
    const at = ats.get(d.todo.id)
    if (at && !(at.id in out) && Math.abs(pos(d.tsEpochMs) - pos(at.tsEpochMs)) < maxPx) out[at.id] = d.id
  }
  return out
}

// ---------------------------------------------------------------------------
// Making todos: the Add box ("book appt 3p", "laundry 20m", "laundry 4p 20m", "feed cats 7a daily")

export interface TodoInput {
  label: string
  /** A time of day typed with it ("3p", "at 7", "15:30"). */
  time?: AlarmTime
  /** "today", "tonight", "tomorrow". */
  day?: 'today' | 'tonight' | 'tomorrow'
  durationMs?: number
  /** "daily", "weekdays", "weekends", "every 3 days" (only with a time: a series needs one). */
  repeat?: Repeat
}

/** A length with its unit: "20m", "1h", "1h30", "45min", "2 hours" is two words and isn't one. */
const LENGTH_TOKEN = /^\d+(?:\.\d+)?(?:h(?:\d{1,2}m?)?|hrs?|hours?|m|mins?|minutes?)$/
/** A time that can't be anything else: "3p", "3pm", "3:30p", "15:30", "7:05am". */
const TIME_TOKEN = /^(?:\d{1,2}(?::\d{2})?\s*(?:a|p|am|pm)|\d{1,2}:\d{2})$/
const DAY_WORDS: Record<string, TodoInput['day']> = { today: 'today', tonight: 'tonight', tomorrow: 'tomorrow', tmrw: 'tomorrow', tmr: 'tomorrow' }

/**
 * Reads the Add box: a name, then (in any order at its end) a time, a day word, a length and a
 * repeat. Only words that can't be part of a name count ("buy 2 eggs" stays a name; "at 2" is a
 * time). Nothing left for a name: the whole text is the name.
 */
export function parseTodoInput(text: string): TodoInput {
  const words = text.trim().split(/\s+/).filter(Boolean)
  const used = new Set<number>()
  const out: Omit<TodoInput, 'label'> = {}
  let repeatAt: number[] = []
  let k = words.length - 1
  while (k >= 0) {
    const w = words[k].toLowerCase().replace(/[.,;]$/, '')
    const prev = k > 0 ? words[k - 1].toLowerCase() : ''
    if (!out.durationMs && LENGTH_TOKEN.test(w)) {
      const ms = parseTimerInput(w)
      if (ms === null) break
      out.durationMs = ms
      used.add(k--)
      continue
    }
    if (!out.time && (TIME_TOKEN.test(w) || (prev === 'at' && parseAlarmTime(w)))) {
      const t = parseAlarmTime(w)
      if (!t) break
      out.time = t
      used.add(k--)
      if (prev === 'at') used.add(k--)
      continue
    }
    if (!out.day && DAY_WORDS[w]) {
      out.day = DAY_WORDS[w]
      used.add(k--)
      continue
    }
    if (!out.repeat) {
      const r = repeatWords(words, k)
      if (r) {
        out.repeat = r.repeat
        repeatAt = r.at
        for (const j of r.at) used.add(j)
        k = Math.min(...r.at) - 1
        continue
      }
    }
    break
  }
  // A series needs a time of day: without one the words stay in the name.
  if (out.repeat && !out.time) {
    for (const j of repeatAt) used.delete(j)
    delete out.repeat
  }
  const label = words.filter((_, j) => !used.has(j)).join(' ')
  if (!label) return { label: text.trim() }
  return { label, ...out }
}

/** Repeat words ending at `k`: "daily", "weekdays", "weekends", "every day", "every other day", "every 3 days". */
function repeatWords(words: readonly string[], k: number): { repeat: Repeat; at: number[] } | null {
  const w = (j: number) => (j >= 0 ? words[j].toLowerCase().replace(/[.,;]$/, '') : '')
  const one = w(k)
  if (one === 'daily' || one === 'everyday') return { repeat: { kind: 'weekly', days: [...EVERY_DAY] }, at: [k] }
  if (one === 'weekdays') return { repeat: { kind: 'weekly', days: [...WEEKDAYS] }, at: [k] }
  if (one === 'weekends') return { repeat: { kind: 'weekly', days: [...WEEKENDS] }, at: [k] }
  if (one === 'day' && w(k - 1) === 'every') return { repeat: { kind: 'weekly', days: [...EVERY_DAY] }, at: [k - 1, k] }
  if (one === 'day' && w(k - 1) === 'other' && w(k - 2) === 'every') return { repeat: { kind: 'interval', every: 2 }, at: [k - 2, k - 1, k] }
  if (one === 'days' && /^\d{1,3}$/.test(w(k - 1)) && w(k - 2) === 'every') {
    const every = Number(w(k - 1))
    if (every >= 1 && every <= 365) return { repeat: { kind: 'interval', every }, at: [k - 2, k - 1, k] }
  }
  return null
}

/** The Todos tab's quick durations (its ⋯ menu), minutes; "—" before them is none. */
export const TODO_DURATIONS_MIN: readonly number[] = [5, 15, 30, 60]

/** Times the quick choices use: Tonight and Tomorrow (Settings), as hours and minutes. */
export interface TodoTimes { tonight: { h: number; m: number }; tomorrow: { h: number; m: number } }
export const DEFAULT_TODO_TIMES: TodoTimes = { tonight: { h: 19, m: 0 }, tomorrow: { h: 9, m: 0 } }

const onDay = (now: number, plusDays: number, h: number, m: number) => {
  const d = new Date(now)
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + plusDays, h, m).getTime()
}

/**
 * When a typed todo is for, or null for none: a time today (or tomorrow once passed, as an
 * alarm does; an ambiguous "at 7" takes the sooner of AM and PM), on the day named; "tonight" or
 * "tomorrow" alone take their times from Settings.
 */
export function todoInputAt(input: Pick<TodoInput, 'time' | 'day'>, now: number, times: TodoTimes = DEFAULT_TODO_TIMES): number | null {
  const { time, day } = input
  if (!time) {
    if (day === 'tonight') return onDay(now, 0, times.tonight.h, times.tonight.m) > now ? onDay(now, 0, times.tonight.h, times.tonight.m) : null
    if (day === 'tomorrow') return onDay(now, 1, times.tomorrow.h, times.tomorrow.m)
    return null
  }
  // Tomorrow, an ambiguous hour is the morning unless typed otherwise ("tomorrow 7" is 7a).
  if (day === 'tomorrow') return onDay(now, 1, hour24(time, false), time.m)
  const pm = day === 'tonight' ? true : isAmbiguous(time) ? soonerIsPm(time, now) : false
  return nextAt(hour24(time, pm), time.m, now)
}

/** The quick Schedule / Later choices: In 15m, In 1h, Tonight (while still ahead), Tomorrow. */
export interface TimeChoice { key: 'in15' | 'in1h' | 'tonight' | 'tomorrow'; label: string; ts: number }

export function quickChoices(now: number, times: TodoTimes = DEFAULT_TODO_TIMES): TimeChoice[] {
  const tonight = onDay(now, 0, times.tonight.h, times.tonight.m)
  return [
    { key: 'in15', label: 'In 15m', ts: now + 15 * MINUTE },
    { key: 'in1h', label: 'In 1h', ts: now + 60 * MINUTE },
    ...(tonight > now + 15 * MINUTE ? [{ key: 'tonight' as const, label: 'Tonight', ts: tonight }] : []),
    { key: 'tomorrow', label: 'Tomorrow', ts: onDay(now, 1, times.tomorrow.h, times.tomorrow.m) },
  ]
}

/** "HH:MM" for Settings, read back as hours and minutes (null when it isn't one). */
export function parseClockSetting(text: unknown): { h: number; m: number } | null {
  if (typeof text !== 'string') return null
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(text)
  return m ? { h: Number(m[1]), m: Number(m[2]) } : null
}

/**
 * A typed "when" (Later's Other…, the Todos tab's Schedule box): a time ("3p", "at 7", "15:30"),
 * a day word with or without one ("tomorrow", "tomorrow 9a"), or a length from now ("10" minutes,
 * "1h30", "45m"). Null when it is none of those or isn't ahead.
 */
export function parseWhen(text: string, now: number, times: TodoTimes = DEFAULT_TODO_TIMES): number | null {
  const t = text.trim()
  if (!t) return null
  const asLength = parseTimerInput(t)
  if (asLength !== null && !/[ap:]/i.test(t.replace(/m(in(ute)?s?)?$/i, ''))) return now + asLength
  const input = parseTodoInput(`_ ${t}`)
  if (input.label !== '_') return null
  if (input.time || input.day) {
    const ts = todoInputAt(input, now, times)
    return ts !== null && ts > now ? ts : null
  }
  return input.durationMs ? now + input.durationMs : null
}
