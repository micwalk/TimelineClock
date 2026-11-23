// One sound preview at a time, with ■ to stop it; picking a sound stops it.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'

const previewSound = vi.fn<(sound: string, onEnded?: () => void) => boolean>(() => true)
const stopPreview = vi.fn()
const previewNativeSound = vi.fn(async () => {})
const stopNativePreview = vi.fn(async () => {})
vi.mock('./AlarmScheduler.ts', () => ({
  previewSound: (s: string, e?: () => void) => previewSound(s, e),
  stopPreview: () => stopPreview(),
}))
vi.mock('./nativeShell.ts', () => ({
  previewNativeSound: () => previewNativeSound(),
  stopNativePreview: () => stopNativePreview(),
  isNativeShell: () => false,
  nativeSounds: async () => null,
}))

import { NATIVE_PREVIEW_MS, currentPreview, playSoundPreview, stopSoundPreview } from './soundPreview.ts'
import { SoundChips } from '../components/common/SoundPicker.tsx'

afterEach(() => {
  stopSoundPreview()
  vi.clearAllMocks()
  vi.useRealTimers()
})

describe('sound previews', () => {
  it('plays one at a time and goes back to none when it has played out', () => {
    playSoundPreview('tone1', false)
    expect(currentPreview()).toBe('tone1')
    const ended = previewSound.mock.calls[0][1]!
    playSoundPreview('tone2', false)
    expect(stopPreview).toHaveBeenCalledTimes(1)
    // The first one's end (it was cut) leaves the second alone.
    ended()
    expect(currentPreview()).toBe('tone2')
    previewSound.mock.calls[1][1]!()
    expect(currentPreview()).toBeNull()
  })

  it('■ stops it', () => {
    playSoundPreview('chime', false)
    stopSoundPreview()
    expect(stopPreview).toHaveBeenCalled()
    expect(currentPreview()).toBeNull()
  })

  it("nothing shows as playing when the browser can't play", () => {
    previewSound.mockReturnValueOnce(false)
    playSoundPreview('tone1', false)
    expect(currentPreview()).toBeNull()
  })

  it("in the Android app, the app's sound plays; stopped there, or done after its preview time", () => {
    vi.useFakeTimers()
    playSoundPreview('tone3', true)
    expect(previewNativeSound).toHaveBeenCalled()
    vi.advanceTimersByTime(NATIVE_PREVIEW_MS)
    expect(currentPreview()).toBeNull()
    playSoundPreview('tone3', true)
    stopSoundPreview()
    expect(stopNativePreview).toHaveBeenCalled()
  })

  it("the picker's ▶ reads ■ while it plays, and picking a sound stops it", () => {
    const onChange = vi.fn()
    render(<SoundChips value="tone1" onChange={onChange} />)
    fireEvent.click(screen.getByRole('button', { name: 'Play Beacon' }))
    expect(screen.getByRole('button', { name: 'Stop Beacon' })).toBeTruthy()
    fireEvent.click(screen.getByRole('radio', { name: /Beacon/ }))
    expect(onChange).toHaveBeenCalledWith('tone2')
    expect(stopPreview).toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Play Beacon' })).toBeTruthy()
  })
})
