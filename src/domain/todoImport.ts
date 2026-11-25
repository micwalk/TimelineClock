// Many todos at once, from text (docs/prd_todo_import_widgets.md §1–2). Pure, deterministic and
// local: rules only, no network and no model.
//
// Two shapes of text come in:
// - a list (pasted text or Markdown): one todo per line; list markers ("-", "*", "1.", "☐"),
//   checkboxes ("- [x]" comes in done) and nesting are read and dropped (nesting is ignored for
//   now: subtasks are planned, owner 2026-11-25); a heading that names a day ("## Tomorrow",
//   "Friday:", "Nov 28") sets the day for the items under it, any other heading is skipped;
// - speech (keyboard dictation): one run-on line, split into todos at "then", "also", "after
//   that", sentence ends, and "and" or a comma before a verb ("call mom and pick up the kids";
//   "salt and pepper" stays one).
// Each todo's words are read as spoken: number words ("three thirty pm", "twenty minutes", "an
// hour and a half"), "half past four", "noon", "for 20 minutes" (its length), "in 20 minutes" (a
// time from now), "this evening", "tomorrow morning", weekdays ("on Friday"), "every morning",
// and filler ("um", "remind me to") goes. What is left goes through the Add box's own reader
// (domain/todos parseTodoInput), so typed "laundry 4p 20m" reads the same here.
import type { AlarmTime } from './alarmPicker.ts'
import { hour24, isAmbiguous } from './alarmPicker.ts'
import type { Repeat } from './series.ts'
import { EVERY_DAY, WEEKDAYS, WEEKENDS } from './series.ts'
import type { TodoInput, TodoTimes } from './todos.ts'
import { DEFAULT_TODO_TIMES, parseTodoInput, todoInputAt } from './todos.ts'
import { HOUR, MINUTE } from './time.ts'

/** One todo read from the text, and what it will be. */
export interface ImportRow {
  key: number
  /** Its text as written (a list line without its marker, or a spoken piece). */
  source: string
  label: string
  /** When, or null for none (it goes on the list). */
  at: number | null
  durationMs?: number
  /** Repeating (needs a time). */
  repeat?: Repeat
  /** "- [x]": it comes in done. */
  done: boolean
  /** The day its list heading named ("2026-11-28"), for reading it again after an edit. */
  headingDay?: string
}

// ---------------------------------------------------------------------------
// Number words

const ONES: Record<string, number> = {
  zero: 0, oh: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19,
}
const TENS: Record<string, number> = { twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, ninety: 90 }
const ONE_WORDS = Object.keys(ONES).filter(w => w !== 'oh' && w !== 'zero').join('|')
const TEN_WORDS = Object.keys(TENS).join('|')
/** A number, in digits or words ("7", "seven", "twenty five", "forty-five"). */
const NUM = `(?:\\d+(?:\\.\\d+)?|(?:${TEN_WORDS})(?:[\\s-](?:${ONE_WORDS}))?|${ONE_WORDS})`

/** The value of a number in digits or words; NaN when it isn't one. */
export function numberValue(text: string): number {
  const t = text.trim().toLowerCase()
  if (/^\d+(\.\d+)?$/.test(t)) return Number(t)
  const parts = t.split(/[\s-]+/)
  if (parts.length === 1) return ONES[parts[0]] ?? TENS[parts[0]] ?? NaN
  if (parts.length === 2 && TENS[parts[0]] !== undefined && ONES[parts[1]] !== undefined && ONES[parts[1]] < 10) return TENS[parts[0]] + ONES[parts[1]]
  return NaN
}

// ---------------------------------------------------------------------------
// What a spoken todo says

/** A todo's words, read. */
export interface SpokenTodo {
  input: TodoInput
  /** A weekday or date it names ("on Friday", "Nov 28"): its day, as "YYYY-MM-DD". */
  date?: string
  /** "in 20 minutes": that long from now. */
  inMs?: number
  /** "morning" / "afternoon" / "evening": which half an ambiguous hour is. */
  half?: 'am' | 'pm'
  /** "this afternoon" with no time: the time it means. */
  partTime?: { h: number; m: number }
}

