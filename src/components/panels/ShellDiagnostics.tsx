// Inside the Android app: copy the diagnostics log (native and page events, stalls, errors)
// to report a problem. Nothing in a browser.
import { useState } from 'react'
import { clearNativeDiagnostics, nativeDiagnostics } from '../../services/nativeShell.ts'
import { useShell } from '../../store/shell.ts'

export function ShellDiagnostics() {
  const inApp = useShell(s => s.status !== null)
  const [note, setNote] = useState('')
  const [text, setText] = useState<string | null>(null)
  if (!inApp) return null

  const copy = async () => {
    const t = await nativeDiagnostics()
    try {
      await navigator.clipboard.writeText(t)
      setNote('Copied. Paste it into a message.')
      setText(null)
    } catch {
      // No clipboard access: show it to select and copy by hand.
      setNote('Select the text below and copy it.')
      setText(t)
    }
  }
  const clear = async () => {
    await clearNativeDiagnostics()
    setNote('Log cleared.')
    setText(null)
  }

  return (
    <div className="shell-diag">
      <div className="shell-diag__row">
        <button type="button" className="settings__action settings__action--plain glow-box" onClick={() => void copy()}>Copy diagnostics log</button>
        <button type="button" className="settings__action settings__action--plain glow-box" onClick={() => void clear()}>Clear</button>
      </div>
      {note && <p className="shell-diag__note" role="status">{note}</p>}
      {text !== null && <textarea className="shell-diag__text mono" readOnly value={text} rows={8} onFocus={e => e.currentTarget.select()} />}
    </div>
  )
}
