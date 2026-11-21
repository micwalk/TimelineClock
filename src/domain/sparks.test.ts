import { describe, expect, it } from 'vitest'
import { sparkAt, sparkBurst } from './sparks.ts'

describe('sparks', () => {
  it('a burst is the same for the same seed', () => {
    expect(sparkBurst(10, 140, 1.5, 3, 7)).toEqual(sparkBurst(10, 140, 1.5, 3, 7))
    expect(sparkBurst(10, 140, 1.5, 3, 7)).toHaveLength(10)
  })
  it('sparks fly mostly up, fall and fade, and are gone by the end', () => {
    const burst = sparkBurst(60, 140, 1.5, 3, 3)
    const early = burst.map(s => sparkAt(s, 0.15, 1.5, 140)!)
    expect(early.filter(p => p.y < 0).length).toBeGreaterThan(40)
    for (const s of burst) {
      expect(sparkAt(s, 1.5, 1.5, 140)).toBeNull()
      const a = sparkAt(s, 0.1, 1.5, 140)!
      const b = sparkAt(s, 0.5, 1.5, 140)!
      expect(b.alpha).toBeLessThan(a.alpha)
    }
    // They stay within a few spreads of where they started.
    const far = Math.max(...burst.map(s => { const p = sparkAt(s, 0.8, 1.5, 140); return p ? Math.hypot(p.x, p.y) : 0 }))
    expect(far).toBeLessThan(400)
  })
})
