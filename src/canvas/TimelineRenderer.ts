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
    
    // Calculate hour boundaries for the visible time range
    const startDate = new Date(this.timeStart)
    const endDate = new Date(this.timeEnd)
    
    // Round to nearest hour for cleaner display
    const startHour = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate(), startDate.getHours(), 0, 0, 0)
    const endHour = new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate(), endDate.getHours() + 1, 0, 0, 0)
    
    // Draw time ticks
    this.ctx.save()
    this.ctx.strokeStyle = '#ffffff'
    this.ctx.lineWidth = 1
    
    const now = Date.now()
    const nowDate = new Date(now)
    const currentHour = new Date(nowDate.getFullYear(), nowDate.getMonth(), nowDate.getDate(), nowDate.getHours(), 0, 0, 0)
    
    // Draw ticks for each hour in the visible range
    for (let hourTime = startHour.getTime(); hourTime <= endHour.getTime(); hourTime += 60 * 60 * 1000) {
      const hourDate = new Date(hourTime)
      const normalizedHour = hourDate.getHours()
      
      // Calculate position using helper function
      const x = this.timeToPosition(hourTime)
      const tickHeight = hourTime === currentHour.getTime() ? 20 : 10
      
      this.ctx.beginPath()
      this.ctx.moveTo(x, centerY - tickHeight)
      this.ctx.lineTo(x, centerY + tickHeight)
      this.ctx.stroke()
      
      // Draw hour labels for all ticks (12-hour format with AM/PM)
      this.ctx.fillStyle = '#ffffff'
      this.ctx.font = '12px monospace'
      this.ctx.textAlign = 'center'
      
      // Convert to 12-hour format
      let displayHour = normalizedHour
      let ampm = 'AM'
      if (normalizedHour === 0) {
        displayHour = 12
        ampm = 'AM'
      } else if (normalizedHour === 12) {
        displayHour = 12
        ampm = 'PM'
      } else if (normalizedHour > 12) {
        displayHour = normalizedHour - 12
        ampm = 'PM'
      }
      
      this.ctx.fillText(`${displayHour}${ampm}`, x, centerY + tickHeight + 20)
      
      // Draw 15-minute minor ticks for this hour
      for (let minute = 15; minute < 60; minute += 15) {
        const minuteTime = hourTime + (minute * 60 * 1000)
        const minorX = this.timeToPosition(minuteTime)
        const minorTickHeight = 5
        
        this.ctx.beginPath()
        this.ctx.moveTo(minorX, centerY - minorTickHeight)
        this.ctx.lineTo(minorX, centerY + minorTickHeight)
        this.ctx.stroke()
      }
    }
    
    this.ctx.restore()
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
