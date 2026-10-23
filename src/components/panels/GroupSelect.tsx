// A dropdown of your groups (domain/collections), with "New group…" at the bottom: picking it
// turns the dropdown into a name box, and the new group is picked once named (an empty name
// keeps the old pick).
import { useState } from 'react'
import { useEntities } from '../../store/entities.ts'
import * as act from '../../store/actions.ts'
import { InlineInput } from '../common/InlineInput.tsx'

const NEW = '__new__'

export function GroupSelect({ value, onChange, label = 'Group' }: { value: string; onChange: (id: string) => void; label?: string }) {
  const collections = useEntities(s => s.collections)
  const [naming, setNaming] = useState(false)
  return (
    <label className="group-select">
      <span className="group-select__label">{label}</span>
      {naming
        ? <InlineInput initial="" placeholder="Group name" ariaLabel="New group name" className="group-select__new chip-input glow-box"
            onCommit={name => { setNaming(false); if (name.trim()) onChange(act.createCollection(name)) }}
            onCancel={() => setNaming(false)} />
        : (
          <select value={value} onChange={e => (e.target.value === NEW ? setNaming(true) : onChange(e.target.value))}>
            {collections.map(c => <option key={c.id} value={c.id}>{c.label}{c.hidden ? ' (hidden)' : ''}</option>)}
            <option value={NEW}>New group…</option>
          </select>
        )}
    </label>
  )
}
