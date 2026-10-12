// Test fixtures shared by several test files.
import type { InstantRecord } from '../domain/entities.ts'
import { legacyAlarmId } from '../domain/entities.ts'

/** An instant's fields, where `alarm: true` stands for one alarm at the instant (its ring key is the bare instant id). */
export type InstantOpts = Partial<InstantRecord> & { alarm?: boolean }

export function instantFields(id: string, { alarm, ...rest }: InstantOpts): Partial<InstantRecord> {
  return alarm ? { alarms: [{ id: legacyAlarmId(id), offsetMs: 0 }], ...rest } : rest
}
