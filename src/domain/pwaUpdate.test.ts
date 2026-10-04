import { describe, expect, it } from 'vitest'
import { RESUME_WINDOW_MS, shouldApplyUpdate } from './pwaUpdate.ts'

const base = { visible: true, msSinceVisible: 0, ringing: false, upcomingAlarm: false }

describe('shouldApplyUpdate', () => {
  it('applies right after the app is opened or resumed', () => {
    expect(shouldApplyUpdate(base)).toBe(true)
    expect(shouldApplyUpdate({ ...base, msSinceVisible: RESUME_WINDOW_MS })).toBe(true)
    expect(shouldApplyUpdate({ ...base, upcomingAlarm: true })).toBe(true)
  })

  it('waits while the user is using the app', () => {
    expect(shouldApplyUpdate({ ...base, msSinceVisible: RESUME_WINDOW_MS + 1 })).toBe(false)
  })

  it('applies in the background unless an alarm is set', () => {
    expect(shouldApplyUpdate({ ...base, visible: false, msSinceVisible: 1e9 })).toBe(true)
    expect(shouldApplyUpdate({ ...base, visible: false, msSinceVisible: 1e9, upcomingAlarm: true })).toBe(false)
  })

  it('never reloads under a ringing alarm', () => {
    expect(shouldApplyUpdate({ ...base, ringing: true })).toBe(false)
    expect(shouldApplyUpdate({ ...base, visible: false, ringing: true })).toBe(false)
  })
})