const WEEKDAY_NAMES = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
/** A weekday's full name ("friday"), or its short name ("fri", "thurs"), which needs "on" / "next" / "this" before it. */
const WEEKDAY_FULL = `(?:sun|mon|tues|wednes|thurs|fri|satur)day`
const WEEKDAY_SHORT = `(?:sun|mon|tues?|wed|thu(?:rs?)?|fri|sat)`
const WEEKDAY = `(?:${WEEKDAY_FULL}|${WEEKDAY_SHORT})`
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']
const MONTH = `(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)`
/** Not inside a word, nor before an apostrophe ("Friday's"). */
const END = `(?![\\w'’])`

const weekdayIndex = (w: string) => WEEKDAY_NAMES.findIndex(n => n.startsWith(w.toLowerCase().slice(0, 3)))

const pad2 = (n: number) => String(n).padStart(2, '0')
const keyOf = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`

/** The next `weekday` from `now` (today counts unless `next`). */
function weekdayKey(weekday: number, now: number, next: boolean): string {
  const d = new Date(now)
  let ahead = (weekday - d.getDay() + 7) % 7
  if (ahead === 0 && next) ahead = 7
  return keyOf(new Date(d.getFullYear(), d.getMonth(), d.getDate() + ahead))
}

/** A month and day, this year or, once passed, next year. */
function monthDayKey(month: number, day: number, now: number, year?: number): string | undefined {
  if (month < 0 || month > 11 || day < 1 || day > 31) return undefined
  const n = new Date(now)
  const y = year ?? n.getFullYear()
  let d = new Date(y, month, day)
  if (d.getMonth() !== month) return undefined
  if (year === undefined && d.getTime() < new Date(n.getFullYear(), n.getMonth(), n.getDate()).getTime()) d = new Date(y + 1, month, day)
  return keyOf(d)
}

/** A clock time from an hour and minute words ("seven", "thirty"; "4", "05"). */
function clockOf(hour: string, minute: string | undefined, meridiem: string | undefined): AlarmTime | null {
  const h = numberValue(hour)
  const m = minute === undefined ? 0 : numberValue(minute.replace(/^oh[\s-]+/i, ''))
  if (!Number.isInteger(h) || !Number.isInteger(m) || m < 0 || m > 59) return null
  const mer = meridiem ? (/^p/i.test(meridiem) ? 'pm' : 'am') : null
  if (mer ? h < 1 || h > 12 : h < 0 || h > 23) return null
  return { h, m, meridiem: mer }
}

/** A length in words: "twenty minutes", "an hour and a half", "1.5 hours", "half an hour", "2 hours 15 minutes". */
const LEN = `(?:half\\s+an?\\s+hour|(?:an?|${NUM})(?:\\s+and\\s+a\\s+half)?\\s+(?:hours?|hrs?)(?:\\s+and\\s+a\\s+half)?(?:\\s+(?:and\\s+)?${NUM}\\s+(?:minutes?|mins?))?|(?:an?|${NUM})\\s+(?:minutes?|mins?))`

function lengthOf(text: string): number | null {
  const t = text.toLowerCase().trim()
  if (/^half\s+an?\s+hour$/.test(t)) return 30 * MINUTE
  const m = new RegExp(`^(an?|${NUM})(\\s+and\\s+a\\s+half)?\\s+(hours?|hrs?|minutes?|mins?)(\\s+and\\s+a\\s+half)?(?:\\s+(?:and\\s+)?(${NUM})\\s+(?:minutes?|mins?))?$`).exec(t)
  if (!m) return null
  const n = /^an?$/.test(m[1]) ? 1 : numberValue(m[1])
  if (!Number.isFinite(n) || n <= 0) return null
  const half = m[2] || m[4] ? 0.5 : 0
  const unit = /^h/.test(m[3]) ? HOUR : MINUTE
  const extra = m[5] ? numberValue(m[5]) * MINUTE : 0
  const ms = Math.round((n + half) * unit + (Number.isFinite(extra) ? extra : 0))
  return ms > 0 && ms <= 100 * HOUR ? ms : null
}

const FILLER = new RegExp(
  '^(?:(?:um+|uh+|er+|so|okay|ok|please|hey|and|also|then)[,\\s]+)*' +
  '(?:(?:can you |could you |please )?(?:remind me to|remind me|i need to|i have to|i\'ve got to|i got to|i gotta|i should|i want to|i must|' +
  'don\'t forget to|dont forget to|do not forget to|remember to|need to|have to|gotta|got to|to)\\s+)?', 'i')

/**
 * Reads a todo as said. Phrases it understands come out of the words; what is left goes through
 * parseTodoInput, which may still find typed ones ("3p", "20m", "daily") at its end.
 */
export function readSpoken(text: string, now: number): SpokenTodo {
  let s = ` ${text.trim()} `
    .replace(/\b([ap])\.\s?m\.?/gi, '$1m')
    .replace(/\bo['’]?clock\b/gi, '')
  const out: Omit<SpokenTodo, 'input'> = {}
  let time: AlarmTime | null = null
  let day: TodoInput['day'] | undefined
  let durationMs: number | undefined
  let repeat: Repeat | undefined
  const take = (re: RegExp, f: (...m: string[]) => boolean | void) => {
    s = s.replace(re, (...args) => (f(...(args.slice(0, -2) as string[])) === false ? args[0] : ' '))
  }

  // Repeats first ("every morning" is a repeat and a half of the day).
  take(new RegExp(`\\b(?:every\\s*day|daily)${END}`, 'i'), () => { repeat = { kind: 'weekly', days: [...EVERY_DAY] } })
  take(new RegExp(`\\bevery\\s+(morning|afternoon|evening|night)${END}`, 'i'), (_m, part) => {
    repeat = { kind: 'weekly', days: [...EVERY_DAY] }
    out.half = part.toLowerCase() === 'morning' ? 'am' : 'pm'
  })
  take(new RegExp(`\\b(?:every\\s+weekday|weekdays)${END}`, 'i'), () => { repeat = { kind: 'weekly', days: [...WEEKDAYS] } })
  take(new RegExp(`\\b(?:every\\s+weekend|weekends)${END}`, 'i'), () => { repeat = { kind: 'weekly', days: [...WEEKENDS] } })
  take(new RegExp(`\\bevery\\s+other\\s+day${END}`, 'i'), () => { repeat = { kind: 'interval', every: 2 } })
  take(new RegExp(`\\bevery\\s+(${NUM})\\s+days${END}`, 'i'), (_m, n) => {
    const every = numberValue(n)
    if (!Number.isInteger(every) || every < 1 || every > 365) return false
    repeat = { kind: 'interval', every }
  })
  take(new RegExp(`\\bevery\\s+(${WEEKDAY})${END}`, 'i'), (_m, w) => { repeat = { kind: 'weekly', days: [weekdayIndex(w)] } })

  // "in 20 minutes": a time from now (before lengths, which would take its words).
  take(new RegExp(`\\bin\\s+(${LEN})${END}`, 'i'), (_m, len) => {
    const ms = lengthOf(len)
    if (ms === null) return false
    out.inMs = ms
  })
  // A length: "for twenty minutes", "an hour and a half".
  take(new RegExp(`\\b(?:for\\s+|takes?\\s+|about\\s+)?(${LEN})${END}`, 'i'), (_m, len) => {
    const ms = lengthOf(len)
    if (ms === null || durationMs !== undefined) return false
    durationMs = ms
  })

  // Times.
  const at = `(?:at|by|around|@)\\s+`
  const MIN = `(?:oh[\\s-]+(?:${ONE_WORDS})|${TEN_WORDS}(?:[\\s-](?:${ONE_WORDS}))?|fifteen|\\d{2})`
  const setTime = (t: AlarmTime | null) => { if (!t || time) return false; time = t }
  take(new RegExp(`\\b(?:${at})?noon${END}`, 'i'), () => setTime({ h: 12, m: 0, meridiem: 'pm' }))
  take(new RegExp(`\\b(?:${at})?midnight${END}`, 'i'), () => setTime({ h: 12, m: 0, meridiem: 'am' }))
  take(new RegExp(`\\b(?:${at})?(half|quarter)\\s+(past|after|to|till|til|of|before)\\s+(${NUM})(?:\\s*(am|pm))?${END}`, 'i'), (_m, which, rel, hour, mer) => {
    const h = numberValue(hour)
    if (!Number.isInteger(h) || h < 1 || h > 23) return false
    const mins = which.toLowerCase() === 'half' ? 30 : 15
    const before = /^(to|till|til|of|before)$/i.test(rel)
    if (before && which.toLowerCase() === 'half') return false
    const hh = before ? (h === 1 ? 12 : h - 1) : h
    return setTime(clockOf(String(hh), String(before ? 60 - mins : mins), mer))
  })
  // "seven thirty pm", "3:30 pm", "3 pm", "at 7:05", "at seven".
  take(new RegExp(`\\b(?:${at})?(\\d{1,2}|${ONE_WORDS})(?::(\\d{2})|\\s+(${MIN}))?(?:\\s*(am|pm)|([ap]))${END}`, 'i'), (_m, h, mm, mw, mer, short) => setTime(clockOf(h, mm ?? mw, mer ?? short)))
  take(new RegExp(`\\b${at}(\\d{1,2}|${ONE_WORDS})(?::(\\d{2})|\\s+(${MIN}))?${END}`, 'i'), (_m, h, mm, mw) => setTime(clockOf(h, mm ?? mw, undefined)))
  take(/\b(\d{1,2}):(\d{2})(?![\w'’:])/i, (_m, h, mm) => setTime(clockOf(h, mm, undefined)))

  // Parts of the day.
  const PART_TIMES = { morning: { h: 9, m: 0 }, afternoon: { h: 15, m: 0 }, evening: { h: 19, m: 0 }, night: { h: 20, m: 0 } }
  take(new RegExp(`\\b(this|tomorrow|today|in\\s+the)\\s+(morning|afternoon|evening|night)${END}`, 'i'), (_m, which, part) => {
    const w = which.toLowerCase()
    const p = part.toLowerCase() as keyof typeof PART_TIMES
    out.half = p === 'morning' ? 'am' : 'pm'
    if (w === 'tomorrow') day = 'tomorrow'
    else if (w !== 'in the') day = p === 'evening' || p === 'night' ? 'tonight' : 'today'
    out.partTime = PART_TIMES[p]
  })
  take(new RegExp(`\\b(tonight|today|tomorrow|tmrw|tmr)${END}`, 'i'), (_m, w) => {
    if (day) return false
    const l = w.toLowerCase()
    day = l === 'tonight' ? 'tonight' : l === 'today' ? 'today' : 'tomorrow'
  })

  // A weekday or a date: "on Friday", "next Tuesday", "Nov 28", "28 November", "11/28", "2026-11-28".
  const onWeekday = (next: string | undefined, w: string) => {
    if (out.date) return false
    const k = weekdayIndex(w)
    if (k < 0) return false
    out.date = weekdayKey(k, now, !!next)
  }
  take(new RegExp(`\\b(?:(?:on|this|by)\\s+)?(next\\s+)?(${WEEKDAY_FULL})${END}`, 'i'), (_m, next, w) => onWeekday(next, w))
  take(new RegExp(`\\b(?:(?:on|this|by)\\s+|(next)\\s+)(${WEEKDAY_SHORT})\\.?${END}`, 'i'), (_m, next, w) => onWeekday(next, w))
  take(/\b(?:on\s+)?(\d{4})-(\d{2})-(\d{2})\b/i, (_m, y, mo, d) => { if (out.date) return false; out.date = monthDayKey(Number(mo) - 1, Number(d), now, Number(y)) })
  take(new RegExp(`\\b(?:on\\s+)?(${MONTH})\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?${END}`, 'i'), (_m, mon, d) => {
    if (out.date) return false
    out.date = monthDayKey(MONTHS.indexOf(mon.toLowerCase().slice(0, 3)), Number(d), now)
  })
  take(new RegExp(`\\b(?:on\\s+)?(?:the\\s+)?(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:of\\s+)?(${MONTH})${END}`, 'i'), (_m, d, mon) => {
    if (out.date) return false
    out.date = monthDayKey(MONTHS.indexOf(mon.toLowerCase().slice(0, 3)), Number(d), now)
  })
  // "11/28" only after "on" or at the end ("1/2 cup flour" is no date).
  take(/\b(?:on\s+(\d{1,2})\/(\d{1,2})(?![\w/])|(\d{1,2})\/(\d{1,2})(?=\s*$))/i, (_m, mo1, d1, mo2, d2) => {
    const mo = mo1 ?? mo2
    const d = d1 ?? d2
    if (out.date) return false; out.date = monthDayKey(Number(mo) - 1, Number(d), now) })

  const rest = s.replace(/\s+/g, ' ').replace(/\s+([,.;:!?])/g, '$1').trim()
  const cleaned = rest.replace(FILLER, '').replace(/^[,.;:\-–—\s]+|[,;:\-–—\s]+$/g, '').replace(/[.!?]+$/, '').trim()
  const typed = parseTodoInput(cleaned)
  const input: TodoInput = { label: typed.label }
  const t = time ?? typed.time
  if (t) input.time = t
  const d = day ?? typed.day
  if (d) input.day = d
  const len = durationMs ?? typed.durationMs
  if (len) input.durationMs = len
  const r = repeat ?? typed.repeat
  if (r) input.repeat = r
  // Nothing left for a name: what was said is the name (as the Add box does).
  if (!input.label) return { input: { label: text.trim() } }
  return { input, ...out }
}

/** When a spoken todo is for, or null for none. */
export function spokenAt(p: SpokenTodo, now: number, times: TodoTimes = DEFAULT_TODO_TIMES): number | null {
  if (p.inMs !== undefined) return now + p.inMs
  let time = p.input.time
  if (time && !time.meridiem && p.half && isAmbiguous(time)) time = { ...time, meridiem: p.half }
  if (p.date) {
    const [y, mo, d] = p.date.split('-').map(Number)
    if (!time) {
      // Today with no time: on the list, as "today" alone is (unless a part of the day still ahead).
      if (p.date === keyOf(new Date(now))) {
        if (!p.partTime) return null
        const t = new Date(y, mo - 1, d, p.partTime.h, p.partTime.m).getTime()
        return t > now ? t : null
      }
      const at = p.partTime ?? times.tomorrow
      return new Date(y, mo - 1, d, at.h, at.m).getTime()
    }
    // A day ahead: an ambiguous hour is the afternoon up to 6 ("Friday at 3" is 3p), else the morning.
    const pm = time.meridiem ? time.meridiem === 'pm' : time.h >= 1 && time.h <= 6
    return new Date(y, mo - 1, d, hour24(time, pm), time.m).getTime()
  }
  if (!time && p.partTime && (p.input.day === 'today' || p.input.day === 'tomorrow')) {
    const base = new Date(now)
    const at = new Date(base.getFullYear(), base.getMonth(), base.getDate() + (p.input.day === 'tomorrow' ? 1 : 0), p.partTime.h, p.partTime.m).getTime()
    return at > now ? at : null
  }
  // "in the morning": the next one.
  if (!time && p.partTime && !p.input.day) {
    const base = new Date(now)
    const today = new Date(base.getFullYear(), base.getMonth(), base.getDate(), p.partTime.h, p.partTime.m).getTime()
    return today > now ? today : new Date(base.getFullYear(), base.getMonth(), base.getDate() + 1, p.partTime.h, p.partTime.m).getTime()
  }
  if (!time && p.input.day === 'today') return null
  return todoInputAt({ time, day: p.input.day === 'today' ? undefined : p.input.day }, now, times)
}

// ---------------------------------------------------------------------------
// Splitting

/** Words that start a todo: "and" or a comma before one splits ("call mom and pick up the kids"). */
const VERBS = new Set([
  'call', 'phone', 'ring', 'text', 'email', 'e-mail', 'message', 'buy', 'get', 'pick', 'grab', 'order', 'pay', 'book', 'schedule',
  'cancel', 'renew', 'clean', 'wash', 'vacuum', 'mop', 'tidy', 'sweep', 'fold', 'iron', 'do', 'make', 'cook', 'bake', 'take', 'bring',
  'drop', 'return', 'send', 'mail', 'post', 'write', 'read', 'review', 'finish', 'start', 'check', 'fix', 'repair', 'water', 'feed',
  'walk', 'go', 'visit', 'meet', 'see', 'prepare', 'prep', 'pack', 'unpack', 'file', 'print', 'sign', 'submit', 'update', 'charge',
  'fill', 'empty', 'change', 'put', 'set', 'move', 'ask', 'tell', 'practice', 'practise', 'study', 'exercise', 'run', 'shower',
  'remind', 'reply', 'respond', 'plan', 'organize', 'organise', 'clear', 'sort', 'load', 'unload', 'hang', 'mow', 'shop', 'refill',
  'look', 'find', 'install', 'download', 'upload', 'backup', 'test', 'listen', 'watch', 'pray', 'meditate', 'stretch', 'lift',
  'need', 'have', 'remember', "don't", 'dont', 'i',
])

const startsTodo = (text: string) => {
  const first = text.trim().toLowerCase().replace(/^(?:to|then|also)\s+/, '').split(/\s+/)[0]?.replace(/[^a-z'-]/g, '') ?? ''
  return VERBS.has(first)
}
/** Has a time, a day or a length of its own (so "… at 3 and … at 5" splits). */
const hasWhen = (text: string, now: number) => {
  const p = readSpoken(text, now)
  return !!(p.input.time || p.input.day || p.date || p.inMs !== undefined)
}

/** One run-on line of speech, as its todos. */
export function splitSpoken(text: string, now: number): string[] {
  const pieces = text
    .replace(/\b([ap])\.\s?m\./gi, '$1m')
    .split(/(?:[.!?;]+(?=\s|$)|\n)+|\s*,?\s*\b(?:and then|then|and also|also|after that|plus)\b\s*/i)
    .map(p => p.trim())
    .filter(p => p && !/^(?:and|,)$/i.test(p))
  const out: string[] = []
  for (const piece of pieces) {
    // "and" or a comma: split where what follows starts a todo, or both sides say when.
    const parts = piece.split(/\s*(,\s*(?:and\s+)?|\s+and\s+)/i)
    let cur = parts[0]
    for (let k = 1; k < parts.length; k += 2) {
      const next = parts[k + 1] ?? ''
      if (cur.trim() && next.trim() && (startsTodo(next) || (hasWhen(cur, now) && hasWhen(next, now)))) {
        out.push(cur.trim())
        cur = next
      } else {
        cur = `${cur}${parts[k]}${next}`
      }
    }
    if (cur.trim()) out.push(cur.trim())
  }
  return out
}

// ---------------------------------------------------------------------------
// Lists

/** A list line's marker: "-", "*", "+", "•", "1.", "1)", "☐", "☑", "- [ ]", "- [x]". */
const MARKER = /^\s*(?:(?:[-*+•▪◦‣]|\d{1,3}[.)])\s+)?(?:\[([ xX✓✔])\]\s*|([☐☑☒✅✓✔])\s*)?/
const HEADING = /^\s*(?:#{1,6}\s+(.*?)\s*#*\s*$|(.*\S)\s*:\s*$)/

/** A heading's day ("Tomorrow", "Friday", "Nov 28"), as "YYYY-MM-DD"; undefined when it says anything else. */
export function headingDay(text: string, now: number): string | undefined {
  const t = text.trim().replace(/[*_`]/g, '')
  if (!t) return undefined
  const p = readSpoken(`x ${t}`, now)
  if (p.input.label !== 'x' || p.input.time || p.input.durationMs || p.input.repeat || p.inMs !== undefined) return undefined
  if (p.date) return p.date
  if (!p.input.day) return undefined
  const d = new Date(now)
  return keyOf(new Date(d.getFullYear(), d.getMonth(), d.getDate() + (p.input.day === 'tomorrow' ? 1 : 0)))
}

