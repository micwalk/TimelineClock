// When a downloaded app update may reload the page. Pure; the service worker wiring is in services/pwaUpdate.

/** A reload this soon after the app is opened or brought back is part of opening it. */
export const RESUME_WINDOW_MS = 10_000
/** How often a running app asks the server for a new version. */
export const UPDATE_CHECK_INTERVAL_MS = 60 * 60_000
/** Coming back to the app checks for a new version at most this often. */
export const MIN_CHECK_GAP_MS = 60_000

export interface UpdateContext {
  visible: boolean
  /** Time since the page was loaded or last became visible. */
  msSinceVisible: number
  /** An alarm is ringing: never reload under it. */
  ringing: boolean
  /** An alarm is set for later. A reload loses the audio unlock, so a hidden page with one waits. */
  upcomingAlarm: boolean
}

/**
 * Apply a waiting update now? Yes right after the app is opened or resumed (the user has
 * not started doing anything yet), or while it is in the background with no alarm to ring.
 * Otherwise wait, so a reload never interrupts what the user is doing.
 */
export function shouldApplyUpdate(c: UpdateContext): boolean {
  if (c.ringing) return false
  if (c.visible) return c.msSinceVisible <= RESUME_WINDOW_MS
  return !c.upcomingAlarm
}

// ---------------------------------------------------------------------------
// Opening offline. The service worker keeps a copy of the app (Workbox's precache) and serves it
// when there is no network, in a browser and in the Android app alike. A first install that fails
// (the network drops, the app goes to the background mid-download, a storage error) deletes the
// registration, and the page only registers again when it loads; an installed app is resumed
// from memory for days, so it could go that long with no copy. So each update check also
// registers again when there is no worker at all.

/** What a page can tell about its offline copy. */
export interface OfflineFacts {
  /** Service workers exist here (and this is a production build). */
  supported: boolean
  /** A worker is active (it serves the copy). */
  active: boolean
  /** A worker is installing or installed and waiting (saving a copy). */
  installing: boolean
  /** The copy's page (index.html) is in the cache. */
  cached: boolean
}

/** ready: it opens offline; saving: a copy is on its way; missing: none yet; unsupported: no workers here. */
export type OfflineState = 'ready' | 'saving' | 'missing' | 'unsupported'

export function offlineState(f: OfflineFacts): OfflineState {
  if (!f.supported) return 'unsupported'
  if (f.active && f.cached) return 'ready'
  if (f.installing) return 'saving'
  return 'missing'
}

/** Register the worker again: there is none at all (a failed first install deletes it). */
export const needsRegistration = (f: OfflineFacts): boolean => f.supported && !f.active && !f.installing
