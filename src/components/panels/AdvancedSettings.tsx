// Settings > Advanced: every behavior tunable as a number field, generated from the
// tunables table, with a reset button on changed values.
import { useState } from 'react'
import { ArrowUturnLeftIcon } from '@heroicons/react/20/solid'
import type { TunableDescriptor, TunableGroup } from '../../domain/tunables.ts'
import { TUNABLE_DESCRIPTORS } from '../../domain/tunables.ts'
import { getTunables, settings, useSettings } from '../../store/settings.ts'
import { IconButton } from '../common/IconButton.tsx'

const GROUPS: TunableGroup[] = ['Layout', 'Gestures', 'Glide', 'Labels']

function TunableRow({ d }: { d: TunableDescriptor }) {
  const overridden = useSettings(s => d.key in s.tunables)
  // Re-render on changes; the resolved value is clamped and merged with defaults.
  useSettings(s => s.tunables[d.key])
  const value = getTunables()[d.key]
  const id = `tunable-${d.key}`
  // While editing, show what's typed; only in-range numbers commit live, the rest settle on blur/Enter.
  const [draft, setDraft] = useState<string | null>(null)
  const settle = () => {
    const n = draft === null || draft.trim() === '' ? NaN : Number(draft)
    if (Number.isFinite(n)) settings.setTunable(d.key, n)
    setDraft(null)
  }
  return (
    <div className="settings__row settings__row--tunable">
      <label htmlFor={id}>{d.label}</label>
      <input
        id={id}
        type="number"
        min={d.min}
        max={d.max}
        step={d.step}
        value={draft ?? value}
        onChange={e => {
          setDraft(e.target.value)
          const n = e.target.valueAsNumber
          if (Number.isFinite(n) && n >= d.min && n <= d.max) settings.setTunable(d.key, n)
        }}
        onBlur={settle}
        onKeyDown={e => { if (e.key === 'Enter') settle() }}
      />
      {overridden ? (
        <IconButton icon={ArrowUturnLeftIcon} label={`Reset ${d.label}`} bare onClick={() => { setDraft(null); settings.resetTunable(d.key) }} />
      ) : (
        <span className="settings__reset-spacer" aria-hidden />
      )}
    </div>
  )
}

export function AdvancedSettings() {
  return (
    <>
      {GROUPS.map(group => (
        <div key={group} className="settings__subgroup">
          <h4>{group}</h4>
          {TUNABLE_DESCRIPTORS.filter(d => d.group === group).map(d => <TunableRow key={d.key} d={d} />)}
        </div>
      ))}
    </>
  )
}
