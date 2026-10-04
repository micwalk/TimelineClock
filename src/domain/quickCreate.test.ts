import { describe, expect, it } from 'vitest'
import { HOUR, MINUTE, SECOND } from './time.ts'
import {
  IDLE_STOPWATCH, MAX_RECENT_TIMERS, TIMER_PRESETS_MS, closedSpanLabel, formatTimerLength, parseTimerInput, pruneStopwatch,
  pushRecentTimer, sanitizeRecentTimers, sanitizeStopwatch, stopwatchPhase, timerChoices,
} from './quickCreate.ts'

describe('parseTimerInput', () => {
  it.each([
    ['13', 13 * MINUTE],
    ['1.5', 90 * SECOND],
    ['13m', 13 * MINUTE],
    ['13 min', 13 * MINUTE],
    ['90s', 90 * SECOND],
    ['1h', HOUR],
    ['1h30', HOUR + 30 * MINUTE],
    ['1h 30m', HOUR + 30 * MINUTE],
    ['2 hours', 2 * HOUR],
    ['1m 30s', 90 * SECOND],
    ['1:30', 90 * SECOND],
    ['1:30:00', HOUR + 30 * MINUTE],
    [' 25M ', 25 * MINUTE],
  ])('%s', (text, ms) => expect(parseTimerInput(text)).toBe(ms))

  it.each(['', '0', '0m', 'abc', '1:75', '-5', '100h', 'm'])('rejects %j', text => expect(parseTimerInput(text)).toBeNull())
})

describe('formatTimerLength', () => {
  it('names the units in use', () => {
    expect(formatTimerLength(13 * MINUTE)).toBe('13m')
    expect(formatTimerLength(HOUR + 30 * MINUTE)).toBe('1h 30m')
    expect(formatTimerLength(90 * SECOND)).toBe('1m 30s')
    expect(formatTimerLength(45 * SECOND)).toBe('45s')
    expect(formatTimerLength(HOUR)).toBe('1h')
  })
})

describe('timer recents', () => {
  it('lists recents first and leaves them out of the presets', () => {
    const { recent, presets } = timerChoices([13 * MINUTE, 5 * MINUTE])
    expect(recent).toEqual([13 * MINUTE, 5 * MINUTE])
    expect(presets).not.toContain(5 * MINUTE)
    expect(presets).toHaveLength(TIMER_PRESETS_MS.length - 1)
  })

  it('keeps the latest few, most recent first, without repeats', () => {
    let r: number[] = []
    for (const m of [1, 2, 3, 2, 4]) r = pushRecentTimer(r, m * MINUTE)
    expect(r).toEqual([4, 2, 3].map(m => m * MINUTE))
    expect(r).toHaveLength(MAX_RECENT_TIMERS)
  })

  it('drops junk from storage', () => {
    expect(sanitizeRecentTimers([MINUTE, 'x', -1, NaN, 2 * MINUTE])).toEqual([MINUTE, 2 * MINUTE])
    expect(sanitizeRecentTimers(null)).toEqual([])
  })
})

describe('stopwatch state', () => {
  it('has phases idle, running and stopped', () => {
    expect(stopwatchPhase(IDLE_STOPWATCH)).toBe('idle')
    expect(stopwatchPhase({ marks: ['a'], stopped: false })).toBe('running')
    expect(stopwatchPhase({ marks: ['a', 'b'], stopped: true })).toBe('stopped')
  })

  it('sanitizes stored state', () => {
    expect(sanitizeStopwatch({ marks: ['a', 3, 'b'], stopped: true })).toEqual({ marks: ['a', 'b'], stopped: true })
    expect(sanitizeStopwatch({ marks: ['a'], stopped: true })).toEqual({ marks: ['a'], stopped: false })
    expect(sanitizeStopwatch('junk')).toEqual(IDLE_STOPWATCH)
  })

  it('forgets deleted marks, and goes idle with none left', () => {
    const s = { marks: ['a', 'b', 'c'], stopped: true }
    expect(pruneStopwatch(s, id => id !== 'b')).toEqual({ marks: ['a', 'c'], stopped: true })
    expect(pruneStopwatch(s, id => id === 'a')).toEqual({ marks: ['a'], stopped: false })
    expect(pruneStopwatch(s, () => false)).toBe(IDLE_STOPWATCH)
    expect(pruneStopwatch(s, () => true)).toBe(s)
  })

  it('labels closed spans', () => {
    expect(closedSpanLabel(1, false)).toBe('Lap 1')
    expect(closedSpanLabel(1, true)).toBe('Stopwatch')
    expect(closedSpanLabel(3, true)).toBe('Lap 3')
  })
})
