// Domain types for timeline spans (pairs of instants)

export interface SpanRecord {
  id: string
  startInstantId: string
  endInstantId: string
  label: string
}

export interface SpanViewBase {
  kind: 'saved' | 'implied'
  id?: string
  label: string
  start: { id?: string; name: string; tsEpochMs: number }
  end: { id?: string; name: string; tsEpochMs: number }
  durationMs: number
}

export type SpanView = SpanViewBase

export function createSpanId(): string {
  return `s_${Math.random().toString(36).slice(2, 9)}`
}


