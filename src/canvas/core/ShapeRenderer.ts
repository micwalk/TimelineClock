// Reusable shape drawing utilities for the timeline canvas
// Centralizes common shape patterns to eliminate duplication

export interface BoxStyle {
  fillColor?: string
  strokeColor?: string
  lineWidth?: number
  cornerRadius?: number
}

export interface TextStyle {
  font?: string
  color?: string
  align?: CanvasTextAlign
  baseline?: CanvasTextBaseline
}

export class ShapeRenderer {
  private ctx: CanvasRenderingContext2D
  
  constructor(ctx: CanvasRenderingContext2D) {
    this.ctx = ctx
  }

  // Draw a rectangle with configurable fill and stroke
  drawBox(x: number, y: number, w: number, h: number, style?: BoxStyle): void {
    const opts = {
      fillColor: 'rgba(0,0,0,0.8)',
      strokeColor: '#ffffff',
      lineWidth: 2,
      cornerRadius: 0,
      ...style
    }

    this.ctx.save()
    this.ctx.fillStyle = opts.fillColor
    this.ctx.strokeStyle = opts.strokeColor
    this.ctx.lineWidth = opts.lineWidth

    if (opts.cornerRadius > 0) {
      this.drawRoundedRect(x, y, w, h, opts.cornerRadius)
    } else {
      this.ctx.fillRect(x, y, w, h)
      this.ctx.strokeRect(x, y, w, h)
    }

    this.ctx.restore()
  }

  // Draw a rounded rectangle
  private drawRoundedRect(x: number, y: number, w: number, h: number, radius: number): void {
    this.ctx.beginPath()
    this.ctx.moveTo(x + radius, y)
    this.ctx.lineTo(x + w - radius, y)
    this.ctx.quadraticCurveTo(x + w, y, x + w, y + radius)
    this.ctx.lineTo(x + w, y + h - radius)
    this.ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h)
    this.ctx.lineTo(x + radius, y + h)
    this.ctx.quadraticCurveTo(x, y + h, x, y + h - radius)
    this.ctx.lineTo(x, y + radius)
    this.ctx.quadraticCurveTo(x, y, x + radius, y)
    this.ctx.closePath()
    this.ctx.fill()
    this.ctx.stroke()
  }

  // Draw text with background box (common pattern in timeline)
  drawTextBox(
    text: string,
    x: number,
    y: number,
    options?: {
      padding?: number
      boxStyle?: BoxStyle
      textStyle?: TextStyle
      centerX?: boolean
      centerY?: boolean
      fixedWidth?: number
      fixedHeight?: number
    }
  ): { width: number; height: number } {
    const opts = {
      padding: 10,
      boxStyle: {
        fillColor: 'rgba(0, 0, 0, 0.8)',
        strokeColor: '#ffffff',
        lineWidth: 2
      },
      textStyle: {
        font: 'bold 16px Arial',
        color: '#ffffff',
        align: 'center' as CanvasTextAlign,
        baseline: 'middle' as CanvasTextBaseline
      },
      centerX: false,
      centerY: false,
      fixedWidth: undefined,
      fixedHeight: undefined,
      ...options
    }

    this.ctx.save()
    this.ctx.font = opts.textStyle.font!
    
    // Measure text
    const metrics = this.ctx.measureText(text)
    const textWidth = metrics.width
    const textHeight = 20 // Approximate height for common fonts
    
    // Calculate box dimensions
    const boxWidth = opts.fixedWidth ?? (textWidth + opts.padding)
    const boxHeight = opts.fixedHeight ?? (textHeight + opts.padding)
    
    // Calculate positions
    const boxX = opts.centerX ? x - boxWidth / 2 : x
    const boxY = opts.centerY ? y - boxHeight / 2 : y
    const textX = boxX + boxWidth / 2
    const textY = boxY + boxHeight / 2

    // Draw background box
    this.drawBox(boxX, boxY, boxWidth, boxHeight, opts.boxStyle)

    // Draw text
    this.ctx.fillStyle = opts.textStyle.color!
    this.ctx.font = opts.textStyle.font!
    this.ctx.textAlign = opts.textStyle.align!
    this.ctx.textBaseline = opts.textStyle.baseline!
    this.ctx.fillText(text, textX, textY)

    this.ctx.restore()

    return { width: boxWidth, height: boxHeight }
  }

  // Draw a timeline line (vertical line with optional glow)
  drawTimelineLine(
    x: number,
    startY: number,
    endY: number,
    options?: {
      color?: string
      lineWidth?: number
      glowColor?: string
      glowBlur?: number
      lineCap?: CanvasLineCap
    }
  ): void {
    const opts = {
      color: '#ffffff',
      lineWidth: 2,
      glowColor: undefined,
      glowBlur: 0,
      lineCap: 'round' as CanvasLineCap,
      ...options
    }

    this.ctx.save()

    // Draw glow effect if specified
    if (opts.glowColor && opts.glowBlur) {
      this.ctx.shadowColor = opts.glowColor
      this.ctx.shadowBlur = opts.glowBlur
      this.ctx.shadowOffsetX = 0
      this.ctx.shadowOffsetY = 0
    }

    this.ctx.strokeStyle = opts.color
    this.ctx.lineWidth = opts.lineWidth
    this.ctx.lineCap = opts.lineCap
    this.ctx.beginPath()
    this.ctx.moveTo(x, startY)
    this.ctx.lineTo(x, endY)
    this.ctx.stroke()

    this.ctx.restore()
  }

  // Draw a horizontal span line with optional glow
  drawSpanLine(
    startX: number,
    endX: number,
    y: number,
    options?: {
      color?: string
      lineWidth?: number
      glowColor?: string
      glowBlur?: number
      lineCap?: CanvasLineCap
    }
  ): void {
    const opts = {
      color: '#ffffff',
      lineWidth: 3,
      glowColor: undefined,
      glowBlur: 0,
      lineCap: 'round' as CanvasLineCap,
      ...options
    }

    this.ctx.save()

    // Draw glow effect if specified
    if (opts.glowColor && opts.glowBlur) {
      this.ctx.shadowColor = opts.glowColor
      this.ctx.shadowBlur = opts.glowBlur
      this.ctx.shadowOffsetX = 0
      this.ctx.shadowOffsetY = 0
    }

    this.ctx.strokeStyle = opts.color
    this.ctx.lineWidth = opts.lineWidth
    this.ctx.lineCap = opts.lineCap
    this.ctx.beginPath()
    this.ctx.moveTo(startX, y)
    this.ctx.lineTo(endX, y)
    this.ctx.stroke()

    this.ctx.restore()
  }

  // Measure text width (helper for layout calculations)
  measureText(text: string, font: string): { width: number; height: number } {
    this.ctx.save()
    this.ctx.font = font
    const metrics = this.ctx.measureText(text)
    this.ctx.restore()
    
    return {
      width: metrics.width,
      height: 20 // Approximate height for most fonts
    }
  }
}
