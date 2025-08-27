import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// Dev-only SW registration to enable Notification via SW in Firefox
if (import.meta.env.DEV && 'serviceWorker' in navigator) {
	const swUrl = '/dev-sw.js'
	navigator.serviceWorker.register(swUrl).then(reg => {
		console.log('[SW] Registered dev service worker', reg.scope)
	}).catch(err => {
		console.warn('[SW] Dev SW register failed', err)
	})
}

// HMR: snapshot and restore ringing alarms to keep UI/audio consistent across reloads
if (import.meta.hot) {
	import.meta.hot.dispose(() => {
		try {
			const g: any = globalThis as any
			const s = g.__TC_currentTimelineState__
			if (s) {
				g.__TC_HMR__ = g.__TC_HMR__ || {}
				g.__TC_HMR__.ringingAlarms = s.getRingingAlarms()
				console.log('[HMR] Saved ringing alarms snapshot', g.__TC_HMR__.ringingAlarms?.length)
			}
		} catch (err) {
			console.warn('[HMR] Failed to snapshot ringing alarms', err)
		}
	})
}
