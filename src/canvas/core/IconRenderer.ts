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

  // Draw a bell icon (for alarms)
  drawBell(cx: number, cy: number, radius: number, filled: boolean, options?: {
    fillColor?: string
    strokeColor?: string
    lineWidth?: number
  }): void {
    const opts = {
      fillColor: '#f59e0b', // Amber color for alarm bells
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

    // Draw bell shape
    this.ctx.beginPath()
    
    // Bell body (curved bottom)
    const bellWidth = radius * 1.2
    const bellHeight = radius * 1.4
    const bellTop = cy - bellHeight / 2
    const bellBottom = cy + bellHeight / 2
    
    // Top of bell (flat)
    this.ctx.moveTo(cx - bellWidth / 2, bellTop)
    this.ctx.lineTo(cx + bellWidth / 2, bellTop)
    
    // Right side (curved)
    this.ctx.quadraticCurveTo(
      cx + bellWidth / 2 + radius * 0.1, 
      cy, 
      cx + bellWidth / 2, 
      bellBottom
    )
    
    // Bottom curve
    this.ctx.quadraticCurveTo(
      cx, 
      bellBottom + radius * 0.2, 
      cx - bellWidth / 2, 
      bellBottom
    )
    
    // Left side (curved)
    this.ctx.quadraticCurveTo(
      cx - bellWidth / 2 - radius * 0.1, 
      cy, 
      cx - bellWidth / 2, 
      bellTop
    )
    
    this.ctx.closePath()
    
    if (filled) {
      this.ctx.fill()
    }
    this.ctx.stroke()
    
    // Draw bell clapper (small circle at bottom)
    this.ctx.beginPath()
    this.ctx.arc(cx, bellBottom - radius * 0.2, radius * 0.15, 0, Math.PI * 2)
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

  // Draw a pencil icon (for rename)
  drawPencil(x: number, y: number, w: number, h: number, options?: {
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

    // Pencil glyph at 45° with double-line body, V tip, and square cap
    const pad = Math.min(w, h) * 0.2
    const x1 = x + pad
    const y1 = y + h - pad
    const x2 = x + w - pad
    const y2 = y + pad

    const dx = x2 - x1
    const dy = y2 - y1
    const len = Math.hypot(dx, dy) || 1
    const ux = dx / len
    const uy = dy / len
    const nx = -uy
    const ny = ux
    const halfWidth = Math.min(w, h) * 0.08
    const tipLen = Math.min(w, h) * .2
    const capSize = Math.min(w, h) * 0.2

    // Adjust body endpoints to reserve space for tip and cap
    const bodyStartX = x1 + ux * tipLen
    const bodyStartY = y1 + uy * tipLen
    const bodyEndX = x2 - ux * capSize * 0.5
    const bodyEndY = y2 - uy * capSize * 0.5

    // Two parallel body lines
    this.ctx.beginPath()
    this.ctx.moveTo(bodyStartX + nx * halfWidth, bodyStartY + ny * halfWidth)
    this.ctx.lineTo(bodyEndX + nx * halfWidth, bodyEndY + ny * halfWidth)
    this.ctx.moveTo(bodyStartX - nx * halfWidth, bodyStartY - ny * halfWidth)
    this.ctx.lineTo(bodyEndX - nx * halfWidth, bodyEndY - ny * halfWidth)
    this.ctx.stroke()

    // V-shaped tip at bottom-left
    this.ctx.beginPath()
    this.ctx.moveTo(x1, y1)
    this.ctx.lineTo(bodyStartX + nx * halfWidth * 1.2, bodyStartY + ny * halfWidth * 1.2)
    this.ctx.moveTo(x1, y1)
    this.ctx.lineTo(bodyStartX - nx * halfWidth * 1.2, bodyStartY - ny * halfWidth * 1.2)
    this.ctx.stroke()

    // Square cap at top-right aligned to the shaft
    const capCenterOffset = capSize * 0.25
    const cx0 = x2 - ux * capCenterOffset
    const cy0 = y2 - uy * capCenterOffset
    const hx = (ux * capSize) / 2
    const hy = (uy * capSize) / 2
    const px = (nx * capSize) / 2
    const py = (ny * capSize) / 2

    this.ctx.beginPath()
    this.ctx.moveTo(cx0 + hx + px, cy0 + hy + py)
    this.ctx.lineTo(cx0 - hx + px, cy0 - hy + py)
    this.ctx.lineTo(cx0 - hx - px, cy0 - hy - py)
    this.ctx.lineTo(cx0 + hx - px, cy0 + hy - py)
    this.ctx.closePath()
    this.ctx.stroke()

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

  // Draw a lock icon (closed or open)
  drawLock(x: number, y: number, w: number, h: number, options?: {
    locked?: boolean
    fillColor?: string
    strokeColor?: string
    lineColor?: string
    lineWidth?: number
  }): void {
    const opts = {
      locked: true,
      fillColor: 'rgba(0,0,0,0.8)',
      strokeColor: '#ffffff',
      lineColor: '#ffffff',
      lineWidth: 2,
      ...options
    }

    this.ctx.save()
    // Outer box
    this.ctx.fillStyle = opts.fillColor
    this.ctx.strokeStyle = opts.strokeColor
    this.ctx.lineWidth = opts.lineWidth
    this.ctx.fillRect(x, y, w, h)
    this.ctx.strokeRect(x, y, w, h)

    // Draw lock body and shackle
    this.ctx.strokeStyle = opts.lineColor
    this.ctx.lineWidth = opts.lineWidth

    const paddingX = w * 0.22
    const bodyTop = y + h * 0.45
    const bodyLeft = x + paddingX
    const bodyRight = x + w - paddingX
    const bodyBottom = y + h - h * 0.18

    // Body rectangle
    this.ctx.strokeRect(bodyLeft, bodyTop, bodyRight - bodyLeft, bodyBottom - bodyTop)

    // Shackle
    const cx = x + w / 2
    const shackleRadius = Math.min(w, h) * 0.22
    const shackleTop = y + h * 0.3

    this.ctx.beginPath()
    if (opts.locked) {
      // Closed shackle: semi-circle
      this.ctx.arc(cx, shackleTop + shackleRadius, shackleRadius, Math.PI, 0, false)
    } else {
      // Open shackle: draw a rotated, broken arc
      const openOffset = w * 0.12
      this.ctx.moveTo(cx - shackleRadius, shackleTop + shackleRadius)
      this.ctx.arc(cx, shackleTop + shackleRadius, shackleRadius, Math.PI, Math.PI * 0.2, false)
      // break
      this.ctx.moveTo(cx + shackleRadius * 0.9, shackleTop + shackleRadius * 0.5)
      this.ctx.lineTo(cx + shackleRadius * 0.9 + openOffset, shackleTop + shackleRadius * 0.2)
    }
    this.ctx.stroke()

    // Keyhole
    const keyholeY = (bodyTop + bodyBottom) / 2
    this.ctx.beginPath()
    this.ctx.arc(cx, keyholeY - h * 0.04, h * 0.03, 0, Math.PI * 2)
    this.ctx.moveTo(cx, keyholeY - h * 0.01)
    this.ctx.lineTo(cx, keyholeY + h * 0.08)
    this.ctx.stroke()

    this.ctx.restore()
  }

  // Draw a move icon (for entering move mode)
  drawMove(cx: number, cy: number, radius: number, options?: {
    fillColor?: string
    strokeColor?: string
    lineWidth?: number
  }): void {
    const opts = {
      fillColor: '#22d3ee',
      strokeColor: '#22d3ee',
      lineWidth: 2,
      ...options
    }

    this.ctx.save()
    this.ctx.strokeStyle = opts.strokeColor
    this.ctx.lineWidth = opts.lineWidth

    // Draw a simple move icon (four arrows pointing outward)
    this.ctx.beginPath()
    
    // Top arrow
    this.ctx.moveTo(cx, cy - radius * 0.3)
    this.ctx.lineTo(cx, cy - radius * 0.8)
    this.ctx.moveTo(cx - radius * 0.2, cy - radius * 0.6)
    this.ctx.lineTo(cx, cy - radius * 0.8)
    this.ctx.lineTo(cx + radius * 0.2, cy - radius * 0.6)
    
    // Bottom arrow
    this.ctx.moveTo(cx, cy + radius * 0.3)
    this.ctx.lineTo(cx, cy + radius * 0.8)
    this.ctx.moveTo(cx - radius * 0.2, cy + radius * 0.6)
    this.ctx.lineTo(cx, cy + radius * 0.8)
    this.ctx.lineTo(cx + radius * 0.2, cy + radius * 0.6)
    
    // Left arrow
    this.ctx.moveTo(cx - radius * 0.3, cy)
    this.ctx.lineTo(cx - radius * 0.8, cy)
    this.ctx.moveTo(cx - radius * 0.6, cy - radius * 0.2)
    this.ctx.lineTo(cx - radius * 0.8, cy)
    this.ctx.lineTo(cx - radius * 0.6, cy + radius * 0.2)
    
    // Right arrow
    this.ctx.moveTo(cx + radius * 0.3, cy)
    this.ctx.lineTo(cx + radius * 0.8, cy)
    this.ctx.moveTo(cx + radius * 0.6, cy - radius * 0.2)
    this.ctx.lineTo(cx + radius * 0.8, cy)
    this.ctx.lineTo(cx + radius * 0.6, cy + radius * 0.2)
    
    this.ctx.stroke()
    this.ctx.restore()
  }

  // Draw a check mark icon (for confirming move)
  drawCheck(cx: number, cy: number, radius: number, options?: {
    fillColor?: string
    strokeColor?: string
    lineWidth?: number
  }): void {
    const opts = {
      fillColor: '#10b981',
      strokeColor: '#10b981',
      lineWidth: 2,
      ...options
    }

    this.ctx.save()
    this.ctx.strokeStyle = opts.strokeColor
    this.ctx.lineWidth = opts.lineWidth

    // Draw a check mark
    this.ctx.beginPath()
    this.ctx.moveTo(cx - radius * 0.4, cy)
    this.ctx.lineTo(cx - radius * 0.1, cy + radius * 0.3)
    this.ctx.lineTo(cx + radius * 0.4, cy - radius * 0.3)
    
    this.ctx.stroke()
    this.ctx.restore()
  }

  // Draw an X icon (for canceling move)
  drawX(cx: number, cy: number, radius: number, options?: {
    fillColor?: string
    strokeColor?: string
    lineWidth?: number
  }): void {
    const opts = {
      fillColor: '#ef4444',
      strokeColor: '#ef4444',
      lineWidth: 2,
      ...options
    }

    this.ctx.save()
    this.ctx.strokeStyle = opts.strokeColor
    this.ctx.lineWidth = opts.lineWidth

    // Draw an X
    this.ctx.beginPath()
    this.ctx.moveTo(cx - radius * 0.3, cy - radius * 0.3)
    this.ctx.lineTo(cx + radius * 0.3, cy + radius * 0.3)
    this.ctx.moveTo(cx + radius * 0.3, cy - radius * 0.3)
    this.ctx.lineTo(cx - radius * 0.3, cy + radius * 0.3)
    
    this.ctx.stroke()
    this.ctx.restore()
  }
}
