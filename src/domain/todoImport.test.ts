import { describe, expect, it } from 'vitest'
import { headingDay, isList, numberValue, readOne, readSpoken, readTodoText, splitSpoken } from './todoImport.ts'
import { MINUTE } from './time.ts'

// Wed Nov 25 2026, noon, local time.
const at = (day: number, h: number, m = 0) => new Date(2026, 10, day, h, m).getTime()
const NOW = at(25, 12)
const read = (text: string) => readTodoText(text, NOW).map(r => ({ label: r.label, at: r.at, ...(r.durationMs ? { len: r.durationMs / MINUTE } : {}), ...(r.repeat ? { repeat: r.repeat } : {}), ...(r.done ? { done: true } : {}) }))

describe('number words', () => {
  it('reads digits and words', () => {
    expect([numberValue('7'), numberValue('seven'), numberValue('twenty five'), numberValue('forty-five'), numberValue('1.5')]).toEqual([7, 7, 25, 45, 1.5])
    expect(numberValue('lots')).toBeNaN()
  })
})

describe('speech', () => {
  it('splits run-on dictation into todos, each read as said', () => {
    expect(read('buy milk tomorrow at three pm then call mom for twenty minutes and also laundry tonight')).toEqual([
      { label: 'Buy milk', at: at(26, 15) },
      { label: 'Call mom', at: null, len: 20 },
      { label: 'Laundry', at: at(25, 19) },
    ])
  })

  it('drops filler and splits at "and" before a verb; weekdays and p.m.', () => {
    expect(read('um remind me to call the dentist on Friday at 10 and pick up the kids at 3:30 p.m.')).toEqual([
      { label: 'Call the dentist', at: at(27, 10) },
      { label: 'Pick up the kids', at: at(25, 15, 30) },
    ])
  })

  it('keeps "and" and commas inside a name', () => {
    expect(splitSpoken('salt and pepper', NOW)).toEqual(['salt and pepper'])
    expect(splitSpoken('buy eggs, milk, and bread', NOW)).toEqual(['buy eggs, milk, and bread'])
    expect(splitSpoken('buy milk at 3, groceries at 5', NOW)).toEqual(['buy milk at 3', 'groceries at 5'])
  })

  it('reads times, lengths and parts of the day in words', () => {
    expect(read('take out the trash in twenty minutes')).toEqual([{ label: 'take out the trash', at: NOW + 20 * MINUTE }])
    expect(read('half past four meeting with Sam')).toEqual([{ label: 'meeting with Sam', at: at(25, 16, 30) }])
    expect(read('quarter to nine standup tomorrow')).toEqual([{ label: 'standup', at: at(26, 8, 45) }])
    expect(read('lunch at noon')).toEqual([{ label: 'lunch', at: at(26, 12) }])
    expect(read('workout for an hour and a half this evening')).toEqual([{ label: 'workout', at: at(25, 19), len: 90 }])
    expect(read('read half an hour tomorrow morning at 7')).toEqual([{ label: 'read', at: at(26, 7), len: 30 }])
    expect(read('call grandma next tuesday')).toEqual([{ label: 'call grandma', at: new Date(2026, 11, 1, 9).getTime() }])
    expect(read('water plants every morning at seven')).toEqual([{ label: 'water plants', at: at(26, 7), repeat: { kind: 'weekly', days: [0, 1, 2, 3, 4, 5, 6] } }])
  })

  it('an ambiguous hour on a day ahead is the afternoon up to 6, else the morning', () => {
    expect(readOne('dentist on friday at 3', NOW).at).toBe(at(27, 15))
    expect(readOne('dentist on friday at 9', NOW).at).toBe(at(27, 9))
  })

  it('a short weekday next to a time is that day', () => {
    const sun9 = new Date(2026, 10, 29, 9).getTime()
    expect(read('vet sun 9a')).toEqual([{ label: 'vet', at: sun9 }])
    expect(read('vet sun at 9am')).toEqual([{ label: 'vet', at: sun9 }])
    expect(read('vet 9a sun')).toEqual([{ label: 'vet', at: sun9 }])
    expect(read('call Sam fri 3:30p')).toEqual([{ label: 'call Sam', at: at(27, 15, 30) }])
    expect(read('vet sun 9a\nread book')).toEqual([{ label: 'vet', at: sun9 }, { label: 'read book', at: null }])
  })

  it('leaves words that only look like times or days in the name', () => {
    expect(read('buy 2 eggs')).toEqual([{ label: 'buy 2 eggs', at: null }])
    expect(read('enjoy the sun')).toEqual([{ label: 'enjoy the sun', at: null }])
    expect(read('take 2 a day')).toEqual([{ label: 'take 2 a day', at: null }])
  })

  it('reads typed todos as the Add box does', () => {
    expect(read('laundry 4p 20m')).toEqual([{ label: 'laundry', at: at(25, 16), len: 20 }])
    expect(read('feed cats 7a daily')).toEqual([{ label: 'feed cats', at: at(26, 7), repeat: { kind: 'weekly', days: [0, 1, 2, 3, 4, 5, 6] } }])
  })

  it('nothing left for a name: what was said is the name', () => {
    expect(readSpoken('tomorrow', NOW).input).toEqual({ label: 'tomorrow' })
  })
})

describe('lists', () => {
  it('is a list with more than one line or a marker', () => {
    expect(isList('one\ntwo')).toBe(true)
    expect(isList('- one')).toBe(true)
    expect(isList('one and two')).toBe(false)
  })

  it('reads Markdown: markers and boxes go, [x] is done, nesting is flattened, day headings set the day, others are skipped', () => {
    expect(read('## Today\n- [ ] email Bob at 4p\n- [x] taxes\n  - nested thing 20m\n# Groceries\n* 1/2 cup flour\nTomorrow\n1. dentist at 9\nFriday:\n☐ pay rent\n---\n- [ ] report due Nov 28')).toEqual([
      { label: 'email Bob', at: at(25, 16) },
      { label: 'taxes', at: null, done: true },
      { label: 'nested thing', at: null, len: 20 },
      { label: '1/2 cup flour', at: null },
      { label: 'dentist', at: at(26, 9) },
      { label: 'pay rent', at: at(27, 9) },
      { label: 'report due', at: at(28, 9) },
    ])
  })

  it('a heading names a day only when it says nothing else', () => {
    expect(headingDay('Tomorrow', NOW)).toBe('2026-11-26')
    expect(headingDay('Friday', NOW)).toBe('2026-11-27')
    expect(headingDay('Groceries', NOW)).toBeUndefined()
    expect(headingDay('Tomorrow at 3', NOW)).toBeUndefined()
  })

  it('a row edited is read again with its heading day', () => {
    expect(readOne('dentist', NOW, undefined, { headingDay: '2026-11-27' }).at).toBe(at(27, 9))
    expect(readOne('dentist tomorrow', NOW, undefined, { headingDay: '2026-11-27' }).at).toBe(at(26, 9))
  })
})
