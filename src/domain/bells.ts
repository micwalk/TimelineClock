// Which alarm bells the timeline draws, and where (spec: TLC-1 offset alarms). Pure.
//
// An alarm at its instant is a bell on the instant's chip. One before it (a warning), or after
// it (a snooze of the alarm at it), is its own bell at the time it rings, tied back to the
// instant. Rules:
//   - A live alarm (still to ring, or ringing) is never hidden: it is a bell of its own, or,
//     when it is too close to its instant to stand apart (zoomed out), it folds into the
//     instant's chip, a small bell with its offset ("15m") before the chip (a warning) or after
//     it (a snooze).
//   - An answered or missed alarm (history) shows, hollow, only while its instant is selected
//     or focused, and only where it has room of its own.
//   - The bell being dragged always shows, at the drag's time.
import type { AlarmRecord, InstantRecord } from './entities.ts'
import { ringKey, ringTime } from './alarms.ts'

export interface ShownBell {
  inst: InstantRecord
  alarm: AlarmRecord
  /** When it rings (the drag's time while dragged). */
  ringTs: number
  /** History: answered or missed. Drawn hollow. */
  past: boolean
}

export interface BellOptions {
  now: number
  /** Main-axis position of a time, px. */
  pos: (ts: number) => number
  /** Times on screen (with a margin): bells outside aren't drawn. */
  lo: number
  hi: number
  ringingKeys: ReadonlySet<string>
  /** Instants whose past bells show (the selected and focused ones). */
  revealPast: ReadonlySet<string>
  /** Closer than this (px) to its instant, a bell folds into the instant's chip. */
  collapsePx: number
  dragging: { alarmId: string; ringTs: number } | null
}

/** Still to ring, or ringing now. */
export const isLiveAlarm = (inst: InstantRecord, a: AlarmRecord, now: number, ringingKeys: ReadonlySet<string>) =>
  !a.answered && (ringTime(inst, a) > now || ringingKeys.has(ringKey(inst.id, a.id)))

export interface BellLayout {
  shown: ShownBell[]
  /** Instant id → live bells folded into its chip (too close to stand apart): alarm ids, comma-joined, earliest first. */
  folded: Record<string, string>
}

export function bellsToShow(instants: readonly InstantRecord[], o: BellOptions): BellLayout {
  const shown: ShownBell[] = []
  const folded: Record<string, string> = {}
  for (const inst of instants) {
    if (!inst.alarms) continue
    const into: AlarmRecord[] = []
    for (const alarm of inst.alarms) {
      const dragged = o.dragging?.alarmId === alarm.id
      if (dragged) {
        shown.push({ inst, alarm, ringTs: o.dragging!.ringTs, past: false })
        continue
      }
      if (alarm.offsetMs === 0) continue // on the chip
      const live = isLiveAlarm(inst, alarm, o.now, o.ringingKeys)
      if (!live && !o.revealPast.has(inst.id)) continue
      const ringTs = ringTime(inst, alarm)
      if (Math.abs(o.pos(inst.tsEpochMs) - o.pos(ringTs)) < o.collapsePx) {
        if (live) into.push(alarm)
        continue
      }
      // Off screen, a bell still counts while its line to its instant crosses the screen.
      if (Math.max(ringTs, inst.tsEpochMs) < o.lo || Math.min(ringTs, inst.tsEpochMs) > o.hi) continue
      shown.push({ inst, alarm, ringTs, past: !live })
    }
    if (into.length) folded[inst.id] = into.sort((a, b) => b.offsetMs - a.offsetMs).map(a => a.id).join(',')
  }
  return { shown, folded }
}

/** A bell's layout id (bells share the chips' layout). */
export const bellItemId = (alarmId: string) => `bell:${alarmId}`
