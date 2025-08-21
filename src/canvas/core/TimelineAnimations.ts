import type { TimelineState } from './TimelineState'

export interface ZoomPanAnimation {
  active: boolean
  startTs: number
  durationMs: number
  fromCenter: number
  toCenter: number
  fromWidth: number
  toWidth: number
}

/**
 * Handles all timeline animations including zoom, pan, and smooth transitions
 */
export class TimelineAnimations {
  private zoomPanAnim: ZoomPanAnimation | null = null
  private zoomTargetWidth: number | null = null
  private pendingPersistAfterAnim: boolean = false
  private zoomTargetPersistPending: boolean = false
  
  private state: TimelineState
  
  constructor(state: TimelineState) {
    this.state = state
  }
  
  // === Animation Update Loop ===
  
  public updateAnimations(): boolean {
    let hasChanges = false
    
    // Update zoom/pan animation
    if (this.updateZoomPanAnimation()) {
      hasChanges = true
    }
    
    // Update zoom target smoothing
    if (this.updateZoomTargetSmoothing()) {
      hasChanges = true
    }
    
    return hasChanges
  }
  
  private updateZoomPanAnimation(): boolean {
    if (!this.zoomPanAnim || !this.zoomPanAnim.active) {
      return false
    }
    
    const nowTs = performance.now()
    const tRaw = (nowTs - this.zoomPanAnim.startTs) / this.zoomPanAnim.durationMs
    const t = Math.max(0, Math.min(1, tRaw))
    
    // Cubic ease-in-out
    const ease = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
    
    const newCenter = this.zoomPanAnim.fromCenter + (this.zoomPanAnim.toCenter - this.zoomPanAnim.fromCenter) * ease
    const newWidth = this.zoomPanAnim.fromWidth + (this.zoomPanAnim.toWidth - this.zoomPanAnim.fromWidth) * ease
    
    this.state.setTimeCenter(newCenter)
    this.state.setTimeWidth(newWidth)
    
    if (t >= 1) {
      this.zoomPanAnim.active = false
      if (this.pendingPersistAfterAnim) {
        this.onAnimationComplete()
        this.pendingPersistAfterAnim = false
      }
    }
    
    return true
  }
  
  private updateZoomTargetSmoothing(): boolean {
    // Only smooth when no center animation is running
    const centerAnimating = !!(this.zoomPanAnim && this.zoomPanAnim.active)
    if (centerAnimating || this.zoomTargetWidth === null) {
      return false
    }
    
    const target = this.clampTimeWidth(this.zoomTargetWidth)
    const currentWidth = this.state.getTimeWidth()
    const diff = target - currentWidth
    
    // Exponential smoothing
    const step = diff * 0.25
    if (Math.abs(diff) <= 0.5) {
      this.state.setTimeWidth(target)
      this.zoomTargetWidth = null
      if (this.zoomTargetPersistPending) {
        this.onAnimationComplete()
        this.zoomTargetPersistPending = false
      }
      return true
    } else {
      this.state.setTimeWidth(currentWidth + step)
      return true
    }
  }
  
  // === Zoom/Pan Animation Control ===
  
  public startZoomPanAnimation(targetCenter: number, targetWidth: number, durationMs = 350): void {
    const fromCenter = this.state.getTimeCenter()
    const fromWidth = this.state.getTimeWidth()
    
    this.zoomPanAnim = {
      active: true,
      startTs: performance.now(),
      durationMs,
      fromCenter,
      toCenter: targetCenter,
      fromWidth,
      toWidth: this.clampTimeWidth(targetWidth)
    }
    
    this.pendingPersistAfterAnim = true
  }
  
  public cancelZoomPanAnimation(): void {
    if (this.zoomPanAnim) {
      this.zoomPanAnim.active = false
      this.zoomPanAnim = null
    }
    this.pendingPersistAfterAnim = false
  }
  
  public isZoomPanAnimating(): boolean {
    return !!(this.zoomPanAnim && this.zoomPanAnim.active)
  }
  
  // === Zoom Target Smoothing ===
  
  public setZoomTarget(targetWidth: number, shouldPersist = false): void {
    this.zoomTargetWidth = targetWidth
    this.zoomTargetPersistPending = shouldPersist
  }
  
  public clearZoomTarget(): void {
    this.zoomTargetWidth = null
    this.zoomTargetPersistPending = false
  }
  
  public hasZoomTarget(): boolean {
    return this.zoomTargetWidth !== null
  }
  
  // === Zoom Factor Application ===
  
  public applyZoomFactor(factor: number, shouldPersist = false): void {
    const currentWidth = this.state.getTimeWidth()
    const newWidth = currentWidth * factor
    this.setZoomTarget(newWidth, shouldPersist)
  }
  
  // === Utility Methods ===
  
  private clampTimeWidth(width: number): number {
    const minWidth = 1000 // 1s
    const maxWidth = 30 * 24 * 60 * 60 * 1000 // 30d
    return Math.max(minWidth, Math.min(maxWidth, width))
  }
  
  private onAnimationComplete(): void {
    // Hook for persistence or other completion actions
    // This will be called by the main renderer when animations complete
  }
  
  // === Animation State Queries ===
  
  public isAnimating(): boolean {
    return this.isZoomPanAnimating() || this.hasZoomTarget()
  }
  
  public getAnimationState(): {
    zoomPanActive: boolean
    zoomTargetActive: boolean
    pendingPersist: boolean
  } {
    return {
      zoomPanActive: this.isZoomPanAnimating(),
      zoomTargetActive: this.hasZoomTarget(),
      pendingPersist: this.pendingPersistAfterAnim || this.zoomTargetPersistPending
    }
  }
  
  // === Preset Animations ===
  
  public animateToNow(durationMs = 350): void {
    this.startZoomPanAnimation(Date.now(), this.state.getTimeWidth(), durationMs)
  }
  
  public animateToInstant(timestamp: number, durationMs = 350): void {
    this.startZoomPanAnimation(timestamp, this.state.getTimeWidth(), durationMs)
  }
  
  public animateToRange(startTs: number, endTs: number, durationMs = 350): void {
    const center = (startTs + endTs) / 2
    const duration = Math.abs(endTs - startTs)
    const width = duration * 1.2 // 20% margin
    this.startZoomPanAnimation(center, width, durationMs)
  }
  
  // === Continuous Updates for NOW spans ===
  
  public updateContinuousZoomForNowSpan(startTs: number, nowTs: number): void {
    // Skip if any animations are active
    if (this.isAnimating()) {
      return
    }
    
    // Calculate current span duration and center
    const spanDuration = Math.abs(nowTs - startTs)
    const spanCenter = (startTs + nowTs) / 2
    
    // Check if we need to zoom out (when span is getting longer than visible range)
    const currentTimeRange = this.state.getTimeWidth()
    const spanWithMargin = spanDuration * 1.2 // 20% margin
    
    // Only update if span is growing beyond current view or center needs adjustment
    const needsZoomOut = spanWithMargin > currentTimeRange
    const centerDrift = Math.abs(this.state.getTimeCenter() - spanCenter)
    const centerTolerance = currentTimeRange * 0.1 // 10% of current range
    
    if (needsZoomOut || centerDrift > centerTolerance) {
      // Smoothly adjust center
      this.state.setTimeCenter(spanCenter)
      
      // Zoom out if needed, but only when span is significantly larger than current view
      if (needsZoomOut) {
        this.state.setTimeWidth(Math.max(currentTimeRange, spanWithMargin))
      }
    } else {
      // Just update center for smaller adjustments
      this.state.setTimeCenter(spanCenter)
    }
  }
}
