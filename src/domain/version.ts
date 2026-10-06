// The version line shown in Help and Settings. One semver in package.json (the web app,
// built into the bundle); inside the Android app the shell's own version is shown too,
// since the shell only changes when it is reinstalled.

/** "Version 0.1.0" on the web; "Web 0.2.0 · Android app 0.1.0" inside the Android app. */
export function versionLine(webVersion: string, shellVersion: string | null): string {
  return shellVersion ? `Web ${webVersion} · Android app ${shellVersion}` : `Version ${webVersion}`
}
