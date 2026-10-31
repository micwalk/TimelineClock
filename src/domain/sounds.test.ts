import { describe, expect, it } from 'vitest'
import { DEFAULT_TONE, SOUNDS, isChime, isSound, soundOf, soundSlotName } from './sounds.ts'
import { sanitizeInstants } from './entities.ts'

describe('sounds', () => {
  it('names the four tones and the chime', () => {
    expect(SOUNDS.map(soundSlotName)).toEqual(['Tone 1', 'Tone 2', 'Tone 3', 'Tone 4', 'Chime'])
    expect(SOUNDS.filter(isChime)).toEqual(['chime'])
  })

  it('an alarm without its own sound has the default', () => {
    expect(soundOf({})).toBe(DEFAULT_TONE)
    expect(soundOf({}, 'tone2')).toBe('tone2')
    expect(soundOf({ sound: 'chime' }, 'tone2')).toBe('chime')
    expect(isSound('tone4')).toBe(true)
    expect(isSound('tone5')).toBe(false)
  })

  it('keeps an alarm sound and a chimed answer from storage', () => {
    const [inst] = sanitizeInstants([{ id: 'i', tsEpochMs: 1, label: '', alarms: [
      { id: 'a', offsetMs: 0, sound: 'chime', answered: 'chimed' },
      { id: 'b', offsetMs: 0, sound: 'bogus' },
    ] }])
    expect(inst.alarms).toEqual([{ id: 'a', offsetMs: 0, sound: 'chime', answered: 'chimed' }, { id: 'b', offsetMs: 0 }])
  })
})
