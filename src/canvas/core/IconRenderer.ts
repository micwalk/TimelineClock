// Reusable icon drawing utilities for the timeline canvas
// Centralizes all icon rendering to eliminate duplication

export class IconRenderer {
  private ctx: CanvasRenderingContext2D
  
  constructor(ctx: CanvasRenderingContext2D) {
    this.ctx = ctx
  }

  // Draw a trash can icon (reusable for both span and instant deletion)
  drawTrashcan(x: number, y: number, w: number, h: number, options?: {
    fillColor?: string
    strokeColor?: string
    lineColor?: string
    lineWidth?: number
  }): void {
    const opts = {
      fillColor: 'rgba(0,0,0,0.8)',
      strokeColor: '#ef4444',
      lineColor: '#ffffff',
      lineWidth: 2,
      ...options
    }

    this.ctx.save()
    this.ctx.fillStyle = opts.fillColor
    this.ctx.strokeStyle = opts.strokeColor
    this.ctx.lineWidth = opts.lineWidth
    this.ctx.fillRect(x, y, w, h)
    this.ctx.strokeRect(x, y, w, h)
    
    // Draw simple trash lines (like the prettier instant version)
    this.ctx.strokeStyle = opts.lineColor
    this.ctx.beginPath()
    
    const centerX = x + w / 2
    const topY = y + h * 0.35
    const bottomY = y + h * 0.85
    
    // Top horizontal line
    this.ctx.moveTo(centerX - w * 0.25, topY)
    this.ctx.lineTo(centerX + w * 0.25, topY)
    
    // Three vertical lines
    this.ctx.moveTo(centerX - w * 0.15, topY)
    this.ctx.lineTo(centerX - w * 0.12, bottomY)
    
    this.ctx.moveTo(centerX, topY)
    this.ctx.lineTo(centerX, bottomY)
    
    this.ctx.moveTo(centerX + w * 0.15, topY)
    this.ctx.lineTo(centerX + w * 0.12, bottomY)
    
    this.ctx.stroke()
    this.ctx.restore()
  }

  // Draw a star icon (for favorites)
  drawStar(cx: number, cy: number, radius: number, filled: boolean, options?: {
    fillColor?: string
    strokeColor?: string
    lineWidth?: number
  }): void {
    const opts = {
      fillColor: '#fbbf24',
      strokeColor: '#ffffff',
      lineWidth: 2,
      ...options
    }

    this.ctx.save()
    this.ctx.strokeStyle = opts.strokeColor
    this.ctx.lineWidth = opts.lineWidth
    
    if (filled) {
      this.ctx.fillStyle = opts.fillColor
    }

    // Generate star path
    this.ctx.beginPath()
    const spikes = 5
    const outerRadius = radius
    const innerRadius = radius * 0.4
    
    for (let i = 0; i < spikes * 2; i++) {
      const angle = (i * Math.PI) / spikes
      const r = i % 2 === 0 ? outerRadius : innerRadius
      const x = cx + Math.cos(angle - Math.PI / 2) * r
      const y = cy + Math.sin(angle - Math.PI / 2) * r
      
      if (i === 0) {
        this.ctx.moveTo(x, y)
      } else {
        this.ctx.lineTo(x, y)
      }
    }
    
    this.ctx.closePath()
    
    if (filled) {
      this.ctx.fill()
    }
    this.ctx.stroke()
    this.ctx.restore()
  }

  // Draw an eye icon (for visibility toggle)
  drawEye(x: number, y: number, w: number, h: number, options?: {
    fillColor?: string
    strokeColor?: string
    lineWidth?: number
    crossed?: boolean
  }): void {
    const opts = {
      fillColor: 'rgba(0,0,0,0.8)',
      strokeColor: '#ffffff',
      lineWidth: 2,
      crossed: false,
      ...options
    }

    this.ctx.save()
    this.ctx.fillStyle = opts.fillColor
    this.ctx.strokeStyle = opts.strokeColor
    this.ctx.lineWidth = opts.lineWidth
    this.ctx.fillRect(x, y, w, h)
    this.ctx.strokeRect(x, y, w, h)
    
    // Draw eye shape
    this.ctx.beginPath()
    const centerX = x + w / 2
    const centerY = y + h / 2
    
    // Eye outline (almond shape)
    this.ctx.moveTo(x + 4, centerY)
    this.ctx.quadraticCurveTo(centerX, y + 4, x + w - 4, centerY)
    this.ctx.quadraticCurveTo(centerX, y + h - 4, x + 4, centerY)
    this.ctx.stroke()
    
    // Pupil
    this.ctx.beginPath()
    this.ctx.arc(centerX, centerY, 3, 0, Math.PI * 2)
    this.ctx.stroke()
    
    // Red X overlay if crossed out
    if (opts.crossed) {
      this.ctx.strokeStyle = '#ef4444'
      this.ctx.beginPath()
      this.ctx.moveTo(x + 3, y + 3)
      this.ctx.lineTo(x + w - 3, y + h - 3)
      this.ctx.moveTo(x + w - 3, y + 3)
      this.ctx.lineTo(x + 3, y + h - 3)
      this.ctx.stroke()
    }
    
    this.ctx.restore()
  }

