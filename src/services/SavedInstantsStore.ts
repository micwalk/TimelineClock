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

	create(tsEpochMs: number, label = '', alarm = false, snoozeOriginalId?: string): string {
		const instant: InstantRecord = {
			id: `i_${Math.random().toString(36).slice(2, 9)}`,
			tsEpochMs,
			label,
			favorite: alarm, // Auto-favorite alarmed instants per PRD
			alarm,
			snoozeOriginalId
		}
		this.items.push(instant)
		this.persist()
		return instant.id
	}

	// New: Create from InstantRecord (useful for migrations, imports, etc.)
	createFromRecord(record: InstantRecord): string {
		// Ensure auto-favorite logic is applied
		if (record.alarm && !record.favorite) {
			record.favorite = true
		}
		this.items.push(record)
		this.persist()
		return record.id
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

	setFavorite(id: string, value: boolean) {
		const it = this.items.find(x => x.id === id)
		if (!it) return
		it.favorite = value
		this.persist()
	}

	// New: Set alarm state for an instant
	setAlarm(id: string, value: boolean) {
		const it = this.items.find(x => x.id === id)
		if (!it) return
		
		it.alarm = value
		
		// Auto-favorite alarmed instants per PRD
		if (value && !it.favorite) {
			it.favorite = true
		}
		
		this.persist()
	}

	// New: Get all alarmed instants
	getAlarmedInstants(): InstantRecord[] {
		return this.items.filter(x => x.alarm)
	}

	// New: Get next alarm time (for dynamic scheduling)
	getNextAlarmTime(): number | null {
		const now = Date.now()
		const futureAlarms = this.items
			.filter(x => x.alarm && x.tsEpochMs > now)
			.sort((a, b) => a.tsEpochMs - b.tsEpochMs)
		
		return futureAlarms.length > 0 ? futureAlarms[0].tsEpochMs : null
	}

	// New: Check if an instant has an alarm
	hasAlarm(id: string): boolean {
		const it = this.items.find(x => x.id === id)
		return it?.alarm ?? false
	}

	// New: Count snoozes for a given original alarm ID
	getSnoozeCount(originalAlarmId: string): number {
		return this.items.filter(x => x.snoozeOriginalId === originalAlarmId).length
	}

	// New: Get instant by ID
	getById(id: string): InstantRecord | null {
		return this.items.find(x => x.id === id) ?? null
	}

	// New: Update entire instant record
	updateInstant(id: string, updates: Partial<InstantRecord>): boolean {
		const it = this.items.find(x => x.id === id)
		if (!it) return false
		
		// Apply updates
		Object.assign(it, updates)
		
		// Ensure auto-favorite logic is maintained
		if (it.alarm && !it.favorite) {
			it.favorite = true
		}
		
		this.persist()
		return true
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
					this.items = data.savedInstants.map(x => ({ 
						id: x.id, 
						tsEpochMs: x.ts, 
						label: x.label, 
						favorite: false, 
						alarm: false 
					}))
					this.persist()
				}
			}
		} catch (err) { void err }
	}
}


