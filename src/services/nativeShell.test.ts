import { afterEach, describe, expect, it } from 'vitest'
import { isNativeShell } from './nativeShell.ts'

type CapWindow = Window & { Capacitor?: unknown }

afterEach(() => { delete (window as CapWindow).Capacitor })

describe('isNativeShell', () => {
  it('is false in a browser', () => {
    expect(isNativeShell()).toBe(false)
    ;(window as CapWindow).Capacitor = { isNativePlatform: () => false }
    expect(isNativeShell()).toBe(false)
  })

  it('is true inside the Android app, whose bridge defines window.Capacitor', () => {
    ;(window as CapWindow).Capacitor = { isNativePlatform: () => true }
    expect(isNativeShell()).toBe(true)
  })

  it('treats a broken global as a browser', () => {
    ;(window as CapWindow).Capacitor = { isNativePlatform: () => { throw new Error('nope') } }
    expect(isNativeShell()).toBe(false)
    ;(window as CapWindow).Capacitor = { isNativePlatform: 'yes' }
    expect(isNativeShell()).toBe(false)
  })
})
