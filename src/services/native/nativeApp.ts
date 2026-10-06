// The Android app's side of the page (loaded only inside it, by services/nativeShell): native
// alarms, live timer/stopwatch notifications, notification taps, and the shell's version.
// Each part fails on its own, so one problem can't stop the others.
import { App } from '@capacitor/app'
import type { NotificationKind } from '../../domain/nativeNotifications.ts'
import { revealLive } from '../../store/actions.ts'
import { useAlarms } from '../../store/alarms.ts'
import { useEntities } from '../../store/entities.ts'
import { useQuick } from '../../store/quick.ts'
import { useShell } from '../../store/shell.ts'
import { syncAlarms } from './alarmSync.ts'
import { Alarms } from './alarmsPlugin.ts'
import { LiveNotifications } from './liveNotificationsPlugin.ts'
import { syncLive } from './liveSync.ts'
import { clearPageLog, diag, pageLog, watchPage } from './diagLog.ts'
import { versionLine } from '../../domain/version.ts'

/** Store changes come in bursts (a timer makes two instants and two spans): sync once after. Short, so an alarm set just before leaving the app is scheduled. */
const DEBOUNCE_MS = 50

let started = false
let debounce: ReturnType<typeof setTimeout> | null = null

const warn = (what: string) => (err: unknown) => console.warn(`[Native] ${what} failed`, err)

function syncAll(force = false) {
  void syncAlarms()
  void syncLive(force)
}

function syncSoon() {
  if (debounce) clearTimeout(debounce)
  debounce = setTimeout(() => { debounce = null; syncAll() }, DEBOUNCE_MS)
}

const KINDS: readonly NotificationKind[] = ['countdown', 'stopwatch', 'alarm']

/** Asks for notification permission (from a tap, or once on the first start), then syncs. */
export async function requestNotificationPermission() {
  await Alarms.requestPermissions()
  syncAll(true)
}

/** Stops the ringing alarm notifications' sound (Silence in the app). */
export async function silenceAlarms() {
  await Alarms.silence()
}

/** Settings › Diagnostics: the versions, what Android allows, then the native and page logs. */
export async function diagnosticsText(): Promise<string> {
  const { shellVersion, status } = useShell.getState()
  let native: string[] = []
  try {
    native = (await Alarms.getLog()).lines
  } catch (err) {
    native = [`(native log unavailable: ${String(err)})`]
  }
  return [
    versionLine(__APP_VERSION__, shellVersion),
    `Status: ${JSON.stringify(status)}`,
    `User agent: ${navigator.userAgent}`,
    '',
    '— Android app —',
    ...native,
    '',
    '— Page —',
    ...pageLog(),
  ].join('\n')
}

export async function clearDiagnostics() {
  clearPageLog()
  try { await Alarms.clearLog() } catch { /* an older app has no log */ }
}

export function startNativeApp() {
  if (started) return
  started = true
  watchPage()
  diag('page started')

  App.getInfo()
    .then(info => useShell.setState({ shellVersion: info.version }))
    .catch(warn('App info'))

  // A tap goes to the stopwatch's run, a running timer's span, or an alarm's overtime. The
  // plugin keeps a tap that started the app until this listener is added.
  LiveNotifications.addListener('notificationTapped', ({ instantId, kind }) => {
    diag(`tapped ${String(kind)}`)
    if (typeof instantId !== 'string' || !instantId) return
    revealLive(KINDS.find(k => k === kind) ?? 'alarm', instantId)
  }).catch(warn('Tap listener'))
  // Dismiss / Snooze on a notification while the page runs: replay it now.
  Alarms.addListener('actions', () => { diag('answers from a notification'); void syncAlarms() }).catch(warn('Alarm answer listener'))

  useEntities.subscribe((s, prev) => { if (s.instants !== prev.instants || s.spans !== prev.spans) syncSoon() })
  useQuick.subscribe((s, prev) => { if (s.stopwatch !== prev.stopwatch) syncSoon() })
  useAlarms.subscribe((s, prev) => { if (s.autoDismissMs !== prev.autoDismissMs || s.unattended !== prev.unattended) syncSoon() })
  App.addListener('resume', () => { diag('resume'); syncAll(true) }).catch(warn('Resume listener'))
  // Leaving the app: don't wait out the debounce.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden' && debounce) { clearTimeout(debounce); debounce = null; syncAll() }
  })

  // The app exists to ring in the background, so it asks for notifications on its first
  // start. Once answered, only a bell or timer tap asks again (primeNotifications).
  Alarms.checkPermissions()
    .then(({ notifications }) => (notifications === 'prompt' ? requestNotificationPermission() : syncAll(true)))
    .catch(warn('Notification permission check'))
}
