// Settings > Data: export everything as one JSON file, or import settings and/or data
// from one (data replaces what is here or is combined with it).
import { useRef, useState } from 'react'
import type { Backup, ImportMode } from '../../domain/backup.ts'
import { backupFileName, describeBackup, parseBackup } from '../../domain/backup.ts'
import * as act from '../../store/actions.ts'
import { downloadText, readFileText } from '../../services/fileTransfer.ts'

interface Pending {
  backup: Backup
  settings: boolean
  data: boolean
  mode: ImportMode
}

export function DataSettings() {
  const fileRef = useRef<HTMLInputElement>(null)
  const [pending, setPending] = useState<Pending | null>(null)
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null)

  const exportAll = () => {
    const now = new Date()
    downloadText(backupFileName(now), JSON.stringify(act.exportBackup(now), null, 2))
    setMessage({ text: 'Exported settings and data.' })
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
    setPending({ backup, settings: !!backup.settings, data: !!backup.data, mode: 'combine' })
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
        <button type="button" className="settings__action settings__action--plain glow-box" onClick={exportAll}>Export…</button>
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
