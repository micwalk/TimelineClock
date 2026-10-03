import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { engine } from './engine/viewportEngine.ts'
import { startAlarmScheduler } from './services/AlarmScheduler.ts'
import { applySettingsToDocument } from './store/settings.ts'
import { runMigrations } from './store/migrations.ts'

applySettingsToDocument()
runMigrations()
engine.start()
startAlarmScheduler()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// Dev-only SW registration so notifications work via a service worker (Firefox needs it).
if (import.meta.env.DEV && 'serviceWorker' in navigator) {
  navigator.serviceWorker.register('/dev-sw.js').catch(err => console.warn('[SW] Dev SW register failed', err))
}
