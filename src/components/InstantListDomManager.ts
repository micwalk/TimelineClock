import { TimelineRenderer } from '../canvas/TimelineRenderer.ts'

type ListElement = HTMLDivElement & { _lastVersion?: number; _lastRenderAt?: number }

export class InstantListDomManager {
	private listEl: ListElement
	private controlsEl: HTMLDivElement | null

	constructor(listEl: ListElement, controlsEl: HTMLDivElement | null) {
		this.listEl = listEl
		this.controlsEl = controlsEl
	}

	update(ctx: { canvas: HTMLCanvasElement; renderer: TimelineRenderer }) {
		const { canvas, renderer } = ctx
		const version = renderer.getStateVersion?.() ?? 0
		const nowTs = Date.now()
		if (this.listEl._lastVersion === version && this.listEl._lastRenderAt && nowTs - this.listEl._lastRenderAt < 1000) {
			// throttle frequent refreshes
			return
		}
		this.listEl._lastVersion = version
		this.listEl._lastRenderAt = nowTs

		// Keep list positioned below controls dynamically
		const rect = canvas.getBoundingClientRect()
		const controlsH = this.controlsEl?.getBoundingClientRect().height ?? 0
		this.listEl.style.top = `${Math.round(rect.height + controlsH)}px`

		// Ensure tabs exist once
		let tabs = (this.listEl.querySelector('[data-role="instants-tabs"]') as HTMLElement) || null
		if (!tabs) {
			tabs = document.createElement('div')
			tabs.dataset.role = 'instants-tabs'
			tabs.style.display = 'flex'
			tabs.style.gap = '16px'
			tabs.style.borderBottom = '2px solid #ffffff'
			tabs.style.marginBottom = '8px'
			const tabAll = document.createElement('div')
			tabAll.textContent = 'All Instants'
			tabAll.style.font = 'bold 16px Arial'
			tabAll.style.color = '#ffffff'
			tabAll.style.padding = '6px 8px'
			tabAll.style.borderBottom = '3px solid #22d3ee'
			const tabFav = document.createElement('div')
			tabFav.textContent = 'Favorites'
			tabFav.style.font = 'bold 16px Arial'
			tabFav.style.color = '#94a3b8'
			tabFav.style.padding = '6px 8px'
			tabs.appendChild(tabAll)
			tabs.appendChild(tabFav)
			this.listEl.innerHTML = ''
			this.listEl.appendChild(tabs)
		}

		// Persistent scroller
		let scroller = (this.listEl.querySelector('[data-role="instants-scroller"]') as HTMLElement) || null
		if (!scroller) {
			scroller = document.createElement('div')
			scroller.dataset.role = 'instants-scroller'
			scroller.style.overflowY = 'scroll'
			scroller.style.scrollbarGutter = 'stable both-edges'
			scroller.style.width = '100%'
			scroller.style.boxSizing = 'border-box'
			scroller.style.paddingRight = '8px'
			scroller.onwheel = (evt) => { evt.stopPropagation() }
			this.listEl.appendChild(scroller)
		}

		// Update scroller height dynamically each frame
		{
			const rect2 = canvas.getBoundingClientRect()
			const controlsH2 = this.controlsEl?.getBoundingClientRect().height ?? 0
			const maxH = `calc(100vh - ${Math.round(rect2.height)}px - 40px - ${Math.round(controlsH2)}px)`
			scroller.style.maxHeight = maxH
		}

		// Capture previous positions (FLIP)
		const prevPos = new Map<string, number>()
		Array.from(scroller.children).forEach((el) => {
			const elem = el as HTMLElement
			const key = elem.dataset.key
			if (key) prevPos.set(key, elem.getBoundingClientRect().top)
		})

		// Build unified entries
		const items = renderer.getSavedInstantsSnapshot().slice().sort((a, b) => a.ts - b.ts)
		const focus = renderer.getViewFocus?.() ?? { mode: 'now', focusedInstantId: null as string | null }
		const entries: Array<{ key: string; ts: number; name: string; focused: boolean; instantKind: 'now'|'cursor'|'instant'; id?: string }> = []
		const nowTsEntry = nowTs
		entries.push({ key: 'now', ts: nowTsEntry, name: 'Now', focused: focus.mode === 'now', instantKind: 'now' })
		if (focus.mode === 'cursor') {
			const cursorTs = renderer.getTimeCenter?.() ?? nowTsEntry
			entries.push({ key: 'cursor', ts: cursorTs, name: 'Cursor', focused: true, instantKind: 'cursor' })
		}
		for (const it of items) {
			const focused = focus.mode === 'instant' && focus.focusedInstantId === it.id
			entries.push({ key: `i:${it.id}`, ts: it.ts, name: it.label || '(unnamed)', focused, instantKind: 'instant', id: it.id })
		}
		entries.sort((a, b) => a.ts - b.ts)

		// Reconcile DOM nodes in sorted order
		const presentKeys = new Set<string>()
		let focusedRowEl: HTMLElement | null = null
		for (const en of entries) {
			presentKeys.add(en.key)
			let card = scroller.querySelector(`[data-key="${en.key}"]`) as HTMLElement | null
			if (!card) {
				card = document.createElement('div')
				card.dataset.key = en.key
				card.style.display = 'grid'
				card.style.gridTemplateColumns = '2fr 1.3fr 1.3fr'
				card.style.alignItems = 'center'
				card.style.background = 'rgba(0,0,0,0.6)'
				card.style.color = '#ffffff'
				card.style.padding = '8px 12px'
				card.style.marginBottom = '10px'
				card.style.cursor = 'pointer'
				card.style.willChange = 'transform'
				card.onpointerdown = (ev) => { ev.stopPropagation() }
				const name = document.createElement('div'); name.dataset.role = 'name'; name.style.font = 'bold 16px Arial'
				const dt = document.createElement('div'); dt.dataset.role = 'dt'; dt.style.font = 'bold 14px monospace'
				const dur = document.createElement('div'); dur.dataset.role = 'dur'; dur.style.font = 'bold 14px monospace'; dur.style.opacity = '0.9'; dur.style.whiteSpace = 'pre'
				card.appendChild(name); card.appendChild(dt); card.appendChild(dur)
			}
			// Update content
			const nameEl = card.querySelector('[data-role="name"]') as HTMLElement
			const dtEl = card.querySelector('[data-role="dt"]') as HTMLElement
			const durEl = card.querySelector('[data-role="dur"]') as HTMLElement
			nameEl.textContent = en.name
			dtEl.textContent = new Date(en.ts).toLocaleString()
			if (en.instantKind === 'now') {
				durEl.textContent = ' 00:00:00'
				durEl.style.color = '#ffffff'
			} else {
				const diffMs = en.ts - Date.now()
				const sign = diffMs >= 0 ? 1 : -1
				const abs = Math.abs(diffMs)
				const totalSeconds = Math.floor(abs / 1000)
				const hours = Math.floor(totalSeconds / 3600)
				const minutes = Math.floor((totalSeconds % 3600) / 60)
				const seconds = totalSeconds % 60
				const hh = hours.toString().padStart(2, '0')
				const mm = minutes.toString().padStart(2, '0')
				const ss = seconds.toString().padStart(2, '0')
				const text = `${sign > 0 ? '+' : '-'}${hh}:${mm}:${ss}`
				durEl.textContent = text
				durEl.style.color = sign > 0 ? '#93c5fd' : '#fca5a5'
			}
			card.style.border = `2px solid ${en.focused ? '#22d3ee' : '#ffffff'}`
			card.onclick = () => {
				const r = renderer
				if (!r) return
				if (en.instantKind === 'now') {
					r.setViewFocus('now')
				} else if (en.instantKind === 'cursor') {
					r.setViewFocus('cursor')
				} else {
					r.setViewFocus('instant', en.id!)
					r.setTimeCenter(en.ts)
				}
				card!.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
			}
			scroller.appendChild(card)
			if (en.focused) focusedRowEl = card
		}

		// Remove nodes not present
		Array.from(scroller.children).forEach((el) => {
			const elem = el as HTMLElement
			const key = elem.dataset.key
			if (key && !presentKeys.has(key)) elem.remove()
		})

		// FLIP animation
		Array.from(scroller.children).forEach((el) => {
			const elem = el as HTMLElement
			const key = elem.dataset.key
			if (!key) return
			const prevTop = prevPos.get(key)
			const newTop = elem.getBoundingClientRect().top
			if (prevTop !== undefined) {
				const delta = prevTop - newTop
				if (delta !== 0) {
					elem.style.transition = 'none'
					elem.style.transform = `translateY(${delta}px)`
					requestAnimationFrame(() => {
						elem.style.transition = 'transform 280ms ease'
						elem.style.transform = 'translateY(0)'
					})
				}
			}
		})

		// Ensure focused row is visible
		if (focusedRowEl) focusedRowEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
	}

	destroy() {
		// no-op for now; placeholder for future listeners
	}
}


