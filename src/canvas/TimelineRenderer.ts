// Format information for drawing instants
export interface InstantFormatInfo {
  lineColor: string
  lineWidth: number
  lineHeight: number
  glowColor?: string
  glowBlur?: number
  labelBackgroundColor?: string
  labelBorderColor?: string
  labelTextColor?: string
  labelFont?: string
  timeStringFont?: string
  timeStringOffset: number
  labelStringOffset: number
}

export class TimelineRenderer {
  private canvas: HTMLCanvasElement
  private ctx: CanvasRenderingContext2D
  private animationId: number | null = null
  private zoomLevel: number = 1
  private panOffset: number = 0
  private lastUpdateTime: number = 0

  // Core timeline state variables
  private screenWidth: number = 0
  private timeWidth: number = 6 * 60 * 60 * 1000 // 6 hours in milliseconds
  private timeCenter: number = Date.now() // Center of timeline as instant
  private timeStart: number = 0 // Start of visible timeline
  private timeEnd: number = 0 // End of visible timeline

  // Zoom configuration
  private zoomPercent: number = 0.1 // 10% per step
  private readonly minTimeWidthMs: number = 1000 // 1s
  private readonly maxTimeWidthMs: number = 30 * 24 * 60 * 60 * 1000 // 30d

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas
    const context = canvas.getContext('2d')
    if (!context) {
      throw new Error('Could not get 2D context from canvas')
    }
    this.ctx = context
    this.setupCanvas()
    this.updateTimelineState()
    this.lastUpdateTime = Date.now()
  }

  private setupCanvas() {
    // Enable high DPI support
    const dpr = window.devicePixelRatio || 1
    this.ctx.scale(dpr, dpr)
    
    // Set rendering quality
    this.ctx.imageSmoothingEnabled = true
    this.ctx.imageSmoothingQuality = 'high'
  }



  private updateTimelineState() {
    const dpr = window.devicePixelRatio || 1
    this.screenWidth = this.canvas.width / dpr
    
    // Update time center to current time
    this.timeCenter = Date.now()
    
    // Calculate time range based on timeWidth and center
    const halfTimeWidth = this.timeWidth / 2
    this.timeStart = this.timeCenter - halfTimeWidth
    this.timeEnd = this.timeCenter + halfTimeWidth
  }

  public render() {
    // Update timeline state
    this.updateTimelineState()
    
    // For now, keep pan offset at 0 to get basic timeline working
    this.panOffset = 0
    
    this.clear()
    this.drawTimeline()
    this.drawTimeTicks()
    this.drawNowLabel() // This now draws the line, label, and time string

    this.lastUpdateTime = Date.now()
  }

  private clear() {
    // Clear with transparent background - let the page gradient show through
    const dpr = window.devicePixelRatio || 1
    this.ctx.clearRect(0, 0, this.canvas.width / dpr, this.canvas.height / dpr)
  }

  private drawTimeline() {
    const dpr = window.devicePixelRatio || 1
    const centerY = (this.canvas.height / dpr) / 2
    const startX = 0
    const endX = this.screenWidth

    // Draw timeline with blue neon glow effect
    this.ctx.save()
    
    // Create glow effect
    this.ctx.shadowColor = '#3b82f6'
    this.ctx.shadowBlur = 15
    this.ctx.shadowOffsetX = 0
    this.ctx.shadowOffsetY = 0
    
    // Draw main timeline line
    this.ctx.strokeStyle = '#ffffff'
    this.ctx.lineWidth = 3
    this.ctx.lineCap = 'round'
    this.ctx.beginPath()
    this.ctx.moveTo(startX, centerY)
    this.ctx.lineTo(endX, centerY)
    this.ctx.stroke()
    
    // Draw additional glow layers
    this.ctx.shadowBlur = 8
    this.ctx.lineWidth = 2
    this.ctx.stroke()
    
    this.ctx.shadowBlur = 4
    this.ctx.lineWidth = 1
    this.ctx.stroke()
    
    this.ctx.restore()
  }

  private drawTimeTicks() {
    const dpr = window.devicePixelRatio || 1
    const centerY = (this.canvas.height / dpr) / 2

    // Determine tiers
    const { tier0, tier1, tier2 } = this.pickTickTiers()

    const pxPerMs = this.screenWidth / this.timeWidth
    const spacing0 = tier0.ms * pxPerMs
    const spacing1 = tier1.ms * pxPerMs
    const spacing2 = tier2.ms * pxPerMs

    const style0 = this.computeTickStyle('low', spacing0)
    const style1 = this.computeTickStyle('mid', spacing1)
    const style2 = this.computeTickStyle('high', spacing2)

    // Draw tiers with dynamic heights and label fades
    this.drawTickTier(tier0, style0)
    this.drawTickTier(tier1, style1)
    this.drawTickTier(tier2, style2)
  }

  private getTickUnits(): { kind: 'duration' | 'calendar'; ms: number; calendarUnit?: 'day' | 'week' | 'month' | 'year' }[] {
    return [
      { kind: 'duration', ms: 250 }, // 250ms
      { kind: 'duration', ms: 1000 }, // 1s
      { kind: 'duration', ms: 5000 }, // 5s
      { kind: 'duration', ms: 15000 }, // 15s
      { kind: 'duration', ms: 60 * 1000 }, // 1 minute
      { kind: 'duration', ms: 5 * 60 * 1000 }, // 5 minutes
      { kind: 'duration', ms: 15 * 60 * 1000 }, // 15 minutes
      { kind: 'duration', ms: 60 * 60 * 1000 }, // 1 hour
      { kind: 'duration', ms: 6 * 60 * 60 * 1000 }, // 6 hours
      { kind: 'calendar', ms: 24 * 60 * 60 * 1000, calendarUnit: 'day' }, // 1 day (midnight)
      { kind: 'calendar', ms: 7 * 24 * 60 * 60 * 1000, calendarUnit: 'week' }, // 1 week (midnight)
      { kind: 'calendar', ms: 30 * 24 * 60 * 60 * 1000, calendarUnit: 'month' }, // 1 month (midnight)
      { kind: 'calendar', ms: 365 * 24 * 60 * 60 * 1000, calendarUnit: 'year' }, // 1 year (midnight)
    ]
  }

  private pickTickTiers(): { tier0: { kind: 'duration' | 'calendar'; ms: number; calendarUnit?: 'day' | 'week' | 'month' | 'year' }; tier1: { kind: 'duration' | 'calendar'; ms: number; calendarUnit?: 'day' | 'week' | 'month' | 'year' }; tier2: { kind: 'duration' | 'calendar'; ms: number; calendarUnit?: 'day' | 'week' | 'month' | 'year' } } {
    const units = this.getTickUnits()
    const pxPerMs = this.screenWidth / this.timeWidth
    const minLabelSpacingPx = 100
    let middleIdx = units.length - 1
    for (let i = 0; i < units.length; i++) {
      const spacingPx = units[i].ms * pxPerMs
      if (spacingPx >= minLabelSpacingPx) {
        middleIdx = i
        break
      }
    }
    const lowIdx = Math.max(0, middleIdx - 1)
    const highIdx = Math.min(units.length - 1, middleIdx + 1)
    return { tier0: units[lowIdx], tier1: units[middleIdx], tier2: units[highIdx] }
  }

  private drawTickTier(unit: { kind: 'duration' | 'calendar'; ms: number; calendarUnit?: 'day' | 'week' | 'month' | 'year' }, style: { halfHeight: number; labelAlpha: number; fontSizePx: number; bold: boolean }) {
    const dpr = window.devicePixelRatio || 1
    const centerY = (this.canvas.height / dpr) / 2
    this.ctx.save()
    this.ctx.strokeStyle = '#ffffff'
    this.ctx.lineWidth = 1

    if (unit.kind === 'duration') {
      const unitMs = unit.ms
      // Special alignment for 6-hour grid: snap to 00/06/12/18
      if (unitMs === 6 * 60 * 60 * 1000) {
        const first = this.getFirstSixHourBoundaryAtOrBefore(this.timeStart)
        for (let t = first; t <= this.timeEnd; t += unitMs) {
          const x = this.timeToPosition(t)
          this.ctx.beginPath()
          this.ctx.moveTo(x, centerY - style.halfHeight)
          this.ctx.lineTo(x, centerY + style.halfHeight)
          this.ctx.stroke()

          if (style.labelAlpha > 0) {
            const label = this.formatTickLabel(t, unitMs, unit)
            this.ctx.save()
            this.ctx.globalAlpha = style.labelAlpha
            this.ctx.fillStyle = '#ffffff'
            this.ctx.font = `${style.bold ? 'bold ' : ''}${Math.round(style.fontSizePx)}px monospace`
            this.ctx.textAlign = 'center'
            this.ctx.textBaseline = 'alphabetic'
            const labelYOffset = style.halfHeight + (style.bold ? 26 : 20)
            this.ctx.fillText(label, x, centerY + labelYOffset)
            this.ctx.restore()
          }
        }
        this.ctx.restore()
        return
      }
      const startAligned = Math.floor(this.timeStart / unitMs) * unitMs
      for (let t = startAligned; t <= this.timeEnd; t += unitMs) {
        const x = this.timeToPosition(t)
        this.ctx.beginPath()
        this.ctx.moveTo(x, centerY - style.halfHeight)
        this.ctx.lineTo(x, centerY + style.halfHeight)
        this.ctx.stroke()

        if (style.labelAlpha > 0) {
          const label = this.formatTickLabel(t, unitMs, unit)
          this.ctx.save()
          this.ctx.globalAlpha = style.labelAlpha
          this.ctx.fillStyle = '#ffffff'
          this.ctx.font = `${style.bold ? 'bold ' : ''}${Math.round(style.fontSizePx)}px monospace`
          this.ctx.textAlign = 'center'
          this.ctx.textBaseline = 'alphabetic'
          const labelYOffset = style.halfHeight + (style.bold ? 26 : 20)
          this.ctx.fillText(label, x, centerY + labelYOffset)
          this.ctx.restore()
        }
      }
    } else {
      // Calendar-aligned ticks (midnight boundaries)
      const first = this.getFirstCalendarBoundaryAtOrBefore(this.timeStart, unit.calendarUnit!)
      let t = first
      while (t <= this.timeEnd) {
        const x = this.timeToPosition(t)
        this.ctx.beginPath()
        this.ctx.moveTo(x, centerY - style.halfHeight)
        this.ctx.lineTo(x, centerY + style.halfHeight)
        this.ctx.stroke()

        if (style.labelAlpha > 0) {
          const label = this.formatTickLabel(t, unit.ms, unit)
          this.ctx.save()
          this.ctx.globalAlpha = style.labelAlpha
          this.ctx.fillStyle = '#ffffff'
          this.ctx.font = `${style.bold ? 'bold ' : ''}${Math.round(style.fontSizePx)}px monospace`
          this.ctx.textAlign = 'center'
          this.ctx.textBaseline = 'alphabetic'
          const labelYOffset = style.halfHeight + (style.bold ? 26 : 20)
          this.ctx.fillText(label, x, centerY + labelYOffset)
          this.ctx.restore()
        }

        t = this.addCalendar(t, unit.calendarUnit!, 1)
      }
    }
    this.ctx.restore()
  }

  private computeTickStyle(tier: 'low' | 'mid' | 'high', spacingPx: number): { halfHeight: number; labelAlpha: number; fontSizePx: number; bold: boolean } {
    const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v))
    const smoothstep = (edge0: number, edge1: number, x: number) => {
      const t = clamp((x - edge0) / (edge1 - edge0), 0, 1)
      return t * t * (3 - 2 * t)
    }
    const lerp = (a: number, b: number, t: number) => a + (b - a) * t

    if (tier === 'low') {
      const tH = smoothstep(8, 40, spacingPx)
      const halfHeight = lerp(2, 6, tH)
      return { halfHeight, labelAlpha: 0, fontSizePx: 10, bold: false }
    }
    if (tier === 'mid') {
      const tH = smoothstep(40, 160, spacingPx)
      const halfHeight = lerp(5, 10, tH)
      const tAlpha = smoothstep(90, 140, spacingPx)
      const tFont = smoothstep(100, 180, spacingPx)
      const fontSizePx = lerp(10, 12, tFont)
      return { halfHeight, labelAlpha: tAlpha, fontSizePx, bold: false }
    }
    // high tier
    const tH = smoothstep(120, 260, spacingPx)
    const halfHeight = lerp(10, 20, tH)
    const tAlpha = smoothstep(160, 220, spacingPx)
    const tFont = smoothstep(160, 240, spacingPx)
    const fontSizePx = lerp(12, 14, tFont)
    return { halfHeight, labelAlpha: tAlpha, fontSizePx, bold: true }
  }

  private formatTickLabel(timestamp: number, unitMs: number, unit?: { kind: 'duration' | 'calendar'; ms: number; calendarUnit?: 'day' | 'week' | 'month' | 'year' }): string {
    const d = new Date(timestamp)
    if (unitMs < 1000) {
      // sub-second → mm:ss.S
      const mm = d.getMinutes().toString().padStart(2, '0')
      const ss = d.getSeconds().toString().padStart(2, '0')
      const ms = Math.floor(d.getMilliseconds() / 100)
      return `${mm}:${ss}.${ms}`
    }
    if (unitMs < 60 * 1000) {
      // seconds → mm:ss
      const mm = d.getMinutes().toString().padStart(2, '0')
      const ss = d.getSeconds().toString().padStart(2, '0')
      return `${mm}:${ss}`
    }
    if (unitMs < 60 * 60 * 1000) {
      // minutes → HH:MM
      const h = d.getHours()
      const m = d.getMinutes()
      const hh = (h === 0 ? 12 : h > 12 ? h - 12 : h).toString().padStart(2, '0')
      const mm = m.toString().padStart(2, '0')
      return `${hh}:${mm}`
    }
    if (unitMs < 24 * 60 * 60 * 1000) {
      // hours → h AM/PM
      const h = d.getHours()
      const displayHour = h === 0 ? 12 : h > 12 ? h - 12 : h
      const ampm = h >= 12 ? 'PM' : 'AM'
      return `${displayHour}${ampm}`
    }
    if (unit && unit.kind === 'calendar' && unit.calendarUnit === 'day') {
      // days → MMM d
      const month = d.toLocaleString(undefined, { month: 'short' })
      const day = d.getDate()
      return `${month} ${day}`
    }
    if (unit && unit.kind === 'calendar' && unit.calendarUnit === 'week') {
      // week → MMM d (start of week)
      const month = d.toLocaleString(undefined, { month: 'short' })
      const day = d.getDate()
      return `${month} ${day}`
    }
    if (unit && unit.kind === 'calendar' && unit.calendarUnit === 'month') {
      // months → MMM yyyy
      const month = d.toLocaleString(undefined, { month: 'short' })
      const year = d.getFullYear()
      return `${month} ${year}`
    }
    // years → yyyy
    return `${d.getFullYear()}`
  }

  private getFirstCalendarBoundaryAtOrBefore(ts: number, unit: 'day' | 'week' | 'month' | 'year'): number {
    const d = new Date(ts)
    if (unit === 'day') {
      d.setHours(0, 0, 0, 0)
      return d.getTime()
    }
    if (unit === 'week') {
      // Align to Sunday 00:00 local
      d.setHours(0, 0, 0, 0)
      const day = d.getDay() // 0=Sun
      const deltaToSunday = day
      d.setDate(d.getDate() - deltaToSunday)
      return d.getTime()
    }
    if (unit === 'month') {
      d.setHours(0, 0, 0, 0)
      d.setDate(1)
      return d.getTime()
    }
    // year
    d.setHours(0, 0, 0, 0)
    d.setMonth(0, 1)
    return d.getTime()
  }

  private addCalendar(ts: number, unit: 'day' | 'week' | 'month' | 'year', amount: number): number {
    const d = new Date(ts)
    if (unit === 'day') {
      d.setDate(d.getDate() + amount)
      return d.getTime()
    }
    if (unit === 'week') {
      d.setDate(d.getDate() + 7 * amount)
      return d.getTime()
    }
    if (unit === 'month') {
      d.setMonth(d.getMonth() + amount, 1)
      return d.getTime()
    }
    // year
    d.setFullYear(d.getFullYear() + amount, 0, 1)
    return d.getTime()
  }

  private getFirstSixHourBoundaryAtOrBefore(ts: number): number {
    const d = new Date(ts)
    d.setMinutes(0, 0, 0)
    const hour = d.getHours()
    const alignedHour = Math.floor(hour / 6) * 6
    d.setHours(alignedHour, 0, 0, 0)
    return d.getTime()
  }

  private drawNowLabel() {
    // Draw the NOW label using the drawInstant helper
    this.drawInstant(Date.now(), 'NOW', {
      lineColor: '#ef4444',
      lineWidth: 4,
      lineHeight: (this.canvas.height / (window.devicePixelRatio || 1)) * 0.6,
      glowColor: '#ef4444',
      glowBlur: 10,
      labelBackgroundColor: 'rgba(0, 0, 0, 0.8)',
      labelBorderColor: '#ef4444',
      labelTextColor: '#ef4444',
      labelFont: 'bold 16px Arial'
    })
  }

  // Public getters for state variables
  public getScreenWidth(): number {
    return this.screenWidth
  }

  public getTimeWidth(): number {
    return this.timeWidth
  }

  public getTimeCenter(): number {
    return this.timeCenter
  }

  public getTimeStart(): number {
    return this.timeStart
  }

  public getTimeEnd(): number {
    return this.timeEnd
  }

  // Public helper functions
  public timeToPosition(instant: number): number {
    // Convert a timestamp to x coordinate on the timeline
    const progress = (instant - this.timeStart) / (this.timeEnd - this.timeStart)
    return progress * this.screenWidth
  }

  public positionToTime(x: number): number {
    // Convert x coordinate to timestamp
    const progress = x / this.screenWidth
    return this.timeStart + (progress * (this.timeEnd - this.timeStart))
  }

  // Zoom API (percent-based around current center)
  public setZoomPercent(zoomPercent: number): void {
    const clamped = Math.max(0.001, Math.min(0.9, zoomPercent))
    this.zoomPercent = clamped
  }

  public zoomIn(): void {
    const factor = 1 - this.zoomPercent
    this.timeWidth = this.clampTimeWidth(this.timeWidth * factor)
  }

  public zoomOut(): void {
    const factor = 1 + this.zoomPercent
    this.timeWidth = this.clampTimeWidth(this.timeWidth * factor)
  }

  private clampTimeWidth(width: number): number {
    return Math.max(this.minTimeWidthMs, Math.min(this.maxTimeWidthMs, width))
  }

  private formatTimeString12h(timestamp: number): string {
    const d = new Date(timestamp)
    const h = d.getHours()
    const m = d.getMinutes()
    const s = d.getSeconds()
    const displayHour = h === 0 ? 12 : h > 12 ? h - 12 : h
    const ampm = h >= 12 ? 'PM' : 'AM'
    return `${displayHour.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')} ${ampm}`
  }

  // Draw an instant (timestamp) on the timeline with optional label
  public drawInstant(timestamp: number, label?: string, formatInfo?: Partial<InstantFormatInfo>): void {
    const dpr = window.devicePixelRatio || 1
    const centerY = (this.canvas.height / dpr) / 2
    
    // Default format info
    const defaultFormat: InstantFormatInfo = {
      lineColor: '#ffffff',
      lineWidth: 2,
      lineHeight: (this.canvas.height / dpr) * 0.6,
      glowColor: undefined,
      glowBlur: 0,
      labelBackgroundColor: 'rgba(0, 0, 0, 0.8)',
      labelBorderColor: '#ffffff',
      labelTextColor: '#ffffff',
      labelFont: 'bold 16px Arial',
      timeStringFont: 'bold 20px monospace',
      labelStringOffset: 40,
      timeStringOffset: 80
    }
    
    const format: InstantFormatInfo = { ...defaultFormat, ...formatInfo }
    
    // Calculate position
    const timelinePosition = this.timeToPosition(timestamp)
    const startY = centerY - format.lineHeight / 2
    const endY = centerY + format.lineHeight / 2

    this.ctx.save()
    
    // Draw line with optional glow effect
    if (format.glowColor && format.glowBlur) {
      this.ctx.shadowColor = format.glowColor
      this.ctx.shadowBlur = format.glowBlur
      this.ctx.shadowOffsetX = 0
      this.ctx.shadowOffsetY = 0
    }
    
    this.ctx.strokeStyle = format.lineColor
    this.ctx.lineWidth = format.lineWidth
    this.ctx.lineCap = 'round'
    this.ctx.beginPath()
    this.ctx.moveTo(timelinePosition, startY)
    this.ctx.lineTo(timelinePosition, endY)
    this.ctx.stroke()
    
    this.ctx.restore()
    
    // Draw label if provided
    if (label) {
      this.ctx.save()
      
      // Draw background rectangle for label
      this.ctx.fillStyle = format.labelBackgroundColor!
      this.ctx.strokeStyle = format.labelBorderColor!
      this.ctx.lineWidth = 2
      
      const labelWidth = this.ctx.measureText(label).width + 20 // Add padding
      const labelHeight = 30
      const labelX = timelinePosition - labelWidth / 2
      const labelY = centerY + format.labelStringOffset
      
      this.ctx.fillRect(labelX, labelY, labelWidth, labelHeight)
      this.ctx.strokeRect(labelX, labelY, labelWidth, labelHeight)
      
      // Draw label text
      this.ctx.fillStyle = format.labelTextColor!
      this.ctx.font = format.labelFont!
      this.ctx.textAlign = 'center'
      this.ctx.textBaseline = 'middle'
      this.ctx.fillText(label, timelinePosition, labelY + labelHeight / 2)
      
      this.ctx.restore()
    }
    
    // Draw the time string (intrinsic part of an instant)
    this.ctx.save()
    
    // Format the time string
    const timeString = this.formatTimeString12h(timestamp)
    
    // Draw background rectangle for time string - always white for consistency
    this.ctx.fillStyle = 'rgba(0, 0, 0, 0.8)'
    this.ctx.strokeStyle = '#ffffff'
    this.ctx.lineWidth = 2
    
    const timeBoxWidth = this.ctx.measureText(timeString).width + 80 // Lots of padding needed for some reason
    const timeBoxHeight = 40
    const timeX = timelinePosition - timeBoxWidth / 2
    const timeY = centerY + format.timeStringOffset
    
    this.ctx.fillRect(timeX, timeY, timeBoxWidth, timeBoxHeight)
    this.ctx.strokeRect(timeX, timeY, timeBoxWidth, timeBoxHeight)
    
    // Draw time string text - always white for better readability
    this.ctx.fillStyle = '#ffffff'
    this.ctx.font = format.timeStringFont!
    this.ctx.textAlign = 'center'
    this.ctx.textBaseline = 'middle'
    this.ctx.fillText(timeString, timelinePosition, timeY + timeBoxHeight / 2)
    
    this.ctx.restore()
  }

  public setZoom(zoom: number) {
    this.zoomLevel = Math.max(0.1, Math.min(10, zoom))
    // TODO: Implement zoom logic that affects timeWidth
  }

  public setPan(offset: number) {
    this.panOffset = offset
    // TODO: Implement pan logic that affects timeCenter
  }

  public setTimeWidth(widthMs: number) {
    this.timeWidth = Math.max(1000, widthMs) // Minimum 1 second
  }

  public setTimeCenter(centerMs: number) {
    this.timeCenter = centerMs
  }



  public destroy() {
    if (this.animationId) {
      cancelAnimationFrame(this.animationId)
    }
  }
}
