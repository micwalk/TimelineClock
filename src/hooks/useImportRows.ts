// The Add box's reading of a pasted list or dictation (components/panels/TodoImportPreview): the
// rows as the user leaves them (unticked ones out, edited ones read again), and a row's reading.
import { useState } from 'react'
import type { ImportRow } from '../domain/todoImport.ts'
import { readOne } from '../domain/todoImport.ts'
import { describeRepeatShort } from '../domain/series.ts'
import { formatClockCompact, formatDurationShort, formatMonthDay } from '../domain/format.ts'
import { MARKS, TODO_UI } from '../config/labels.ts'
import { getTodoTimes } from '../store/settings.ts'

const whenText = (ts: number, now: number) => {
  const d = new Date(ts)
  const n = new Date(now)
  const tomorrow = new Date(n.getFullYear(), n.getMonth(), n.getDate() + 1).toDateString()
  const day = d.toDateString() === n.toDateString() ? '' : d.toDateString() === tomorrow ? 'Tomorrow ' : `${d.toLocaleDateString(undefined, { weekday: 'short' })} ${formatMonthDay(ts, now)} `
  return `${day}${formatClockCompact(ts, false)}`
}

/** What a row read, in words. */
export function rowReading(r: ImportRow, now: number): string {
  if (r.done) return TODO_UI.importDone
  return [
    r.at !== null ? whenText(r.at, now) : '',
    r.durationMs ? `⏱ ${formatDurationShort(r.durationMs)}` : '',
    r.repeat ? `${MARKS.repeat} ${describeRepeatShort(r.repeat)}` : '',
  ].filter(Boolean).join(' · ')
}

/** The rows as the user left them: unticked ones out, edited ones read again. */
export function useImportRows(rows: readonly ImportRow[]) {
  const [off, setOff] = useState<ReadonlySet<number>>(new Set())
  const [edits, setEdits] = useState<ReadonlyMap<number, string>>(new Map())
  const now = Date.now()
  const shown = rows.map(r => {
    const text = edits.get(r.key)
    return text === undefined ? r : readOne(text, now, getTodoTimes(), { done: r.done, headingDay: r.headingDay, key: r.key, capitalize: /^[A-Z]/.test(r.label) && !/^[A-Z]/.test(r.source) })
  })
  return {
    shown,
    off,
    chosen: shown.filter(r => !off.has(r.key) && r.label.trim()),
    toggle: (key: number) => setOff(s => { const n = new Set(s); if (n.has(key)) n.delete(key); else n.add(key); return n }),
    edit: (key: number, text: string) => setEdits(m => new Map(m).set(key, text)),
    reset: () => { setOff(new Set()); setEdits(new Map()) },
  }
}