interface ListItem { source: string; done: boolean; headingDay?: string }

/** A list's items, in order: one per line (nesting ignored), headings applied, blank lines and rules skipped. */
export function listItems(text: string, now: number): ListItem[] {
  const out: ListItem[] = []
  let day: string | undefined
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/\t/g, '  ')
    if (!line.trim() || /^\s*(?:[-*_=]\s*){3,}$/.test(line)) continue
    const marked = MARKER.exec(line)
    const hasMarker = !!marked && marked[0].trim() !== ''
    const h = !hasMarker ? HEADING.exec(line) : null
    if (h) { day = headingDay(h[1] ?? h[2] ?? '', now); continue }
    const body = line.slice(marked?.[0].length ?? 0).trim().replace(/^[*_]{1,2}|[*_]{1,2}$/g, '').trim()
    if (!body) continue
    // A bare day word on its own line ("Tomorrow") is a heading too.
    if (!hasMarker) {
      const bare = headingDay(body, now)
      if (bare && body.split(/\s+/).length <= 3) { day = bare; continue }
    }
    const box = marked?.[1] ?? marked?.[2] ?? ''
    out.push({ source: body, done: /[xX✓✔☑☒✅]/.test(box), ...(day ? { headingDay: day } : {}) })
  }
  return out
}

