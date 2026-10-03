import { describe, expect, it } from 'vitest'
import { panelPosition } from './panelPosition.ts'

describe('panelPosition', () => {
  it('opens below the gear with the remaining height', () => {
    const p = panelPosition({ top: 391, bottom: 429, right: 1300 }, 1400, 900)
    expect(p).toEqual({ right: 100, top: 437, maxHeight: 455 })
  })
  it('opens above a gear near the bottom', () => {
    const p = panelPosition({ top: 800, bottom: 838, right: 1300 }, 1400, 900)
    expect(p).toEqual({ right: 100, bottom: 900 - 800 + 8, maxHeight: 784 })
  })
})
