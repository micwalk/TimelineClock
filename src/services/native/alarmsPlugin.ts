// The app's native alarms (android/app/src/main/java/com/micwalk/timelineclock/AlarmsPlugin.java).
import { registerPlugin } from '@capacitor/core'
import type { PermissionState, PluginListenerHandle } from '@capacitor/core'
import type { NativeAlarm, ShellStatus } from '../../domain/nativeNotifications.ts'

export interface AlarmsPermissions {
  notifications: PermissionState
}

export interface AlarmsPlugin {
  /** What should ring; the native side schedules, rings and stops to match. Returns what Android allows. */
  sync(options: { alarms: NativeAlarm[]; ringMs: number; unattended: 'dismiss' | 'snooze'; snoozeMinutes: number }): Promise<ShellStatus>
  /** Answers given from notifications since last asked (untrusted shape: sanitizeAlarmActions). */
  takeActions(): Promise<{ actions: unknown }>
  getStatus(): Promise<ShellStatus>
  /** Stops the sound of every ringing alarm; they stay on the lock screen until answered. */
  silence(): Promise<void>
  /** The native diagnostics log (Diag.java), oldest first. */
  getLog(): Promise<{ lines: string[] }>
  clearLog(): Promise<void>
  checkPermissions(): Promise<AlarmsPermissions>
  requestPermissions(): Promise<AlarmsPermissions>
  /** An answer was given from a notification while the page runs. */
  addListener(eventName: 'actions', listener: () => void): Promise<PluginListenerHandle>
}

export const Alarms = registerPlugin<AlarmsPlugin>('Alarms')
