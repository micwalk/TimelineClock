import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { InstantRecord } from '../../domain/entities.ts'
import { alarmNotificationIds } from '../../domain/nativeNotifications.ts'
import { MINUTE } from '../../domain/time.ts'

// A fake LocalNotifications plugin: what is pending and what is showing.
const fake = vi.hoisted(() => ({
  permission: 'granted' as string,
  pending: [] as { id: number; title: string; body: string }[],
  delivered: [] as { id: number; tag?: string; title: string; body: string }[],
  scheduled: [] as { id: number; title: string; isExactNotification?: boolean; schedule?: { at?: Date; allowWhileIdle?: boolean }; extra?: { instantId: string }; channelId?: string }[],
  requested: 0,
}))

vi.mock('@capacitor/local-notifications', () => ({
  LocalNotifications: {
    checkPermissions: vi.fn(async () => ({ display: fake.permission })),
    requestPermissions: vi.fn(async () => { fake.requested++; return { display: fake.permission } }),
    getPending: vi.fn(async () => ({ notifications: fake.pending })),
    cancel: vi.fn(async ({ notifications }: { notifications: { id: number }[] }) => {
      const ids = new Set(notifications.map(n => n.id))
      fake.pending = fake.pending.filter(n => !ids.has(n.id))
    }),
    schedule: vi.fn(async ({ notifications }: { notifications: typeof fake.scheduled }) => {
      fake.scheduled.push(...notifications)
      const ids = new Set(notifications.map(n => n.id))
      fake.pending = [...fake.pending.filter(n => !ids.has(n.id)), ...notifications.map(n => ({ id: n.id, title: n.title, body: '' }))]
      return { notifications: notifications.map(n => ({ id: n.id })) }
    }),
    getDeliveredNotifications: vi.fn(async () => ({ notifications: fake.delivered })),
    removeDeliveredNotificationsById: vi.fn(async ({ ids }: { ids: number[] }) => {
      fake.delivered = fake.delivered.filter(n => !ids.includes(n.id))
    }),
  },
}))

const now = Date.now()
const inst = (id: string, offsetMs: number, opts: Partial<InstantRecord> = {}): InstantRecord =>
  ({ id, tsEpochMs: now + offsetMs, label: id, ...opts })

// Fresh module state (what was scheduled) for each test.
async function load(instants: InstantRecord[]) {
  vi.resetModules()
  const { useEntities } = await import('../../store/entities.ts')
  useEntities.setState({ instants, spans: [] })
  const { syncAlarms } = await import('./alarmSync.ts')
  const sync = (exact = true) => syncAlarms(async () => exact)
  return { useEntities, sync }
}

beforeEach(() => {
  fake.permission = 'granted'
  fake.pending = []
  fake.delivered = []
  fake.scheduled = []
  fake.requested = 0
})

describe('syncAlarms', () => {
  it('schedules future alarms exactly, allowed while idle, on the alarms channel', async () => {
    const { sync } = await load([inst('tea', 5 * MINUTE, { alarm: true }), inst('plain', 5 * MINUTE), inst('past', -MINUTE, { alarm: true })])
    await sync()
    expect(fake.scheduled).toHaveLength(1)
    expect(fake.scheduled[0]).toMatchObject({
      title: 'tea', channelId: 'alarms', isExactNotification: true,
      schedule: { at: new Date(now + 5 * MINUTE), allowWhileIdle: true }, extra: { instantId: 'tea' },
    })
  })

  it('never asks for permission, and schedules nothing without it', async () => {
    fake.permission = 'prompt'
    const { sync } = await load([inst('tea', 5 * MINUTE, { alarm: true })])
    await sync()
    expect(fake.requested).toBe(0)
    expect(fake.scheduled).toEqual([])
  })

  it('replaces whatever an earlier page left pending, then only changes what changed', async () => {
    fake.pending = [{ id: 42, title: 'old', body: '' }]
    const { sync, useEntities } = await load([inst('a', 5 * MINUTE, { alarm: true }), inst('b', 9 * MINUTE, { alarm: true })])
    await sync()
    expect(fake.pending.map(n => n.title).sort()).toEqual(['a', 'b'])

    fake.scheduled = []
    useEntities.setState(s => ({ instants: s.instants.map(i => (i.id === 'a' ? { ...i, tsEpochMs: now + 7 * MINUTE } : i)) }))
    await sync()
    expect(fake.scheduled.map(n => n.title)).toEqual(['a'])
    expect(fake.pending.map(n => n.title).sort()).toEqual(['a', 'b'])

    fake.scheduled = []
    await sync()
    expect(fake.scheduled).toEqual([])
  })

  it('cancels an alarm that was turned off or deleted', async () => {
    const { sync, useEntities } = await load([inst('a', 5 * MINUTE, { alarm: true }), inst('b', 9 * MINUTE, { alarm: true })])
    await sync()
    useEntities.setState(s => ({ instants: s.instants.filter(i => i.id !== 'a').map(i => ({ ...i, alarm: false })) }))
    await sync()
    expect(fake.pending).toEqual([])
  })

  it('takes answered alarms out of the shade, and leaves ringing ones and live notifications', async () => {
    const ringing = inst('ringing', -MINUTE, { alarm: true })
    const answered = inst('answered', -MINUTE)
    const ids = alarmNotificationIds([ringing, { ...answered, alarm: true }])
    fake.delivered = [
      { id: ids.get('ringing')!, title: 'ringing', body: '' },
      { id: ids.get('answered')!, title: 'answered', body: '' },
      { id: 7, tag: 'tc-live', title: 'Stopwatch', body: '' },
    ]
    const { sync } = await load([ringing, answered])
    await sync()
    expect(fake.delivered.map(n => n.title)).toEqual(['ringing', 'Stopwatch'])
  })

  it('asks only for inexact alarms when exact ones are not allowed', async () => {
    const { sync } = await load([inst('tea', 5 * MINUTE, { alarm: true })])
    await sync(false)
    expect(fake.scheduled[0].isExactNotification).toBe(false)
  })

  it('runs overlapping calls one after another, the last one seeing the latest state', async () => {
    const { sync, useEntities } = await load([inst('a', 5 * MINUTE, { alarm: true })])
    const first = sync()
    useEntities.setState(s => ({ instants: [...s.instants, inst('b', 6 * MINUTE, { alarm: true })] }))
    const second = sync()
    await Promise.all([first, second])
    expect(fake.pending.map(n => n.title).sort()).toEqual(['a', 'b'])
  })
})
