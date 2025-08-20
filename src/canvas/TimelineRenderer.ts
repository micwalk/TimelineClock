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
  private zoomPanAnim: { active: boolean; startTs: number; durationMs: number; fromCenter: number; toCenter: number; fromWidth: number; toWidth: number } | null = null
  private pendingPersistAfterAnim: boolean = false
  private zoomTargetWidth: number | null = null
  private zoomTargetPersistPending: boolean = false

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
  private hitTargets: { type: 'save-now' | 'save-cursor' | 'instant-label' | 'cursor-label' | 'now-label' | 'cursor-star' | 'now-star' | 'instant-trash' | 'instant-time' | 'span-pin' | 'span-label' | 'instant-fav' | 'span-end-focus'; id?: string; rect: { x: number; y: number; w: number; h: number }; focus?: 'now'|'cursor'|'instant' }[] = []
  private overlayElements: { type: 'save-now' | 'save-cursor' | 'instant-label' | 'instant-trash' | 'span-label'; id?: string; rect: { x: number; y: number; w: number; h: number }; text?: string; focused?: boolean }[] = []
  private editingInstantId: string | null = null
  private editingSpanId: string | null = null
  private stateVersion: number = 0
  private lastImpliedSpan: { aTs: number; bTs: number; label: string } | null = null
  // Visibility toggles for implied spans
  private showImpliedSelectedNow: boolean = true
  private showImpliedSelectedPrev: boolean = true
  // Focus history (previous = previously focused instant)
  private focusHistory: string[] = []
  private focusHistoryIndex: number = -1
  private suppressHistoryPush: boolean = false

  
  // Recentered vertical baseline for the timeline: lesser of one-third of canvas CSS height or constant pixels
  private TimelineCenterY(): number {
    // const dpr = window.devicePixelRatio || 1
    // const cssHeight = this.canvas.height / dpr
    //return Math.min(cssHeight / 3, 130)
    
    return 130 // TODO: Make responsive
  }

  // Centralized vertical offsets for span rows
  private readonly spanRows = {
    cursorNow: -100, // Aka Row 0
    selectedNow: -70, // FKA Row 2
    selectedCursor: 170, // Aka Row 1
    selectedPrev: 200, // Aka Row 3
    focusedSaved: 230, // Aka Row 4
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
    
    // Update time center depending on view mode (skip if animating)
    const animating = !!(this.zoomPanAnim && this.zoomPanAnim.active)
    if (!animating) {
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
    }
    // Apply zoom/pan animation if active
    if (this.zoomPanAnim && this.zoomPanAnim.active) {
      const nowTs = performance.now()
      const tRaw = (nowTs - this.zoomPanAnim.startTs) / this.zoomPanAnim.durationMs
      const t = Math.max(0, Math.min(1, tRaw))
      // cubic ease-in-out
      const ease = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
      this.timeCenter = this.zoomPanAnim.fromCenter + (this.zoomPanAnim.toCenter - this.zoomPanAnim.fromCenter) * ease
      this.timeWidth = this.zoomPanAnim.fromWidth + (this.zoomPanAnim.toWidth - this.zoomPanAnim.fromWidth) * ease
      if (t >= 1) {
        this.zoomPanAnim.active = false
        if (this.pendingPersistAfterAnim) {
          this.persistState()
          this.pendingPersistAfterAnim = false
        }
      }
    }
    // Smooth towards wheel-zoom target if present and no center animation is running
    const centerAnimating = !!(this.zoomPanAnim && this.zoomPanAnim.active)
    if (!centerAnimating && this.zoomTargetWidth !== null) {
      const target = this.clampTimeWidth(this.zoomTargetWidth)
      const diff = target - this.timeWidth
      // Exponential smoothing
      const step = diff * 0.25
      if (Math.abs(diff) <= 0.5) {
        this.timeWidth = target
        this.zoomTargetWidth = null
        if (this.zoomTargetPersistPending) {
          this.persistState()
          this.zoomTargetPersistPending = false
        }
      } else {
        this.timeWidth += step
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
    // Removed: favorite implied spans are now represented as saved spans with endIsNow and visible
    if (this.viewFocusMode === 'cursor' || this.viewFocusMode === 'instant') {
      if (this.viewFocusMode === 'cursor') {
        this.drawCursorInstant()
      }
      this.drawCursorNowSpan()
    }
    // Draw focused saved span if any (and suppress implied spans)
    if (this.viewFocusMode === 'span' && this.focusedSpanId) {
      const sp = this.spansStore.getSnapshot().find(s => s.id === this.focusedSpanId)
      if (sp) {
        const a = this.savedStore.getSnapshot().find(i => i.id === sp.startInstantId)?.tsEpochMs
        const b = sp.endIsNow ? Date.now() : this.savedStore.getSnapshot().find(i => i.id === sp.endInstantId)?.tsEpochMs
        if (typeof a === 'number' && typeof b === 'number') {
          // Only draw the selected saved span
          const aRec = this.savedStore.getSnapshot().find(i => i.id === sp.startInstantId)
          const bRec = sp.endIsNow ? undefined : this.savedStore.getSnapshot().find(i => i.id === sp.endInstantId)
          const startName = aRec?.label || '?'
          const endName = sp.endIsNow ? 'Now' : (bRec?.label || '?')
          const header = sp.label && sp.label.length > 0 ? sp.label : undefined
          this.drawSpanBetween(a, b, this.TimelineCenterY() + this.spanRows.focusedSaved, '#34d399', { showPin: false, spanId: sp.id, startName, endName, headerLabel: header })
          return
        }
      }
    }

    // Draw all visible saved spans (including ones ending at Now)
    {
      const centerY = this.TimelineCenterY()
      let rowOffset = 0
      for (const sp of this.spansStore.getSnapshot()) {
        if (!sp.visible) continue
        const a = this.savedStore.getSnapshot().find(i => i.id === sp.startInstantId)?.tsEpochMs
        const b = sp.endIsNow ? Date.now() : this.savedStore.getSnapshot().find(i => i.id === sp.endInstantId)?.tsEpochMs
        if (typeof a !== 'number' || typeof b !== 'number') continue
        const aRec = this.savedStore.getSnapshot().find(i => i.id === sp.startInstantId)
        const bRec = sp.endIsNow ? undefined : this.savedStore.getSnapshot().find(i => i.id === sp.endInstantId)
        const startName = aRec?.label || '?'
        const endName = sp.endIsNow ? 'Now' : (bRec?.label || '?')
        const header = sp.label && sp.label.length > 0 ? sp.label : undefined
        const y = centerY + this.spanRows.focusedSaved + rowOffset * 30
        this.drawSpanVisual(a, b, { y, color: '#34d399', spanId: sp.id, startName, endName, headerLabel: header, startFocus: { kind: 'instant', id: aRec?.id }, endFocus: sp.endIsNow ? { kind: 'now' } : { kind: 'instant', id: bRec?.id } })
        rowOffset++
      }
    }

    // Draw implied spans for selected/current instant
    const selected = this.currentSelectedInstantId ? this.savedStore.getSnapshot().find(si => si.id === this.currentSelectedInstantId) : null
    // Previously focused instant for the purple span
    const prev = (() => {
      const id = this.getPrevFocusedInstantId()
      if (!id) return null
      return this.savedStore.getSnapshot().find(si => si.id === id) || null
    })()
    // Row 1: Selected ↔ Cursor (when focusing cursor), or Selected ↔ Focused Instant (when focusing a different instant)
    if (selected) {
      const y = this.TimelineCenterY() + this.spanRows.selectedCursor
      const color = '#22d3ee' // light blue always for this row
      if (this.viewFocusMode === 'cursor') {
        const startName = selected.label && selected.label.length > 0 ? selected.label : '?'
        const endName = 'Cursor'
        this.drawSpanVisual(selected.tsEpochMs, this.timeCenter, {
          y,
          color,
          startName,
          endName,
          showPin: true,
          saveLabel: 'Selected to Cursor',
          startFocus: { kind: 'instant', id: selected.id! },
          endFocus: { kind: 'cursor' },
        })
      } else if (this.viewFocusMode === 'instant' && this.focusedInstantId && this.focusedInstantId !== selected.id) {
        const f = this.savedStore.getSnapshot().find(si => si.id === this.focusedInstantId)
        if (f) {
          const startName = selected.label && selected.label.length > 0 ? selected.label : '?'
          const endName = f.label && f.label.length > 0 ? f.label : '?'
          this.drawSpanVisual(selected.tsEpochMs, f.tsEpochMs, {
            y,
            color,
            startName,
            endName,
            showPin: true,
            saveLabel: 'Selected to Focus',
            startFocus: { kind: 'instant', id: selected.id! },
            endFocus: { kind: 'instant', id: f.id },
          })
        }
      }
    }
    // Row 3: Selected → Now (always shown)
    if (selected) {
      const y = this.TimelineCenterY() + this.spanRows.selectedNow
      const color = '#2563eb'
      const startName = selected.label && selected.label.length > 0 ? selected.label : '?'
      const endName = 'Now'
      this.drawSpanVisual(selected.tsEpochMs, Date.now(), {
        y,
        color,
        startName,
        endName,
        showPin: true,
        saveLabel: 'Selected to Now',
        startFocus: { kind: 'instant', id: selected.id! },
        endFocus: { kind: 'now' },
      })
    }
    if (selected && prev && this.showImpliedSelectedPrev) {
      const startName = prev.label && prev.label.length > 0 ? prev.label : '?'
      const endName = selected.label && selected.label.length > 0 ? selected.label : 'selected'
      this.drawSpanVisual(prev.tsEpochMs, selected.tsEpochMs, { y: this.TimelineCenterY() + this.spanRows.selectedPrev, color: '#8b5cf6', startName, endName, headerLabel: undefined, showPin: true, saveLabel: 'Selected to Previous', startFocus: { kind: 'instant', id: prev.id }, endFocus: { kind: 'instant', id: selected.id } })
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
        focusHistory: this.focusHistory,
        focusHistoryIndex: this.focusHistoryIndex,
      }
      localStorage.setItem('timeline.state', JSON.stringify(payload))
      this.stateVersion++
    } catch (err) { void err }
  }

  private loadPersistedState() {
    try {
      const raw = localStorage.getItem('timeline.state')
      if (!raw) return
      const data = JSON.parse(raw) as Partial<{ timeWidth: number; timeCenter: number; viewFocusMode: 'now'|'cursor'|'instant'|'span'; focusedInstantId: string|null; focusedSpanId: string|null; currentSelectedInstantId: string|null; previousSelectedInstantId: string|null; focusHistory: string[]; focusHistoryIndex: number }>
      if (typeof data.timeWidth === 'number') this.timeWidth = this.clampTimeWidth(data.timeWidth)
      if (typeof data.timeCenter === 'number') this.timeCenter = data.timeCenter
      if (data.viewFocusMode === 'now' || data.viewFocusMode === 'cursor' || data.viewFocusMode === 'instant' || data.viewFocusMode === 'span') this.viewFocusMode = data.viewFocusMode
      if (typeof data.focusedInstantId === 'string' || data.focusedInstantId === null) this.focusedInstantId = data.focusedInstantId ?? null
      if (typeof data.focusedSpanId === 'string' || data.focusedSpanId === null) this.focusedSpanId = data.focusedSpanId ?? null
      if (typeof data.currentSelectedInstantId === 'string' || data.currentSelectedInstantId === null) this.currentSelectedInstantId = data.currentSelectedInstantId ?? null
      if (typeof data.previousSelectedInstantId === 'string' || data.previousSelectedInstantId === null) this.previousSelectedInstantId = data.previousSelectedInstantId ?? null
      if (Array.isArray(data.focusHistory)) this.focusHistory = data.focusHistory
      if (typeof data.focusHistoryIndex === 'number') this.focusHistoryIndex = data.focusHistoryIndex
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
    // Add double-click target on NOW time box to focus now
    const rect = this.computeTimeBoxRect(Date.now())
    this.hitTargets.push({ type: 'instant-time', rect })
    // Add double-click target on NOW label to create and edit a new instant
    {
      const centerY = this.TimelineCenterY()
      const x = this.timeToPosition(Date.now())
      const font = 'bold 16px Arial'
      const label = 'Now'
      const w = this.measureTextWidth(font, label) + 10
      const h = 30
      const r = { x: x - w / 2, y: centerY + 50, w, h }
      this.hitTargets.push({ type: 'now-label', rect: r })
      // Add unfilled star next to Now
      const starSize = 20
      const starRect = { x: r.x + r.w + 6, y: r.y + (r.h - starSize) / 2, w: starSize, h: starSize }
      const starCx = starRect.x + starRect.w / 2
      const starCy = starRect.y + starRect.h / 2
      this.drawStarIcon(starCx, starCy, false)
      this.hitTargets.push({ type: 'now-star', rect: starRect })
    }
  }

  // Render all saved instants with label editing and delete icon
  private drawSavedInstants() {
    const saved = this.savedStore.getSnapshot().map(rec => ({ id: rec.id, ts: rec.tsEpochMs, label: rec.label, favorite: !!rec.favorite }))
    for (const s of saved) {
      const isFocused = this.viewFocusMode === 'instant' && this.focusedInstantId === s.id
      const isSelected = this.currentSelectedInstantId === s.id
      const prevId = this.getPrevFocusedInstantId()
      const isPrevFocused = !!prevId && prevId === s.id
      const label = s.label && s.label.length > 0 ? s.label : '?'
      let lineColor = '#ffffff'
      let borderColor = '#ffffff'
      let glowColor: string | undefined = undefined
      let glowBlur = 0
      let lineWidth = 2
      if (isFocused) {
        lineColor = '#22d3ee' // focused: light blue
        borderColor = '#22d3ee'
        glowColor = '#22d3ee'
        glowBlur = 8
        lineWidth = 3
      } else if (isSelected) {
        lineColor = '#2563eb' // selected: deeper blue
        borderColor = '#2563eb'
        glowColor = '#2563eb'
        glowBlur = 8
        lineWidth = 3
      } else if (isPrevFocused) {
        lineColor = '#8b5cf6' // previously selected: purple
        borderColor = '#8b5cf6'
        glowColor = '#8b5cf6'
        glowBlur = 6
        lineWidth = 3
      }
      this.drawInstant(s.ts, label, {
        lineColor,
        glowColor,
        glowBlur,
        lineWidth,
        labelBackgroundColor: 'rgba(0,0,0,0.8)',
        labelBorderColor: borderColor,
        labelTextColor: '#ffffff',
      })
      if (this.currentSelectedInstantId === s.id) {
        this.drawTrashIconAt(s.ts, s.id)
      }
      // Record label hit target roughly using current font and box metrics similar to drawInstant
      const centerY = this.TimelineCenterY()
      const x = this.timeToPosition(s.ts)
      const font = 'bold 16px Arial'
      const w = this.measureTextWidth(font, label) + 10
      const h = 30
      const rect = { x: x - w / 2, y: centerY + 50, w, h }
      this.hitTargets.push({ type: 'instant-label', id: s.id, rect })
      // Favorite star next to label with hit target
      {
        const shouldShowStar = !!s.favorite || this.currentSelectedInstantId === s.id
        if (shouldShowStar) {
          const starSize = 20
          const starRect = { x: rect.x + rect.w + 6, y: rect.y + (rect.h - starSize) / 2, w: starSize, h: starSize }
          const starCx = starRect.x + starRect.w / 2
          const starCy = starRect.y + starRect.h / 2
          this.drawStarIcon(starCx, starCy, !!s.favorite)
          this.hitTargets.push({ type: 'instant-fav', id: s.id, rect: starRect })
        }
      }
      // Add a double-click target for the time box
      const timeRect = this.computeTimeBoxRect(s.ts)
      this.hitTargets.push({ type: 'instant-time', id: s.id, rect: timeRect })
      // Only include overlay input for the one being edited; ensure we use the raw saved label (no fallback)
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
    // (Removed cursor save icon; double-click on label saves a new instant)
    // (Removed cursor trash icon; double-click handles snap-to-now)
    // Double-click target on cursor time box
    const rect = this.computeTimeBoxRect(this.timeCenter)
    this.hitTargets.push({ type: 'instant-time', id: undefined, rect })
    // Add double-click target for the cursor label to save a new instant
    {
      const centerY = this.TimelineCenterY()
      const x = this.timeToPosition(this.timeCenter)
      const font = 'bold 16px Arial'
      const label = 'Cursor'
      const w = this.measureTextWidth(font, label) + 10
      const h = 30
      const r = { x: x - w / 2, y: centerY + 50, w, h }
      this.hitTargets.push({ type: 'cursor-label', rect: r })
      // Add unfilled star next to Cursor
      const starSize = 20
      const starRect = { x: r.x + r.w + 6, y: r.y + (r.h - starSize) / 2, w: starSize, h: starSize }
      const starCx = starRect.x + starRect.w / 2
      const starCy = starRect.y + starRect.h / 2
      this.drawStarIcon(starCx, starCy, false)
      this.hitTargets.push({ type: 'cursor-star', rect: starRect })
    }
  }

  private drawSpanBetween(
    aTs: number,
    bTs: number,
    y: number,
    color: string,
    labelOrOpts: string | { showPin: boolean; spanId?: string; startName: string; endName: string; saveLabel?: string; headerLabel?: string }
  ) {
    // Delegate to unified span renderer
    if (typeof labelOrOpts === 'string') {
      this.drawSpanVisual(aTs, bTs, {
        y,
        color,
        labelText: labelOrOpts,
      })
      return
    }
    this.drawSpanVisual(aTs, bTs, {
      y,
      color,
      startName: labelOrOpts.startName,
      endName: labelOrOpts.endName,
      headerLabel: labelOrOpts.headerLabel,
      showPin: labelOrOpts.showPin,
      spanId: labelOrOpts.spanId,
      saveLabel: labelOrOpts.saveLabel,
    })
  }

  private drawSpanVisual(aTs: number, bTs: number, opts: {
    y: number
    color: string
    headerLabel?: string
    startName?: string
    endName?: string
    labelText?: string
    showPin?: boolean
    spanId?: string
    saveLabel?: string
    addFocusNowButton?: boolean
    recordImplied?: { aTs: number; bTs: number; label: string }
    startFocus?: { kind: 'instant'|'cursor'|'now'; id?: string }
    endFocus?: { kind: 'instant'|'cursor'|'now'; id?: string }
  }) {
    if(aTs === bTs) {
      return
    }
    const spanY = opts.y
    const xA = this.timeToPosition(aTs)
    const xB = this.timeToPosition(bTs)
    const leftX = Math.min(xA, xB)
    const rightX = Math.max(xA, xB)
    const aVisible = xA >= 0 && xA <= this.screenWidth
    const bVisible = xB >= 0 && xB <= this.screenWidth
    // If both endpoints are off-screen, skip drawing entirely
    // BUT if one is left and the other is right (spanning across), we still draw
    const spansScreen = leftX < 0 && rightX > this.screenWidth
    if (!aVisible && !bVisible && !spansScreen) {
      return
    }

    const clampedLeft = Math.max(0, leftX)
    const clampedRight = Math.min(this.screenWidth, rightX)

    this.ctx.save()
    this.ctx.strokeStyle = opts.color
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
      this.ctx.fillStyle = opts.color
      this.ctx.fill()
    }
    const leftOffscreen = leftX < 0
    const rightOffscreen = rightX > this.screenWidth
    if (leftOffscreen) drawArrow(0, -1)
    if (rightOffscreen) drawArrow(this.screenWidth, 1)

    const midX = (Math.max(0, Math.min(this.screenWidth, xA)) + Math.max(0, Math.min(this.screenWidth, xB))) / 2
    const diff = bTs - aTs
    const durText = this.formatDurationHMS(Math.abs(diff))
    const dir = diff >= 0 ? 'AFTER' : 'BEFORE'
    let labelText: string
    if (opts.labelText) {
      labelText = opts.labelText
    } else if (opts.startName && opts.endName) {
      labelText = `${opts.endName} ${durText} ${dir} ${opts.startName}`
    } else {
      labelText = durText
    }
    const font = 'bold 14px monospace'
    const headerFont = 'bold 14px Arial'
    const labelWidth = Math.max(
      this.measureTextWidth(font, labelText),
      opts.headerLabel ? this.measureTextWidth(headerFont, opts.headerLabel) : 0,
    ) + 16
    const labelHeight = opts.headerLabel ? 28 + 20 : 28
    const labelX = midX - labelWidth / 2
    const labelY = spanY - labelHeight / 2
    this.ctx.fillStyle = 'rgba(0,0,0,0.8)'
    this.ctx.strokeStyle = opts.color
    this.ctx.lineWidth = 2
    this.ctx.fillRect(labelX, labelY, labelWidth, labelHeight)
    this.ctx.strokeRect(labelX, labelY, labelWidth, labelHeight)
    this.ctx.fillStyle = '#ffffff'
    this.ctx.textAlign = 'center'
    this.ctx.textBaseline = 'middle'
    if (opts.headerLabel) {
      this.ctx.font = headerFont
      this.ctx.fillText(opts.headerLabel, midX, labelY + 10)
      this.ctx.font = font
      this.ctx.fillText(labelText, midX, labelY + labelHeight - 14)
    } else {
      this.ctx.font = font
      this.ctx.fillText(labelText, midX, labelY + labelHeight / 2)
    }

    // Editable label for saved spans
    if (opts.spanId) {
      this.hitTargets.push({ type: 'span-label', id: opts.spanId, rect: { x: labelX, y: labelY, w: labelWidth, h: labelHeight } })
      if (this.editingSpanId === opts.spanId) {
        const initialText = (typeof opts.headerLabel === 'string' && opts.headerLabel.length > 0) ? opts.headerLabel : labelText
        this.overlayElements.push({ type: 'span-label', id: opts.spanId, rect: { x: labelX, y: labelY, w: labelWidth, h: labelHeight }, text: initialText, focused: true })
      }
    }

    // Optional pin icon to save span
    if (opts.showPin) {
      const iconW = 24, iconH = 24
      const extraLeft = 22 + 8 // account for left focus arrow (width + gap)
      const iconX = labelX - iconW - 8 - extraLeft
      const iconY = labelY + (labelHeight - iconH) / 2
      this.ctx.save()
      this.ctx.fillStyle = 'rgba(0,0,0,0.8)'
      this.ctx.strokeStyle = '#22c55e'
      this.ctx.lineWidth = 2
      this.ctx.fillRect(iconX, iconY, iconW, iconH)
      this.ctx.strokeRect(iconX, iconY, iconW, iconH)
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
      if (opts.recordImplied) {
        this.lastImpliedSpan = { aTs: opts.recordImplied.aTs, bTs: opts.recordImplied.bTs, label: opts.recordImplied.label }
      } else if (typeof opts.saveLabel === 'string') {
        this.lastImpliedSpan = { aTs, bTs, label: opts.saveLabel }
      }
    }

    // Optional focus Now button (arrow square)
    if (opts.addFocusNowButton) {
      const xNow = this.timeToPosition(Date.now())
      const xOther = this.timeToPosition(aTs === Date.now() ? bTs : aTs)
      const placeRight = xNow > midX
      const iconW = 24, iconH = 24
      const iconX = placeRight ? (midX + labelWidth / 2 + 8) : (midX - labelWidth / 2 - 8 - iconW)
      const iconY = labelY + (labelHeight - iconH) / 2
      this.ctx.save()
      this.ctx.fillStyle = 'rgba(0,0,0,0.8)'
      this.ctx.strokeStyle = '#ffffff'
      this.ctx.lineWidth = 2
      this.ctx.fillRect(iconX, iconY, iconW, iconH)
      this.ctx.strokeRect(iconX, iconY, iconW, iconH)
      const towardNow = xNow < xOther ? -1 : 1
      this.ctx.beginPath()
      const ax = iconX + iconW / 2
      const ay = iconY + iconH / 2
      this.ctx.moveTo(ax - 6 * towardNow, ay - 5)
      this.ctx.lineTo(ax + 6 * towardNow, ay)
      this.ctx.lineTo(ax - 6 * towardNow, ay + 5)
      this.ctx.stroke()
      this.ctx.restore()
      this.hitTargets.push({ type: 'save-now', rect: { x: iconX, y: iconY, w: iconW, h: iconH } })
    }

    // Endpoint focus arrows (both sides unless target is cursor)
    const makeFocusArrow = (side: 'left'|'right', target: { kind: 'instant'|'cursor'|'now'; id?: string }) => {
      if (target.kind === 'cursor') return
      const size = 22
      const w = size, h = size
      const gap = 8
      const yTop = labelY + (labelHeight - h) / 2
      const xLeft = labelX - gap - w
      const xRight = labelX + labelWidth + gap
      const rect = side === 'left'
        ? { x: xLeft, y: yTop, w, h }
        : { x: xRight, y: yTop, w, h }
      this.ctx.save()
      this.ctx.fillStyle = 'rgba(0,0,0,0.8)'
      this.ctx.strokeStyle = '#ffffff'
      this.ctx.lineWidth = 2
      this.ctx.fillRect(rect.x, rect.y, rect.w, rect.h)
      this.ctx.strokeRect(rect.x, rect.y, rect.w, rect.h)
      // Draw arrow glyph pointing outward
      const dir = side === 'left' ? -1 : 1
      this.ctx.beginPath()
      const ax = rect.x + rect.w / 2
      const ay = rect.y + rect.h / 2
      this.ctx.moveTo(ax - 6 * dir, ay - 5)
      this.ctx.lineTo(ax + 6 * dir, ay)
      this.ctx.lineTo(ax - 6 * dir, ay + 5)
      this.ctx.stroke()
      this.ctx.restore()
      this.hitTargets.push({ type: 'span-end-focus', rect, focus: target.kind === 'now' ? 'now' : 'instant', id: target.id })
    }

    // Place arrows based on time order: left arrow → older endpoint, right arrow → newer endpoint
    const aIsOlder = aTs <= bTs
    const leftTarget = aIsOlder ? opts.startFocus : opts.endFocus
    const rightTarget = aIsOlder ? opts.endFocus : opts.startFocus
    if (leftTarget) makeFocusArrow('left', leftTarget)
    if (rightTarget) makeFocusArrow('right', rightTarget)

    this.ctx.restore()
  }

  // removed legacy implied draw method after refactor

  private drawStarIcon(cx: number, cy: number, filled: boolean) {
    const r = 8
    this.ctx.save()
    this.ctx.beginPath()
    for (let i = 0; i < 10; i++) {
      const angle = (Math.PI / 5) * i - Math.PI / 2
      const radius = i % 2 === 0 ? r : r * 0.5
      const x = cx + Math.cos(angle) * radius
      const y = cy + Math.sin(angle) * radius
      if (i === 0) this.ctx.moveTo(x, y); else this.ctx.lineTo(x, y)
    }
    this.ctx.closePath()
    if (filled) {
      this.ctx.fillStyle = '#facc15'
      this.ctx.fill()
    }
    this.ctx.strokeStyle = '#facc15'
    this.ctx.lineWidth = 2
    this.ctx.stroke()
    this.ctx.restore()
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
        if (target.type === 'span-end-focus') {
          if (target.focus === 'now') {
            this.setViewFocus('now')
          } else if (target.focus === 'instant' && target.id) {
            const ts = this.savedStore.getSnapshot().find(si => si.id === target.id)?.tsEpochMs
            if (typeof ts === 'number') {
              this.focusInstantAnimated(target.id, ts)
            }
          }
          return
        }
        if (target.type === 'instant-fav' && target.id) {
          const inst = this.savedStore.getSnapshot().find(si => si.id === target.id)
          if (inst) {
            this.toggleFavorite(target.id, !inst.favorite)
          }
          return
        }
        if (target.type === 'cursor-star') {
          const newId = this.createInstantAt(this.timeCenter, '')
          this.savedStore.setFavorite(newId, true)
          this.setViewFocus('instant', newId)
          this.editingInstantId = newId
          return
        }
        if (target.type === 'now-star') {
          const nowTs = Date.now()
          const newId = this.createInstantAt(nowTs, '')
          this.savedStore.setFavorite(newId, true)
          this.setViewFocus('instant', newId)
          this.timeCenter = nowTs
          this.editingInstantId = newId
          return
        }
        // span-label editing moved to double-click
        if (target.type === 'instant-label' && target.id) {
          // Single-click selects (but does not focus) the instant
          this.setSelectedInstant(target.id)
          return
        }
        if (target.type === 'instant-time' && target.id) {
          // Single-click selects (but does not focus) the instant
          this.setSelectedInstant(target.id)
          return
        }
        if (target.type === 'instant-time' && !target.id) {
          // Clicked cursor/now time box — snap/animate to now
          this.focusNowAnimated()
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
                this.setViewFocus('cursor')
                this.startZoomPanAnimation(ts, this.timeWidth)
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
        // instant-label editing moved to double-click
      }
    }
  }

  // Exposed for list UI to toggle favorite status
  public toggleFavorite(id: string, value: boolean) {
    this.savedStore.setFavorite(id, value)
    // Ensure there is a corresponding visible span to Now when favorited
    if (value) {
      this.spansStore.createOrUpdateFavoriteNowSpan(id, true)
    } else {
      // On unfavorite, just hide the span if exists
      const sp = this.spansStore.getSnapshot().find(s => s.startInstantId === id && s.endIsNow)
      if (sp) this.spansStore.setVisible(sp.id, false)
    }
    this.stateVersion++
  }

  public setSpanVisible(spanId: string, value: boolean) {
    this.spansStore.setVisible(spanId, value)
    this.stateVersion++
  }

  public setImpliedVisibility(which: 'selected-now'|'selected-prev', value: boolean) {
    if (which === 'selected-now') this.showImpliedSelectedNow = value
    if (which === 'selected-prev') this.showImpliedSelectedPrev = value
    this.stateVersion++
  }

  public handleDoubleClick(x: number, y: number) {
    for (const target of this.hitTargets) {
      const { rect } = target
      if (x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h) {
        if (target.type === 'instant-time') {
          if (target.id) {
            const ts = this.savedStore.getSnapshot().find(si => si.id === target.id)?.tsEpochMs
            if (typeof ts === 'number') {
              this.focusInstantAnimated(target.id, ts)
            }
          } else {
            // Cursor/Now time box
            // Double-click Now: animate to Now
            this.focusNowAnimated()
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
        if (target.type === 'span-label' && target.id) {
          this.editingSpanId = target.id
          return
        }
        if (target.type === 'cursor-label') {
          const newId = this.createInstantAt(this.timeCenter, '')
          if (newId) {
            this.setViewFocus('instant', newId)
            this.editingInstantId = newId
          }
          return
        }
        if (target.type === 'now-label') {
          const nowTs = Date.now()
          const newId = this.createInstantAt(nowTs, '')
          if (newId) {
            this.setViewFocus('instant', newId)
            this.timeCenter = nowTs
            this.editingInstantId = newId
          }
          return
        }
        if (target.type === 'cursor-star') {
          const newId = this.createInstantAt(this.timeCenter, '')
          if (newId) {
            this.savedStore.setFavorite(newId, true)
            this.setViewFocus('instant', newId)
            this.editingInstantId = newId
          }
          return
        }
        if (target.type === 'now-star') {
          const nowTs = Date.now()
          const newId = this.createInstantAt(nowTs, '')
          if (newId) {
            this.savedStore.setFavorite(newId, true)
            this.setViewFocus('instant', newId)
            this.timeCenter = nowTs
            this.editingInstantId = newId
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
    this.setZoomTargetFactor(1 - this.zoomPercent)
  }

  public zoomOut(): void {
    this.setZoomTargetFactor(1 + this.zoomPercent)
  }

  private setZoomTargetFactor(factor: number) {
    const base = this.zoomTargetWidth !== null ? this.zoomTargetWidth : this.timeWidth
    this.zoomTargetWidth = this.clampTimeWidth(base * factor)
    this.zoomTargetPersistPending = true
  }

  private clampTimeWidth(width: number): number {
    return Math.max(this.minTimeWidthMs, Math.min(this.maxTimeWidthMs, width))
  }

  // time formatting helpers moved to src/utils/timeFormat.ts

  private drawCursorNowSpan() {
    const now = Date.now()
    // Use focused instant when focus is on an instant; otherwise use cursor/timeCenter
    let sourceTs = this.timeCenter
    if (this.viewFocusMode === 'instant' && this.focusedInstantId) {
      const s = this.savedStore.getSnapshot().find(si => si.id === this.focusedInstantId)
      if (s) sourceTs = s.tsEpochMs
    }
    const diffMsSigned = sourceTs - now
    const color = '#ef4444' // always red per spec

    const xNow = this.timeToPosition(now)
    const xSource = this.timeToPosition(sourceTs)
    // Place using configured row (can be negative to position near top)
    const spanY = this.TimelineCenterY() + this.spanRows.cursorNow

    // Compute visible endpoints; arrows if off-screen
    const leftX = Math.min(xNow, xSource)
    const rightX = Math.max(xNow, xSource)
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
    const midX = (Math.max(0, Math.min(this.screenWidth, xNow)) + Math.max(0, Math.min(this.screenWidth, xSource))) / 2
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
    const towardNow = xNow < xSource ? -1 : 1
    this.ctx.beginPath()
    const ax = iconX + iconW / 2
    const ay = iconY + iconH / 2
    this.ctx.moveTo(ax - 6 * towardNow, ay - 5)
    this.ctx.lineTo(ax + 6 * towardNow, ay)
    this.ctx.lineTo(ax - 6 * towardNow, ay + 5)
    this.ctx.stroke()
    this.ctx.restore()
    this.hitTargets.push({ type: 'save-now', rect: { x: iconX, y: iconY, w: iconW, h: iconH } })

    // Pin icon to save span (source ↔ now) placed opposite the arrow side
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
    this.lastImpliedSpan = { aTs: sourceTs, bTs: now, label: 'To Now' }
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
    // If leaving an instant focus to cursor, push current focused instant into history tail
    const prevMode = this.viewFocusMode
    const leavingInstantToCursor = (prevMode === 'instant' && mode === 'cursor' && this.focusedInstantId)
    this.viewFocusMode = mode
    // Update focused instant and push into history unless suppressed
    if (mode === 'instant') {
      const nextId = instantId ?? null
      const prevId = this.focusedInstantId
      this.focusedInstantId = nextId
      if (!this.suppressHistoryPush && nextId && nextId !== prevId) {
        // If navigating within history (index not at tail), drop forward history
        if (this.focusHistoryIndex >= 0 && this.focusHistoryIndex < this.focusHistory.length - 1) {
          this.focusHistory = this.focusHistory.slice(0, this.focusHistoryIndex + 1)
        }
        this.focusHistory.push(nextId)
        this.focusHistoryIndex = this.focusHistory.length - 1
      }
    }
    this.focusedSpanId = mode === 'span' ? (spanId ?? null) : this.focusedSpanId
    if (leavingInstantToCursor) {
      const id = this.focusedInstantId!
      if (!this.suppressHistoryPush) {
        if (this.focusHistoryIndex >= 0 && this.focusHistoryIndex < this.focusHistory.length - 1) {
          this.focusHistory = this.focusHistory.slice(0, this.focusHistoryIndex + 1)
        }
        this.focusHistory.push(id)
        this.focusHistoryIndex = this.focusHistory.length - 1
      }
    }
    this.persistState()
  }

  private getPrevFocusedInstantId(): string | null {
    if (this.focusHistoryIndex > 0) return this.focusHistory[this.focusHistoryIndex - 1] ?? null
    return null
  }

  public navigateFocusHistory(delta: -1 | 1) {
    if (this.focusHistory.length === 0) return
    let nextIndex = this.focusHistoryIndex + delta
    nextIndex = Math.max(0, Math.min(this.focusHistory.length - 1, nextIndex))
    if (nextIndex === this.focusHistoryIndex) return
    const nextId = this.focusHistory[nextIndex]
    if (!nextId) return
    const ts = this.savedStore.getSnapshot().find(si => si.id === nextId)?.tsEpochMs
    if (typeof ts !== 'number') return
    this.suppressHistoryPush = true
    this.focusInstantAnimated(nextId, ts)
    this.suppressHistoryPush = false
    this.focusHistoryIndex = nextIndex
  }

  // Select an instant without changing focus mode
  private setSelectedInstant(instantId: string) {
    if (this.currentSelectedInstantId && this.currentSelectedInstantId !== instantId) {
      this.previousSelectedInstantId = this.currentSelectedInstantId
    }
    this.currentSelectedInstantId = instantId
    // Do not change viewFocusMode or focusedInstantId here
    this.persistState()
  }

  public getViewFocus(): { mode: 'now' | 'cursor' | 'instant' | 'span'; focusedInstantId: string | null; focusedSpanId?: string | null } {
    return { mode: this.viewFocusMode, focusedInstantId: this.focusedInstantId, focusedSpanId: this.focusedSpanId }
  }

  public panByPixels(deltaX: number) {
    this.cancelZoomPanAnimation()
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
    this.cancelZoomPanAnimation()
    this.timeCenter = centerMs
  }

  // Smoothly focus an instant by id or timestamp; keeps current zoom
  public focusInstantAnimated(instantId?: string, tsEpochMs?: number): void {
    let targetTs: number | undefined = tsEpochMs
    if (typeof targetTs !== 'number' && instantId) {
      targetTs = this.savedStore.getSnapshot().find(i => i.id === instantId)?.tsEpochMs
    }
    if (typeof targetTs !== 'number') return
    if (instantId) {
      this.setViewFocus('instant', instantId)
    } else {
      this.setViewFocus('instant')
    }
    this.startZoomPanAnimation(targetTs, this.timeWidth)
  }

  private startZoomPanAnimation(targetCenter: number, targetWidth: number, durationMs = 350): void {
    const fromCenter = this.timeCenter
    const fromWidth = this.timeWidth
    this.zoomPanAnim = {
      active: true,
      startTs: performance.now(),
      durationMs,
      fromCenter,
      toCenter: targetCenter,
      fromWidth,
      toWidth: this.clampTimeWidth(targetWidth),
    }
    this.pendingPersistAfterAnim = true
  }

  public focusNowAnimated(): void {
    this.setViewFocus('now')
    this.startZoomPanAnimation(Date.now(), this.timeWidth)
  }

  private cancelZoomPanAnimation(): void {
    if (this.zoomPanAnim && this.zoomPanAnim.active) {
      this.zoomPanAnim.active = false
      this.pendingPersistAfterAnim = false
    }
  }

  // Adjust zoom so a time range [aTs, bTs] fits with margins or is enlarged when too close
  public adjustZoomToRange(aTs: number, bTs: number): void {
    const early = Math.min(aTs, bTs)
    const late = Math.max(aTs, bTs)
    const xEarly = this.timeToPosition(early)
    const xLate = this.timeToPosition(late)
    const offscreen = (xEarly < 0) || (xLate > this.screenWidth)
    if (offscreen) {
      const desiredTimeWidth = (late - early) / 0.8 // leave 10% margins on each side
      this.startZoomPanAnimation((early + late) / 2, desiredTimeWidth)
      return
    }
    const distancePx = Math.max(0, xLate - xEarly)
    if (distancePx < 0.2 * this.screenWidth) {
      const desiredTimeWidth = 2 * (late - early) // make distance 50% of width
      this.startZoomPanAnimation((early + late) / 2, desiredTimeWidth)
    }
  }

  // Convenience: adjust zoom for a saved span by id
  public adjustZoomForSpan(spanId: string): void {
    const sp = this.spansStore.getSnapshot().find(s => s.id === spanId)
    if (!sp) return
    const start = this.savedStore.getSnapshot().find(i => i.id === sp.startInstantId)?.tsEpochMs
    const end = sp.endIsNow ? Date.now() : this.savedStore.getSnapshot().find(i => i.id === sp.endInstantId)?.tsEpochMs
    if (typeof start !== 'number' || typeof end !== 'number') return
    this.adjustZoomToRange(start, end)
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

  public deleteSpan(id: string) {
    if (this.focusedSpanId === id) this.focusedSpanId = null
    this.spansStore.delete(id)
    this.stateVersion++
    this.persistState()
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
      ...this.savedStore.getSnapshot().map<InstantView>(s => ({ kind: 'saved' as const, id: s.id, tsEpochMs: s.tsEpochMs, label: s.label, favorite: !!s.favorite }))
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
      const bRec = s.endIsNow ? null : savedMap.get(s.endInstantId)
      if (!a || (!s.endIsNow && !bRec)) continue
      const start = { id: a.id, name: a.label || '?', tsEpochMs: a.tsEpochMs }
      const end = s.endIsNow ? { name: 'Now', tsEpochMs: Date.now() } : { id: bRec!.id, name: bRec!.label || '?', tsEpochMs: bRec!.tsEpochMs }
      spans.push({ kind: 'saved', id: s.id, label: s.label || '?', start, end, durationMs: end.tsEpochMs - start.tsEpochMs, visible: !!s.visible })
    }
    // Implied: selected → now (always listed; visibility reflected in flag)
    if (this.currentSelectedInstantId) {
      const a = savedMap.get(this.currentSelectedInstantId)
      if (a) {
        const now = Date.now()
        spans.push({ kind: 'implied', label: 'Selected to Now', start: { id: a.id, name: a.label || '?', tsEpochMs: a.tsEpochMs }, end: { name: 'Now', tsEpochMs: now }, durationMs: now - a.tsEpochMs, visible: this.showImpliedSelectedNow })
      }
    }
    // Removed: favorites implied spans are now saved spans managed by spans store
    // Implied: selected → previously focused
    if (this.currentSelectedInstantId) {
      const prevId = this.getPrevFocusedInstantId()
      const a = prevId ? savedMap.get(prevId) : undefined
      const b = savedMap.get(this.currentSelectedInstantId)
      if (a && b) {
        spans.push({ kind: 'implied', label: 'Selected to Previous', start: { id: a.id, name: a.label || '?', tsEpochMs: a.tsEpochMs }, end: { id: b.id, name: b.label || '?', tsEpochMs: b.tsEpochMs }, durationMs: b.tsEpochMs - a.tsEpochMs, visible: this.showImpliedSelectedPrev })
      }
    }
    // Sort by midpoint time
    spans.sort((x, y) => ((x.start.tsEpochMs + x.end.tsEpochMs) / 2) - ((y.start.tsEpochMs + y.end.tsEpochMs) / 2))
    return spans
  }
}
