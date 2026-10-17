// TC Preview only (the Android test app for pull requests, docs/android.md): which preview this
// is, and a button to load another, so switching doesn't depend on the launcher shortcut.
import { useState } from 'react'
import { useShell } from '../../store/shell.ts'
import { isPreviewShell, previewNumber } from '../../domain/version.ts'
import { changePreview } from '../../services/nativeShell.ts'

export function PreviewSwitch() {
  const preview = useShell(s => isPreviewShell(s.shellVersion))
  const [failed, setFailed] = useState(false)
  if (!preview) return null
  const pr = previewNumber(window.location.hostname)
  return (
    <section className="settings__group">
      <h3>TC Preview</h3>
      <div className="settings__row">
        <span>{pr !== null ? `Preview of PR #${pr}` : `Loading ${window.location.hostname}`}</span>
        <button type="button" className="settings__action settings__action--plain glow-box preview-switch__btn"
          onClick={async () => setFailed(!(await changePreview()))}>Change preview</button>
      </div>
      {failed && <p className="sky-settings__note">This preview app can’t switch from here: long-press its icon › Change preview.</p>}
    </section>
  )
}
