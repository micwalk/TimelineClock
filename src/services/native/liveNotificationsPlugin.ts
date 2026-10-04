// The app's own native plugin (android/app/src/main/java/com/micwalk/timelineclock/LiveNotificationsPlugin.java).
import { registerPlugin } from '@capacitor/core'
import type { PluginListenerHandle } from '@capacitor/core'
import type { LiveNotification, ShellStatus } from '../../domain/nativeNotifications.ts'

export interface LiveNotificationsPlugin {
  /** Shows exactly these live notifications (posts, updates, removes the rest). */
  sync(options: { items: LiveNotification[] }): Promise<ShellStatus & { posted: number }>
  cancelAll(): Promise<void>
  getStatus(): Promise<ShellStatus>
  addListener(eventName: 'liveNotificationTapped', listener: (data: { instantId: string }) => void): Promise<PluginListenerHandle>
}

export const LiveNotifications = registerPlugin<LiveNotificationsPlugin>('LiveNotifications')
