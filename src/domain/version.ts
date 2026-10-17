// The version line shown in Help and Settings. One semver in package.json (the web app,
// built into the bundle); inside the Android app the shell's own version is shown too,
// since the shell only changes when it is reinstalled.

/** "Version 0.1.0" on the web; "Web 0.2.0 · Android app 0.1.0" inside the Android app. */
/** TC Preview (the test app for pull requests) reports its version as "x.y.z-preview". */
export const isPreviewShell = (shellVersion: string | null) => !!shellVersion?.endsWith('-preview')

/** The pull request a Netlify deploy preview is of ("deploy-preview-25--…" → 25), or null. */
export function previewNumber(hostname: string): number | null {
  const m = /^deploy-preview-(\d+)--/.exec(hostname)
  return m ? Number(m[1]) : null
}

export function versionLine(webVersion: string, shellVersion: string | null): string {
  return shellVersion ? `Web ${webVersion} · Android app ${shellVersion}` : `Version ${webVersion}`
}
