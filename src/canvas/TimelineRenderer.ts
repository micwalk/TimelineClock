// Format information for drawing instants
import { formatTimeString12h, formatDurationHuman } from '../utils/timeFormat.ts'
import type { SavedInstantCompat } from '../types/instants.ts'
import type { InstantView } from '../types/instants.ts'
import type { InstantRecord } from '../types/instants.ts'
import { SavedInstantsStore } from '../services/SavedInstantsStore.ts'
import { SavedSpansStore } from '../services/SavedSpansStore.ts'
import type { SpanView } from '../types/spans.ts'
import { TimelineState } from './core/TimelineState.ts'
import { TimelineViewport } from './core/TimelineViewport.ts'
import { TimelineAnimations } from './core/TimelineAnimations.ts'
import { HitTargetManager } from './core/HitTargetManager.ts'
import { IconRenderer } from './core/IconRenderer.ts'
import { ShapeRenderer } from './core/ShapeRenderer.ts'
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

  // Core systems
  private state: TimelineState
  private viewport: TimelineViewport
  private animations: TimelineAnimations
  private hitTargets: HitTargetManager
  private icons: IconRenderer
  private shapes: ShapeRenderer

  // Data stores
  private savedStore: SavedInstantsStore
  private spansStore: SavedSpansStore
  private overlayElements: { type: 'save-now' | 'save-cursor' | 'instant-label' | 'instant-trash' | 'span-label'; id?: string; rect: { x: number; y: number; w: number; h: number }; text?: string; focused?: boolean }[] = []
  private lastImpliedSpan: { aTs: number; bTs: number; label: string } | null = null

  
  // Recentered vertical baseline for the timeline: lesser of one-third of canvas CSS height or constant pixels
  private TimelineCenterY(): number {
    // const dpr = window.devicePixelRatio || 1
    // const cssHeight = this.canvas.height / dpr
    //return Math.min(cssHeight / 3, 130)
    
    return 130 // TODO: Make responsive
  }

  // Centralized vertical offsets for span rows
  private readonly spanRows = {
    cursorNow: -110, // Aka Row 0
    selectedNow: 160, // FKA Row 2
    selectedCursor: -75, // Aka Row 1
    selectedPrev: 190, // Aka Row 3
    spanList: 190, // Aka Row 4
    focusedSpanTop: -80, // Focused saved span drawn above the timeline
  } as const

  // Zoom configuration
  private zoomPercent: number = 0.1 // 10% per step

  constructor(canvas: HTMLCanvasElement, deps?: { saved?: SavedInstantsStore; spans?: SavedSpansStore }) {
    this.canvas = canvas
    const context = canvas.getContext('2d')
    if (!context) {
      throw new Error('Could not get 2D context from canvas')
    }
    this.ctx = context
    this.setupCanvas()
    
    // Initialize data stores
    this.savedStore = deps?.saved ?? new SavedInstantsStore()
    this.spansStore = deps?.spans ?? new SavedSpansStore()
    
    // Initialize core systems
    this.state = new TimelineState(this.savedStore, this.spansStore)
    this.viewport = new TimelineViewport(canvas, this.state)
    this.animations = new TimelineAnimations(this.state)
    this.hitTargets = new HitTargetManager()
    this.icons = new IconRenderer(this.ctx)
    this.shapes = new ShapeRenderer(this.ctx)
    
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

  // Parse time string in format "hh:mm:ss" or "-hh:mm:ss" and return milliseconds
  private parseTimeString(timeString: string): number {
    const isNegative = timeString.startsWith('-')
    const cleanTime = timeString.replace(/^[+-]/, '')
    const parts = cleanTime.split(':')
    
    if (parts.length !== 3) {
      throw new Error('Invalid time format. Expected hh:mm:ss')
    }
    
    const hours = parseInt(parts[0], 10)
    const minutes = parseInt(parts[1], 10)
    const seconds = parseInt(parts[2], 10)
    
    if (isNaN(hours) || isNaN(minutes) || isNaN(seconds)) {
      throw new Error('Invalid time values')
    }
    
    if (hours > 23 || minutes > 59 || seconds > 59) {
      throw new Error('Time values out of range')
    }
    
    const totalMs = (hours * 60 * 60 + minutes * 60 + seconds) * 1000
    return isNegative ? -totalMs : totalMs
  }

  // Move cursor to a specific time relative to a reference point
  public moveCursorToTime(timeString: string, referenceTime: number = Date.now()): void {
    try {
      const deltaMs = this.parseTimeString(timeString)
      const targetTime = referenceTime + deltaMs
      this.state.setTimeCenter(targetTime)
      this.state.setViewFocus('cursor')
      this.persistState()
    } catch (error) {
      console.error('Failed to parse time string:', error)
    }
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
    // Update viewport dimensions
    this.viewport.updateDimensions()
    
    // Update focus-based time center (skip if animating)
    const focusState = this.state.getViewFocus()
    if (!this.animations.isZoomPanAnimating()) {
      if (focusState.mode === 'now') {
        this.state.setTimeCenter(Date.now())
      } else if (focusState.mode === 'span' && focusState.focusedSpanId) {
        const span = this.spansStore.getSnapshot().find(s => s.id === focusState.focusedSpanId)
        if (span) {
          const a = this.savedStore.getSnapshot().find(i => i.id === span.startInstantId)?.tsEpochMs
          const b = span.endIsNow ? Date.now() : this.savedStore.getSnapshot().find(i => i.id === span.endInstantId)?.tsEpochMs
          if (typeof a === 'number' && typeof b === 'number') {
            // For spans with NOW endpoint, continuously update center and zoom
            if (span.endIsNow) {
              this.animations.updateContinuousZoomForNowSpan(a, b)
            } else {
              this.state.setTimeCenter((a + b) / 2)
            }
          }
        }
      }
    }
    // Update animations
    if (this.animations.updateAnimations()) {
      // Check if we need to persist state after animation completion
      const animState = this.animations.getAnimationState()
      if (animState.pendingPersist && !animState.zoomPanActive && !animState.zoomTargetActive) {
        this.persistState()
      }
    }
    
    // Update viewport time range
    this.viewport.updateTimeRange()
  }

  public render() {
    // Update timeline state
    this.updateTimelineState()
    
    this.clear()
    this.drawTimeline()
    this.drawTimeTicks()
    this.hitTargets.clear()
    this.overlayElements = []
    this.drawNowInstant() // This now draws the line, label, and time string
    // Draw saved instants
    this.drawSavedInstants()
    // Track spans already drawn to avoid duplicates across bands
    const drawnSpanIds = new Set<string>()
    
    if (this.state.getViewFocus().mode === 'cursor' || this.state.getViewFocus().mode === 'instant') {
    if (this.state.getViewFocus().mode === 'cursor') {
      this.drawCursorInstant()
      }
      this.drawCursorNowSpan()
    }
    // Draw focused saved span if any (with emphasis)
    if (this.state.getViewFocus().mode === 'span' && this.state.getViewFocus().focusedSpanId) {
      const sp = this.spansStore.getSnapshot().find(s => s.id === this.state.getViewFocus().focusedSpanId)
      if (sp) {
        const a = this.savedStore.getSnapshot().find(i => i.id === sp.startInstantId)?.tsEpochMs
        const b = sp.endIsNow ? Date.now() : this.savedStore.getSnapshot().find(i => i.id === sp.endInstantId)?.tsEpochMs
        if (typeof a === 'number' && typeof b === 'number') {
          // Draw the selected saved span with a glow and thicker line
          const aRec = this.savedStore.getSnapshot().find(i => i.id === sp.startInstantId)
          const bRec = sp.endIsNow ? undefined : this.savedStore.getSnapshot().find(i => i.id === sp.endInstantId)
          const startName = aRec?.label || '?'
          const endName = sp.endIsNow ? 'Now' : (bRec?.label || '?')
          // For favorite-now spans, suppress the 'Favorite' label and show a star next to the start name
          const isFavNow = !!sp.endIsNow && typeof aRec?.favorite === 'boolean' && aRec.favorite
          const header = (() => {
            if (isFavNow) return undefined
            return sp.label && sp.label.length > 0 ? sp.label : undefined
          })()
          this.drawSpanVisual(a, b, {
            y: this.TimelineCenterY() + this.spanRows.focusedSpanTop,
            color: '#34d399',
            spanId: sp.id,
            startName,
            endName,
            headerLabel: header,
            startFocus: { kind: 'instant', id: aRec?.id },
            endFocus: sp.endIsNow ? { kind: 'now' } : { kind: 'instant', id: bRec?.id },
            lineWidth: 5,
            glowColor: '#34d399',
            glowBlur: 12,
            showInlineControls: true,
            startStar: isFavNow,
          })
          drawnSpanIds.add(sp.id)
          // Highlight endpoints in green glow when span is focused
          if (aRec) {
            this.drawInstant(aRec.tsEpochMs, aRec.label || '?', {
              lineColor: '#34d399', glowColor: '#34d399', glowBlur: 10, lineWidth: 4,
              labelBorderColor: '#34d399', labelTextColor: '#ffffff'
            })
          }
          if (bRec && !sp.endIsNow) {
            this.drawInstant(bRec.tsEpochMs, bRec.label || '?', {
              lineColor: '#34d399', glowColor: '#34d399', glowBlur: 10, lineWidth: 4,
              labelBorderColor: '#34d399', labelTextColor: '#ffffff'
            })
          }
        }
      }
    }

    // Draw all saved spans using one layout pass (including invisible ones related to focus history)
    {
      const centerY = this.TimelineCenterY()
      const focusedId = this.state.getViewFocus().focusedInstantId
      const selectedId = this.state.getCurrentSelectedInstantId()
      const savedSpans = this.spansStore.getSnapshot()

      // De-duplication mechanism for multiple reasons to draw spans.
      type Drawable = { sp: typeof savedSpans[number]; a: number; b: number; aRec?: InstantRecord; bRec?: InstantRecord | undefined; prio: number }
      const byId: Map<string, Drawable> = new Map()
      const pushCandidate = (cand: Drawable): void => {
        const id = cand.sp.id
        const prev = byId.get(id)
        if (!prev || cand.prio < prev.prio) {
          byId.set(id, cand)
        }
      }

      // Loop through all saved spans and add them to the list if they should be drawn
      for (const sp of savedSpans) {
        if (this.state.getViewFocus().mode === 'span' && this.state.getViewFocus().focusedSpanId === sp.id) continue // focused span drawn elsewhere
        const aRec = this.savedStore.getSnapshot().find(i => i.id === sp.startInstantId)
        const bRec = sp.endIsNow ? undefined : this.savedStore.getSnapshot().find(i => i.id === sp.endInstantId)
        const a = aRec?.tsEpochMs
        const b = sp.endIsNow ? Date.now() : bRec?.tsEpochMs
        if (typeof a !== 'number' || typeof b !== 'number') continue
        if (!this.shouldDrawSpan(a, b)) continue
        const involveFocused = !!focusedId && (sp.startInstantId === focusedId || sp.endInstantId === focusedId)
        const involveSelected = !!selectedId && (sp.startInstantId === selectedId || sp.endInstantId === selectedId)
                
        // Priority: 0 focused (cyan), 1 selected (blue), 2 visible (green), -1 or otherwise (exclude)
        let includePrio: number = -1
        if (this.state.getViewFocus().mode === 'instant' && focusedId) {
            includePrio = involveFocused ? 0 : sp.visible ? 2 : -1;
        } else if (selectedId) {
            includePrio = involveSelected ? 1 : sp.visible ? 2 : -1;
        } else if (sp.visible) {
            includePrio = 2;
        }
        if (includePrio < 0) continue
        pushCandidate({ sp, a, b, aRec, bRec, prio: includePrio })
      }
      // Build final list from map and order by priority then midpoint
      const spanDrawList = Array.from(byId.values())
      spanDrawList.sort((x, y) => {
        const dp = x.prio - y.prio
        if (dp !== 0) return dp
        // fallback by midpoint time
        const xm = (x.a + x.b) / 2
        const ym = (y.a + y.b) / 2
        return xm - ym
      })
      
      // Actually draw all spans into "rows"
      let rowOffset : number = centerY + this.spanRows.spanList
      const rowHeights = {
        "short": 30,
        "labeled": 50,
        "controlExtra": 20,
      }
      for (const d of spanDrawList) {
        const { sp, a, b, aRec, bRec, prio } = d
        const startName = aRec?.label || '?'
        const endName = sp.endIsNow ? 'Now' : (bRec?.label || '?')
        const isFavNow = !!sp.endIsNow && typeof aRec?.favorite === 'boolean' && aRec.favorite
        const header = (() => {
          if (isFavNow) return undefined
          return sp.label && sp.label.length > 0 ? sp.label : undefined
        })()
        const color = prio === 0 ? '#22d3ee' : prio === 1 ? '#2563eb' : '#34d399'
        rowOffset += header ? rowHeights.labeled : rowHeights.short
        const drawControls = prio <= 1
        const willActuallyShowControls = this.willShowSpanControls({ spanId: sp.id, showInlineControls: drawControls })
        if(willActuallyShowControls) rowOffset +=rowHeights.controlExtra
        this.drawSpanVisual(a, b, { y:rowOffset, color, spanId: sp.id, startName, endName, headerLabel: header, 
            startFocus: { kind: 'instant', id: aRec?.id }, 
            endFocus: sp.endIsNow ? { kind: 'now' } : { kind: 'instant', id: bRec?.id }, 
            startStar: isFavNow, 
            showInlineControls: drawControls, 
            visibleHint: sp.visible !== false })
        drawnSpanIds.add(sp.id)
      }
    } // End Draw Visible Spans

    // Draw implied spans for selected/current instant
    const selected = this.state.getCurrentSelectedInstantId() ? this.savedStore.getSnapshot().find(si => si.id === this.state.getCurrentSelectedInstantId()) : null
    // Previously focused instant for the purple span
    const prev = (() => {
      const id = this.getPrevFocusedInstantId()
      if (!id) return null
      return this.savedStore.getSnapshot().find(si => si.id === id) || null
    })()

    // Row 1: Selected ↔ Cursor (when focusing cursor), OR Selected ↔ Focused Instant (when focusing a different instant)
    if (selected) {
      const y = this.TimelineCenterY() + this.spanRows.selectedCursor
      const color = '#22d3ee' // light blue always for this row
      if (this.state.getViewFocus().mode === 'cursor') {
        const diffMs = this.state.getTimeCenter() - selected.tsEpochMs
        const sign = diffMs >= 0 ? '+' : '-'
        const durOnly = `${sign}${this.formatDurationHMS(Math.abs(diffMs))}`
        this.drawSpanVisual(selected.tsEpochMs, this.state.getTimeCenter(), {
          y,
          color,
          // Render like cursor:now – duration only with sign
          labelText: durOnly,
          showPin: true,
          saveLabel: 'Selected to Cursor',
          startFocus: { kind: 'instant', id: selected.id! },
          endFocus: { kind: 'cursor' },
          showInlineControls: true,
        })
      } else if (this.state.getViewFocus().mode === 'instant' && this.state.getViewFocus().focusedInstantId && this.state.getViewFocus().focusedInstantId !== selected.id) {
        const f = this.savedStore.getSnapshot().find(si => si.id === this.state.getViewFocus().focusedInstantId)
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
            showInlineControls: true,
          })
        }
      }
    }

    // Implied Span: Selected → Now (always shown, at top)
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
        showInlineControls: true,
      })
    }
    
    // Implied Span: for selected → previous.
    if (selected && prev && this.state.getImpliedVisibility('selected-prev')) { // && this.state.getViewFocus().mode !== 'instant'
      const startName = prev.label && prev.label.length > 0 ? prev.label : '?'
      const endName = selected.label && selected.label.length > 0 ? selected.label : 'selected'
      this.drawSpanVisual(prev.tsEpochMs, selected.tsEpochMs, { 
        y: this.TimelineCenterY() + this.spanRows.selectedPrev, color: '#8b5cf6', startName, endName, 
        headerLabel: undefined, showPin: true, saveLabel: 'Selected to Previous', 
        startFocus: { kind: 'instant', id: prev.id }, endFocus: { kind: 'instant', id: selected.id },
        showInlineControls: true,
    })
    }

  }

  private persistState() {
    try {
      const payload = this.state.getSnapshot()
      localStorage.setItem('timeline.state', JSON.stringify(payload))
    } catch (err) { void err }
  }

  private loadPersistedState() {
    try {
      const raw = localStorage.getItem('timeline.state')
      if (!raw) return
      const data = JSON.parse(raw)
      this.state.loadSnapshot(data)
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
    const endX = this.viewport.getScreenWidth()

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

    const pxPerMs = this.viewport.getScreenWidth() / this.state.getTimeWidth()
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
    const pxPerMs = this.viewport.getScreenWidth() / this.state.getTimeWidth()
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
        const first = this.getFirstSixHourBoundaryAtOrBefore(this.viewport.getTimeStart())
        for (let t = first; t <= this.viewport.getTimeEnd(); t += unitMs) {
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
      const startAligned = Math.floor(this.viewport.getTimeStart() / unitMs) * unitMs
      for (let t = startAligned; t <= this.viewport.getTimeEnd(); t += unitMs) {
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
      const first = this.getFirstCalendarBoundaryAtOrBefore(this.viewport.getTimeStart(), unit.calendarUnit!)
      let t = first
      while (t <= this.viewport.getTimeEnd()) {
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
    this.hitTargets.addInstantTime('now', rect.x, rect.y, rect.w, rect.h)
    // Add double-click target on NOW label to create and edit a new instant
    {
      const centerY = this.TimelineCenterY()
      const x = this.timeToPosition(Date.now())
      const font = 'bold 16px Arial'
      const label = 'Now'
      const w = this.measureTextWidth(font, label) + 10
      const h = 30
      const r = { x: x - w / 2, y: centerY + 50, w, h }
      this.hitTargets.addNowLabel(r.x, r.y, r.w, r.h)
      // Add unfilled star next to Now
      const starSize = 20
      const starRect = { x: r.x + r.w + 6, y: r.y + (r.h - starSize) / 2, w: starSize, h: starSize }
      const starCx = starRect.x + starRect.w / 2
      const starCy = starRect.y + starRect.h / 2
      this.drawStarIcon(starCx, starCy, false)
      this.hitTargets.addNowStar(starRect.x, starRect.y, starRect.w, starRect.h)
    }
  }

  // Render all saved instants with label editing and delete icon
  private drawSavedInstants() {
    const saved = this.savedStore.getSnapshot().map(rec => ({ id: rec.id, ts: rec.tsEpochMs, label: rec.label, favorite: !!rec.favorite }))
    for (const s of saved) {
      const isFocused = this.state.getViewFocus().mode === 'instant' && this.state.getViewFocus().focusedInstantId === s.id
      const isSelected = this.state.getCurrentSelectedInstantId() === s.id
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
      if (this.state.getCurrentSelectedInstantId() === s.id) {
      this.drawTrashIconAt(s.ts, s.id)
      }
      // Record label hit target roughly using current font and box metrics similar to drawInstant
      const centerY = this.TimelineCenterY()
      const x = this.timeToPosition(s.ts)
      const font = 'bold 16px Arial'
      const w = this.measureTextWidth(font, label) + 10
      const h = 30
      const rect = { x: x - w / 2, y: centerY + 50, w, h }
      this.hitTargets.addInstantLabel(s.id, rect.x, rect.y, rect.w, rect.h)
      // Favorite star next to label with hit target
      {
        const shouldShowStar = !!s.favorite || this.state.getCurrentSelectedInstantId() === s.id
        if (shouldShowStar) {
        const starSize = 20
        const starRect = { x: rect.x + rect.w + 6, y: rect.y + (rect.h - starSize) / 2, w: starSize, h: starSize }
        const starCx = starRect.x + starRect.w / 2
        const starCy = starRect.y + starRect.h / 2
        this.drawStarIcon(starCx, starCy, !!s.favorite)
        this.hitTargets.addInstantFavorite(s.id, starRect.x, starRect.y, starRect.w, starRect.h)
        }
      }
      // Add a double-click target for the time box
      const timeRect = this.computeTimeBoxRect(s.ts)
      this.hitTargets.addInstantTime(s.id, timeRect.x, timeRect.y, timeRect.w, timeRect.h)
      // Only include overlay input for the one being edited; ensure we use the raw saved label (no fallback)
      if (this.state.getEditingInstantId() === s.id) {
        this.overlayElements.push({ type: 'instant-label', id: s.id, rect, text: s.label, focused: true })
      }
    }
  }
  
  private drawCursorInstant() {
    // Draw the CURSOR center line and label at the timeCenter
    this.drawInstant(this.state.getTimeCenter(), 'Cursor', {
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
    const rect = this.computeTimeBoxRect(this.state.getTimeCenter())
    this.hitTargets.addInstantTime('cursor', rect.x, rect.y, rect.w, rect.h)
    // Add double-click target for the cursor label to save a new instant
    {
      const centerY = this.TimelineCenterY()
      const x = this.timeToPosition(this.state.getTimeCenter())
      const font = 'bold 16px Arial'
      const label = 'Cursor'
      const w = this.measureTextWidth(font, label) + 10
      const h = 30
      const r = { x: x - w / 2, y: centerY + 50, w, h }
      this.hitTargets.addCursorLabel(r.x, r.y, r.w, r.h)
      // Add unfilled star next to Cursor
      const starSize = 20
      const starRect = { x: r.x + r.w + 6, y: r.y + (r.h - starSize) / 2, w: starSize, h: starSize }
      const starCx = starRect.x + starRect.w / 2
      const starCy = starRect.y + starRect.h / 2
      this.drawStarIcon(starCx, starCy, false)
      this.hitTargets.addCursorStar(starRect.x, starRect.y, starRect.w, starRect.h)
    }
  }



  private willShowSpanControls(opts: { spanId?: string; showInlineControls?: boolean }): boolean {
    // For spans without IDs (implied spans), only show arrows when explicitly requested
    if (!opts.spanId) {
      return !!opts.showInlineControls
    }
    
    // For spans with IDs, show controls when focused, selected, or explicitly requested
    const isFocused = this.state.getViewFocus().mode === 'span' && this.state.getViewFocus().focusedSpanId === opts.spanId
    const isSelected = this.state.getSelectedSpanId() === opts.spanId
    return isFocused || isSelected || !!opts.showInlineControls
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
    lineWidth?: number
    glowColor?: string
    glowBlur?: number
    spanKeyRect?: { x: number; y: number; w: number; h: number }
    showInlineControls?: boolean
    startStar?: boolean
    visibleHint?: boolean
  }) {
    if(aTs === bTs) {
      return
    }
    const spanY = opts.y
    const xA = this.timeToPosition(aTs)
    const xB = this.timeToPosition(bTs)
    const leftX = Math.min(xA, xB)
    const rightX = Math.max(xA, xB)
    const aVisible = xA >= 0 && xA <= this.viewport.getScreenWidth()
    const bVisible = xB >= 0 && xB <= this.viewport.getScreenWidth()
    // If both endpoints are off-screen, skip drawing entirely
    // BUT if one is left and the other is right (spanning across), we still draw
    const spansScreen = leftX < 0 && rightX > this.viewport.getScreenWidth()
    if (!aVisible && !bVisible && !spansScreen) {
      return
    }

    const clampedLeft = Math.max(0, leftX)
    const clampedRight = Math.min(this.viewport.getScreenWidth(), rightX)

    this.ctx.save()
    this.ctx.strokeStyle = opts.color
    this.ctx.lineWidth = opts.lineWidth ?? 3
    if (opts.glowColor && opts.glowBlur && opts.glowBlur > 0) {
      this.ctx.shadowColor = opts.glowColor
      this.ctx.shadowBlur = opts.glowBlur
      this.ctx.shadowOffsetX = 0
      this.ctx.shadowOffsetY = 0
    }
    this.ctx.beginPath()
    this.ctx.moveTo(clampedLeft, spanY)
    this.ctx.lineTo(clampedRight, spanY)
    this.ctx.stroke()
    // (body selection hit-target will be pushed later to ensure label edits take precedence)
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
    const rightOffscreen = rightX > this.viewport.getScreenWidth()
    if (leftOffscreen) drawArrow(0, -1)
    if (rightOffscreen) drawArrow(this.viewport.getScreenWidth(), 1)

    const midX = (Math.max(0, Math.min(this.viewport.getScreenWidth(), xA)) + Math.max(0, Math.min(this.viewport.getScreenWidth(), xB))) / 2
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
    const starExtraSpace = opts.startStar ? 35 : 0 // Extra space for star icon
    const labelWidth = Math.max(
      this.measureTextWidth(font, labelText),
      opts.headerLabel ? this.measureTextWidth(headerFont, opts.headerLabel) : 0,
    ) + 16 + starExtraSpace
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
    // Favorite-now star at right side (inside box) when requested
    if (opts.startStar) {
      const starCx = labelX + labelWidth - 12
      const starCy = labelY + labelHeight / 2
      this.drawStarIcon(starCx, starCy, true)
    }

    // Editable label for saved spans
    if (opts.spanId) {
      this.hitTargets.addSpanLabel(opts.spanId, labelX, labelY, labelWidth, labelHeight)
      if (this.state.getEditingSpanId() === opts.spanId) {
        const initialText = (typeof opts.headerLabel === 'string' && opts.headerLabel.length > 0) ? opts.headerLabel : labelText
        this.overlayElements.push({ type: 'span-label', id: opts.spanId, rect: { x: labelX, y: labelY, w: labelWidth, h: labelHeight }, text: initialText, focused: true })
      }
    }

    // Special hit target for selected-cursor span time input
    if (opts.saveLabel === 'Selected to Cursor') {
      this.hitTargets.addSpanTimeInput(labelX, labelY, labelWidth, labelHeight, 'selected-cursor')
    }

    // Optional pin icon to save span
    if (opts.showPin) {
      const iconW = 24, iconH = 24
      const screenW = this.viewport.getScreenWidth()
      const midX = (Math.max(0, Math.min(screenW, this.timeToPosition(aTs))) + Math.max(0, Math.min(screenW, this.timeToPosition(bTs)))) / 2

      let iconX: number
      if (opts.endFocus?.kind === 'cursor' || opts.startFocus?.kind === 'cursor') {
        // Mirror cursor-now logic: pin goes opposite the cursor side of the label
        const cursorX = opts.endFocus?.kind === 'cursor' ? this.timeToPosition(bTs) : this.timeToPosition(aTs)
        const placeRight = cursorX < midX
        iconX = placeRight ? (labelX - 8 - iconW) : (labelX + labelWidth + 8)
        if (iconX < 0) iconX = labelX + labelWidth + 8
        if (iconX + iconW > screenW) iconX = labelX - 8 - iconW
      }  else {
        // Normal spans will have 2 arrows, so try to place consistently on left
        const iconPadding = 7
        const extraSpace = iconW + 2 * iconPadding // padding of 5, *2
        //Position on left
        iconX = labelX - iconW - extraSpace
        // If left is off-screen, place on right
        if (iconX < 0) iconX = labelX + labelWidth + extraSpace
      }

      const iconY = labelY + (labelHeight - iconH) / 2
      this.icons.drawPin(iconX, iconY, iconW, iconH)
      const spanData = opts.recordImplied ? 
        { aTs: opts.recordImplied.aTs, bTs: opts.recordImplied.bTs, label: opts.recordImplied.label } :
        (typeof opts.saveLabel === 'string' ? { aTs, bTs, label: opts.saveLabel } : undefined)
      
      this.hitTargets.addSpanPin(iconX, iconY, iconW, iconH, spanData)
      
      // Still set lastImpliedSpan for backwards compatibility
      if (spanData) {
        this.lastImpliedSpan = spanData
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
      this.hitTargets.addSaveNow(iconX, iconY, iconW, iconH)
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
      this.icons.drawArrow(rect.x, rect.y, rect.w, rect.h, side === 'left' ? 'left' : 'right')
      this.hitTargets.addSpanEndFocus(rect.x, rect.y, rect.w, rect.h, target.kind === 'now' ? 'now' : 'instant', target.id)
    }

    // Place arrows based on time order: left arrow → older endpoint, right arrow → newer endpoint
    const aIsOlder = aTs <= bTs
    const leftTarget = aIsOlder ? opts.startFocus : opts.endFocus
    const rightTarget = aIsOlder ? opts.endFocus : opts.startFocus
    
    // Use the same logic for determining if controls should be shown
    const shouldShowControls = this.willShowSpanControls(opts)
      
    if (shouldShowControls) {
      if (leftTarget) makeFocusArrow('left', leftTarget)
      if (rightTarget) makeFocusArrow('right', rightTarget)
    }
    
    // Show eye/trash controls only for actual spans with IDs
    if (opts.spanId && shouldShowControls) {
      const spVisibleForEyeHint = opts.visibleHint
      // Inline visibility toggle near the label (eye icon)
      const iconW = 20, iconH = 20
      const eyeX = labelX + (labelWidth - iconW) / 2
      const eyeY = labelY + labelHeight + 6
      this.icons.drawEye(eyeX, eyeY, iconW, iconH, { 
        crossed: typeof spVisibleForEyeHint !== 'undefined' && spVisibleForEyeHint === false 
      })
      this.hitTargets.addSpanVisible(opts.spanId, eyeX, eyeY, iconW, iconH)

      // Red trashcan delete button to the right of eye
      const delW = 20, delH = 20
      const delX = eyeX + iconW + 8
      const delY = eyeY
      this.icons.drawTrashcan(delX, delY, delW, delH)
      this.hitTargets.addSpanDelete(opts.spanId, delX, delY, delW, delH)
    }
    
    // Push body hit-target last so label double-click takes priority
    if (opts.spanId) {
      const bodyRect = { x: clampedLeft, y: spanY - 8, w: Math.max(12, clampedRight - clampedLeft), h: 16 }
      this.hitTargets.addSpanBody(opts.spanId, bodyRect.x, bodyRect.y, bodyRect.w, bodyRect.h)
    }

    this.ctx.restore()
  }

  // removed legacy implied draw method after refactor

  private drawStarIcon(cx: number, cy: number, filled: boolean) {
    this.icons.drawStar(cx, cy, 8, filled, { fillColor: '#facc15', strokeColor: '#facc15' })
  }

  // removed unused drawCursorTrashIcon

  // Public getters for state variables
  public getScreenWidth(): number {
    return this.viewport.getScreenWidth()
  }

  public getTimeWidth(): number {
    return this.state.getTimeWidth()
  }

  public getTimeCenter(): number {
    return this.state.getTimeCenter()
  }

  public getTimeStart(): number {
    return this.viewport.getTimeStart()
  }

  public getTimeEnd(): number {
    return this.viewport.getTimeEnd()
  }

  // Public helper functions
  public timeToPosition(instant: number): number {
    return this.viewport.timeToPosition(instant)
  }

  // Decide whether a span should be drawn on the canvas based on current viewport
  private shouldDrawSpan(aTs: number, bTs: number): boolean {
    if (aTs === bTs) return false
    const xA = this.timeToPosition(aTs)
    const xB = this.timeToPosition(bTs)
    const leftX = Math.min(xA, xB)
    const rightX = Math.max(xA, xB)
    const aVisible = xA >= 0 && xA <= this.viewport.getScreenWidth()
    const bVisible = xB >= 0 && xB <= this.viewport.getScreenWidth()
    const spansScreen = leftX < 0 && rightX > this.viewport.getScreenWidth()
    return aVisible || bVisible || spansScreen
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
    const progress = x / this.viewport.getScreenWidth()
    return this.viewport.getTimeStart() + (progress * (this.viewport.getTimeEnd() - this.viewport.getTimeStart()))
  }

  // Interaction hooks to be called by component
  public handleClick(x: number, y: number) {
    // Find hit target at click position
    const target = this.hitTargets.findTargetAt(x, y)
    if (target) {
      if (target.type === 'save-now') {
        // If this came from the span arrow button, treat as focus-now
        if (this.state.getViewFocus().mode !== 'now') {
          this.setViewFocus('now')
          return
        }
        this.createInstantAt(Date.now(), '')
        // focus remains unchanged
        return
      }
      if (target.type === 'span-pin') {
        const imp = target.spanData ?? this.lastImpliedSpan ?? undefined
        if (imp) {
          // Ensure endpoints are saved instants (create instant at Now explicitly)
          const ensureInstant = (ts: number): string => {
              const found = this.savedStore.getSnapshot().find(i => i.tsEpochMs === ts)
              if (found) return found.id
              return this.createInstantAt(ts, '')
            }
            const aId = ensureInstant(imp.aTs)
            const bId = ensureInstant(imp.bTs)
            // Create span with blank label and set visible true
            const newId = this.spansStore.create(aId, bId, '', { visible: true, endIsNow: false })
            // Focus newly created span
            this.setViewFocus('span', undefined, newId)
          }
          return
        }
        if (target.type === 'save-cursor') {
          const newId = this.createInstantAt(this.state.getTimeCenter(), '')
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
        if (target.type === 'span-delete' && target.id) {
          this.deleteSpan(target.id)
          return
        }
        if (target.type === 'span-body' && target.id) {
          // Select a saved span (no zoom/pan)
          this.state.setSelectedSpan(target.id)
          return
          }
        if (target.type === 'span-visible' && target.id) {
          // Toggle visibility of saved span
          const sp = this.spansStore.getSnapshot().find(s => s.id === target.id)
          if (sp) this.setSpanVisible(sp.id, !sp.visible)
          return
        }
        if (target.type === 'cursor-star') {
          const newId = this.createInstantAt(this.state.getTimeCenter(), '')
          this.savedStore.setFavorite(newId, true)
          this.setViewFocus('instant', newId)
          this.state.setEditingInstant(newId)
          return
        }
        if (target.type === 'now-star') {
          const nowTs = Date.now()
          const newId = this.createInstantAt(nowTs, '')
          this.savedStore.setFavorite(newId, true)
          this.setViewFocus('instant', newId)
          this.state.setTimeCenter(nowTs)
          this.state.setEditingInstant(newId)
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
            const isFocused = this.state.getViewFocus().mode === 'instant' && this.state.getViewFocus().focusedInstantId === id
            const ts = this.savedStore.getSnapshot().find(si => si.id === id)?.tsEpochMs
            this.deleteInstant(id)
            if (isFocused) {
              if (typeof ts === 'number') {
                this.setViewFocus('cursor')
                this.startZoomPanAnimation(ts, this.state.getTimeWidth())
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
        if (target.type === 'span-label' && target.id) {
          const sp = this.spansStore.getSnapshot().find(s => s.id === target.id)
          if (sp) {
            const isFocused = this.state.getViewFocus().mode === 'span' && this.state.getViewFocus().focusedSpanId === target.id
            if (isFocused) {
              // Already focused → enter rename
              this.state.setEditingSpan(target.id)
              return
            }
            // Not focused → focus and zoom-to-fit
            const a = this.savedStore.getSnapshot().find(i => i.id === sp.startInstantId)?.tsEpochMs
            const b = sp.endIsNow ? Date.now() : this.savedStore.getSnapshot().find(i => i.id === sp.endInstantId)?.tsEpochMs
            if (typeof a === 'number' && typeof b === 'number') {
              this.setViewFocus('span', undefined, sp.id)
              this.adjustZoomToRange(a, b)
              return
            }
          }
          return
        }
        if (target.type === 'span-time-input' && target.id) {
          console.log('span-time-input hit target found:', target.id)
          // Handle time input for special spans (cursor-now, selected-cursor)
          if (target.id === 'cursor-now') {
            console.log('Dispatching cursor-now span-time-input event')
            // Emit event for cursor-now span time input
            this.canvas.dispatchEvent(new CustomEvent('span-time-input', {
              detail: {
                type: 'cursor-now',
                position: { x: target.rect.x + target.rect.w / 2, y: target.rect.y }
              }
            }))
            return
          }
          if (target.id === 'selected-cursor') {
            console.log('Dispatching selected-cursor span-time-input event')
            // Emit event for selected-cursor span time input
            this.canvas.dispatchEvent(new CustomEvent('span-time-input', {
              detail: {
                type: 'selected-cursor',
                position: { x: target.rect.x + target.rect.w / 2, y: target.rect.y }
              }
            }))
            return
          }
          return
        }
        if (target.type === 'instant-time') {
          if (target.id) {
            this.setSelectedInstant(target.id)
          }
          return
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

  }

  public setSpanVisible(spanId: string, value: boolean) {
    this.spansStore.setVisible(spanId, value)
  }

  public setImpliedVisibility(which: 'selected-now'|'selected-prev', value: boolean) {
    this.state.setImpliedVisibility(which, value)
  }

  public handleDoubleClick(x: number, y: number) {
    console.log('handleDoubleClick called at:', x, y)
    const target = this.hitTargets.findTargetAt(x, y)
    console.log('Hit target found:', target)
    if (target) {
      if (target.type === 'span-label' && target.id) {
        const sp = this.spansStore.getSnapshot().find(s => s.id === target.id)
        if (sp) {
          const isFocused = this.state.getViewFocus().mode === 'span' && this.state.getViewFocus().focusedSpanId === target.id
          if (isFocused) {
            // Already focused → enter rename
            this.state.setEditingSpan(target.id)
            return
          }
          // Not focused → focus and zoom-to-fit
          const a = this.savedStore.getSnapshot().find(i => i.id === sp.startInstantId)?.tsEpochMs
          const b = sp.endIsNow ? Date.now() : this.savedStore.getSnapshot().find(i => i.id === sp.endInstantId)?.tsEpochMs
          if (typeof a === 'number' && typeof b === 'number') {
            this.setViewFocus('span', undefined, sp.id)
            this.adjustZoomToRange(a, b)
            return
          }
        }
        return
      }
      if (target.type === 'span-body' && target.id) {
        // Focus span and zoom-to-fit
        const sp = this.spansStore.getSnapshot().find(s => s.id === target.id)
        if (sp) {
          const a = this.savedStore.getSnapshot().find(i => i.id === sp.startInstantId)?.tsEpochMs
          const b = sp.endIsNow ? Date.now() : this.savedStore.getSnapshot().find(i => i.id === sp.endInstantId)?.tsEpochMs
          if (typeof a === 'number' && typeof b === 'number') {
            this.setViewFocus('span', undefined, sp.id)
            this.adjustZoomToRange(a, b)
          }
        }
        return
      }
      if (target.type === 'span-label' && target.id) {
        const sp = this.spansStore.getSnapshot().find(s => s.id === target.id)
        if (sp) {
          const isFocused = this.state.getViewFocus().mode === 'span' && this.state.getViewFocus().focusedSpanId === target.id
          if (isFocused) {
            // Already focused → enter rename
            this.state.setEditingSpan(target.id)
            return
          }
          // Not focused → focus and zoom-to-fit
          const a = this.savedStore.getSnapshot().find(i => i.id === sp.startInstantId)?.tsEpochMs
          const b = sp.endIsNow ? Date.now() : this.savedStore.getSnapshot().find(i => i.id === sp.endInstantId)?.tsEpochMs
          if (typeof a === 'number' && typeof b === 'number') {
            this.setViewFocus('span', undefined, sp.id)
            this.adjustZoomToRange(a, b)
            return
          }
        }
        return
      }
      if (target.type === 'span-time-input' && target.id) {
        console.log('span-time-input hit target found:', target.id)
        // Handle time input for special spans (cursor-now, selected-cursor)
        if (target.id === 'cursor-now') {
          console.log('Dispatching cursor-now span-time-input event')
          // Emit event for cursor-now span time input
          this.canvas.dispatchEvent(new CustomEvent('span-time-input', {
            detail: {
              type: 'cursor-now',
              position: { x: target.rect.x + target.rect.w / 2, y: target.rect.y }
            }
          }))
          return
        }
        if (target.id === 'selected-cursor') {
          console.log('Dispatching selected-cursor span-time-input event')
          // Emit event for selected-cursor span time input
          this.canvas.dispatchEvent(new CustomEvent('span-time-input', {
            detail: {
              type: 'selected-cursor',
              position: { x: target.rect.x + target.rect.w / 2, y: target.rect.y }
            }
          }))
          return
        }
        return
      }
      if (target.type === 'instant-time') {
        if (target.id === 'now') {
          // Open time input for NOW → move cursor forward to typed time (today, future-only)
          const r = this.computeTimeBoxRect(Date.now())
          this.canvas.dispatchEvent(new CustomEvent('instant-time-input', {
            detail: {
              type: 'now',
              position: { x: r.x + r.w / 2, y: r.y },
              initial: new Date().toLocaleTimeString([], { hour12: false })
            }
          }))
        } else if (target.id === 'cursor') {
          const r = this.computeTimeBoxRect(this.state.getTimeCenter())
          const current = new Date()
          const hh = current.getHours().toString().padStart(2, '0')
          const mm = current.getMinutes().toString().padStart(2, '0')
          const ss = current.getSeconds().toString().padStart(2, '0')
          this.canvas.dispatchEvent(new CustomEvent('instant-time-input', {
            detail: {
              type: 'cursor',
              position: { x: r.x + r.w / 2, y: r.y },
              initial: `${hh}:${mm}:${ss}`
            }
          }))
        } else if (target.id) {
          const ts = this.savedStore.getSnapshot().find(si => si.id === target.id)?.tsEpochMs
          if (typeof ts === 'number') {
            this.focusInstantAnimated(target.id, ts)
          }
        } else {
          this.focusNowAnimated()
        }
        return
      }
      if (target.type === 'instant-label' && target.id) {
        const inst = this.savedStore.getSnapshot().find(si => si.id === target.id)
        if (inst) {
          this.state.setEditingInstant(target.id)
        }
        return
      }
      if (target.type === 'cursor-label') {
        const newId = this.createInstantAt(this.state.getTimeCenter(), '')
        if (newId) {
          this.setViewFocus('instant', newId)
          this.state.setEditingInstant(newId)
        }
        return
      }
      if (target.type === 'now-label') {
        const nowTs = Date.now()
        const newId = this.createInstantAt(nowTs, '')
        if (newId) {
          this.setViewFocus('instant', newId)
          this.state.setTimeCenter(nowTs)
          this.state.setEditingInstant(newId)
        }
        return
      }
      if (target.type === 'cursor-star') {
        const newId = this.createInstantAt(this.state.getTimeCenter(), '')
        if (newId) {
          this.savedStore.setFavorite(newId, true)
          this.setViewFocus('instant', newId)
          this.state.setEditingInstant(newId)
        }
        return
      }
             if (target.type === 'now-star') {
         const nowTs = Date.now()
         const newId = this.createInstantAt(nowTs, '')
         if (newId) {
           this.savedStore.setFavorite(newId, true)
           this.setViewFocus('instant', newId)
           this.state.setTimeCenter(nowTs)
           this.state.setEditingInstant(newId)
         }
         return
       }
       if (target.type === 'span-time-input' && target.id) {
         // Handle time input for special spans (cursor-now, selected-cursor)
         if (target.id === 'cursor-now') {
           // Emit event for cursor-now span time input
           this.canvas.dispatchEvent(new CustomEvent('span-time-input', {
             detail: {
               type: 'cursor-now',
               position: { x: target.rect.x + target.rect.w / 2, y: target.rect.y }
             }
           }))
           return
         }
         if (target.id === 'selected-cursor') {
           // Emit event for selected-cursor span time input
           this.canvas.dispatchEvent(new CustomEvent('span-time-input', {
             detail: {
               type: 'selected-cursor',
               position: { x: target.rect.x + target.rect.w / 2, y: target.rect.y }
             }
           }))
           return
         }
         return
       }
     }
   }

  private measureTextWidth(font: string, text: string): number {
    return this.shapes.measureText(text, font).width
  }

  private drawTrashIconAt(ts: number, id: string) {
    const centerY = this.TimelineCenterY()
    const x = this.timeToPosition(ts)
    const boxW = 28
    const boxH = 28
    const y = centerY + 120
    this.icons.drawTrashcan(x - boxW / 2, y, boxW, boxH)
    this.hitTargets.addInstantTrash(id, x - boxW / 2, y, boxW, boxH)
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
    this.animations.applyZoomFactor(factor, true)
  }



  // time formatting helpers moved to src/utils/timeFormat.ts

  private drawCursorNowSpan() {
    const now = Date.now()
    // Use focused instant when focus is on an instant; otherwise use cursor/timeCenter
    let sourceTs = this.state.getTimeCenter()
    if (this.state.getViewFocus().mode === 'instant' && this.state.getViewFocus().focusedInstantId) {
      const s = this.savedStore.getSnapshot().find(si => si.id === this.state.getViewFocus().focusedInstantId)
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
    const rightVisible = rightX <= this.viewport.getScreenWidth()
    const clampedLeft = Math.max(0, leftX)
    const clampedRight = Math.min(this.viewport.getScreenWidth(), rightX)

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
    if (!rightVisible) drawArrow(this.viewport.getScreenWidth(), 1)

    // Label at midpoint of visible segment
    const midX = (Math.max(0, Math.min(this.viewport.getScreenWidth(), xNow)) + Math.max(0, Math.min(this.viewport.getScreenWidth(), xSource))) / 2
    const sign = diffMsSigned >= 0 ? '+' : '-'
    const label = `${sign}${this.formatDurationHMS(Math.abs(diffMsSigned))}`
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

    // Add hit target for time input on the label
    this.hitTargets.addSpanTimeInput(labelX, labelY, labelWidth, labelHeight, 'cursor-now')

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
    this.hitTargets.addSaveNow(iconX, iconY, iconW, iconH)

    // Pin icon to save span (source ↔ now) placed opposite the arrow side
    const pinW = 24, pinH = 24
    let pinX = (placeRight ? (labelX - 8 - pinW) : (labelX + labelWidth + 8))
    if (pinX < 0) pinX = labelX + labelWidth + 8
    if (pinX + pinW > this.viewport.getScreenWidth()) pinX = labelX - 8 - pinW
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
    const spanData = { aTs: sourceTs, bTs: now, label: 'To Now' }
    this.hitTargets.addSpanPin(pinX, pinY, pinW, pinH, spanData)
    this.lastImpliedSpan = spanData
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
    // When focusing a span, clear any selected instant and previous
    if (mode === 'span') {
      this.state.setSelectedInstant(null)
    }
    
    this.state.setViewFocus(mode, instantId, spanId)
    this.persistState()
  }

  private getPrevFocusedInstantId(): string | null {
    return this.state.getPrevFocusedInstantId()
  }

  public navigateFocusHistory(delta: -1 | 1) {
    this.state.navigateFocusHistory(delta)
  }

  // Select an instant without changing focus mode
  private setSelectedInstant(instantId: string) {
    if (this.state.getCurrentSelectedInstantId() && this.state.getCurrentSelectedInstantId() !== instantId) {
      // Previous selection is handled automatically in TimelineState
    }
    this.state.setSelectedInstant(instantId)
    // Do not change viewFocusMode or focusedInstantId here
    this.persistState()
  }

  public getViewFocus(): { mode: 'now' | 'cursor' | 'instant' | 'span'; focusedInstantId: string | null; focusedSpanId?: string | null } {
    return this.state.getViewFocus()
  }

  public panByPixels(deltaX: number) {
    this.cancelZoomPanAnimation()
    const msPerPx = this.state.getTimeWidth() / Math.max(1, this.viewport.getScreenWidth())
    // Drag right should move timeline with the finger: shift center earlier
    this.state.setTimeCenter(this.state.getTimeCenter() - deltaX * msPerPx)
    this.persistState()
  }

  public snapToNowIfClose(tolerancePx: number): boolean {
    const xNow = this.timeToPosition(Date.now())
    const xCenter = this.viewport.getScreenWidth() / 2
    if (Math.abs(xNow - xCenter) <= tolerancePx) {
      this.setViewFocus('now')
      return true
    }
    return false
  }

  public snapToInstantIfClose(tolerancePx: number): boolean {
    const xCenter = this.viewport.getScreenWidth() / 2
    let best: { id: string; dist: number } | null = null
    for (const s of this.savedStore.getSnapshot()) {
      const x = this.timeToPosition(s.tsEpochMs)
      const d = Math.abs(x - xCenter)
      if (d <= tolerancePx && (!best || d < best.dist)) best = { id: s.id, dist: d }
    }
    if (best) {
      this.setViewFocus('instant', best.id)
      this.state.setTimeCenter(this.savedStore.getSnapshot().find(si => si.id === best!.id)!.tsEpochMs)
      return true
    }
    return false
  }

  public setTimeWidth(widthMs: number) {
    this.state.setTimeWidth(Math.max(1000, widthMs)) // Minimum 1 second
  }

  public setTimeCenter(centerMs: number) {
    this.animations.cancelZoomPanAnimation()
    this.state.setTimeCenter(centerMs)
  }

  // Time increment management
  public getTimeIncrementMs(): number {
    return this.state.getTimeIncrementMs()
  }

  public getTimeIncrementLabel(): string {
    return this.state.getTimeIncrementLabel()
  }

  public getTimeIncrement(): import('./core/TimelineState').TimeIncrement {
    return this.state.getTimeIncrement()
  }

  public setTimeIncrement(increment: import('./core/TimelineState').TimeIncrement): void {
    this.state.setTimeIncrement(increment)
  }

  public getCurrentSelectedInstantId(): string | null {
    return this.state.getCurrentSelectedInstantId()
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
    this.startZoomPanAnimation(targetTs, this.state.getTimeWidth())
  }

  private startZoomPanAnimation(targetCenter: number, targetWidth: number, durationMs = 350): void {
    this.animations.startZoomPanAnimation(targetCenter, targetWidth, durationMs)
  }

  public focusNowAnimated(): void {
    this.setViewFocus('now')
    this.animations.animateToNow()
  }

  private cancelZoomPanAnimation(): void {
    this.animations.cancelZoomPanAnimation()
  }

  // Adjust zoom so a time range [aTs, bTs] fits with margins or is enlarged when too close
  public adjustZoomToRange(aTs: number, bTs: number): void {
    const early = Math.min(aTs, bTs)
    const late = Math.max(aTs, bTs)
    const xEarly = this.timeToPosition(early)
    const xLate = this.timeToPosition(late)
    const offscreen = (xEarly < 0) || (xLate > this.viewport.getScreenWidth())
    if (offscreen) {
      const desiredTimeWidth = (late - early) / 0.8 // leave 10% margins on each side
      this.startZoomPanAnimation((early + late) / 2, desiredTimeWidth)
      return
    }
    const distancePx = Math.max(0, xLate - xEarly)
    if (distancePx < 0.2 * this.viewport.getScreenWidth()) {
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
    if (this.state.getViewFocus().focusedInstantId === id) this.state.getViewFocus().focusedInstantId = null
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
    this.state.setEditingInstant(null)
  }

  public updateSpanLabel(id: string, newLabel: string) {
    this.spansStore.updateLabel(id, newLabel)
    this.persistState()
    this.state.setEditingSpan(null)
  }

  public deleteSpan(id: string) {
    if (this.state.getViewFocus().focusedSpanId === id) this.state.getViewFocus().focusedSpanId = null
    this.spansStore.delete(id)

    this.persistState()
  }

  public endEditing() {
    this.state.setEditingInstant(null)
    this.state.setEditingSpan(null)
  }

  // Public read APIs for HTML list
  public getSavedInstantsSnapshot(): SavedInstantCompat[] {
    return this.savedStore.getSnapshot().map(s => ({ id: s.id, ts: s.tsEpochMs, label: s.label }))
  }

  public getCenterTimestamp(): number {
    if (this.state.getViewFocus().mode === 'now') return Date.now()
    if (this.state.getViewFocus().mode === 'cursor') return this.state.getTimeCenter()
    if (this.state.getViewFocus().mode === 'instant') {
      const s = this.savedStore.getSnapshot().find(si => si.id === this.state.getViewFocus().focusedInstantId)
      return s ? s.tsEpochMs : Date.now()
    }
    if (this.state.getViewFocus().mode === 'span') {
      const sp = this.state.getViewFocus().focusedSpanId ? this.spansStore.getSnapshot().find(s => s.id === this.state.getViewFocus().focusedSpanId) : null
      if (sp) {
        const a = this.savedStore.getSnapshot().find(i => i.id === sp.startInstantId)?.tsEpochMs
        const b = this.savedStore.getSnapshot().find(i => i.id === sp.endInstantId)?.tsEpochMs
        if (typeof a === 'number' && typeof b === 'number') return (a + b) / 2
      }
      return this.state.getTimeCenter()
    }
    return Date.now()
  }

  public getStateVersion(): number {
    return this.state.getStateVersion()
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
    if (this.state.getCurrentSelectedInstantId()) {
      const selectedId = this.state.getCurrentSelectedInstantId()
      const a = selectedId ? savedMap.get(selectedId) : undefined
      if (a) {
        const now = Date.now()
        spans.push({ kind: 'implied', label: 'Selected to Now', start: { id: a.id, name: a.label || '?', tsEpochMs: a.tsEpochMs }, end: { name: 'Now', tsEpochMs: now }, durationMs: now - a.tsEpochMs, visible: this.state.getImpliedVisibility('selected-now') })
      }
    }
    // Removed: favorites implied spans are now saved spans managed by spans store
    // Implied: selected → previously focused
    if (this.state.getCurrentSelectedInstantId()) {
      const prevId = this.getPrevFocusedInstantId()
      const a = prevId ? savedMap.get(prevId) : undefined
      const selectedId = this.state.getCurrentSelectedInstantId()
      const b = selectedId ? savedMap.get(selectedId) : undefined
      if (a && b) {
        spans.push({ kind: 'implied', label: 'Selected to Previous', start: { id: a.id, name: a.label || '?', tsEpochMs: a.tsEpochMs }, end: { id: b.id, name: b.label || '?', tsEpochMs: b.tsEpochMs }, durationMs: b.tsEpochMs - a.tsEpochMs, visible: this.state.getImpliedVisibility('selected-prev') })
      }
    }
    // Sort by midpoint time
    spans.sort((x, y) => ((x.start.tsEpochMs + x.end.tsEpochMs) / 2) - ((y.start.tsEpochMs + y.end.tsEpochMs) / 2))
    return spans
  }
}
