import { describe, expect, it } from 'vitest'
import { needsRegistration, offlineState } from './pwaUpdate.ts'

const facts = (f: Partial<Parameters<typeof offlineState>[0]> = {}) => ({ supported: true, active: false, installing: false, cached: false, ...f })

describe('offline copy', () => {
  it('opens offline only with an active worker and its page cached', () => {
    expect(offlineState(facts({ active: true, cached: true }))).toBe('ready')
    expect(offlineState(facts({ active: true }))).toBe('missing')
    expect(offlineState(facts({ installing: true }))).toBe('saving')
    expect(offlineState(facts())).toBe('missing')
    expect(offlineState(facts({ supported: false }))).toBe('unsupported')
  })

  it('registers again only when there is no worker at all (a failed first install deletes it)', () => {
    expect(needsRegistration(facts())).toBe(true)
    expect(needsRegistration(facts({ installing: true }))).toBe(false)
    expect(needsRegistration(facts({ active: true }))).toBe(false)
    expect(needsRegistration(facts({ supported: false }))).toBe(false)
  })
})
