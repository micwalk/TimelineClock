import { TimelineRenderer } from '../canvas/TimelineRenderer.ts'
import type { InstantView } from '../types/instants.ts'
import type { SpanView } from '../types/spans.ts'

type ListElement = HTMLDivElement & { _lastVersion?: number; _lastRenderAt?: number }

export class InstantListDomManager {
	private listEl: ListElement
	private controlsEl: HTMLDivElement | null
	private activeTab: 'instants' | 'favorites' | 'spans' = 'instants'
	private lastRenderedTab: 'instants' | 'favorites' | 'spans' = 'instants'

	constructor(listEl: ListElement, controlsEl: HTMLDivElement | null) {
		this.listEl = listEl
		this.controlsEl = controlsEl
	}

	update(ctx: { canvas: HTMLCanvasElement; renderer: TimelineRenderer }) {
		const { canvas, renderer } = ctx
		// Sync from DOM dataset to avoid stale state
		const domActive = (this.listEl.dataset.activeTab as 'instants'|'favorites'|'spans'|undefined)
		if (domActive && domActive !== this.activeTab) {
			this.activeTab = domActive
		}
		const version = renderer.getStateVersion?.() ?? 0
		const nowTs = Date.now()
		const tabChanged = this.lastRenderedTab !== this.activeTab
		if (!tabChanged && this.listEl._lastVersion === version && this.listEl._lastRenderAt && nowTs - this.listEl._lastRenderAt < 1000) {
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
			tabs.style.pointerEvents = 'auto'
			const makeTab = (label: string, key: 'instants'|'favorites'|'spans') => {
				const t = document.createElement('button')
				t.type = 'button'
				t.textContent = label
				t.style.font = 'bold 16px Arial'
				t.style.color = '#94a3b8'
				t.style.padding = '6px 8px'
				t.style.cursor = 'pointer'
				t.style.background = 'transparent'
				t.style.border = 'none'
				t.style.outline = 'none'
				t.style.borderBottom = '3px solid transparent'
				t.dataset.tabkey = key
				t.onclick = (ev) => {
					ev.stopPropagation()
					this.listEl.dataset.activeTab = key
					this.activeTab = key
					this.listEl._lastRenderAt = 0
					// debug: confirm click is handled
					try { console.log('[InstantList] tab click', key) } catch { /* noop */ }
				}
				return t
			}
			const tabAll = makeTab('All Instants', 'instants')
			const tabFav = makeTab('Favorites', 'favorites')
			const tabSpans = makeTab('All Spans', 'spans')
			tabs.appendChild(tabAll)
			tabs.appendChild(tabFav)
			tabs.appendChild(tabSpans)
			this.listEl.innerHTML = ''
			this.listEl.appendChild(tabs)
			if (!this.listEl.dataset.activeTab) this.listEl.dataset.activeTab = 'instants'
			this.activeTab = (this.listEl.dataset.activeTab as 'instants'|'favorites'|'spans')
		}
		// Update tab highlighting
		{
			const active = this.activeTab || 'instants'
			Array.from(tabs.querySelectorAll('[data-tabkey]')).forEach((el) => {
				const t = el as HTMLElement
				const isActive = t.dataset.tabkey === active
				t.style.borderBottom = isActive ? '3px solid #22d3ee' : '3px solid transparent'
				t.style.color = isActive ? '#ffffff' : '#94a3b8'
			})
			// debug: show active tab
			try { console.log('[InstantList] activeTab', active) } catch { /* noop */ }
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
			scroller.style.pointerEvents = 'auto'
			scroller.onwheel = (evt) => { evt.stopPropagation() }
			scroller.onclick = (e) => { e.stopPropagation() }
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

		// Build entries depending on active tab
		type Focus = { mode: 'now'|'cursor'|'instant'|'span'; focusedInstantId: string|null; focusedSpanId?: string|null }
		const focus: Focus = renderer.getViewFocus ? renderer.getViewFocus() : { mode: 'now', focusedInstantId: null, focusedSpanId: null }
		if (this.activeTab === 'spans') {
			const spans: SpanView[] = typeof (renderer as unknown as { getAllSpansView?: () => SpanView[] }).getAllSpansView === 'function'
				? ((renderer as unknown as { getAllSpansView: () => SpanView[] }).getAllSpansView())
				: []
			const presentKeys = new Set<string>()
			let focusedRowEl: HTMLElement | null = null
			for (let idx = 0; idx < spans.length; idx++) {
				const s = spans[idx]
				const key = s.kind === 'saved' ? `s:${s.id}` : `imp:${idx}`
				presentKeys.add(key)
				let card = scroller.querySelector(`[data-key="${key}"]`) as HTMLElement | null
				if (!card) {
					card = document.createElement('div')
					card.dataset.key = key
					card.style.display = 'grid'
					card.style.gridTemplateColumns = '1.6fr 1fr 1.2fr 1.1fr 1.2fr 1fr'
					card.style.alignItems = 'center'
					card.style.background = 'rgba(0,0,0,0.6)'
					card.style.color = '#ffffff'
					card.style.padding = '8px 12px'
					card.style.marginBottom = '10px'
					card.style.cursor = 'pointer'
					card.style.willChange = 'transform'
					card.onpointerdown = (ev) => { ev.stopPropagation() }
					const name = document.createElement('div'); name.dataset.role = 'name'; name.style.font = 'bold 16px Arial'
					const sname = document.createElement('div'); sname.dataset.role = 'sname'; sname.style.font = 'bold 14px Arial'
					const stime = document.createElement('div'); stime.dataset.role = 'stime'; stime.style.font = 'bold 14px monospace'; stime.style.textAlign = 'right'
					const dur = document.createElement('div'); dur.dataset.role = 'dur'; dur.style.font = 'bold 14px monospace'; dur.style.textAlign = 'center'
					const etime = document.createElement('div'); etime.dataset.role = 'etime'; etime.style.font = 'bold 14px monospace'; etime.style.textAlign = 'right'
					const ename = document.createElement('div'); ename.dataset.role = 'ename'; ename.style.font = 'bold 14px Arial'
					card.appendChild(name)
					card.appendChild(sname)
					card.appendChild(stime)
					card.appendChild(dur)
					card.appendChild(etime)
					card.appendChild(ename)
				}
				const isFocused = (focus.mode === 'span') && (s.kind === 'saved') && (focus.focusedSpanId === s.id)
				const nameEl = card.querySelector('[data-role="name"]') as HTMLElement
				const snameEl = card.querySelector('[data-role="sname"]') as HTMLElement
				const stimeEl = card.querySelector('[data-role="stime"]') as HTMLElement
				const durEl = card.querySelector('[data-role="dur"]') as HTMLElement
				const etimeEl = card.querySelector('[data-role="etime"]') as HTMLElement
				const enameEl = card.querySelector('[data-role="ename"]') as HTMLElement
				nameEl.textContent = s.label
				snameEl.textContent = s.start.name
				stimeEl.textContent = new Date(s.start.tsEpochMs).toLocaleString()
				{
					const abs = Math.abs(s.durationMs)
					const totalSeconds = Math.floor(abs / 1000)
					const hours = Math.floor(totalSeconds / 3600)
					const minutes = Math.floor((totalSeconds % 3600) / 60)
					const seconds = totalSeconds % 60
					const hh = hours.toString().padStart(2, '0')
					const mm = minutes.toString().padStart(2, '0')
					const ss = seconds.toString().padStart(2, '0')
					durEl.textContent = `${hh}:${mm}:${ss}`
				}
				etimeEl.textContent = new Date(s.end.tsEpochMs).toLocaleString()
				enameEl.textContent = s.end.name
				card.style.border = `2px solid ${isFocused ? '#22d3ee' : '#ffffff'}`
				if (s.kind === 'saved' && s.id) {
					card.onclick = () => {
						renderer.setViewFocus('span', undefined, s.id!)
						const mid = (s.start.tsEpochMs + s.end.tsEpochMs) / 2
						renderer.setTimeCenter(mid)
						card!.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
					}
				} else {
					card.onclick = null
				}
				scroller.appendChild(card)
				if (isFocused) focusedRowEl = card
			}
			// Remove nodes not present
			Array.from(scroller.children).forEach((el) => {
				const elem = el as HTMLElement
				const key = elem.dataset.key
				if (key && !presentKeys.has(key)) elem.remove()
			})
			// Ensure focused row is visible
			if (focusedRowEl) focusedRowEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
			this.lastRenderedTab = this.activeTab
			return
		}

		// Default Instants tab
		const items: InstantView[] = renderer.getAllInstantsView()
		const entries: Array<{ key: string; ts: number; name: string; focused: boolean; instantKind: 'now'|'cursor'|'instant'; id?: string }> = []
		for (const it of items) {
			if (it.kind === 'now') {
				entries.push({ key: 'now', ts: it.tsEpochMs, name: 'Now', focused: focus.mode === 'now', instantKind: 'now' })
				continue
			}
			if (it.kind === 'cursor') {
				if (it.visible) {
					entries.push({ key: 'cursor', ts: it.tsEpochMs, name: 'Cursor', focused: focus.mode === 'cursor', instantKind: 'cursor' })
				}
				continue
			}
			entries.push({ key: `i:${it.id}`, ts: it.tsEpochMs, name: it.label || '(unnamed)', focused: focus.mode === 'instant' && focus.focusedInstantId === it.id, instantKind: 'instant', id: it.id })
		}

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
		this.lastRenderedTab = this.activeTab
	}

	destroy() {
		// no-op for now; placeholder for future listeners
	}
}


