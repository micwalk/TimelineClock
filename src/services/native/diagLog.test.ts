import { beforeEach, describe, expect, it, vi } from 'vitest'
import { clearPageLog, diag, pageLog, timed } from './diagLog.ts'

beforeEach(() => clearPageLog())

describe('diagLog', () => {
  it('keeps the last 200 lines, stamped', () => {
    for (let i = 0; i < 205; i++) diag(`line ${i}`)
    const lines = pageLog()
    expect(lines).toHaveLength(200)
    expect(lines[0]).toMatch(/^\d\d-\d\d \d\d:\d\d:\d\d\.\d{3} line 5$/)
    expect(lines.at(-1)).toMatch(/ line 204$/)
  })

  it('notes slow and failed native calls, not quick ones', async () => {
    const now = vi.spyOn(performance, 'now')
    now.mockReturnValueOnce(0).mockReturnValueOnce(10)
    await timed('quick', Promise.resolve(1))
    now.mockReturnValueOnce(0).mockReturnValueOnce(2500)
    await timed('sync', Promise.resolve(1))
    await expect(timed('takeActions', Promise.reject(new Error('boom')))).rejects.toThrow('boom')
    now.mockRestore()
    const lines = pageLog().join('\n')
    expect(lines).not.toMatch(/quick/)
    expect(lines).toMatch(/sync took 2500 ms/)
    expect(lines).toMatch(/takeActions failed: Error: boom/)
  })
})
