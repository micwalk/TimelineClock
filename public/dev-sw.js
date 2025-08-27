self.addEventListener('install', event => {
	// Activate immediately for dev
	self.skipWaiting()
})

self.addEventListener('activate', event => {
	// Become active immediately
	event.waitUntil(self.clients.claim())
})

// Fallback notification click handler
self.addEventListener('notificationclick', event => {
	event.notification.close()
	event.waitUntil(
		self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientsArr => {
			for (const client of clientsArr) {
				if ('focus' in client) return client.focus()
			}
			if (self.clients.openWindow) {
				return self.clients.openWindow('/')
			}
		})
	)
})