// ---------------------------------------------------------------------------
// The whole text

/** Whether the text is a list (more than one line, or a line with a list marker). */
export function isList(text: string): boolean {
  const lines = text.split(/\r?\n/).filter(l => l.trim())
  if (lines.length > 1) return true
  const m = lines[0] ? MARKER.exec(lines[0]) : null
  return !!m && m[0].trim() !== ''
}

const capitalize = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s)

/** One todo from its text (a list line, a spoken piece, or a row being edited). */
export function readOne(source: string, now: number, times: TodoTimes = DEFAULT_TODO_TIMES, opts: { done?: boolean; headingDay?: string; capitalize?: boolean; key?: number } = {}): ImportRow {
  const p = readSpoken(source, now)
  if (opts.headingDay && !p.date && !p.input.day && p.inMs === undefined) p.date = opts.headingDay
  const at = opts.done ? null : spokenAt(p, now, times)
  return {
    key: opts.key ?? 0,
    source,
    label: opts.capitalize ? capitalize(p.input.label) : p.input.label,
    at,
    ...(p.input.durationMs ? { durationMs: p.input.durationMs } : {}),
    ...(p.input.repeat && at !== null ? { repeat: p.input.repeat } : {}),
    done: !!opts.done,
    ...(opts.headingDay ? { headingDay: opts.headingDay } : {}),
  }
}

/**
 * The todos in a text: a list's lines, or a spoken line's pieces (one, when nothing splits it).
 * Deterministic: the same text and `now` always read the same.
 */
export function readTodoText(text: string, now: number, times: TodoTimes = DEFAULT_TODO_TIMES): ImportRow[] {
  if (!text.trim()) return []
  if (isList(text)) {
    return listItems(text, now).map((item, key) => readOne(item.source, now, times, { done: item.done, headingDay: item.headingDay, key }))
  }
  const pieces = splitSpoken(text, now)
  const many = pieces.length > 1
  return pieces.map((source, key) => readOne(source, now, times, { capitalize: many, key }))
}
