// "Version 0.1.0" (or "Web 0.2.0 · Android app 0.1.0" inside the Android app).
import { versionLine } from '../../domain/version.ts'
import { useShell } from '../../store/shell.ts'

export function AppVersion({ className }: { className?: string }) {
  const shellVersion = useShell(s => s.shellVersion)
  return <p className={className}>{versionLine(__APP_VERSION__, shellVersion)}</p>
}
