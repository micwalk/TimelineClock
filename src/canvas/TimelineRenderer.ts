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
    this.drawNowLabel()
    this.drawCurrentTime()
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

    // Draw bright red NOW line at center
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
    
    // Show NOW ±3 hours (6 hour range total)
    const now = new Date()
    const currentHour = now.getHours()
    
    // Calculate start and end hours for the 6-hour window
    const startHour = currentHour - 3
    const endHour = currentHour + 3
    
    // Draw time ticks
    this.ctx.save()
    this.ctx.strokeStyle = '#ffffff'
    this.ctx.lineWidth = 1
    
    // Draw ticks for each hour in the 6-hour window
    for (let hour = startHour; hour <= endHour; hour++) {
      // Normalize hour to 0-23 range
      const normalizedHour = ((hour % 24) + 24) % 24
      
      // Calculate position (0 = startHour, 1 = endHour)
      const progress = (hour - startHour) / (endHour - startHour)
      const x = progress * timelineWidth
      const tickHeight = hour === currentHour ? 20 : 10
      
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
        const minuteProgress = minute / 60
        const minorX = x + (minuteProgress * (timelineWidth / (endHour - startHour)))
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
    const centerY = this.canvas.height / 2
    const timelineWidth = this.canvas.width
    
    // Get current time to position NOW label correctly
    const now = new Date()
    const currentHour = now.getHours()
    const currentMinute = now.getMinutes()
    
    // Calculate position based on current time (24-hour format)
    const minutesSinceMidnight = currentHour * 60 + currentMinute
    const timelinePosition = (minutesSinceMidnight / (24 * 60)) * timelineWidth
    
    this.ctx.save()
    
    // Draw background rectangle for NOW label
    this.ctx.fillStyle = 'rgba(0, 0, 0, 0.8)'
    this.ctx.strokeStyle = '#ef4444'
    this.ctx.lineWidth = 2
    
    const labelWidth = 60
    const labelHeight = 30
    const labelX = timelinePosition - labelWidth / 2
    const labelY = centerY + 20
    
    this.ctx.fillRect(labelX, labelY, labelWidth, labelHeight)
    this.ctx.strokeRect(labelX, labelY, labelWidth, labelHeight)
    
    // Draw NOW text
    this.ctx.fillStyle = '#ef4444'
    this.ctx.font = 'bold 16px Arial'
    this.ctx.textAlign = 'center'
    this.ctx.textBaseline = 'middle'
    this.ctx.fillText('NOW', timelinePosition, labelY + labelHeight / 2)
    
    this.ctx.restore()
  }

  private drawCurrentTime() {
    const centerY = this.canvas.height / 2
    const timelineWidth = this.canvas.width
    
    // Get current time
    const now = new Date()
    const currentHour = now.getHours()
    const currentMinute = now.getMinutes()
    const currentSecond = now.getSeconds()
    
    // Calculate position based on current time (24-hour format)
    const minutesSinceMidnight = currentHour * 60 + currentMinute
    const timelinePosition = (minutesSinceMidnight / (24 * 60)) * timelineWidth
    
    // Format time in 12-hour format
    const displayHour = currentHour === 0 ? 12 : currentHour > 12 ? currentHour - 12 : currentHour
    const ampm = currentHour >= 12 ? 'PM' : 'AM'
    const timeString = `${displayHour.toString().padStart(2, '0')}:${currentMinute.toString().padStart(2, '0')}:${currentSecond.toString().padStart(2, '0')} ${ampm}`
    
    this.ctx.save()
    
    // Draw background rectangle for time
    this.ctx.fillStyle = 'rgba(0, 0, 0, 0.8)'
    this.ctx.strokeStyle = '#ffffff'
    this.ctx.lineWidth = 2
    
    const timeWidth = 140
    const timeHeight = 40
    const timeX = timelinePosition - timeWidth / 2
    const timeY = centerY + 60
    
    this.ctx.fillRect(timeX, timeY, timeWidth, timeHeight)
    this.ctx.strokeRect(timeX, timeY, timeWidth, timeHeight)
    
    // Draw time text
    this.ctx.fillStyle = '#ffffff'
    this.ctx.font = 'bold 20px monospace'
    this.ctx.textAlign = 'center'
    this.ctx.textBaseline = 'middle'
    this.ctx.fillText(timeString, timelinePosition, timeY + timeHeight / 2)
    
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