  // Draw an arrow icon (for navigation/focus)
  drawArrow(x: number, y: number, w: number, h: number, direction: 'left' | 'right' | 'up' | 'down', options?: {
    fillColor?: string
    strokeColor?: string
    lineWidth?: number
  }): void {
    const opts = {
      fillColor: 'rgba(0,0,0,0.8)',
      strokeColor: '#ffffff',
      lineWidth: 2,
      ...options
    }

    this.ctx.save()
    this.ctx.fillStyle = opts.fillColor
    this.ctx.strokeStyle = opts.strokeColor
    this.ctx.lineWidth = opts.lineWidth
    this.ctx.fillRect(x, y, w, h)
    this.ctx.strokeRect(x, y, w, h)
    
    // Draw arrow glyph
    this.ctx.beginPath()
    const centerX = x + w / 2
    const centerY = y + h / 2
    const arrowSize = Math.min(w, h) * 0.3
    
    let tipX = centerX, tipY = centerY
    let baseX1 = centerX, baseY1 = centerY
    let baseX2 = centerX, baseY2 = centerY
    
    switch (direction) {
      case 'left':
        tipX = centerX - arrowSize
        baseX1 = baseX2 = centerX + arrowSize
        baseY1 = centerY - arrowSize
        baseY2 = centerY + arrowSize
        break
      case 'right':
        tipX = centerX + arrowSize
        baseX1 = baseX2 = centerX - arrowSize
        baseY1 = centerY - arrowSize
        baseY2 = centerY + arrowSize
        break
      case 'up':
        tipY = centerY - arrowSize
        baseY1 = baseY2 = centerY + arrowSize
        baseX1 = centerX - arrowSize
        baseX2 = centerX + arrowSize
        break
      case 'down':
        tipY = centerY + arrowSize
        baseY1 = baseY2 = centerY - arrowSize
        baseX1 = centerX - arrowSize
        baseX2 = centerX + arrowSize
        break
    }
    
    this.ctx.moveTo(baseX1, baseY1)
    this.ctx.lineTo(tipX, tipY)
    this.ctx.lineTo(baseX2, baseY2)
    this.ctx.stroke()
    this.ctx.restore()
  }

  // Draw a pin icon (for saving spans)
  drawPin(x: number, y: number, w: number, h: number, options?: {
    fillColor?: string
    strokeColor?: string
    lineColor?: string
    lineWidth?: number
  }): void {
    const opts = {
      fillColor: 'rgba(0,0,0,0.8)',
      strokeColor: '#22c55e',
      lineColor: '#ffffff',
      lineWidth: 2,
      ...options
    }

    this.ctx.save()
    this.ctx.fillStyle = opts.fillColor
    this.ctx.strokeStyle = opts.strokeColor
    this.ctx.lineWidth = opts.lineWidth
    this.ctx.fillRect(x, y, w, h)
    this.ctx.strokeRect(x, y, w, h)
    
    // Draw simple pin icon
    this.ctx.strokeStyle = opts.lineColor
    this.ctx.beginPath()
    
    const centerX = x + w / 2
    const topY = y + h * 0.2
    const bottomY = y + h * 0.8
    const midY = y + h * 0.6
    
    // Vertical line (pin shaft)
    this.ctx.moveTo(centerX, topY)
    this.ctx.lineTo(centerX, bottomY)
    
    // Simple arrow point at bottom
    this.ctx.moveTo(centerX - w * 0.15, midY)
    this.ctx.lineTo(centerX, bottomY)
    this.ctx.lineTo(centerX + w * 0.15, midY)
    
    this.ctx.stroke()
    this.ctx.restore()
  }
}
