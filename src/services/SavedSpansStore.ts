import type { SpanRecord } from '../types/spans.ts'

type Listener = () => void

export class SavedSpansStore {
  private items: SpanRecord[] = []
  private listeners = new Set<Listener>()
  private version = 0
  private readonly key = 'timeline.spans.v1'

  constructor() {
    this.hydrate()
  }

  getVersion(): number { return this.version }
  subscribe(fn: Listener): () => void { this.listeners.add(fn); return () => this.listeners.delete(fn) }

  getSnapshot(): SpanRecord[] { return this.items.slice() }

  create(startInstantId: string, endInstantId: string, label = ''): string {
    const id = `s_${Math.random().toString(36).slice(2, 9)}`
    this.items.push({ id, startInstantId, endInstantId, label })
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
        this.items = JSON.parse(raw) as SpanRecord[]
        return
      }
    } catch (err) { void err }
  }
}


