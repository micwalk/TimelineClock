// Is the page running inside the Android app (a Capacitor shell, docs/android.md)? The shell
// defines window.Capacitor before the page's own scripts run. Everything native loads on
// demand from services/native, so browsers never download it.

interface CapacitorGlobal {
  isNativePlatform?: () => boolean
}

export function isNativeShell(): boolean {
  if (typeof window === 'undefined') return false
  const cap = (window as Window & { Capacitor?: CapacitorGlobal }).Capacitor
  try {
    return typeof cap?.isNativePlatform === 'function' && cap.isNativePlatform()
  } catch {
    return false
  }
}

const loadNative = () => import('./native/nativeApp.ts')

/** Starts the native side (alarm and live notifications, version, taps). No-op in a browser. */
export function startNativeShell() {
  if (!isNativeShell()) return
  loadNative()
    .then(m => m.startNativeApp())
    .catch(err => console.error('[Native] Could not start', err))
}

/** Asks Android for notification permission (the APK's half of primeNotifications). */
export async function requestNativeNotifications() {
  if (!isNativeShell()) return
  try {
    await (await loadNative()).requestNotificationPermission()
  } catch (err) {
    console.warn('[Native] Notification permission request failed', err)
  }
}

/** Silence in the app: the Android app's ringing alarm notifications go quiet too. */
export async function silenceNativeAlarms() {
  if (!isNativeShell()) return
  try {
    await (await loadNative()).silenceAlarms()
  } catch (err) {
    console.warn('[Native] Could not silence the alarms', err)
  }
}

/**
 * TC Preview: opens its "Which preview?" dialog. False when the app is from before it could
 * (then only the launcher shortcut can: long-press the icon).
 */
export async function changePreview(): Promise<boolean> {
  if (!isNativeShell()) return false
  try {
    await (await import('./native/previewPlugin.ts')).Preview.choose()
    return true
  } catch (err) {
    console.warn('[Native] Could not open the preview chooser', err)
    return false
  }
}

/** Settings › Diagnostics (Android app only): the native and page logs as text, to copy. */
export async function nativeDiagnostics(): Promise<string> {
  if (!isNativeShell()) return ''
  return (await loadNative()).diagnosticsText()
}

export async function clearNativeDiagnostics() {
  if (!isNativeShell()) return
  await (await loadNative()).clearDiagnostics()
}
