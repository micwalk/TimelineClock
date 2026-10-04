import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { InstantRecord, SpanRecord } from '../../domain/entities.ts'
import type { LiveNotification } from '../../domain/nativeNotifications.ts'
import { MINUTE } from '../../domain/time.ts'

const fake = vi.hoisted(() => ({ calls: [] as LiveNotification[][] }))

vi.mock('./liveNotificationsPlugin.ts', () => ({
  LiveNotifications: {
    sync: vi.fn(async ({ items }: { items: LiveNotification[] }) => {
      fake.calls.push(items)
      return { posted: items.length, notifications: true, alarmChannel: true, exactAlarms: true, liveUpdates: false }
    }),
  },
}))

const now = Date.now()
const inst = (id: string, offsetMs: number, opts: Partial<InstantRecord> = {}): InstantRecord =>
  ({ id, tsEpochMs: now + offsetMs, label: '', ...opts })
const span = (a: string, b: string, label: string): SpanRecord =>
  ({ id: `s_${a}_${b}`, startInstantId: a, endInstantId: b, label, visible: true, endIsNow: false })

async function load(instants: InstantRecord[], spans: SpanRecord[]) {
  vi.resetModules()
  const { useEntities } = await import('../../store/entities.ts')
  useEntities.setState({ instants, spans })
  const { useShell } = await import('../../store/shell.ts')
  const { useQuick } = await import('../../store/quick.ts')
  const { syncLive } = await import('./liveSync.ts')
  return { useEntities, useShell, useQuick, syncLive }
}

beforeEach(() => { fake.calls = [] })

describe('syncLive', () => {
  it('shows a running timer and records what Android allows', async () => {
    const { syncLive, useShell } = await load(
      [inst('start', -MINUTE), inst('end', 12 * MINUTE, { alarm: true, label: '13m timer' })],
      [span('start', 'end', '13m timer')],
    )
    await syncLive()
    expect(fake.calls).toHaveLength(1)
    expect(fake.calls[0]).toMatchObject([{ kind: 'countdown', title: '13m timer', whenMs: now + 12 * MINUTE, instantId: 'end' }])
    expect(useShell.getState().status).toEqual({ notifications: true, alarmChannel: true, exactAlarms: true, liveUpdates: false })
  })

  it('posts again only when the list changes, or when forced', async () => {
    const { syncLive, useQuick } = await load([inst('sw', -MINUTE)], [])
    await syncLive()
    await syncLive()
    expect(fake.calls).toEqual([[]])
    useQuick.setState({ stopwatch: { marks: ['sw'], stopped: false } })
    await syncLive()
    expect(fake.calls[1]).toMatchObject([{ kind: 'stopwatch', whenMs: now - MINUTE }])
    await syncLive(true)
    expect(fake.calls).toHaveLength(3)
    useQuick.setState({ stopwatch: { marks: [], stopped: false } })
    await syncLive()
    expect(fake.calls[3]).toEqual([])
  })
})
