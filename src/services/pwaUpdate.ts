// Keeps an installed app up to date. An installed PWA on Android is usually resumed from
// memory rather than reloaded, so the browser's own update check (on navigation) rarely
// runs: we check on resume and every hour, and reload into the new version when
// domain/pwaUpdate says it won't get in the way.
import { registerSW } from 'virtual:pwa-register'
import { MIN_CHECK_GAP_MS, UPDATE_CHECK_INTERVAL_MS, shouldApplyUpdate } from '../domain/pwaUpdate.ts'
import { nextAlarmTime } from '../domain/alarms.ts'
import { useAlarms } from '../store/alarms.ts'
import { useEntities } from '../store/entities.ts'

let started = false

export function startPwaUpdates() {
  if (started || !('serviceWorker' in navigator)) return
  started = true

  let visibleSince = performance.now()
  let lastCheck = performance.now()
  let waiting = false
  let applying = false

  const applyIfSafe = () => {
    if (!waiting || applying) return
    const ok = shouldApplyUpdate({
      visible: document.visibilityState === 'visible',
      msSinceVisible: performance.now() - visibleSince,
      ringing: useAlarms.getState().ringing.length > 0,
      upcomingAlarm: nextAlarmTime(useEntities.getState().instants, Date.now()) !== null,
    })
    if (!ok) return
    applying = true
    // Activates the waiting worker; the page reloads once it takes control.
    void updateSW(true)
  }

  const updateSW = registerSW({
    immediate: true,
    onNeedRefresh() {
      waiting = true
      applyIfSafe()
    },
    onRegisteredSW(_url, reg) {
      if (!reg) return
      const check = () => {
        if (!navigator.onLine) return
        lastCheck = performance.now()
        reg.update().catch(err => console.warn('[PWA] Update check failed', err))
      }
      setInterval(check, UPDATE_CHECK_INTERVAL_MS)
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible' && performance.now() - lastCheck >= MIN_CHECK_GAP_MS) check()
      })
    },
    onRegisterError(err) {
      console.warn('[PWA] Service worker registration failed', err)
    },
  })

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') visibleSince = performance.now()
    applyIfSafe()
  })
  // A ringing alarm held the update back: try again once it is answered.
  useAlarms.subscribe((s, prev) => { if (prev.ringing.length > 0 && s.ringing.length === 0) applyIfSafe() })
}
