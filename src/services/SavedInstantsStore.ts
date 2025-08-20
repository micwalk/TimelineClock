import type { InstantRecord } from '../types/instants.ts'

type Listener = () => void

export class SavedInstantsStore {
	private items: InstantRecord[] = []
	private listeners = new Set<Listener>()
	private version = 0
	private readonly key = 'timeline.saved.v1'

	constructor() {
		this.hydrate()
	}

	getVersion(): number { return this.version }
	subscribe(fn: Listener): () => void { this.listeners.add(fn); return () => this.listeners.delete(fn) }

	getSnapshot(): InstantRecord[] { return this.items.slice() }
	getSorted(): InstantRecord[] { return this.items.slice().sort((a, b) => a.tsEpochMs - b.tsEpochMs) }

	create(tsEpochMs: number, label = ''): string {
		const id = `i_${Math.random().toString(36).slice(2, 9)}`
		this.items.push({ id, tsEpochMs, label })
		this.persist()
		return id
	}

	delete(id: string) {
		this.items = this.items.filter(x => x.id !== id)
		this.persist()
	}

	updateLabel(id: string, label: string) {
		const it = this.items.find(x => x.id === id)
		if (!it) return
		it.label = label
		this.persist()
	}

	private persist() {
		try {
			localStorage.setItem(this.key, JSON.stringify(this.items))
		} catch (err) { void err }
		this.version++
		for (const l of this.listeners) l()
	}

	private hydrate() {
		try {
			const raw = localStorage.getItem(this.key)
			if (raw) {
				this.items = JSON.parse(raw) as InstantRecord[]
				return
			}
			// Soft migrate from legacy renderer state if present
			const legacy = localStorage.getItem('timeline.state')
			if (legacy) {
				const data = JSON.parse(legacy) as { savedInstants?: { id: string; ts: number; label: string }[] }
				if (Array.isArray(data.savedInstants)) {
					this.items = data.savedInstants.map(x => ({ id: x.id, tsEpochMs: x.ts, label: x.label }))
					this.persist()
				}
			}
		} catch (err) { void err }
	}
}


