import { describe, expect, it } from 'vitest'
import { isPreviewShell, previewNumber, versionLine } from './version.ts'

describe('versionLine', () => {
  it('shows just the web version in a browser', () => {
    expect(versionLine('0.1.0', null)).toBe('Version 0.1.0')
  })

  it('shows both versions inside the Android app', () => {
    expect(versionLine('0.2.0', '0.1.0')).toBe('Web 0.2.0 · Android app 0.1.0')
  })
})

describe('TC Preview', () => {
  it('is the app whose version ends in -preview, and the PR comes from the deploy preview address', () => {
    expect(isPreviewShell('0.4.2-preview')).toBe(true)
    expect(isPreviewShell('0.4.2')).toBe(false)
    expect(isPreviewShell(null)).toBe(false)
    expect(previewNumber('deploy-preview-25--timelineclockapp.netlify.app')).toBe(25)
    expect(previewNumber('timelineclockapp.netlify.app')).toBeNull()
  })
})
