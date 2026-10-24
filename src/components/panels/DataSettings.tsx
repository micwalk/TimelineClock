// Settings > Data: export settings and data as one JSON file, or import settings and/or data
// from one (data replaces what is here or is combined with it). With more than one group
// (domain/collections), export picks the groups (and whether settings go too: sharing a group
// with someone leaves them out), and a combining import maps each of the file's groups to a new
// group, one of yours, or nothing.
import { useMemo, useRef, useState } from 'react'
import type { Backup, ImportMode } from '../../domain/backup.ts'
import { backupFileName, describeBackup, parseBackup } from '../../domain/backup.ts'
import type { ImportGroupRow, ImportTarget } from '../../domain/collections.ts'
import { collectionCounts, defaultImportRows } from '../../domain/collections.ts'
import { storedInstants } from '../../domain/entities.ts'
import { useEntities } from '../../store/entities.ts'
import * as act from '../../store/actions.ts'
import { readFileText, saveText } from '../../services/fileTransfer.ts'

interface Pending {
  backup: Backup
  settings: boolean
  data: boolean
  mode: ImportMode
  groups: ImportGroupRow[]
}

interface ExportChoice {
  groups: ReadonlySet<string>
  settings: boolean
}

export function DataSettings() {
  const fileRef = useRef<HTMLInputElement>(null)
  const [pending, setPending] = useState<Pending | null>(null)
  const [exporting, setExporting] = useState<ExportChoice | null>(null)
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null)
  const collections = useEntities(s => s.collections)

  const save = async (choice: ExportChoice | null) => {
    const now = new Date()
    const all = !choice || choice.groups.size === collections.length
    const backup = act.exportBackup(now, { collections: all ? undefined : choice!.groups, settings: choice?.settings ?? true })
    setExporting(null)
    try {
      const result = await saveText(backupFileName(now), JSON.stringify(backup, null, 2))
      const what = [backup.settings && 'settings', all ? 'data' : `${choice!.groups.size === 1 ? 'one group' : `${choice!.groups.size} groups`}`].filter(Boolean).join(' and ')
      setMessage(result === 'saved' ? { text: `Exported ${what}.` }
        : result === 'cancelled' ? { text: 'Not exported.' }
        : { text: 'This version of the Android app can’t save files: install the latest from GitHub Releases.', error: true })
    } catch {
      setMessage({ text: 'Could not save the file.', error: true })
    }
  }

  const startExport = () => {
    setMessage(null)
    // With only Default there is nothing to pick.
    if (collections.length <= 1) void save(null)
    else setExporting({ groups: new Set(collections.map(c => c.id)), settings: true })
  }

  const onFile = async (file: File | undefined) => {
    if (!file) return
    let text: string
    try {
      text = await readFileText(file)
    } catch {
      setPending(null)
      setMessage({ text: 'Could not read the file.', error: true })
      return
    }
    const result = parseBackup(text)
    if (!result.ok) {
      setPending(null)
      setMessage({ text: result.error, error: true })
      return
    }
    const { backup } = result
    setMessage(null)
    setExporting(null)
    setPending({
      backup, settings: !!backup.settings, data: !!backup.data, mode: 'combine',
      groups: backup.data ? defaultImportRows(backup.data, useEntities.getState().collections) : [],
    })
  }

  const runImport = () => {
    if (!pending) return
    act.importBackup(pending.backup, pending)
    const parts = [pending.settings && 'settings', pending.data && (pending.mode === 'replace' ? 'data (replaced)' : 'data (combined)')].filter(Boolean)
    setPending(null)
    setMessage({ text: `Imported ${parts.join(' and ')}.` })
  }

  const nothingChosen = !pending || (!pending.settings && !pending.data)

  return (
    <div className="data-settings">
      <div className="data-settings__buttons">
        <button type="button" className="settings__action settings__action--plain glow-box" onClick={startExport}>Export…</button>
        <button type="button" className="settings__action settings__action--plain glow-box" onClick={() => fileRef.current?.click()}>Import…</button>
      </div>
      <input
        ref={fileRef}
        type="file"
        accept="application/json,.json"
        hidden
        data-testid="import-file"
        onChange={e => {
          void onFile(e.target.files?.[0])
          e.target.value = '' // picking the same file again still fires
        }}
      />

      {exporting && <ExportPicker choice={exporting} onChange={setExporting} onCancel={() => setExporting(null)} onExport={() => void save(exporting)} />}

      {pending && (
        <div className="data-settings__import" role="group" aria-label="Import">
          <p className="data-settings__summary">File has {describeBackup(pending.backup)}.</p>
          <label className="settings__row settings__row--check">
            <input type="checkbox" checked={pending.settings} disabled={!pending.backup.settings} onChange={e => setPending({ ...pending, settings: e.target.checked })} />
            <span>Settings</span>
          </label>
          <label className="settings__row settings__row--check">
            <input type="checkbox" checked={pending.data} disabled={!pending.backup.data} onChange={e => setPending({ ...pending, data: e.target.checked })} />
            <span>Instants and spans</span>
          </label>
          {pending.data && (
            <fieldset className="data-settings__mode">
              <label className="settings__row settings__row--check">
                <input type="radio" name="import-mode" checked={pending.mode === 'combine'} onChange={() => setPending({ ...pending, mode: 'combine' })} />
                <span>Combine with current data</span>
              </label>
              <label className="settings__row settings__row--check">
                <input type="radio" name="import-mode" checked={pending.mode === 'replace'} onChange={() => setPending({ ...pending, mode: 'replace' })} />
                <span>Replace current data</span>
              </label>
            </fieldset>
          )}
          {pending.data && pending.mode === 'combine' && pending.groups.length > 0 && (
            <ImportGroups rows={pending.groups} onChange={groups => setPending({ ...pending, groups })} />
          )}
          <div className="data-settings__buttons">
            <button type="button" className="settings__action settings__action--plain glow-box" onClick={() => setPending(null)}>Cancel</button>
            <button type="button" className="settings__action glow-box" disabled={nothingChosen} onClick={runImport}>
              {pending.data && pending.mode === 'replace' ? 'Replace' : 'Import'}
            </button>
          </div>
        </div>
      )}

      {message && <p className={`data-settings__message${message.error ? ' is-error' : ''}`} role="status">{message.text}</p>}
    </div>
  )
}

