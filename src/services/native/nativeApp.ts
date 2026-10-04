// The Android app's side of the page (loaded only inside it, by services/nativeShell): alarm
// notifications, live timer/stopwatch notifications, notification taps, and the shell's
// version. Each part fails on its own, so one problem can't stop the others.
import { App } from '@capacitor/app'
import { LocalNotifications } from '@capacitor/local-notifications'
import { revealInstant } from '../../store/actions.ts'
import { useEntities } from '../../store/entities.ts'
import { useQuick } from '../../store/quick.ts'
import { useShell } from '../../store/shell.ts'
import { syncAlarms } from './alarmSync.ts'
import { LiveNotifications } from './liveNotificationsPlugin.ts'
import { syncLive } from './liveSync.ts'

/** Store changes come in bursts (a timer makes two instants and two spans): sync once after. Short, so an alarm set just before leaving the app is scheduled. */
const DEBOUNCE_MS = 50

let started = false
let debounce: ReturnType<typeof setTimeout> | null = null

const warn = (what: string) => (err: unknown) => console.warn(`[Native] ${what} failed`, err)

async function refreshStatus() {
  const { notifications, alarmChannel, exactAlarms, liveUpdates } = await LiveNotifications.getStatus()
  useShell.setState({ status: { notifications, alarmChannel, exactAlarms, liveUpdates } })
  return exactAlarms
}

const exactAllowed = () => refreshStatus().catch(() => true)

function syncAll(force = false) {
  void syncAlarms(exactAllowed)
  void syncLive(force)
}

function syncSoon() {
  if (debounce) clearTimeout(debounce)
  debounce = setTimeout(() => { debounce = null; syncAll() }, DEBOUNCE_MS)
}

function reveal(instantId: unknown) {
  if (typeof instantId === 'string' && instantId) revealInstant(instantId)
}

/** Asks for notification permission (from a tap, or once on the first start), then syncs. */
export async function requestNotificationPermission() {
  const { display } = await LocalNotifications.requestPermissions()
  if (display === 'granted') syncAll(true)
  await refreshStatus().catch(warn('Status'))
}

export function startNativeApp() {
  if (started) return
  started = true

  App.getInfo()
    .then(info => useShell.setState({ shellVersion: info.version }))
    .catch(warn('App info'))

  // Taps go to the alarm's (or the timer's, or the stopwatch's) instant. Both plugins keep a
  // tap that started the app until these listeners are added.
  LocalNotifications.addListener('localNotificationActionPerformed', action => {
    const extra: unknown = action.notification.extra
    reveal(extra && typeof extra === 'object' ? (extra as { instantId?: unknown }).instantId : undefined)
  }).catch(warn('Alarm tap listener'))
  LiveNotifications.addListener('liveNotificationTapped', data => reveal(data.instantId)).catch(warn('Live tap listener'))

  useEntities.subscribe((s, prev) => { if (s.instants !== prev.instants || s.spans !== prev.spans) syncSoon() })
  useQuick.subscribe((s, prev) => { if (s.stopwatch !== prev.stopwatch) syncSoon() })
  App.addListener('resume', () => syncAll(true)).catch(warn('Resume listener'))
  // Leaving the app: don't wait out the debounce.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden' && debounce) { clearTimeout(debounce); debounce = null; syncAll() }
  })

  // The app exists to ring in the background, so it asks for notifications on its first
  // start. Once answered, only a bell or timer tap asks again (primeNotifications).
  LocalNotifications.checkPermissions()
    .then(({ display }) => (display === 'prompt' ? requestNotificationPermission() : syncAll(true)))
    .catch(warn('Notification permission check'))
}
