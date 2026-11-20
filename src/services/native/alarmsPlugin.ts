// The app's native alarms (android/app/src/main/java/com/micwalk/timelineclock/AlarmsPlugin.java).
import { registerPlugin } from '@capacitor/core'
import type { PermissionState, PluginListenerHandle } from '@capacitor/core'
import type { NativeAlarm, ShellStatus } from '../../domain/nativeNotifications.ts'
import type { AlarmSound } from '../../domain/sounds.ts'

export interface AlarmsPermissions {
  notifications: PermissionState
}

/** One alarm sound's channel (NotificationChannels.java), as Android has it now. */
export interface NativeSound {
  sound: AlarmSound
  /** Still the app's own tone. */
  own: boolean
  /** What Android calls the sound picked instead ("" for none, or when `own`). */
  title: string
  /** The channel isn't turned off. */
  on: boolean
}

export interface AlarmsPlugin {
  /** What should ring; the native side schedules, rings and stops to match. Returns what Android allows. */
  sync(options: { alarms: NativeAlarm[]; ringMs: number; unattended: 'dismiss' | 'snooze'; snoozeMinutes: number }): Promise<ShellStatus>
  /** Answers given from notifications since last asked (untrusted shape: sanitizeAlarmActions). */
  takeActions(): Promise<{ actions: unknown }>
  getStatus(): Promise<ShellStatus>
  /** Stops the sound of every ringing alarm; they stay on the lock screen until answered. */
  silence(): Promise<void>
  /** The alarm sounds' channels as they are now. */
  getSounds(): Promise<{ sounds: NativeSound[] }>
  /** Opens Android's settings for one sound's channel, where any sound (the user's own too) can be picked. */
  openSoundSettings(options: { sound: AlarmSound }): Promise<void>
  /** Plays a channel's sound once (stops by itself). */
  previewSound(options: { sound: AlarmSound }): Promise<void>
  stopPreview(): Promise<void>
  /** The native diagnostics log (Diag.java), oldest first. */
  getLog(): Promise<{ lines: string[] }>
  clearLog(): Promise<void>
  checkPermissions(): Promise<AlarmsPermissions>
  requestPermissions(): Promise<AlarmsPermissions>
  /** An answer was given from a notification while the page runs. */
  addListener(eventName: 'actions', listener: () => void): Promise<PluginListenerHandle>
}

export const Alarms = registerPlugin<AlarmsPlugin>('Alarms')
