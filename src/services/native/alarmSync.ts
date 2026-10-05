// Alarmed instants as native alarms, so a timer rings with the app closed or the phone asleep,
// with Dismiss and Snooze on the notification (android/.../Alarms.java). Each sync first replays
// the answers given from notifications while the page wasn't running, then hands the native
// side the full list; it works out what to schedule, ring or stop. Decisions:
// domain/nativeNotifications.
import { desiredNativeAlarms, replayAlarmActions, sanitizeAlarmActions } from '../../domain/nativeNotifications.ts'
import { useAlarms } from '../../store/alarms.ts'
import { entities, useEntities } from '../../store/entities.ts'
import { useShell } from '../../store/shell.ts'
import { SNOOZE_MINUTES, dismiss, snooze } from '../AlarmScheduler.ts'
import { Alarms } from './alarmsPlugin.ts'

let running = false
let again = false

async function syncOnce() {
  // Never prompt from here: the prompt belongs to the first start or a tap (requestNotificationPermission).
  if ((await Alarms.checkPermissions()).notifications !== 'granted') {
    useShell.setState({ status: await Alarms.getStatus() })
    return
  }

  const { actions } = await Alarms.takeActions()
  replayAlarmActions(sanitizeAlarmActions(actions), {
    isOn: id => !!entities.getInstant(id)?.alarm,
    dismiss,
    snooze: (id, at) => snooze(id, SNOOZE_MINUTES, at),
  })

  const { instants, spans } = useEntities.getState()
  const { autoDismissMs, unattended } = useAlarms.getState()
  const status = await Alarms.sync({
    alarms: desiredNativeAlarms(instants, spans, Date.now(), autoDismissMs),
    ringMs: autoDismissMs,
    unattended,
    snoozeMinutes: SNOOZE_MINUTES,
  })
  useShell.setState({ status })
}

/** Brings the native alarms in line with the alarmed instants. Calls never overlap; a call made meanwhile runs once more after. */
export async function syncAlarms() {
  if (running) { again = true; return }
  running = true
  try {
    do {
      again = false
      try {
        await syncOnce()
      } catch (err) {
        console.error('[Native] Alarm sync failed', err)
      }
    } while (again)
  } finally {
    running = false
  }
}
