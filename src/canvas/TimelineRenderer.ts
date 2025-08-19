export class TimelineRenderer {
  private canvas: HTMLCanvasElement
  private ctx: CanvasRenderingContext2D
  private animationId: number | null = null
  private zoomLevel: number = 1
  private panOffset: number = 0

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas
    const context = canvas.getContext('2d')
    if (!context) {
      throw new Error('Could not get 2D context from canvas')
    }
    this.ctx = context
    this.setupCanvas()
  }

  private setupCanvas() {
    // Enable high DPI support
    const dpr = window.devicePixelRatio || 1
    this.ctx.scale(dpr, dpr)
    
    // Set rendering quality
    this.ctx.imageSmoothingEnabled = true
    this.ctx.imageSmoothingQuality = 'high'
  }

  public render() {
    this.clear()
    this.drawTimeline()
    this.drawNowLine()
    this.drawTimeTicks()
  }

  private clear() {
    // Clear with transparent background - let the page gradient show through
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height)
  }

  private drawTimeline() {
    const centerY = this.canvas.height / 2
    const timelineWidth = this.canvas.width // Full width
    const startX = 0
    const endX = timelineWidth

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

  private drawNowLine() {
    const centerY = this.canvas.height / 2
    const timelineWidth = this.canvas.width
    const lineHeight = this.canvas.height * 0.6
    
    // Get current time to position NOW line correctly
    const now = new Date()
    const currentHour = now.getHours()
    const currentMinute = now.getMinutes()
    
    // Calculate position based on current time (24-hour format)
    const minutesSinceMidnight = currentHour * 60 + currentMinute
    const timelinePosition = (minutesSinceMidnight / (24 * 60)) * timelineWidth
    
    const startY = centerY - lineHeight / 2
    const endY = centerY + lineHeight / 2

    // Draw bright red NOW line at actual current time position
    this.ctx.save()
    
    // Create glow effect for NOW line
    this.ctx.shadowColor = '#ef4444'
    this.ctx.shadowBlur = 10
    this.ctx.shadowOffsetX = 0
    this.ctx.shadowOffsetY = 0
    
    this.ctx.strokeStyle = '#ef4444'
    this.ctx.lineWidth = 4
    this.ctx.lineCap = 'round'
    this.ctx.beginPath()
    this.ctx.moveTo(timelinePosition, startY)
    this.ctx.lineTo(timelinePosition, endY)
    this.ctx.stroke()
    
    this.ctx.restore()
  }

  private drawTimeTicks() {
    const centerY = this.canvas.height / 2
    const timelineWidth = this.canvas.width
    
    // Draw time ticks
    this.ctx.save()
    this.ctx.strokeStyle = '#ffffff'
    this.ctx.lineWidth = 1
    
    // Draw ticks for each hour (24-hour format for positioning)
    for (let i = 0; i <= 24; i++) {
      const x = (timelineWidth / 24) * i
      const tickHeight = i % 6 === 0 ? 20 : 10
      
      this.ctx.beginPath()
      this.ctx.moveTo(x, centerY - tickHeight)
      this.ctx.lineTo(x, centerY + tickHeight)
      this.ctx.stroke()
      
      // Draw hour labels for major ticks (12-hour format with AM/PM)
      if (i % 6 === 0) {
        this.ctx.fillStyle = '#ffffff'
        this.ctx.font = '12px monospace'
        this.ctx.textAlign = 'center'
        
        // Convert to 12-hour format
        let displayHour = i
        let ampm = 'AM'
        if (i === 0) {
          displayHour = 12
          ampm = 'AM'
        } else if (i === 12) {
          displayHour = 12
          ampm = 'PM'
        } else if (i > 12) {
          displayHour = i - 12
          ampm = 'PM'
        }
        
        this.ctx.fillText(`${displayHour}:00 ${ampm}`, x, centerY + tickHeight + 20)
      }
    }
    
    this.ctx.restore()
  }

  public setZoom(zoom: number) {
    this.zoomLevel = Math.max(0.1, Math.min(10, zoom))
  }

  public setPan(offset: number) {
    this.panOffset = offset
  }

  public destroy() {
    if (this.animationId) {
      cancelAnimationFrame(this.animationId)
    }
  }
}
