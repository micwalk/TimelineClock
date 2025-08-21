// Hit target management for timeline interactions
// Centralizes hit target registration and testing logic

export type HitTargetType = 
  | 'save-now' 
  | 'save-cursor' 
  | 'instant-label' 
  | 'cursor-label' 
  | 'now-label' 
  | 'cursor-star' 
  | 'now-star' 
  | 'instant-trash' 
  | 'instant-time' 
  | 'span-pin' 
  | 'span-label' 
  | 'span-body' 
  | 'span-visible' 
  | 'span-delete' 
  | 'instant-fav' 
  | 'span-end-focus'

export interface HitTargetRect {
  x: number
  y: number
  w: number
  h: number
}

export interface HitTarget {
  type: HitTargetType
  id?: string
  rect: HitTargetRect
  focus?: 'now' | 'cursor' | 'instant'
  spanData?: { aTs: number; bTs: number; label: string }
}

export class HitTargetManager {
  private targets: HitTarget[] = []

  // Clear all registered targets (called at start of render)
  clear(): void {
    this.targets = []
  }

  // Generic target registration
  addTarget(target: HitTarget): void {
    this.targets.push(target)
  }

  // Convenience methods for common target types
  addSpanLabel(spanId: string, x: number, y: number, w: number, h: number): void {
    this.targets.push({
      type: 'span-label',
      id: spanId,
      rect: { x, y, w, h }
    })
  }

  addSpanBody(spanId: string, x: number, y: number, w: number, h: number): void {
    this.targets.push({
      type: 'span-body',
      id: spanId,
      rect: { x, y, w, h }
    })
  }

  addSpanPin(x: number, y: number, w: number, h: number, spanData?: { aTs: number; bTs: number; label: string }): void {
    this.targets.push({
      type: 'span-pin',
      rect: { x, y, w, h },
      spanData
    })
  }

  addSpanDelete(spanId: string, x: number, y: number, w: number, h: number): void {
    this.targets.push({
      type: 'span-delete',
      id: spanId,
      rect: { x, y, w, h }
    })
  }

  addSpanVisible(spanId: string, x: number, y: number, w: number, h: number): void {
    this.targets.push({
      type: 'span-visible',
      id: spanId,
      rect: { x, y, w, h }
    })
  }

  addSpanEndFocus(x: number, y: number, w: number, h: number, focus: 'now' | 'cursor' | 'instant', id?: string): void {
    this.targets.push({
      type: 'span-end-focus',
      rect: { x, y, w, h },
      focus,
      id
    })
  }

  addSaveNow(x: number, y: number, w: number, h: number): void {
    this.targets.push({
      type: 'save-now',
      rect: { x, y, w, h }
    })
  }

  addInstantLabel(instantId: string, x: number, y: number, w: number, h: number): void {
    this.targets.push({
      type: 'instant-label',
      id: instantId,
      rect: { x, y, w, h }
    })
  }

  addInstantFavorite(instantId: string, x: number, y: number, w: number, h: number): void {
    this.targets.push({
      type: 'instant-fav',
      id: instantId,
      rect: { x, y, w, h }
    })
  }

  addInstantTime(instantId: string | undefined, x: number, y: number, w: number, h: number): void {
    this.targets.push({
      type: 'instant-time',
      id: instantId,
      rect: { x, y, w, h }
    })
  }

  addInstantTrash(instantId: string, x: number, y: number, w: number, h: number): void {
    this.targets.push({
      type: 'instant-trash',
      id: instantId,
      rect: { x, y, w, h }
    })
  }

  addCursorLabel(x: number, y: number, w: number, h: number): void {
    this.targets.push({
      type: 'cursor-label',
      rect: { x, y, w, h }
    })
  }

  addCursorStar(x: number, y: number, w: number, h: number): void {
    this.targets.push({
      type: 'cursor-star',
      rect: { x, y, w, h }
    })
  }

  addNowLabel(x: number, y: number, w: number, h: number): void {
    this.targets.push({
      type: 'now-label',
      rect: { x, y, w, h }
    })
  }

  addNowStar(x: number, y: number, w: number, h: number): void {
    this.targets.push({
      type: 'now-star',
      rect: { x, y, w, h }
    })
  }

  // Hit testing
  private isPointInRect(x: number, y: number, rect: HitTargetRect): boolean {
    return x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h
  }

  findTargetAt(x: number, y: number): HitTarget | null {
    // Iterate in reverse order (last added has highest priority)
    for (let i = this.targets.length - 1; i >= 0; i--) {
      const target = this.targets[i]
      if (this.isPointInRect(x, y, target.rect)) {
        return target
      }
    }
    return null
  }

  // Get all targets (for debugging or backward compatibility)
  getAllTargets(): readonly HitTarget[] {
    return this.targets
  }

  // Get targets count
  getTargetCount(): number {
    return this.targets.length
  }
}
