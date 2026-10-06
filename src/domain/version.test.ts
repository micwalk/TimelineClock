import { describe, expect, it } from 'vitest'
import { versionLine } from './version.ts'

describe('versionLine', () => {
  it('shows just the web version in a browser', () => {
    expect(versionLine('0.1.0', null)).toBe('Version 0.1.0')
  })

  it('shows both versions inside the Android app', () => {
    expect(versionLine('0.2.0', '0.1.0')).toBe('Web 0.2.0 · Android app 0.1.0')
  })
})
