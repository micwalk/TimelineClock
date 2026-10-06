// What the native shell (the Android app) reports about itself. Stays empty in a browser.
import { create } from 'zustand'
import type { ShellStatus } from '../domain/nativeNotifications.ts'

export interface ShellState {
  /** The Android app's version (its versionName), once the native side has answered. */
  shellVersion: string | null
  /** What Android allows the app (services/native). */
  status: ShellStatus | null
}

export const useShell = create<ShellState>(() => ({ shellVersion: null, status: null }))
