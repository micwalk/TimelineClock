import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { InstantRecord, SpanRecord } from '../../domain/entities.ts'
import type { NativeAlarm } from '../../domain/nativeNotifications.ts'
import { MINUTE } from '../../domain/time.ts'

// A fake Alarms plugin: the last sync, waiting answers, and the permission.
const fake = vi.hoisted(() => ({
  permission: 'granted' as string,
  synced: null as null | { alarms: NativeAlarm[]; ringMs: number; unattended: string; snoozeMinutes: number },
  actions: [] as unknown[],
  requested: 0,
}))

const status = { notifications: true, alarmChannel: true, exactAlarms: true }

vi.mock('./alarmsPlugin.ts', () => ({
  Alarms: {
    checkPermissions: vi.fn(async () => ({ notifications: fake.permission })),
    requestPermissions: vi.fn(async () => { fake.requested++; return { notifications: fake.permission } }),
    getStatus: vi.fn(async () => ({ ...status, notifications: fake.permission === 'granted' })),
    takeActions: vi.fn(async () => { const actions = fake.actions; fake.actions = []; return { actions } }),
    sync: vi.fn(async (opts: NonNullable<typeof fake.synced>) => { fake.synced = opts; return status }),
  },
}))

const now = Date.now()
const inst = (id: string, offsetMs: number, opts: Partial<InstantRecord> = {}): InstantRecord =>
  ({ id, tsEpochMs: now + offsetMs, label: id, ...opts })
const span = (id: string, a: string, b: string, label = ''): SpanRecord =>
  ({ id, startInstantId: a, endInstantId: b, label, visible: true, endIsNow: false })

// Fresh module state for each test.
async function load(instants: InstantRecord[], spans: SpanRecord[] = []) {
  vi.resetModules()
  const { useEntities, entities } = await import('../../store/entities.ts')
  useEntities.setState({ instants, spans })
  const { useAlarms } = await import('../../store/alarms.ts')
  useAlarms.setState({ ringing: [], autoDismissMs: 5 * MINUTE, unattended: 'dismiss' })
  const { useShell } = await import('../../store/shell.ts')
  const { syncAlarms } = await import('./alarmSync.ts')
  return { useEntities, entities, useShell, syncAlarms }
}

beforeEach(() => {
  fake.permission = 'granted'
  fake.synced = null
  fake.actions = []
  fake.requested = 0
})

describe('syncAlarms', () => {
  it('hands the native side the alarms and the ring settings, and records what Android allows', async () => {
    const { syncAlarms, useShell } = await load([inst('tea', 5 * MINUTE, { alarm: true }), inst('plain', 5 * MINUTE)])
    await syncAlarms()
    expect(fake.synced).toMatchObject({ ringMs: 5 * MINUTE, unattended: 'dismiss', snoozeMinutes: 5 })
    expect(fake.synced?.alarms.map(a => a.instantId)).toEqual(['tea'])
    expect(useShell.getState().status).toEqual(status)
  })

  it('never asks for permission, and syncs nothing without it', async () => {
    fake.permission = 'prompt'
    const { syncAlarms, useShell } = await load([inst('tea', 5 * MINUTE, { alarm: true })])
    await syncAlarms()
    expect(fake.requested).toBe(0)
    expect(fake.synced).toBeNull()
    expect(useShell.getState().status?.notifications).toBe(false)
  })

  it('replays a Dismiss from the notification before syncing, and a timer’s end stops being a favorite', async () => {
    fake.actions = [{ type: 'dismiss', instantId: 'end', t: now }]
    const { syncAlarms, entities } = await load(
      [inst('start', -2 * MINUTE), inst('end', -MINUTE, { alarm: true, favorite: true })],
      [span('timer', 'start', 'end', '1m timer'), { id: 'endNow', startInstantId: 'end', endInstantId: '__NOW__', label: '', visible: true, endIsNow: true }],
    )
    await syncAlarms()
    expect(entities.getInstant('end')).toMatchObject({ alarm: false, favorite: false })
    expect(entities.getSpan('endNow')?.visible).toBe(false)
    expect(fake.synced?.alarms).toEqual([])
  })

  it('replays a Snooze at the time the notification chose', async () => {
    const at = now + 4 * MINUTE
    fake.actions = [{ type: 'snooze', instantId: 'wake', at }]
    const { syncAlarms, useEntities } = await load([inst('wake', -MINUTE, { alarm: true, label: 'Wake up' })])
    await syncAlarms()
    const snoozed = useEntities.getState().instants.find(i => i.snoozeOriginalId === 'wake')
    expect(snoozed).toMatchObject({ tsEpochMs: at, label: 'Snooze 1: Wake up', alarm: true })
    expect(useEntities.getState().instants.find(i => i.id === 'wake')?.alarm).toBe(false)
    expect(fake.synced?.alarms.map(a => a.instantId)).toEqual([snoozed?.id])
  })

  it('runs overlapping calls one after another, the last one seeing the latest state', async () => {
    const { syncAlarms, useEntities } = await load([inst('a', 5 * MINUTE, { alarm: true })])
    const first = syncAlarms()
    useEntities.setState(s => ({ instants: [...s.instants, inst('b', 6 * MINUTE, { alarm: true })] }))
    const second = syncAlarms()
    await Promise.all([first, second])
    expect(fake.synced?.alarms.map(a => a.instantId)).toEqual(['a', 'b'])
  })
})
