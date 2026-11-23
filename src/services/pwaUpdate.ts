// Keeps an installed app up to date, and its offline copy in place. An installed PWA on Android
// (and the Android app) is usually resumed from memory rather than reloaded, so the browser's own
// update check (on navigation) rarely runs: we check on resume and every hour, and reload into
// the new version when domain/pwaUpdate says it won't get in the way. Each check also makes sure
// there is a worker at all (a failed first install deletes it: domain/pwaUpdate needsRegistration),
// and Settings shows whether the app opens offline (store/offline).
import { registerSW } from 'virtual:pwa-register'
import { MIN_CHECK_GAP_MS, UPDATE_CHECK_INTERVAL_MS, needsRegistration, offlineState, shouldApplyUpdate } from '../domain/pwaUpdate.ts'
import type { OfflineFacts } from '../domain/pwaUpdate.ts'
import { useOffline } from '../store/offline.ts'
import { nextAlarmTime } from '../domain/alarms.ts'
import { useAlarms } from '../store/alarms.ts'
import { useEntities } from '../store/entities.ts'

let started = false

/** The worker vite-plugin-pwa builds (and registerSW registers). */
const SW_URL = '/sw.js'
/** After a failed install, try again this much later (and at every update check). */
const RETRY_INSTALL_MS = 30_000

/** What this page can tell about its offline copy (store/offline gets the result). */
export async function checkOffline(): Promise<OfflineFacts> {
  const supported = 'serviceWorker' in navigator
  let facts: OfflineFacts = { supported, active: false, installing: false, cached: false }
  if (supported) {
    try {
      const reg = await navigator.serviceWorker.getRegistration()
      const cached = typeof caches !== 'undefined' && !!(await caches.match('/index.html', { ignoreSearch: true }))
      facts = { supported, active: !!reg?.active, installing: !!(reg?.installing || reg?.waiting), cached }
    } catch (err) {
      console.warn('[PWA] Offline check failed', err)
    }
  }
  useOffline.setState({ state: offlineState(facts) })
  return facts
}

/** Registers the worker again when there is none (its first install failed), and rechecks once it has settled. */
async function ensureWorker() {
  const facts = await checkOffline()
  if (!needsRegistration(facts) || !navigator.onLine) return
  try {
    watchInstall(await navigator.serviceWorker.register(SW_URL, { scope: '/' }))
  } catch (err) {
    console.warn('[PWA] Registering again failed', err)
  }
}

/** Follows an installing worker: rechecks when it settles, and tries again a while after a failed install. */
function watchInstall(reg: ServiceWorkerRegistration) {
  const worker = reg.installing ?? reg.waiting
  void checkOffline()
  if (!worker) return
  worker.addEventListener('statechange', () => {
    if (worker.state === 'redundant') setTimeout(() => void ensureWorker(), RETRY_INSTALL_MS)
    else void checkOffline()
  })
}

export function startPwaUpdates() {
  if (started) return
  if (!('serviceWorker' in navigator)) { useOffline.setState({ state: 'unsupported' }); return }
  started = true
  // Ask the browser to keep the copy (and the data) when space runs low; it may say no.
  void navigator.storage?.persist?.().catch(() => false)
  navigator.serviceWorker.addEventListener('controllerchange', () => void checkOffline())

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
      if (!reg) { void ensureWorker(); return }
      watchInstall(reg)
      const check = () => {
        if (!navigator.onLine) { void checkOffline(); return }
        lastCheck = performance.now()
        // A worker whose first install failed is gone: register it again rather than update it.
        void navigator.serviceWorker.getRegistration().then(async current => {
          if (!current) { await ensureWorker(); return }
          await current.update()
          await checkOffline()
        }).catch(err => console.warn('[PWA] Update check failed', err))
      }
      setInterval(check, UPDATE_CHECK_INTERVAL_MS)
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible' && performance.now() - lastCheck >= MIN_CHECK_GAP_MS) check()
      })
    },
    onRegisterError(err) {
      console.warn('[PWA] Service worker registration failed', err)
      void checkOffline()
      setTimeout(() => void ensureWorker(), RETRY_INSTALL_MS)
    },
  })

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') visibleSince = performance.now()
    applyIfSafe()
  })
  // A ringing alarm held the update back: try again once it is answered.
  useAlarms.subscribe((s, prev) => { if (prev.ringing.length > 0 && s.ringing.length === 0) applyIfSafe() })
}
