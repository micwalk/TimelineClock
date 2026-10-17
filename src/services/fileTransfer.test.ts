import { afterEach, describe, expect, it, vi } from 'vitest'

const save = vi.fn()
vi.mock('./native/filesPlugin.ts', () => ({ Files: { save: (o: unknown) => save(o) } }))

import { saveText } from './fileTransfer.ts'

const inApp = (on: boolean) => {
  ;(window as Window & { Capacitor?: unknown }).Capacitor = on ? { isNativePlatform: () => true } : undefined
}

afterEach(() => { inApp(false); save.mockReset() })

describe('saveText', () => {
  it('in the Android app, saves through the Files plugin (its picker); a cancel is not an error', async () => {
    inApp(true)
    save.mockResolvedValueOnce({ saved: true })
    expect(await saveText('b.json', '{}')).toBe('saved')
    expect(save).toHaveBeenCalledWith({ name: 'b.json', text: '{}', mimeType: 'application/json' })
    save.mockResolvedValueOnce({ saved: false })
    expect(await saveText('b.json', '{}')).toBe('cancelled')
  })

  it('an app installed before it could save files says to update', async () => {
    inApp(true)
    save.mockRejectedValueOnce(Object.assign(new Error('not implemented'), { code: 'UNIMPLEMENTED' }))
    expect(await saveText('b.json', '{}')).toBe('update-app')
  })

  it('in a browser, downloads', async () => {
    // jsdom has no object URLs.
    const created = vi.fn(() => 'blob:x')
    Object.assign(URL, { createObjectURL: created, revokeObjectURL: () => {} })
    expect(await saveText('b.json', '{}')).toBe('saved')
    expect(created).toHaveBeenCalled()
    expect(save).not.toHaveBeenCalled()
  })
})