/** Which groups to export (all ticked to start), and whether the settings go too. */
function ExportPicker({ choice, onChange, onCancel, onExport }: { choice: ExportChoice; onChange: (c: ExportChoice) => void; onCancel: () => void; onExport: () => void }) {
  const collections = useEntities(s => s.collections)
  const instants = useEntities(s => s.instants)
  const series = useEntities(s => s.groups)
  const counts = useMemo(() => collectionCounts(storedInstants(instants), series ?? []), [instants, series])
  const toggle = (id: string, on: boolean) => {
    const groups = new Set(choice.groups)
    if (on) groups.add(id)
    else groups.delete(id)
    onChange({ ...choice, groups })
  }
  return (
    <div className="data-settings__import" role="group" aria-label="Export">
      <p className="data-settings__summary">Export these groups:</p>
      {collections.map(c => (
        <label key={c.id} className="settings__row settings__row--check">
          <input type="checkbox" checked={choice.groups.has(c.id)} onChange={e => toggle(c.id, e.target.checked)} />
          <span>{c.label} <span className="data-settings__count">({counts.get(c.id) ?? 0})</span></span>
        </label>
      ))}
      <label className="settings__row settings__row--check">
        <input type="checkbox" checked={choice.settings} onChange={e => onChange({ ...choice, settings: e.target.checked })} />
        <span>Settings too <span className="data-settings__count">(untick to share groups)</span></span>
      </label>
      <div className="data-settings__buttons">
        <button type="button" className="settings__action settings__action--plain glow-box" onClick={onCancel}>Cancel</button>
        <button type="button" className="settings__action glow-box" disabled={choice.groups.size === 0 && !choice.settings} onClick={onExport}>Export</button>
      </div>
    </div>
  )
}

const targetValue = (t: ImportTarget) => (t.kind === 'into' ? `into:${t.id}` : t.kind)

/** Where each of the file's groups goes: a new group (named as in the file), one of yours, or left out. */
function ImportGroups({ rows, onChange }: { rows: ImportGroupRow[]; onChange: (rows: ImportGroupRow[]) => void }) {
  const mine = useEntities(s => s.collections)
  const set = (k: number, value: string) => {
    const target: ImportTarget = value === 'skip' ? { kind: 'skip' } : value.startsWith('into:') ? { kind: 'into', id: value.slice(5) } : { kind: 'new', label: rows[k].label }
    onChange(rows.map((r, j) => (j === k ? { ...r, target } : r)))
  }
  return (
    <div className="data-settings__groups">
      <p className="data-settings__summary">The file’s groups:</p>
      {rows.map((r, k) => (
        <label key={r.id} className="group-select">
          <span className="group-select__label">{r.label} ({r.count})</span>
          <select aria-label={`Import ${r.label} as`} value={targetValue(r.target)} onChange={e => set(k, e.target.value)}>
            <option value="new">New group “{r.label}”</option>
            {mine.map(m => <option key={m.id} value={`into:${m.id}`}>Into {m.label}</option>)}
            <option value="skip">Leave out</option>
          </select>
        </label>
      ))}
    </div>
  )
}
