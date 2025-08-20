// Format information for drawing instants
import { formatTimeString12h, formatDurationHuman } from '../utils/timeFormat.ts'
import type { SavedInstantCompat } from '../types/instants.ts'
import type { InstantView } from '../types/instants.ts'
import { SavedInstantsStore } from '../services/SavedInstantsStore.ts'
import { SavedSpansStore } from '../services/SavedSpansStore.ts'
import type { SpanView } from '../types/spans.ts'
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

  // Core timeline state variables
  private screenWidth: number = 0
  private timeWidth: number = 6 * 60 * 60 * 1000 // 6 hours in milliseconds
  private timeCenter: number = Date.now() // Center of timeline as instant
  private timeStart: number = 0 // Start of visible timeline
  private timeEnd: number = 0 // End of visible timeline

  // View behavior
  private viewFocusMode: 'now' | 'cursor' | 'instant' | 'span' = 'now'
  private focusedInstantId: string | null = null
  private focusedSpanId: string | null = null
  private currentSelectedInstantId: string | null = null
  private previousSelectedInstantId: string | null = null

  // Saved instants and hit targets for interactions
  private savedStore: SavedInstantsStore
  private spansStore: SavedSpansStore
  private hitTargets: { type: 'save-now' | 'save-cursor' | 'instant-label' | 'instant-trash' | 'instant-time' | 'span-pin' | 'span-label'; id?: string; rect: { x: number; y: number; w: number; h: number } }[] = []
  private overlayElements: { type: 'save-now' | 'save-cursor' | 'instant-label' | 'instant-trash' | 'span-label'; id?: string; rect: { x: number; y: number; w: number; h: number }; text?: string; focused?: boolean }[] = []
  private editingInstantId: string | null = null
  private editingSpanId: string | null = null
  private stateVersion: number = 0
  private lastImpliedSpan: { aTs: number; bTs: number; label: string } | null = null

  // Centralized vertical offsets for span rows
  private readonly spanRows = {
    cursorNow: 170,
    instantNow: 200,
    prevToSelected: 230,
    focusedSaved: 260,
  } as const

  // Zoom configuration
  private zoomPercent: number = 0.1 // 10% per step
  private readonly minTimeWidthMs: number = 1000 // 1s
  private readonly maxTimeWidthMs: number = 30 * 24 * 60 * 60 * 1000 // 30d

  constructor(canvas: HTMLCanvasElement, deps?: { saved?: SavedInstantsStore; spans?: SavedSpansStore }) {
    this.canvas = canvas
    const context = canvas.getContext('2d')
    if (!context) {
      throw new Error('Could not get 2D context from canvas')
    }
    this.ctx = context
    this.setupCanvas()
    this.savedStore = deps?.saved ?? new SavedInstantsStore()
    this.spansStore = deps?.spans ?? new SavedSpansStore()
    this.savedStore.subscribe(() => { this.stateVersion++ })
    this.spansStore.subscribe(() => { this.stateVersion++ })
    this.loadPersistedState()
    this.updateTimelineState()
  }

  private formatDurationHMS(ms: number): string {
    let remaining = Math.max(0, Math.floor(ms))
    const hours = Math.floor(remaining / (60 * 60 * 1000)); remaining -= hours * 60 * 60 * 1000
    const minutes = Math.floor(remaining / (60 * 1000)); remaining -= minutes * 60 * 1000
    const seconds = Math.floor(remaining / 1000); remaining -= seconds * 1000
    const millis = remaining
    if (hours > 0) {
      const hh = hours.toString().padStart(2, '0')
      const mm = minutes.toString().padStart(2, '0')
      const ss = seconds.toString().padStart(2, '0')
      return `${hh}:${mm}:${ss}`
    }
    if (minutes > 0) {
      const mm = minutes.toString().padStart(2, '0')
      const ss = seconds.toString().padStart(2, '0')
      return `${mm}:${ss}`
    }
    // minutes == 0 → include milliseconds
    const mm = '00'
    const ss = seconds.toString().padStart(2, '0')
    const mmm = millis.toString().padStart(3, '0')
    return `${mm}:${ss}.${mmm}`
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
    
    // Update time center depending on view mode
    if (this.viewFocusMode === 'now') {
      this.timeCenter = Date.now()
    } else if (this.viewFocusMode === 'span' && this.focusedSpanId) {
      const span = this.spansStore.getSnapshot().find(s => s.id === this.focusedSpanId)
      if (span) {
        const a = this.savedStore.getSnapshot().find(i => i.id === span.startInstantId)?.tsEpochMs
        const b = this.savedStore.getSnapshot().find(i => i.id === span.endInstantId)?.tsEpochMs
        if (typeof a === 'number' && typeof b === 'number') {
          this.timeCenter = (a + b) / 2
        }
      }
    }
    
    // Calculate time range based on timeWidth and center
    const halfTimeWidth = this.timeWidth / 2
    this.timeStart = this.timeCenter - halfTimeWidth
    this.timeEnd = this.timeCenter + halfTimeWidth
  }

  public render() {
    // Update timeline state
    this.updateTimelineState()
    
    this.clear()
    this.drawTimeline()
    this.drawTimeTicks()
    this.hitTargets = []
    this.overlayElements = []
    this.drawNowInstant() // This now draws the line, label, and time string
    // Draw saved instants
    this.drawSavedInstants()
    if (this.viewFocusMode === 'cursor') {
      this.drawCursorInstant()
      this.drawCursorNowSpan()
    }
    // Always draw instant→now span if we have a selected instant
    const selected = this.currentSelectedInstantId ? this.savedStore.getSnapshot().find(si => si.id === this.currentSelectedInstantId) : null
    if (selected) {
      // Row 1: implied selected → now
      this.drawInstantNowSpan(selected.tsEpochMs, this.TimelineCenterY() + this.spanRows.instantNow)
    }
    // Draw implied selected→previous span
    const prev = this.previousSelectedInstantId ? this.savedStore.getSnapshot().find(si => si.id === this.previousSelectedInstantId) : null
    if (selected && prev) {
      // Row 2: implied previous → selected; label: "END_NAME DURATION DIR START_NAME"
      const startName = prev.label && prev.label.length > 0 ? prev.label : 'previous'
      const endName = selected.label && selected.label.length > 0 ? selected.label : 'selected'
      this.drawSpanBetween(prev.tsEpochMs, selected.tsEpochMs, this.TimelineCenterY() + this.spanRows.prevToSelected, '#a78bfa', { showPin: true, startName, endName, saveLabel: 'selected to previous' })
    }
    // Draw focused saved span if any (and suppress implied spans)
    if (this.viewFocusMode === 'span' && this.focusedSpanId) {
      const sp = this.spansStore.getSnapshot().find(s => s.id === this.focusedSpanId)
      if (sp) {
        const a = this.savedStore.getSnapshot().find(i => i.id === sp.startInstantId)?.tsEpochMs
        const b = this.savedStore.getSnapshot().find(i => i.id === sp.endInstantId)?.tsEpochMs
        if (typeof a === 'number' && typeof b === 'number') {
          // Only draw the selected saved span
          const aRec = this.savedStore.getSnapshot().find(i => i.id === sp.startInstantId)
          const bRec = this.savedStore.getSnapshot().find(i => i.id === sp.endInstantId)
          const startName = aRec?.label || '(unnamed)'
          const endName = bRec?.label || '(unnamed)'
          const header = sp.label && sp.label.length > 0 ? sp.label : undefined
          this.drawSpanBetween(a, b, this.TimelineCenterY() + this.spanRows.focusedSaved, '#34d399', { showPin: false, spanId: sp.id, startName, endName, headerLabel: header })
          return
        }
      }
    }
  }

  private persistState() {
    try {
      const payload = {
        timeWidth: this.timeWidth,
        timeCenter: this.timeCenter,
        viewFocusMode: this.viewFocusMode,
        focusedInstantId: this.focusedInstantId,
        focusedSpanId: this.focusedSpanId,
        currentSelectedInstantId: this.currentSelectedInstantId,
        previousSelectedInstantId: this.previousSelectedInstantId,
      }
      localStorage.setItem('timeline.state', JSON.stringify(payload))
      this.stateVersion++
    } catch (err) { void err }
  }

  private loadPersistedState() {
    try {
      const raw = localStorage.getItem('timeline.state')
      if (!raw) return
      const data = JSON.parse(raw) as Partial<{ timeWidth: number; timeCenter: number; viewFocusMode: 'now'|'cursor'|'instant'|'span'; focusedInstantId: string|null; focusedSpanId: string|null; currentSelectedInstantId: string|null; previousSelectedInstantId: string|null }>
      if (typeof data.timeWidth === 'number') this.timeWidth = this.clampTimeWidth(data.timeWidth)
      if (typeof data.timeCenter === 'number') this.timeCenter = data.timeCenter
      if (data.viewFocusMode === 'now' || data.viewFocusMode === 'cursor' || data.viewFocusMode === 'instant' || data.viewFocusMode === 'span') this.viewFocusMode = data.viewFocusMode
      if (typeof data.focusedInstantId === 'string' || data.focusedInstantId === null) this.focusedInstantId = data.focusedInstantId ?? null
      if (typeof data.focusedSpanId === 'string' || data.focusedSpanId === null) this.focusedSpanId = data.focusedSpanId ?? null
      if (typeof data.currentSelectedInstantId === 'string' || data.currentSelectedInstantId === null) this.currentSelectedInstantId = data.currentSelectedInstantId ?? null
      if (typeof data.previousSelectedInstantId === 'string' || data.previousSelectedInstantId === null) this.previousSelectedInstantId = data.previousSelectedInstantId ?? null
    } catch (err) { void err }
  }

  private clear() {
    // Clear with transparent background - let the page gradient show through
    const dpr = window.devicePixelRatio || 1
    this.ctx.clearRect(0, 0, this.canvas.width / dpr, this.canvas.height / dpr)
  }

  private drawTimeline() {
    const centerY = this.TimelineCenterY()
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
    const centerY = this.TimelineCenterY()
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
            this.ctx.fillText(label, x, centerY - labelYOffset)
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
          this.ctx.fillText(label, x, centerY - labelYOffset)
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
          this.ctx.fillText(label, x, centerY - labelYOffset)
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

  private drawNowInstant() {
    // Draw the NOW label using the drawInstant helper
    this.drawInstant(Date.now(), 'Now', {
      lineColor: '#ef4444',
      lineWidth: 4,
      lineHeight: (this.canvas.height / (window.devicePixelRatio || 1)) * 0.6,
      glowColor: '#ef4444',
      glowBlur: 10,
      labelBackgroundColor: 'rgba(0, 0, 0, 0.8)',
      labelBorderColor: '#ef4444',
      labelTextColor: '#ef4444',
    })
    this.drawSaveIconAt(Date.now(), 'save-now')
    // Add double-click target on NOW time box to focus now
    const rect = this.computeTimeBoxRect(Date.now())
    this.hitTargets.push({ type: 'instant-time', rect })
  }

  // Render all saved instants with label editing and delete icon
  private drawSavedInstants() {
    const saved = this.savedStore.getSnapshot().map(rec => ({ id: rec.id, ts: rec.tsEpochMs, label: rec.label }))
    for (const s of saved) {
      const isFocused = this.viewFocusMode === 'instant' && this.focusedInstantId === s.id
      const label = s.label && s.label.length > 0 ? s.label : '(unnamed)'
      this.drawInstant(s.ts, label, {
        lineColor: isFocused ? '#22d3ee' : '#ffffff',
        glowColor: isFocused ? '#22d3ee' : undefined,
        glowBlur: isFocused ? 8 : 0,
        lineWidth: isFocused ? 3 : 2,
        labelBackgroundColor: 'rgba(0,0,0,0.8)',
        labelBorderColor: isFocused ? '#22d3ee' : '#ffffff',
        labelTextColor: '#ffffff',
      })
      this.drawTrashIconAt(s.ts, s.id)
      // Record label hit target roughly using current font and box metrics similar to drawInstant
      const centerY = this.TimelineCenterY()
      const x = this.timeToPosition(s.ts)
      const font = 'bold 16px Arial'
      const w = this.measureTextWidth(font, label) + 10
      const h = 30
      const rect = { x: x - w / 2, y: centerY + 50, w, h }
      this.hitTargets.push({ type: 'instant-label', id: s.id, rect })
      // Add a double-click target for the time box
      const timeRect = this.computeTimeBoxRect(s.ts)
      this.hitTargets.push({ type: 'instant-time', id: s.id, rect: timeRect })
      // Only include overlay input for the one being edited
      if (this.editingInstantId === s.id) {
        this.overlayElements.push({ type: 'instant-label', id: s.id, rect, text: s.label, focused: true })
      }
    }
  }
  
  private drawCursorInstant() {
    // Draw the CURSOR center line and label at the timeCenter
    this.drawInstant(this.timeCenter, 'Cursor', {
      lineColor: '#22d3ee',
      glowColor: '#22d3ee',
      glowBlur: 8,
      lineWidth: 3,
      labelBackgroundColor: 'rgba(0,0,0,0.8)',
      labelBorderColor: '#22d3ee',
      labelTextColor: '#22d3ee',
    })
    // Draw save icon box below
    this.drawSaveIconAt(this.timeCenter, 'save-cursor')
    // (Removed cursor trash icon; double-click handles snap-to-now)
    // Double-click target on cursor time box
    const rect = this.computeTimeBoxRect(this.timeCenter)
    this.hitTargets.push({ type: 'instant-time', id: undefined, rect })
  }

  private drawSpanBetween(
    aTs: number,
    bTs: number,
    y: number,
    color: string,
    labelOrOpts: string | { showPin: boolean; spanId?: string; startName: string; endName: string; saveLabel?: string; headerLabel?: string }
  ) {
    const spanY = y
    const xA = this.timeToPosition(aTs)
    const xB = this.timeToPosition(bTs)
    const leftX = Math.min(xA, xB)
    const rightX = Math.max(xA, xB)
    const leftVisible = leftX >= 0
    const rightVisible = rightX <= this.screenWidth
    const clampedLeft = Math.max(0, leftX)
    const clampedRight = Math.min(this.screenWidth, rightX)

    this.ctx.save()
    this.ctx.strokeStyle = color
    this.ctx.lineWidth = 3
    this.ctx.beginPath()
    this.ctx.moveTo(clampedLeft, spanY)
    this.ctx.lineTo(clampedRight, spanY)
    this.ctx.stroke()
    const drawArrow = (x: number, dir: 1 | -1) => {
      const size = 8
      this.ctx.beginPath()
      this.ctx.moveTo(x, spanY)
      this.ctx.lineTo(x - dir * size, spanY - size)
      this.ctx.lineTo(x - dir * size, spanY + size)
      this.ctx.closePath()
      this.ctx.fillStyle = color
      this.ctx.fill()
    }
    if (!leftVisible) drawArrow(0, -1)
    if (!rightVisible) drawArrow(this.screenWidth, 1)

    const midX = (Math.max(0, Math.min(this.screenWidth, xA)) + Math.max(0, Math.min(this.screenWidth, xB))) / 2
    const diff = bTs - aTs
    const durText = this.formatDurationHMS(Math.abs(diff))
    const dir = diff >= 0 ? 'AFTER' : 'BEFORE'
    let labelText: string
    let showPin = false
    let spanId: string | undefined
    let saveLabel: string | undefined
    let headerLabel: string | undefined
    if (typeof labelOrOpts === 'string') {
      labelText = `${durText} ${dir} ${labelOrOpts}`
    } else {
      const { startName, endName } = labelOrOpts
      labelText = `${endName} ${durText} ${dir} ${startName}`
      showPin = !!labelOrOpts.showPin
      spanId = labelOrOpts.spanId
      saveLabel = labelOrOpts.saveLabel
      headerLabel = labelOrOpts.headerLabel
    }
    const font = 'bold 14px monospace'
    const headerFont = 'bold 14px Arial'
    const labelWidth = Math.max(
      this.measureTextWidth(font, labelText),
      headerLabel ? this.measureTextWidth(headerFont, headerLabel) : 0,
    ) + 16
    const labelHeight = headerLabel ? 28 + 20 : 28
    const labelX = midX - labelWidth / 2
    const labelY = spanY - labelHeight / 2
    this.ctx.fillStyle = 'rgba(0,0,0,0.8)'
    this.ctx.strokeStyle = color
    this.ctx.lineWidth = 2
    this.ctx.fillRect(labelX, labelY, labelWidth, labelHeight)
    this.ctx.strokeRect(labelX, labelY, labelWidth, labelHeight)
    this.ctx.fillStyle = '#ffffff'
    this.ctx.textAlign = 'center'
    this.ctx.textBaseline = 'middle'
    if (headerLabel) {
      // Header on top line
      this.ctx.font = headerFont
      this.ctx.fillText(headerLabel, midX, labelY + 10)
      // Duration/detail on second line
      this.ctx.font = font
      this.ctx.fillText(labelText, midX, labelY + labelHeight - 14)
    } else {
      this.ctx.font = font
      this.ctx.fillText(labelText, midX, labelY + labelHeight / 2)
    }
    this.ctx.restore()

    // Make label editable for saved spans
    if (spanId) {
      this.hitTargets.push({ type: 'span-label', id: spanId, rect: { x: labelX, y: labelY, w: labelWidth, h: labelHeight } })
      if (this.editingSpanId === spanId) {
        this.overlayElements.push({ type: 'span-label', id: spanId, rect: { x: labelX, y: labelY, w: labelWidth, h: labelHeight }, text: labelText, focused: true })
      }
    }

    // Optional pin icon to save span
    if (showPin) {
      const iconW = 24, iconH = 24
      const iconX = labelX - iconW - 8
      const iconY = labelY + (labelHeight - iconH) / 2
      this.ctx.save()
      this.ctx.fillStyle = 'rgba(0,0,0,0.8)'
      this.ctx.strokeStyle = '#22c55e'
      this.ctx.lineWidth = 2
      this.ctx.fillRect(iconX, iconY, iconW, iconH)
      this.ctx.strokeRect(iconX, iconY, iconW, iconH)
      // draw pin glyph
      this.ctx.strokeStyle = '#ffffff'
      this.ctx.beginPath()
      this.ctx.moveTo(iconX + 12, iconY + 5)
      this.ctx.lineTo(iconX + 12, iconY + 16)
      this.ctx.moveTo(iconX + 8, iconY + 12)
      this.ctx.lineTo(iconX + 12, iconY + 18)
      this.ctx.lineTo(iconX + 16, iconY + 12)
      this.ctx.stroke()
      this.ctx.restore()
      this.hitTargets.push({ type: 'span-pin', rect: { x: iconX, y: iconY, w: iconW, h: iconH } })
      // Store last implied span endpoints for saving
      this.lastImpliedSpan = { aTs, bTs: bTs, label: saveLabel ?? '' }
    }
  }

  // removed unused drawCursorTrashIcon

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

  // Recentered vertical baseline for the timeline: lesser of one-third of canvas CSS height or constant pixels
  private TimelineCenterY(): number {
    const dpr = window.devicePixelRatio || 1
    const cssHeight = this.canvas.height / dpr

    return Math.min(cssHeight / 3, 100)
  }

  private computeTimeBoxRect(timestamp: number): { x: number; y: number; w: number; h: number } {
    const centerY = this.TimelineCenterY()
    const timelinePosition = this.timeToPosition(timestamp)
    const font = 'bold 20px monospace'
    const timeString = formatTimeString12h(timestamp)
    const timeBoxWidth = this.measureTextWidth(font, timeString) + 20
    const timeBoxHeight = 40
    const timeX = timelinePosition - timeBoxWidth / 2
    const timeY = centerY + 80
    return { x: timeX, y: timeY, w: timeBoxWidth, h: timeBoxHeight }
  }

  public positionToTime(x: number): number {
    // Convert x coordinate to timestamp
    const progress = x / this.screenWidth
    return this.timeStart + (progress * (this.timeEnd - this.timeStart))
  }

  // Interaction hooks to be called by component
  public handleClick(x: number, y: number) {
    // Scan hit targets recorded during render
    for (const target of this.hitTargets) {
      const { rect } = target
      if (x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h) {
        if (target.type === 'save-now') {
          // If this came from the span arrow button, treat as focus-now
          if (this.viewFocusMode !== 'now') {
            this.setViewFocus('now')
            return
          }
          this.createInstantAt(Date.now(), '')
          // focus remains unchanged
          return
        }
        if (target.type === 'span-pin') {
          const imp = this.lastImpliedSpan ?? undefined
          if (imp) {
            // Ensure endpoints are saved instants
            const ensureInstant = (ts: number): string => {
              const found = this.savedStore.getSnapshot().find(i => i.tsEpochMs === ts)
              if (found) return found.id
              return this.createInstantAt(ts, '')
            }
            const aId = ensureInstant(imp.aTs)
            const bId = ensureInstant(imp.bTs)
            const newId = this.spansStore.create(aId, bId, imp.label)
            this.setViewFocus('span', undefined, newId)
          }
          return
        }
        if (target.type === 'save-cursor') {
          const newId = this.createInstantAt(this.timeCenter, '')
          if (newId) this.setViewFocus('instant', newId)
          return
        }
        if (target.type === 'span-label' && target.id) {
          this.editingSpanId = target.id
          return
        }
        if (target.type === 'instant-trash') {
          if (target.id) {
            const id = target.id
            const isFocused = this.viewFocusMode === 'instant' && this.focusedInstantId === id
            const ts = this.savedStore.getSnapshot().find(si => si.id === id)?.tsEpochMs
            this.deleteInstant(id)
            if (isFocused) {
              if (typeof ts === 'number') {
                this.timeCenter = ts
                this.setViewFocus('cursor')
              } else {
                this.setViewFocus('now')
              }
            }
          } else {
            // Cursor trash: snap back to now
            this.setViewFocus('now')
          }
          return
        }
        if (target.type === 'instant-label' && target.id) {
          const inst = this.savedStore.getSnapshot().find(si => si.id === target.id)
          if (inst) {
            this.editingInstantId = target.id
          }
          return
        }
      }
    }
  }

  public handleDoubleClick(x: number, y: number) {
    for (const target of this.hitTargets) {
      const { rect } = target
      if (x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h) {
        if (target.type === 'instant-time') {
          if (target.id) {
            const ts = this.savedStore.getSnapshot().find(si => si.id === target.id)?.tsEpochMs
            if (typeof ts === 'number') {
              this.timeCenter = ts
              this.setViewFocus('instant', target.id)
            }
          } else {
            // Cursor/Now time box
            if (this.viewFocusMode === 'cursor') {
              this.setViewFocus('now')
            } else {
              // Double-click Now keeps Now
              this.setViewFocus('now')
            }
          }
          return
        }
      }
    }
  }

  private measureTextWidth(font: string, text: string): number {
    this.ctx.save()
    this.ctx.font = font
    const metrics = this.ctx.measureText(text)
    this.ctx.restore()
    return metrics.width
  }

  private drawSaveIconAt(ts: number, type: 'save-now' | 'save-cursor') {
    const centerY = this.TimelineCenterY()
    const x = this.timeToPosition(ts)
    const boxW = 28
    const boxH = 28
    const y = centerY + 120
    this.ctx.save()
    this.ctx.fillStyle = 'rgba(0,0,0,0.8)'
    this.ctx.strokeStyle = '#22c55e'
    this.ctx.lineWidth = 2
    this.ctx.fillRect(x - boxW / 2, y, boxW, boxH)
    this.ctx.strokeRect(x - boxW / 2, y, boxW, boxH)
    // simple save icon (arrow)
    this.ctx.strokeStyle = '#ffffff'
    this.ctx.beginPath()
    this.ctx.moveTo(x, y + 6)
    this.ctx.lineTo(x, y + 16)
    this.ctx.moveTo(x - 5, y + 12)
    this.ctx.lineTo(x, y + 18)
    this.ctx.lineTo(x + 5, y + 12)
    this.ctx.stroke()
    this.ctx.restore()
    this.hitTargets.push({ type, rect: { x: x - boxW / 2, y, w: boxW, h: boxH } })
  }

  private drawTrashIconAt(ts: number, id: string) {
    const centerY = this.TimelineCenterY()
    const x = this.timeToPosition(ts)
    const boxW = 28
    const boxH = 28
    const y = centerY + 120
    this.ctx.save()
    this.ctx.fillStyle = 'rgba(0,0,0,0.8)'
    this.ctx.strokeStyle = '#ef4444'
    this.ctx.lineWidth = 2
    this.ctx.fillRect(x - boxW / 2, y, boxW, boxH)
    this.ctx.strokeRect(x - boxW / 2, y, boxW, boxH)
    // trash lines
    this.ctx.strokeStyle = '#ffffff'
    this.ctx.beginPath()
    this.ctx.moveTo(x - 6, y + 10)
    this.ctx.lineTo(x + 6, y + 10)
    this.ctx.moveTo(x - 4, y + 10)
    this.ctx.lineTo(x - 3, y + 20)
    this.ctx.moveTo(x, y + 10)
    this.ctx.lineTo(x, y + 20)
    this.ctx.moveTo(x + 4, y + 10)
    this.ctx.lineTo(x + 3, y + 20)
    this.ctx.stroke()
    this.ctx.restore()
    this.hitTargets.push({ type: 'instant-trash', id, rect: { x: x - boxW / 2, y, w: boxW, h: boxH } })
  }

  // Zoom API (percent-based around current center)
  public setZoomPercent(zoomPercent: number): void {
    const clamped = Math.max(0.001, Math.min(0.9, zoomPercent))
    this.zoomPercent = clamped
  }

  public zoomIn(): void {
    const factor = 1 - this.zoomPercent
    this.timeWidth = this.clampTimeWidth(this.timeWidth * factor)
    this.persistState()
  }

  public zoomOut(): void {
    const factor = 1 + this.zoomPercent
    this.timeWidth = this.clampTimeWidth(this.timeWidth * factor)
    this.persistState()
  }

  private clampTimeWidth(width: number): number {
    return Math.max(this.minTimeWidthMs, Math.min(this.maxTimeWidthMs, width))
  }

  // time formatting helpers moved to src/utils/timeFormat.ts

  private drawCursorNowSpan() {
    const now = Date.now()
    const cursor = this.timeCenter
    const diffMsSigned = cursor - now
    const color = diffMsSigned >= 0 ? '#22d3ee' : '#ef4444' // future → blue, past → red

    const xNow = this.timeToPosition(now)
    const xCursor = this.timeToPosition(cursor)
    const spanY = this.TimelineCenterY() + this.spanRows.cursorNow

    // Compute visible endpoints; arrows if off-screen
    const leftX = Math.min(xNow, xCursor)
    const rightX = Math.max(xNow, xCursor)
    const leftVisible = leftX >= 0
    const rightVisible = rightX <= this.screenWidth
    const clampedLeft = Math.max(0, leftX)
    const clampedRight = Math.min(this.screenWidth, rightX)

    this.ctx.save()
    this.ctx.strokeStyle = color
    this.ctx.lineWidth = 3
    this.ctx.beginPath()
    this.ctx.moveTo(clampedLeft, spanY)
    this.ctx.lineTo(clampedRight, spanY)
    this.ctx.stroke()

    // Arrows for off-screen ends
    const drawArrow = (x: number, dir: 1 | -1) => {
      const size = 8
      this.ctx.beginPath()
      this.ctx.moveTo(x, spanY)
      this.ctx.lineTo(x - dir * size, spanY - size)
      this.ctx.lineTo(x - dir * size, spanY + size)
      this.ctx.closePath()
      this.ctx.fillStyle = color
      this.ctx.fill()
    }
    if (!leftVisible) drawArrow(0, -1)
    if (!rightVisible) drawArrow(this.screenWidth, 1)

    // Label at midpoint of visible segment
    const midX = (Math.max(0, Math.min(this.screenWidth, xNow)) + Math.max(0, Math.min(this.screenWidth, xCursor))) / 2
    const label = this.formatDurationHMS(Math.abs(diffMsSigned))
    const font = 'bold 14px monospace'
    const labelWidth = this.measureTextWidth(font, label) + 16
    const labelHeight = 28
    const labelX = midX - labelWidth / 2
    const labelY = spanY - labelHeight / 2
    this.ctx.fillStyle = 'rgba(0,0,0,0.8)'
    this.ctx.strokeStyle = color
    this.ctx.lineWidth = 2
    this.ctx.fillRect(labelX, labelY, labelWidth, labelHeight)
    this.ctx.strokeRect(labelX, labelY, labelWidth, labelHeight)
      this.ctx.fillStyle = '#ffffff'
    this.ctx.font = font
      this.ctx.textAlign = 'center'
    this.ctx.textBaseline = 'middle'
    this.ctx.fillText(label, midX, labelY + labelHeight / 2)

    this.ctx.restore()

    // Arrow square icon near the duration label to jump focus to Now
    const iconW = 24, iconH = 24
    // Place icon on side toward Now
    const placeRight = xNow > midX
    const iconX = placeRight ? (midX + labelWidth / 2 + 8) : (midX - labelWidth / 2 - 8 - iconW)
    const iconY = labelY + (labelHeight - iconH) / 2
    this.ctx.save()
    this.ctx.fillStyle = 'rgba(0,0,0,0.8)'
    this.ctx.strokeStyle = '#ffffff'
    this.ctx.lineWidth = 2
    this.ctx.fillRect(iconX, iconY, iconW, iconH)
    this.ctx.strokeRect(iconX, iconY, iconW, iconH)
    // draw small arrow pointing toward Now line
    const towardNow = xNow < xCursor ? -1 : 1
    this.ctx.beginPath()
    const ax = iconX + iconW / 2
    const ay = iconY + iconH / 2
    this.ctx.moveTo(ax - 6 * towardNow, ay - 5)
    this.ctx.lineTo(ax + 6 * towardNow, ay)
    this.ctx.lineTo(ax - 6 * towardNow, ay + 5)
    this.ctx.stroke()
    this.ctx.restore()
    this.hitTargets.push({ type: 'save-now', rect: { x: iconX, y: iconY, w: iconW, h: iconH } })

    // Pin icon to save span (cursor ↔ now) placed opposite the arrow side
    const pinW = 24, pinH = 24
    let pinX = (placeRight ? (labelX - 8 - pinW) : (labelX + labelWidth + 8))
    if (pinX < 0) pinX = labelX + labelWidth + 8
    if (pinX + pinW > this.screenWidth) pinX = labelX - 8 - pinW
    const pinY = labelY + (labelHeight - pinH) / 2
    this.ctx.save()
    this.ctx.fillStyle = 'rgba(0,0,0,0.8)'
    this.ctx.strokeStyle = '#22c55e'
    this.ctx.lineWidth = 2
    this.ctx.fillRect(pinX, pinY, pinW, pinH)
    this.ctx.strokeRect(pinX, pinY, pinW, pinH)
    this.ctx.strokeStyle = '#ffffff'
    this.ctx.beginPath()
    this.ctx.moveTo(pinX + 12, pinY + 5)
    this.ctx.lineTo(pinX + 12, pinY + 16)
    this.ctx.moveTo(pinX + 8, pinY + 12)
    this.ctx.lineTo(pinX + 12, pinY + 18)
    this.ctx.lineTo(pinX + 16, pinY + 12)
    this.ctx.stroke()
    this.ctx.restore()
    this.hitTargets.push({ type: 'span-pin', rect: { x: pinX, y: pinY, w: pinW, h: pinH } })
    this.lastImpliedSpan = { aTs: cursor, bTs: now, label: 'selected to now' }
  }

  private drawInstantNowSpan(ts: number, y: number) {
    const now = Date.now()
    const diffMs = ts - now
    const color = diffMs >= 0 ? '#22d3ee' : '#ef4444'
    const xNow = this.timeToPosition(now)
    const xTs = this.timeToPosition(ts)
    const spanY = y

    const leftX = Math.min(xNow, xTs)
    const rightX = Math.max(xNow, xTs)
    const leftVisible = leftX >= 0
    const rightVisible = rightX <= this.screenWidth
    const clampedLeft = Math.max(0, leftX)
    const clampedRight = Math.min(this.screenWidth, rightX)

    this.ctx.save()
    this.ctx.strokeStyle = color
    this.ctx.lineWidth = 3
        this.ctx.beginPath()
    this.ctx.moveTo(clampedLeft, spanY)
    this.ctx.lineTo(clampedRight, spanY)
        this.ctx.stroke()
    const drawArrow = (x: number, dir: 1 | -1) => {
      const size = 8
      this.ctx.beginPath()
      this.ctx.moveTo(x, spanY)
      this.ctx.lineTo(x - dir * size, spanY - size)
      this.ctx.lineTo(x - dir * size, spanY + size)
      this.ctx.closePath()
      this.ctx.fillStyle = color
      this.ctx.fill()
    }
    if (!leftVisible) drawArrow(0, -1)
    if (!rightVisible) drawArrow(this.screenWidth, 1)

    const midX = (Math.max(0, Math.min(this.screenWidth, xNow)) + Math.max(0, Math.min(this.screenWidth, xTs))) / 2
    const name = (() => {
      const rec = this.savedStore.getSnapshot().find(r => r.tsEpochMs === ts)
      const label = rec?.label?.trim() ?? ''
      return label.length > 0 ? label : '(unnamed)'
    })()
    const durText = this.formatDurationHMS(Math.abs(diffMs))
    const sinceOrUntil = diffMs <= 0 ? 'since' : 'until'
    const label = `${durText} ${sinceOrUntil} ${name}.`
    const font = 'bold 14px monospace'
    const labelWidth = this.measureTextWidth(font, label) + 16
    const labelHeight = 28
    const labelX = midX - labelWidth / 2
    const labelY = spanY - labelHeight / 2
    this.ctx.fillStyle = 'rgba(0,0,0,0.8)'
    this.ctx.strokeStyle = color
    this.ctx.lineWidth = 2
    this.ctx.fillRect(labelX, labelY, labelWidth, labelHeight)
    this.ctx.strokeRect(labelX, labelY, labelWidth, labelHeight)
    this.ctx.fillStyle = '#ffffff'
    this.ctx.font = font
    this.ctx.textAlign = 'center'
    this.ctx.textBaseline = 'middle'
    this.ctx.fillText(label, midX, labelY + labelHeight / 2)
    this.ctx.restore()

    // Add arrow square to focus Now
    const iconW = 24, iconH = 24
    const placeRight = xNow > midX
    const iconX = placeRight ? (midX + labelWidth / 2 + 8) : (midX - labelWidth / 2 - 8 - iconW)
    const iconY = labelY + (labelHeight - iconH) / 2
    this.ctx.save()
    this.ctx.fillStyle = 'rgba(0,0,0,0.8)'
    this.ctx.strokeStyle = '#ffffff'
    this.ctx.lineWidth = 2
    this.ctx.fillRect(iconX, iconY, iconW, iconH)
    this.ctx.strokeRect(iconX, iconY, iconW, iconH)
    const towardNow = xNow < xTs ? -1 : 1
    this.ctx.beginPath()
    const ax = iconX + iconW / 2
    const ay = iconY + iconH / 2
    this.ctx.moveTo(ax - 6 * towardNow, ay - 5)
    this.ctx.lineTo(ax + 6 * towardNow, ay)
    this.ctx.lineTo(ax - 6 * towardNow, ay + 5)
    this.ctx.stroke()
    this.ctx.restore()
    this.hitTargets.push({ type: 'save-now', rect: { x: iconX, y: iconY, w: iconW, h: iconH } })

    // Pin icon to save span (selected ↔ now) placed opposite the arrow side
    const pinW = 24, pinH = 24
    let pinX = (placeRight ? (labelX - 8 - pinW) : (labelX + labelWidth + 8))
    if (pinX < 0) pinX = labelX + labelWidth + 8
    if (pinX + pinW > this.screenWidth) pinX = labelX - 8 - pinW
    const pinY = labelY + (labelHeight - pinH) / 2
    this.ctx.save()
    this.ctx.fillStyle = 'rgba(0,0,0,0.8)'
    this.ctx.strokeStyle = '#22c55e'
    this.ctx.lineWidth = 2
    this.ctx.fillRect(pinX, pinY, pinW, pinH)
    this.ctx.strokeRect(pinX, pinY, pinW, pinH)
    this.ctx.strokeStyle = '#ffffff'
    this.ctx.beginPath()
    this.ctx.moveTo(pinX + 12, pinY + 5)
    this.ctx.lineTo(pinX + 12, pinY + 16)
    this.ctx.moveTo(pinX + 8, pinY + 12)
    this.ctx.lineTo(pinX + 12, pinY + 18)
    this.ctx.lineTo(pinX + 16, pinY + 12)
    this.ctx.stroke()
    this.ctx.restore()
    this.hitTargets.push({ type: 'span-pin', rect: { x: pinX, y: pinY, w: pinW, h: pinH } })
    this.lastImpliedSpan = { aTs: ts, bTs: now, label: 'selected to now' }
  }

  // Draw an instant (timestamp) on the timeline with optional label
  public drawInstant(timestamp: number, label?: string, formatInfo?: Partial<InstantFormatInfo>): void {
    const dpr = window.devicePixelRatio || 1
    const centerY = this.TimelineCenterY()
    
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
      labelStringOffset: 50,
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
    
      const labelWidth = this.measureTextWidth(format.labelFont!, label) + 10 // Add padding
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
    const timeString = formatTimeString12h(timestamp)
    
    // Draw background rectangle for time string - always white for consistency
    this.ctx.fillStyle = 'rgba(0, 0, 0, 0.8)'
    this.ctx.strokeStyle = '#ffffff'
    this.ctx.lineWidth = 2
    
    const timeBoxWidth = this.measureTextWidth(format.timeStringFont!, timeString) + 20
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

  // View/pan API
  public setViewFocus(mode: 'now' | 'cursor' | 'instant' | 'span', instantId?: string, spanId?: string) {
    if (mode === 'instant') {
      if (this.currentSelectedInstantId && instantId && this.currentSelectedInstantId !== instantId) {
        this.previousSelectedInstantId = this.currentSelectedInstantId
      }
      this.currentSelectedInstantId = instantId ?? null
    }
    this.viewFocusMode = mode
    this.focusedInstantId = mode === 'instant' ? (instantId ?? null) : this.focusedInstantId
    this.focusedSpanId = mode === 'span' ? (spanId ?? null) : this.focusedSpanId
    this.persistState()
  }

  public getViewFocus(): { mode: 'now' | 'cursor' | 'instant' | 'span'; focusedInstantId: string | null; focusedSpanId?: string | null } {
    return { mode: this.viewFocusMode, focusedInstantId: this.focusedInstantId, focusedSpanId: this.focusedSpanId }
  }

  public panByPixels(deltaX: number) {
    const msPerPx = this.timeWidth / Math.max(1, this.screenWidth)
    // Drag right should move timeline with the finger: shift center earlier
    this.timeCenter -= deltaX * msPerPx
    this.persistState()
  }

  public snapToNowIfClose(tolerancePx: number): boolean {
    const xNow = this.timeToPosition(Date.now())
    const xCenter = this.screenWidth / 2
    if (Math.abs(xNow - xCenter) <= tolerancePx) {
      this.setViewFocus('now')
      return true
    }
    return false
  }

  public snapToInstantIfClose(tolerancePx: number): boolean {
    const xCenter = this.screenWidth / 2
    let best: { id: string; dist: number } | null = null
    for (const s of this.savedStore.getSnapshot()) {
      const x = this.timeToPosition(s.tsEpochMs)
      const d = Math.abs(x - xCenter)
      if (d <= tolerancePx && (!best || d < best.dist)) best = { id: s.id, dist: d }
    }
    if (best) {
      this.setViewFocus('instant', best.id)
      this.timeCenter = this.savedStore.getSnapshot().find(si => si.id === best!.id)!.tsEpochMs
      return true
    }
    return false
  }

  public setTimeWidth(widthMs: number) {
    this.timeWidth = Math.max(1000, widthMs) // Minimum 1 second
  }

  public setTimeCenter(centerMs: number) {
    this.timeCenter = centerMs
  }

  // Instant storage helpers
  private createInstantAt(ts: number, label: string): string {
    const id = this.savedStore.create(ts, label)
    this.persistState()
    return id
  }

  private deleteInstant(id: string) {
    this.savedStore.delete(id)
    if (this.focusedInstantId === id) this.focusedInstantId = null
    this.persistState()
  }

  public destroy() {
    if (this.animationId) {
      cancelAnimationFrame(this.animationId)
    }
  }

  // Expose overlays for HTML layer
  public getOverlayElements(): { type: 'save-now' | 'save-cursor' | 'instant-label' | 'instant-trash' | 'span-label'; id?: string; rect: { x: number; y: number; w: number; h: number }; text?: string; focused?: boolean }[] {
    return this.overlayElements
  }

  public updateInstantLabel(id: string, newLabel: string) {
    this.savedStore.updateLabel(id, newLabel)
    this.persistState()
    this.editingInstantId = null
  }

  public updateSpanLabel(id: string, newLabel: string) {
    this.spansStore.updateLabel(id, newLabel)
    this.persistState()
    this.editingSpanId = null
  }

  public endEditing() {
    this.editingInstantId = null
    this.editingSpanId = null
  }

  // Public read APIs for HTML list
  public getSavedInstantsSnapshot(): SavedInstantCompat[] {
    return this.savedStore.getSnapshot().map(s => ({ id: s.id, ts: s.tsEpochMs, label: s.label }))
  }

  public getCenterTimestamp(): number {
    if (this.viewFocusMode === 'now') return Date.now()
    if (this.viewFocusMode === 'cursor') return this.timeCenter
    if (this.viewFocusMode === 'instant') {
      const s = this.savedStore.getSnapshot().find(si => si.id === this.focusedInstantId)
      return s ? s.tsEpochMs : Date.now()
    }
    if (this.viewFocusMode === 'span') {
      const sp = this.focusedSpanId ? this.spansStore.getSnapshot().find(s => s.id === this.focusedSpanId) : null
      if (sp) {
        const a = this.savedStore.getSnapshot().find(i => i.id === sp.startInstantId)?.tsEpochMs
        const b = this.savedStore.getSnapshot().find(i => i.id === sp.endInstantId)?.tsEpochMs
        if (typeof a === 'number' && typeof b === 'number') return (a + b) / 2
      }
      return this.timeCenter
    }
    return Date.now()
  }

  public getStateVersion(): number {
    return this.stateVersion
  }

  public getHumanDurationTo(ts: number): { text: string; sign: 1 | -1 } {
    const now = Date.now()
    return formatDurationHuman(now, ts)
  }

  // Unified list of all instants for UI consumption (Now, Cursor, Saved)
  public getAllInstantsView(): InstantView[] {
    const nowTs = Date.now()
    const centerTs = this.getCenterTimestamp()
    const focus = this.getViewFocus()
    const list: InstantView[] = [
      { kind: 'now', tsEpochMs: nowTs },
      { kind: 'cursor', tsEpochMs: centerTs, visible: focus.mode === 'cursor' },
      ...this.savedStore.getSnapshot().map<InstantView>(s => ({ kind: 'saved' as const, id: s.id, tsEpochMs: s.tsEpochMs, label: s.label }))
    ]
    list.sort((a, b) => a.tsEpochMs - b.tsEpochMs)
    return list
  }

  // Spans view for DOM list (saved + implied)
  public getAllSpansView(): SpanView[] {
    const spans: SpanView[] = []
    const savedMap = new Map(this.savedStore.getSnapshot().map(i => [i.id, i]))
    // Saved spans
    for (const s of this.spansStore.getSnapshot()) {
      const a = savedMap.get(s.startInstantId)
      const b = savedMap.get(s.endInstantId)
      if (!a || !b) continue
      spans.push({ kind: 'saved', id: s.id, label: s.label || '(unnamed)', start: { id: a.id, name: a.label || '(unnamed)', tsEpochMs: a.tsEpochMs }, end: { id: b.id, name: b.label || '(unnamed)', tsEpochMs: b.tsEpochMs }, durationMs: b.tsEpochMs - a.tsEpochMs })
    }
    // Implied: selected → now
    if (this.currentSelectedInstantId) {
      const a = savedMap.get(this.currentSelectedInstantId)
      if (a) {
        const now = Date.now()
        spans.push({ kind: 'implied', label: 'selected to now', start: { id: a.id, name: a.label || '(unnamed)', tsEpochMs: a.tsEpochMs }, end: { name: 'Now', tsEpochMs: now }, durationMs: now - a.tsEpochMs })
      }
    }
    // Implied: selected → previous
    if (this.currentSelectedInstantId && this.previousSelectedInstantId) {
      const a = savedMap.get(this.previousSelectedInstantId)
      const b = savedMap.get(this.currentSelectedInstantId)
      if (a && b) {
        spans.push({ kind: 'implied', label: 'selected to previous', start: { id: a.id, name: a.label || '(unnamed)', tsEpochMs: a.tsEpochMs }, end: { id: b.id, name: b.label || '(unnamed)', tsEpochMs: b.tsEpochMs }, durationMs: b.tsEpochMs - a.tsEpochMs })
      }
    }
    // Sort by midpoint time
    spans.sort((x, y) => ((x.start.tsEpochMs + x.end.tsEpochMs) / 2) - ((y.start.tsEpochMs + y.end.tsEpochMs) / 2))
    return spans
  }
}
