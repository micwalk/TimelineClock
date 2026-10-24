import { beforeEach, describe, expect, it } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { entities, shownInstants, useEntities } from './entities.ts'
import { initialViewState, useView } from './view.ts'
import * as act from './actions.ts'
import { engine } from '../engine/viewportEngine.ts'
import { HOUR } from '../domain/time.ts'
import { DEFAULT_COLLECTION, sanitizeCollections } from '../domain/collections.ts'
import type { SeriesRecord } from '../domain/series.ts'
import { CollectionRows } from '../components/panels/CollectionRows.tsx'

beforeEach(() => {
  engine.cancelTransition()
  useEntities.setState({ instants: [], spans: [], groups: [], collections: sanitizeCollections([]) })
  useView.setState(initialViewState())
})

const series = (id: string): SeriesRecord => ({ id, kind: 'series', label: 'Wake', time: '07:00', repeat: { kind: 'interval', every: 1 }, alarms: [], from: '2026-10-01' })
const collections = () => useEntities.getState().collections

describe('your groups', () => {
  it('new instants are in Default; moving one, then switching its group off hides it from Previous/Next and the lists', () => {
    const now = engine.sample().now
    const a = entities.createInstant(now - HOUR, 'Work thing')
    const b = entities.createInstant(now - 2 * HOUR, 'Home thing')
    expect(entities.getInstant(a)!.collectionId).toBeUndefined()
    const work = act.createCollection('Work')
    act.setInstantCollection(a, work)
    expect(entities.getInstant(a)!.collectionId).toBe(work)
    act.setCollectionShown(work, false)
    expect(shownInstants().map(i => i.id)).toEqual([b])
    act.focusNow()
    act.goToAdjacentInstant(-1)
    expect(useView.getState().focusedInstantId).toBe(b)
    act.setCollectionShown(work, true)
    expect(shownInstants().map(i => i.id)).toEqual([a, b])
    // Back to Default: no group named.
    act.setInstantCollection(a, DEFAULT_COLLECTION)
    expect(entities.getInstant(a)!.collectionId).toBeUndefined()
  })

  it('a repeat\'s occurrence moves its whole series', () => {
    entities.putGroup(series('s1'))
    useEntities.setState({ instants: [{ id: 'o1', tsEpochMs: 0, label: 'Wake', seriesId: 's1', occurrence: '2026-10-01' }] })
    const c = act.createCollection('Morning')
    act.setInstantCollection('o1', c)
    expect(entities.getGroup('s1')!.collectionId).toBe(c)
    expect(entities.getInstant('o1')!.collectionId).toBeUndefined()
  })

  it('deleting a group moves what was in it to Default, or deletes it too', () => {
    const now = engine.sample().now
    const a = entities.createInstant(now - HOUR, 'A')
    const c = act.createCollection('Trip')
    act.setInstantCollection(a, c)
    act.deleteCollection(c)
    expect(collections().map(x => x.id)).toEqual([DEFAULT_COLLECTION])
    expect(entities.getInstant(a)!.collectionId).toBeUndefined()
    const d = act.createCollection('Trip 2')
    act.setInstantCollection(a, d)
    act.deleteCollection(d, { withInstants: true })
    expect(entities.getInstant(a)).toBeUndefined()
    act.deleteCollection(DEFAULT_COLLECTION)
    expect(collections().map(x => x.id)).toEqual([DEFAULT_COLLECTION])
  })

  it('exports chosen groups without settings; importing one maps it into a new group', () => {
    const now = engine.sample().now
    const a = entities.createInstant(now - HOUR, 'Hers')
    entities.createInstant(now - 2 * HOUR, 'Mine')
    const c = act.createCollection('Sarah')
    act.setInstantCollection(a, c)
    const file = act.exportBackup(new Date(), { collections: new Set([c]), settings: false })
    expect(file.settings).toBeUndefined()
    expect(file.data!.instants.map(i => i.label)).toEqual(['Hers'])
    // On another device: nothing but Default; the file's group comes in as a new one.
    useEntities.setState({ instants: [], spans: [], groups: [], collections: sanitizeCollections([]) })
    act.importBackup(file, { settings: false, data: true, mode: 'combine', groups: [{ id: c, label: 'Sarah', count: 1, target: { kind: 'new', label: 'Sarah' } }] })
    const [, sarah] = collections()
    expect(sarah.label).toBe('Sarah')
    expect(useEntities.getState().instants.map(i => [i.label, i.collectionId])).toEqual([['Hers', sarah.id]])
  })
})

describe('Groups tab', () => {
  it('deleting a group with instants takes a second tap to confirm', () => {
    const a = entities.createInstant(0, 'A')
    const c = act.createCollection('Trip')
    act.setInstantCollection(a, c)
    render(<CollectionRows />)
    fireEvent.click(screen.getByRole('button', { name: 'Delete Trip…' }))
    fireEvent.click(screen.getByRole('button', { name: 'Delete Trip and its 1 instant…' }))
    expect(entities.getInstant(a)).toBeDefined()
    fireEvent.click(screen.getByRole('button', { name: 'Tap again to delete 1 instant' }))
    expect(entities.getInstant(a)).toBeUndefined()
    expect(collections().map(x => x.id)).toEqual([DEFAULT_COLLECTION])
  })

  it('a switch hides a group; Default can be renamed but not deleted', () => {
    render(<CollectionRows />)
    expect(screen.queryByRole('button', { name: 'Delete Default…' })).toBeNull()
    fireEvent.click(screen.getByRole('switch', { name: 'Hide Default' }))
    expect(collections()[0].hidden).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'Rename Default' }))
    const box = screen.getByRole('textbox', { name: 'Group name' })
    fireEvent.change(box, { target: { value: 'Mine' } })
    fireEvent.keyDown(box, { key: 'Enter' })
    expect(collections()[0]).toEqual({ id: DEFAULT_COLLECTION, label: 'Mine', hidden: true })
  })
})
