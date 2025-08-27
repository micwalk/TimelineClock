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

	public async notifyAlarm(label: string): Promise<void> {
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
				icon: '/vite.svg',
				badge: '/vite.svg',
				tag: `alarm-${body}`,
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
			}
		} catch (err) {
			console.warn('Failed to show alarm notification', err)
		}
	}
}


