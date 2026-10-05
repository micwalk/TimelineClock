// The app's live notifications (android/app/src/main/java/com/micwalk/timelineclock/LiveNotificationsPlugin.java).
import { registerPlugin } from '@capacitor/core'
import type { PluginListenerHandle } from '@capacitor/core'
import type { LiveNotification } from '../../domain/nativeNotifications.ts'

export interface LiveNotificationsPlugin {
  /** Shows exactly these live notifications (posts, updates, removes the rest). */
  sync(options: { items: LiveNotification[] }): Promise<{ posted: number }>
  cancelAll(): Promise<void>
  /** A tap on any of the app's notifications (kind: "countdown", "stopwatch" or "alarm"). */
  addListener(eventName: 'notificationTapped', listener: (data: { instantId: string; kind?: string }) => void): Promise<PluginListenerHandle>
}

export const LiveNotifications = registerPlugin<LiveNotificationsPlugin>('LiveNotifications')
