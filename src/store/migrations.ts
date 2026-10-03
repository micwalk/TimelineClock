// One-time changes to saved state when a release changes a default. Runs at startup.
import { settings, useSettings } from './settings.ts'
import { view } from './view.ts'

export function runMigrations() {
  // Layout v2: the Secondary→Selected span becomes opt-in (spec C9).
  if (useSettings.getState().layoutVersion < 2) {
    view.setImpliedVisible('selected-prev', false)
    settings.setLayoutVersion(2)
  }
}
