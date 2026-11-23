// Settings: whether this copy opens without the internet (services/pwaUpdate keeps store/offline current).
import { OFFLINE_UI } from '../../config/labels.ts'
import { useOffline } from '../../store/offline.ts'

export function OfflineStatus({ className }: { className?: string }) {
  const state = useOffline(s => s.state)
  if (state === null) return null
  return <p className={`${className ?? ''} is-${state}`} role="status">{OFFLINE_UI[state]}</p>
}
