// Imported by the service worker (the Workbox one in production, dev-sw.js in dev).
// Plain JS: it runs in the worker as is.

// ---------------------------------------------------------------------------
// Updates. Older builds activated new versions at once (no reload, so the open page kept
// running old code). Builds now wait until the page says a reload is safe. A worker
// replacing one of those older builds still activates at once, since the old page can't
// ask; this marker cache says the page-driven protocol is in place.
const UPDATE_PROTOCOL_MARKER = 'tc-update-protocol-v1'

self.addEventListener('install', event => {
  event.waitUntil(caches.has(UPDATE_PROTOCOL_MARKER).then(has => { if (!has) return self.skipWaiting() }))
})

self.addEventListener('activate', event => {
  event.waitUntil(caches.open(UPDATE_PROTOCOL_MARKER))
})

// ---------------------------------------------------------------------------
// Notification clicks: bring up the window that showed the alarm (or the most recently
// used one, or a new one) and have it go to the alarm's instant.
const ASK_TIMEOUT_MS = 400

/** Asks a window whether it is the one with this tab id. */
function isTab(client, tabId) {
  return new Promise(resolve => {
    const channel = new MessageChannel()
    const timer = setTimeout(() => resolve(false), ASK_TIMEOUT_MS)
    channel.port1.onmessage = e => { clearTimeout(timer); resolve(e.data === true) }
    client.postMessage({ type: 'tc:is-tab', tabId }, [channel.port2])
  })
}

async function pickWindow(tabId) {
  const scope = self.registration.scope
  // Most recently focused first.
  const windows = (await self.clients.matchAll({ type: 'window', includeUncontrolled: true })).filter(c => c.url.startsWith(scope))
  if (tabId) {
    const answers = await Promise.all(windows.map(c => isTab(c, tabId)))
    const owner = windows.find((_, i) => answers[i])
    if (owner) return owner
  }
  return windows.find(c => c.focused) || windows.find(c => c.visibilityState === 'visible') || windows[0]
}

self.addEventListener('notificationclick', event => {
  const data = event.notification.data || {}
  event.notification.close()
  event.waitUntil((async () => {
    const client = await pickWindow(data.tabId)
    if (client) {
      try { await client.focus() } catch (err) { console.warn('[SW] focus failed', err) }
      if (data.instantId) client.postMessage({ type: 'tc:reveal-instant', instantId: data.instantId })
      return
    }
    const url = new URL(self.registration.scope)
    if (data.instantId) url.searchParams.set('instant', data.instantId)
    await self.clients.openWindow(url.href)
  })())
})
