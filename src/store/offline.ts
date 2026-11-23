// Whether this copy of the app opens without the internet (services/pwaUpdate checks; Settings shows it).
import { create } from 'zustand'
import type { OfflineState } from '../domain/pwaUpdate.ts'

/** null: not checked (a dev build never is). */
export const useOffline = create<{ state: OfflineState | null }>(() => ({ state: null }))
