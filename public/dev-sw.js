// Dev-only service worker (production uses the Workbox one), so notifications work in dev.
importScripts('/sw-extras.js')

self.addEventListener('install', () => {
	// Activate immediately for dev
	self.skipWaiting()
})

self.addEventListener('activate', event => {
	// Become active immediately
	event.waitUntil(self.clients.claim())
})
