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
