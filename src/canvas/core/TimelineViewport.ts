import type { TimelineState } from './TimelineState'

/**
 * Handles viewport calculations and time-position transformations
 */
export class TimelineViewport {
  private screenWidth: number = 0
  private timeStart: number = 0
  private timeEnd: number = 0
  
  // Zoom configuration
  private readonly minTimeWidthMs: number = 1000 // 1s
  private readonly maxTimeWidthMs: number = 30 * 24 * 60 * 60 * 1000 // 30d
  
  private canvas: HTMLCanvasElement
  private state: TimelineState
  
  constructor(
    canvas: HTMLCanvasElement,
    state: TimelineState
  ) {
    this.canvas = canvas
    this.state = state
    this.updateDimensions()
  }
  
  // === Dimension Management ===
  
  public updateDimensions(): void {
    const dpr = window.devicePixelRatio || 1
    this.screenWidth = this.canvas.width / dpr
  }
  
  public getScreenWidth(): number {
    return this.screenWidth
  }
  
  // === Time Range Calculations ===
  
  public updateTimeRange(): void {
    const timeWidth = this.state.getTimeWidth()
    const timeCenter = this.state.getTimeCenter()
    const halfTimeWidth = timeWidth / 2
    
    this.timeStart = timeCenter - halfTimeWidth
    this.timeEnd = timeCenter + halfTimeWidth
  }
  
  public getTimeStart(): number {
    return this.timeStart
  }
  
  public getTimeEnd(): number {
    return this.timeEnd
  }
  
  public getVisibleTimeRange(): { start: number; end: number } {
    return { start: this.timeStart, end: this.timeEnd }
  }
  
  // === Time-Position Transformations ===
  
  public timeToPosition(timestamp: number): number {
    const timeWidth = this.state.getTimeWidth()
    const timeCenter = this.state.getTimeCenter()
    const timeOffset = timestamp - timeCenter
    const screenOffset = (timeOffset / timeWidth) * this.screenWidth
    return this.screenWidth / 2 + screenOffset
  }
  
  public positionToTime(x: number): number {
    const timeWidth = this.state.getTimeWidth()
    const timeCenter = this.state.getTimeCenter()
    const screenOffset = x - this.screenWidth / 2
    const timeOffset = (screenOffset / this.screenWidth) * timeWidth
    return timeCenter + timeOffset
  }
  
  // === Visibility Checks ===
  
  public shouldDrawSpan(aTs: number, bTs: number): boolean {
    const early = Math.min(aTs, bTs)
    const late = Math.max(aTs, bTs)
    
    // Check if span overlaps with visible time range
    return !(late < this.timeStart || early > this.timeEnd)
  }
  
  public isTimeVisible(timestamp: number): boolean {
    return timestamp >= this.timeStart && timestamp <= this.timeEnd
  }
  
  public isPositionVisible(x: number): boolean {
    return x >= 0 && x <= this.screenWidth
  }
  
  // === Zoom Utilities ===
  
  public clampTimeWidth(width: number): number {
    return Math.max(this.minTimeWidthMs, Math.min(this.maxTimeWidthMs, width))
  }
  
  public getMinTimeWidth(): number {
    return this.minTimeWidthMs
  }
  
  public getMaxTimeWidth(): number {
    return this.maxTimeWidthMs
  }
  
  // === Pan Utilities ===
  
  public panByPixels(deltaX: number): void {
    const timeWidth = this.state.getTimeWidth()
    const timeOffset = (deltaX / this.screenWidth) * timeWidth
    const newCenter = this.state.getTimeCenter() - timeOffset
    this.state.setTimeCenter(newCenter)
  }
  
  // === Snap Utilities ===
  
  public snapToNowIfClose(tolerancePx: number): boolean {
    const xNow = this.timeToPosition(Date.now())
    const xCenter = this.screenWidth / 2
    if (Math.abs(xNow - xCenter) <= tolerancePx) {
      this.state.setViewFocus('now')
      return true
    }
    return false
  }
  
  public snapToInstantIfClose(tolerancePx: number, instants: Array<{ id: string; tsEpochMs: number }>): boolean {
    const xCenter = this.screenWidth / 2
    let best: { id: string; dist: number } | null = null
    
    for (const instant of instants) {
      const x = this.timeToPosition(instant.tsEpochMs)
      const d = Math.abs(x - xCenter)
      if (d <= tolerancePx && (!best || d < best.dist)) {
        best = { id: instant.id, dist: d }
      }
    }
    
    if (best) {
      const instant = instants.find(i => i.id === best!.id)!
      this.state.setViewFocus('instant', best.id)
      this.state.setTimeCenter(instant.tsEpochMs)
      return true
    }
    
    return false
  }
  
  // === Time Box Calculations ===
  
  public computeTimeBoxRect(timestamp: number): { x: number; y: number; w: number; h: number } {
    const x = this.timeToPosition(timestamp)
    const boxWidth = 100
    const boxHeight = 24
    
    // Center the box on the timestamp position
    return {
      x: x - boxWidth / 2,
      y: 10, // Fixed Y position at top
      w: boxWidth,
      h: boxHeight
    }
  }
  
  // === Zoom to Range ===
  
  public calculateZoomToRange(aTs: number, bTs: number): { center: number; width: number } {
    const early = Math.min(aTs, bTs)
    const late = Math.max(aTs, bTs)
    const xEarly = this.timeToPosition(early)
    const xLate = this.timeToPosition(late)
    const offscreen = (xEarly < 0) || (xLate > this.screenWidth)
    
    if (offscreen) {
      const desiredTimeWidth = (late - early) / 0.8 // leave 10% margins on each side
      return { center: (early + late) / 2, width: desiredTimeWidth }
    }
    
    const distancePx = Math.max(0, xLate - xEarly)
    if (distancePx < 0.2 * this.screenWidth) {
      const desiredTimeWidth = 2 * (late - early) // make distance 50% of width
      return { center: (early + late) / 2, width: desiredTimeWidth }
    }
    
    // No zoom needed
    return { center: this.state.getTimeCenter(), width: this.state.getTimeWidth() }
  }
}
