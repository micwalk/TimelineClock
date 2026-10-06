import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { engine } from './engine/viewportEngine.ts'
import { startAlarmScheduler } from './services/AlarmScheduler.ts'
import { startNativeShell } from './services/nativeShell.ts'
import { startNotificationClicks } from './services/notificationClicks.ts'
import { startPwaUpdates } from './services/pwaUpdate.ts'
import { revealInstant } from './store/actions.ts'
import { applySettingsToDocument } from './store/settings.ts'
import { startLayoutTracking } from './store/layout.ts'
import { runMigrations } from './store/migrations.ts'

applySettingsToDocument()
runMigrations()
startLayoutTracking()
engine.start()
startAlarmScheduler({ onNotificationClick: id => revealInstant(id) })
startNotificationClicks()
// Inside the Android app only: alarm and live notifications (docs/android.md).
startNativeShell()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// Production: the Workbox service worker, with update checks. Dev: a small worker so
// notifications (and their clicks) work; Firefox needs one.
if (import.meta.env.PROD) startPwaUpdates()
else if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/dev-sw.js').catch(err => console.warn('[SW] Dev SW register failed', err))
}
