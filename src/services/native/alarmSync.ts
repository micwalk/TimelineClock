// Alarmed instants as Android alarm notifications, so a timer rings with the app closed or
// the phone asleep. Decisions are in domain/nativeNotifications; this applies them through
// the LocalNotifications plugin (exact, allowed while idle, on the "alarms" channel that
// android/.../NotificationChannels.java creates). The in-app scheduler still rings in the
// app as before.
import { LocalNotifications } from '@capacitor/local-notifications'
import type { LocalNotificationSchema } from '@capacitor/local-notifications'
import { desiredNativeAlarms, planAlarmSync, staleDeliveredAlarms } from '../../domain/nativeNotifications.ts'
import type { NativeAlarm } from '../../domain/nativeNotifications.ts'
import { useEntities } from '../../store/entities.ts'

/** Matches NotificationChannels.ALARMS and the status-bar icon in android/app/src/main/res. */
const CHANNEL_ID = 'alarms'
const SMALL_ICON = 'ic_stat_timeline'
const ICON_COLOR = '#FF3B5C'
/** LiveNotificationsPlugin's tag: those notifications are not alarms. */
const LIVE_TAG = 'tc-live'

/** What this page scheduled (by notification id). Cleared on start, so it matches Android. */
let scheduled = new Map<number, NativeAlarm>()
let reset = false
let running = false
let again = false

const toSchema = (a: NativeAlarm, exact: boolean): LocalNotificationSchema => ({
  id: a.notificationId,
  title: a.title,
  body: a.body,
  channelId: CHANNEL_ID,
  smallIcon: SMALL_ICON,
  iconColor: ICON_COLOR,
  autoCancel: true,
  // Without exact alarms the plugin would open Android's settings screen; ask only for
  // what is allowed (Settings shows it).
  isExactNotification: exact,
  schedule: { at: new Date(a.at), allowWhileIdle: true },
  extra: { instantId: a.instantId },
})

async function syncOnce(exactAllowed: () => Promise<boolean>) {
  // Never prompt from here: the prompt belongs to a tap (requestNotificationPermission).
  if ((await LocalNotifications.checkPermissions()).display !== 'granted') return

  if (!reset) {
    // Start from a clean slate: whatever an earlier page left pending is replaced.
    const pending = await LocalNotifications.getPending()
    if (pending.notifications.length > 0) {
      await LocalNotifications.cancel({ notifications: pending.notifications.map(n => ({ id: n.id })) })
    }
    scheduled = new Map()
    reset = true
  }

  const { instants } = useEntities.getState()
  const plan = planAlarmSync(scheduled, desiredNativeAlarms(instants, Date.now()))
  if (plan.cancel.length > 0) {
    await LocalNotifications.cancel({ notifications: plan.cancel.map(id => ({ id })) })
    for (const id of plan.cancel) scheduled.delete(id)
  }
  if (plan.schedule.length > 0) {
    const exact = await exactAllowed()
    await LocalNotifications.schedule({ notifications: plan.schedule.map(a => toSchema(a, exact)) })
    for (const a of plan.schedule) scheduled.set(a.notificationId, a)
  }

  // An alarm answered in the app (or turned off, or deleted) leaves the notification shade.
  const delivered = await LocalNotifications.getDeliveredNotifications()
  const ids = delivered.notifications.filter(n => n.tag !== LIVE_TAG).map(n => n.id)
  const stale = staleDeliveredAlarms(ids, instants)
  if (stale.length > 0) await LocalNotifications.removeDeliveredNotificationsById({ ids: stale })
}

/** Brings Android's alarms in line with the alarmed instants. Calls never overlap; a call made meanwhile runs once more after. */
export async function syncAlarms(exactAllowed: () => Promise<boolean>) {
  if (running) { again = true; return }
  running = true
  try {
    do {
      again = false
      try {
        await syncOnce(exactAllowed)
      } catch (err) {
        console.error('[Native] Alarm sync failed', err)
        reset = false // start clean next time
      }
    } while (again)
  } finally {
    running = false
  }
}
