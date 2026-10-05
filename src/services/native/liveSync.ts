// The running timer (countdown) and stopwatch (count-up) as ongoing notifications on the lock
// screen and in the shade, the time big and bold. Android draws the time, so they stay right
// while the page is frozen; at zero the native alarm replaces a timer's countdown with its
// ringing notification. Decisions: domain/nativeNotifications.
import { desiredLiveNotifications } from '../../domain/nativeNotifications.ts'
import { useEntities } from '../../store/entities.ts'
import { useQuick } from '../../store/quick.ts'
import { LiveNotifications } from './liveNotificationsPlugin.ts'

/** What was last sent, so unchanged lists aren't posted again. */
let lastSent = ''
let changeTimer: ReturnType<typeof setTimeout> | null = null
let running = false
let again = false
let forceNext = false

async function syncOnce(force: boolean) {
  const { instants, spans } = useEntities.getState()
  const { items, nextChangeAt } = desiredLiveNotifications(instants, spans, useQuick.getState().stopwatch, Date.now())

  // A timer whose start is still ahead starts counting down then.
  if (changeTimer) clearTimeout(changeTimer)
  changeTimer = nextChangeAt === null ? null : setTimeout(() => void syncLive(), Math.max(0, nextChangeAt - Date.now()) + 50)

  const json = JSON.stringify(items)
  if (!force && json === lastSent) return
  await LiveNotifications.sync({ items })
  lastSent = json
}

/**
 * Brings the live notifications in line with the timers and stopwatch. `force` posts them
 * again even if nothing changed (on resume: the user may have swiped one away).
 */
export async function syncLive(force = false) {
  forceNext ||= force
  if (running) { again = true; return }
  running = true
  try {
    do {
      again = false
      const f = forceNext
      forceNext = false
      try {
        await syncOnce(f)
      } catch (err) {
        console.error('[Native] Live notification sync failed', err)
        lastSent = ''
      }
    } while (again)
  } finally {
    running = false
  }
}
