import { describe, expect, it } from 'vitest'
import { sparkAt, confettiBurst } from './sparks.ts'

describe('confetti', () => {
  it('a burst is the same for the same seed', () => {
    expect(confettiBurst(10, 140, 1.5, 3, 7)).toEqual(confettiBurst(10, 140, 1.5, 3, 7))
    expect(confettiBurst(10, 140, 1.5, 3, 7)).toHaveLength(10)
  })
  it('confetti flies out all around (a little more up), falls and fades, and is gone by the end', () => {
    const burst = confettiBurst(60, 140, 1.5, 3, 3)
    const early = burst.map(s => sparkAt(s, 0.15, 1.5, 140)!)
    const up = early.filter(p => p.y < 0).length
    expect(up).toBeGreaterThan(30)
    expect(up).toBeLessThan(55)
    expect(early.filter(p => p.x < 0).length).toBeGreaterThan(15)
    expect(early.filter(p => p.x > 0).length).toBeGreaterThan(15)
    // Later, gravity has most of them on the way down.
    const late = burst.map(s => [sparkAt(s, 0.3, 1.5, 140), sparkAt(s, 0.8, 1.5, 140)] as const).filter(([a, b]) => a && b)
    expect(late.filter(([a, b]) => b!.y > a!.y).length).toBeGreaterThan(late.length / 2)
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
