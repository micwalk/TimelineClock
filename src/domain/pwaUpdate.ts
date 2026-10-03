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
