// One-time changes to saved state when a release changes a default. Runs at startup.
import { settings, useSettings } from './settings.ts'
import { flushView, view } from './view.ts'

export function runMigrations() {
  // Layout v2: the Secondary→Selected span becomes opt-in (spec C9).
  if (useSettings.getState().layoutVersion < 2) {
    view.setImpliedVisible('selected-prev', false)
    flushView() // the version below saves at once; the flag must not lag it, or a quick close loses the migration
    settings.setLayoutVersion(2)
  }
  // Layout v3: the automatic lane spans to the selection (Selected→Cursor, Previous→Selected), not to Now.
  if (useSettings.getState().layoutVersion < 3) {
    view.setImpliedVisible('selected-now', false)
    view.setImpliedVisible('selected-prev', true)
    flushView()
    settings.setLayoutVersion(3)
  }
}
