/** Identifies this window to the service worker, so a notification click returns to the window that rang. */
export const TAB_ID = Math.random().toString(36).slice(2, 11)

export class NotificationService {
	public isSupported(): boolean {
		return typeof window !== 'undefined' && 'Notification' in window
	}

	public getPermission(): NotificationPermission | 'unsupported' {
		if (!this.isSupported()) return 'unsupported'
		return Notification.permission
	}

	public async requestPermission(): Promise<boolean> {
		if (!this.isSupported()) return false
		if (Notification.permission === 'granted') {
			console.log('[Notif] Permission already granted')
			return true
		}
		try {
			console.log('[Notif] Requesting permission; current:', Notification.permission)
			const res = await Notification.requestPermission()
			console.log('[Notif] Permission result:', res)
			return res === 'granted'
		} catch (err) {
			console.warn('Notification permission request failed', err)
			return false
		}
	}

	/**
	 * The instant and TAB_ID ride along in the notification so a click (handled in
	 * public/sw-extras.js) can bring back this window and go to the alarm. `onClick` is for
	 * the fallback window notification, used when there is no service worker.
	 */
	public async notifyAlarm(label: string, target: { instantId: string; onClick: () => void }): Promise<void> {
		const supported = this.isSupported()
		const permission = supported ? Notification.permission : 'unsupported'
		console.log('[Notif] notifyAlarm called:', { supported, permission, label })
		if (!supported) return
		// Skip if window is focused (visible and focused)
		try {
			const isVisible = typeof document !== 'undefined' && document.visibilityState === 'visible'
			// hasFocus can throw in some contexts; guard it
			const hasFocus = typeof document !== 'undefined' && typeof document.hasFocus === 'function' ? document.hasFocus() : false
			if (isVisible && hasFocus) {
				console.log('[Notif] Skipping notification, window focused')
				return
			}
		} catch (err) {
			console.warn('[Notif] Focus/visibility check failed', err)
		}
		// Do not request permission here; must be user gesture. Only notify if already granted.
		if (Notification.permission !== 'granted') {
			console.log('[Notif] Skipping notification, permission not granted')
			return
		}
		try {
			const title = 'Alarm'
			const body = label && label.trim().length > 0 ? label : 'Alarm is ringing'
			const options: NotificationOptions = {
				body,
				icon: '/pwa-192x192.png',
				badge: '/pwa-64x64.png',
				tag: `alarm-${target.instantId}`,
				data: { instantId: target.instantId, tabId: TAB_ID },
				requireInteraction: true,
				silent: false
			}
			// Prefer service worker notifications when available
			if ('serviceWorker' in navigator) {
				try {
					const reg = await navigator.serviceWorker.getRegistration()
					if (reg) {
						await reg.showNotification(title, options)
						console.log('[Notif] SW Notification shown via registration:', { title, body })
						return
					}
					console.log('[Notif] No SW registration found, falling back to window Notification')
				} catch (swErr) {
					console.warn('[Notif] SW showNotification failed, falling back', swErr)
				}
			}
			const n = new Notification(title, options)
			console.log('[Notif] Notification shown (window):', { title, body })
			n.onclick = () => {
				try { window.focus() } catch (err) { console.warn('window.focus failed', err) }
				n.close()
				target.onClick()
			}
		} catch (err) {
			console.warn('Failed to show alarm notification', err)
		}
	}
}


