// Your groups (domain/collections), at the top of the Agenda's Groups tab: each with how many
// instants it holds, a switch that shows or hides them, rename, and delete (never Default).
// Deleting asks what happens to what's in it: move it to Default, or delete it too, which takes
// a second tap to confirm.
import { useEffect, useMemo, useState } from 'react'
import { PencilIcon, PlusIcon, TrashIcon } from '@heroicons/react/20/solid'
import type { CollectionRecord } from '../../domain/collections.ts'
import { DEFAULT_COLLECTION, collectionCounts } from '../../domain/collections.ts'
import { storedInstants } from '../../domain/entities.ts'
import { LABELS } from '../../config/labels.ts'
import { useEntities } from '../../store/entities.ts'
import * as act from '../../store/actions.ts'
import { IconButton } from '../common/IconButton.tsx'
import { InlineInput } from '../common/InlineInput.tsx'

/** The second tap that deletes a group's instants must come within this long, ms. */
const CONFIRM_MS = 4000

const instantsWord = (n: number) => `${n} instant${n === 1 ? '' : 's'}`

export function CollectionRows() {
  const collections = useEntities(s => s.collections)
  const instants = useEntities(s => s.instants)
  const series = useEntities(s => s.groups)
  const counts = useMemo(() => collectionCounts(storedInstants(instants), series ?? []), [instants, series])
  const [adding, setAdding] = useState(false)
  return (
    <div className="collection-rows">
      {collections.map(c => <CollectionRow key={c.id} c={c} count={counts.get(c.id) ?? 0} />)}
      {adding
        ? <InlineInput initial="" placeholder="Group name" ariaLabel="New group name" className="collection-rows__new chip-input glow-box"
            onCommit={name => { setAdding(false); if (name.trim()) act.createCollection(name) }} onCancel={() => setAdding(false)} />
        : <button type="button" className="alarm-link glow-box collection-rows__add" onClick={() => setAdding(true)}><PlusIcon aria-hidden /> New group</button>}
    </div>
  )
}

function CollectionRow({ c, count }: { c: CollectionRecord; count: number }) {
  const [renaming, setRenaming] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const on = !c.hidden
  const name = c.label || LABELS.defaultGroup
  return (
    <div className="group-row">
      <div className={`alarm-row alarm-row--collection glow-box${on ? '' : ' is-paused'}`}>
        <span className="alarm-row__time mono">{count}</span>
        <span className="alarm-row__main">
          {renaming
            ? <InlineInput initial={c.label} ariaLabel="Group name" className="chip-input glow-box"
                onCommit={v => { setRenaming(false); act.renameCollection(c.id, v) }} onCancel={() => setRenaming(false)} />
            : <span className="alarm-row__name">{name}</span>}
          <span className="alarm-row__sub">{instantsWord(count)}{c.id === DEFAULT_COLLECTION ? ' · new ones go here' : ''}</span>
        </span>
        <span className="alarm-row__when">{on ? '' : 'Hidden'}</span>
        <span className="alarm-row__tools">
          <IconButton icon={PencilIcon} label={`Rename ${name}`} color="var(--ink-dim)" bare onClick={() => setRenaming(true)} />
          {c.id !== DEFAULT_COLLECTION && (
            <IconButton icon={TrashIcon} label={`Delete ${name}…`} color="var(--c-danger)" bare pressed={deleting} onClick={() => setDeleting(d => !d)} />
          )}
        </span>
        <button type="button" role="switch" aria-checked={on} aria-label={on ? `Hide ${name}` : `Show ${name}`}
          className={`alarm-switch${on ? ' is-on' : ''}`} onClick={() => act.setCollectionShown(c.id, !on)}>
          <span className="alarm-switch__knob" />
        </button>
      </div>
      {deleting && <DeleteChoices c={c} name={name} count={count} onDone={() => setDeleting(false)} />}
    </div>
  )
}

function DeleteChoices({ c, name, count, onDone }: { c: CollectionRecord; name: string; count: number; onDone: () => void }) {
  const [armed, setArmed] = useState(false)
  useEffect(() => {
    if (!armed) return
    const t = setTimeout(() => setArmed(false), CONFIRM_MS)
    return () => clearTimeout(t)
  }, [armed])
  if (count === 0) {
    return (
      <div className="collection-delete">
        <button type="button" className="alarm-link alarm-link--danger glow-box" onClick={() => { act.deleteCollection(c.id); onDone() }}>Delete {name}</button>
        <button type="button" className="alarm-link glow-box" onClick={onDone}>Cancel</button>
      </div>
    )
  }
  return (
    <div className="collection-delete">
      <button type="button" className="alarm-link glow-box" onClick={() => { act.deleteCollection(c.id); onDone() }}>
        Delete {name}, move its {instantsWord(count)} to {LABELS.defaultGroup}
      </button>
      <button type="button" className={`alarm-link alarm-link--danger glow-box${armed ? ' is-armed' : ''}`}
        onClick={() => { if (!armed) { setArmed(true); return } act.deleteCollection(c.id, { withInstants: true }); onDone() }}>
        {armed ? `Tap again to delete ${instantsWord(count)}` : `Delete ${name} and its ${instantsWord(count)}…`}
      </button>
      <button type="button" className="alarm-link glow-box" onClick={onDone}>Cancel</button>
    </div>
  )
}
