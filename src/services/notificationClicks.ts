// The page's half of alarm notification clicks (the worker's half is public/sw-extras.js):
// answer "is this your notification?", and go to the alarm's instant when asked, or when
// the app was opened by a click with ?instant=<id>.
import * as act from '../store/actions.ts'
import { TAB_ID } from './NotificationService.ts'

const INSTANT_PARAM = 'instant'

let started = false

export function startNotificationClicks() {
  if (started) return
  started = true

  // Opened by a click while no window was open.
  const url = new URL(window.location.href)
  const opened = url.searchParams.get(INSTANT_PARAM)
  if (opened) {
    url.searchParams.delete(INSTANT_PARAM)
    window.history.replaceState(window.history.state, '', url.href)
    act.revealInstant(opened, false)
  }

  if (!('serviceWorker' in navigator)) return
  navigator.serviceWorker.addEventListener('message', (e: MessageEvent) => {
    const data: unknown = e.data
    if (!data || typeof data !== 'object') return
    const msg = data as { type?: unknown; tabId?: unknown; instantId?: unknown }
    if (msg.type === 'tc:is-tab') e.ports[0]?.postMessage(msg.tabId === TAB_ID)
    else if (msg.type === 'tc:reveal-instant' && typeof msg.instantId === 'string') act.revealInstant(msg.instantId)
  })
  navigator.serviceWorker.startMessages()
}
