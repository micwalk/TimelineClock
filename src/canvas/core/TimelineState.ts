import type { SavedInstantsStore } from '../../services/SavedInstantsStore'
import type { SavedSpansStore } from '../../services/SavedSpansStore'

export type ViewFocusMode = 'now' | 'cursor' | 'instant' | 'span'

export interface TimelineStateSnapshot {
  timeWidth: number
  timeCenter: number
  viewFocusMode: ViewFocusMode
  focusedInstantId: string | null
  focusedSpanId: string | null
  currentSelectedInstantId: string | null
  previousSelectedInstantId: string | null
  focusHistory: string[]
  focusHistoryIndex: number
  selectedSpanId: string | null
  showImpliedSelectedNow: boolean
  showImpliedSelectedPrev: boolean
}

/**
 * Manages all timeline state including focus, selection, and view modes
 */
export class TimelineState {
  // Core timeline state
  private timeWidth: number = 6 * 60 * 60 * 1000 // 6 hours in milliseconds
  private timeCenter: number = Date.now() // Center of timeline as instant
  
  // View behavior
  private viewFocusMode: ViewFocusMode = 'now'
  private focusedInstantId: string | null = null
  private focusedSpanId: string | null = null
  private currentSelectedInstantId: string | null = null
  private previousSelectedInstantId: string | null = null
  
  // Focus history management
  private focusHistory: string[] = []
  private focusHistoryIndex: number = -1
  private suppressHistoryPush: boolean = false
  
  // Selection state
  private selectedSpanId: string | null = null
  
  // Visibility toggles for implied spans
  private showImpliedSelectedNow: boolean = true
  private showImpliedSelectedPrev: boolean = true
  
  // Editing state
  private editingInstantId: string | null = null
  private editingSpanId: string | null = null
  
  // State version for change tracking
  private stateVersion: number = 0
  
  private savedStore: SavedInstantsStore
  private spansStore: SavedSpansStore
  
  constructor(
    savedStore: SavedInstantsStore,
    spansStore: SavedSpansStore
  ) {
    this.savedStore = savedStore
    this.spansStore = spansStore
    
    // Subscribe to store changes to increment state version
    this.savedStore.subscribe(() => { this.stateVersion++ })
    this.spansStore.subscribe(() => { this.stateVersion++ })
  }
  
  // === View Focus Management ===
  
  public setViewFocus(mode: ViewFocusMode, instantId?: string, spanId?: string): void {
    if (mode === 'instant') {
      if (this.currentSelectedInstantId && instantId && this.currentSelectedInstantId !== instantId) {
        this.previousSelectedInstantId = this.currentSelectedInstantId
      }
      this.currentSelectedInstantId = instantId ?? null
    }
    
    // Handle focus history for instant transitions
    const prevMode = this.viewFocusMode
    const leavingInstantToCursor = (prevMode === 'instant' && mode === 'cursor' && this.focusedInstantId)
    
    this.viewFocusMode = mode
    this.focusedInstantId = instantId ?? null
    this.focusedSpanId = spanId ?? null
    
    // Update focus history
    if (leavingInstantToCursor && !this.suppressHistoryPush) {
      this.pushToFocusHistory(this.focusedInstantId!)
    }
    
    this.stateVersion++
  }
  
  public getViewFocus(): { mode: ViewFocusMode; focusedInstantId: string | null; focusedSpanId?: string | null } {
    return {
      mode: this.viewFocusMode,
      focusedInstantId: this.focusedInstantId,
      focusedSpanId: this.focusedSpanId
    }
  }
  
  // === Focus History Management ===
  
  private pushToFocusHistory(instantId: string): void {
    if (this.suppressHistoryPush) return
    
    // Remove any existing occurrence
    const existingIndex = this.focusHistory.indexOf(instantId)
    if (existingIndex !== -1) {
      this.focusHistory.splice(existingIndex, 1)
    }
    
    // Add to end
    this.focusHistory.push(instantId)
    
    // Limit history size
    if (this.focusHistory.length > 20) {
      this.focusHistory.shift()
    }
    
    this.focusHistoryIndex = this.focusHistory.length - 1
  }
  
  public navigateFocusHistory(delta: -1 | 1): boolean {
    const newIndex = this.focusHistoryIndex + delta
    if (newIndex < 0 || newIndex >= this.focusHistory.length) {
      return false
    }
    
    this.focusHistoryIndex = newIndex
    const targetId = this.focusHistory[newIndex]
    const targetInstant = this.savedStore.getSnapshot().find(i => i.id === targetId)
    
    if (targetInstant) {
      this.suppressHistoryPush = true
      this.setViewFocus('instant', targetId)
      this.timeCenter = targetInstant.tsEpochMs
      this.suppressHistoryPush = false
      return true
    }
    
    return false
  }
  
  public getPrevFocusedInstantId(): string | null {
    if (this.focusHistory.length === 0) return null
    const currentId = this.focusedInstantId
    for (let i = this.focusHistory.length - 1; i >= 0; i--) {
      const id = this.focusHistory[i]
      if (id !== currentId) return id
    }
    return null
  }
  
  // === Selection Management ===
  
  public setSelectedInstant(instantId: string): void {
    if (this.currentSelectedInstantId !== instantId) {
      this.previousSelectedInstantId = this.currentSelectedInstantId
    }
    this.currentSelectedInstantId = instantId
    this.stateVersion++
  }
  
  public setSelectedSpan(spanId: string | null): void {
    this.selectedSpanId = spanId
    this.stateVersion++
  }
  
  // === Time/Zoom State ===
  
  public getTimeWidth(): number {
    return this.timeWidth
  }
  
  public setTimeWidth(width: number): void {
    this.timeWidth = Math.max(1000, width) // Minimum 1 second
    this.stateVersion++
  }
  
  public getTimeCenter(): number {
    return this.timeCenter
  }
  
  public setTimeCenter(center: number): void {
    this.timeCenter = center
    this.stateVersion++
  }
  
  // === Implied Span Visibility ===
  
  public setImpliedVisibility(which: 'selected-now' | 'selected-prev', value: boolean): void {
    if (which === 'selected-now') {
      this.showImpliedSelectedNow = value
    } else {
      this.showImpliedSelectedPrev = value
    }
    this.stateVersion++
  }
  
  public getImpliedVisibility(which: 'selected-now' | 'selected-prev'): boolean {
    return which === 'selected-now' ? this.showImpliedSelectedNow : this.showImpliedSelectedPrev
  }
  
  // === Editing State ===
  
  public setEditingInstant(id: string | null): void {
    this.editingInstantId = id
    this.stateVersion++
  }
  
  public setEditingSpan(id: string | null): void {
    this.editingSpanId = id
    this.stateVersion++
  }
  
  public getEditingInstantId(): string | null {
    return this.editingInstantId
  }
  
  public getEditingSpanId(): string | null {
    return this.editingSpanId
  }
  
  public endEditing(): void {
    this.editingInstantId = null
    this.editingSpanId = null
    this.stateVersion++
  }
  
  // === State Access ===
  
  public getStateVersion(): number {
    return this.stateVersion
  }
  
  public getCurrentSelectedInstantId(): string | null {
    return this.currentSelectedInstantId
  }
  
  public getPreviousSelectedInstantId(): string | null {
    return this.previousSelectedInstantId
  }
  
  public getSelectedSpanId(): string | null {
    return this.selectedSpanId
  }
  
  // === State Persistence ===
  
  public getSnapshot(): TimelineStateSnapshot {
    return {
      timeWidth: this.timeWidth,
      timeCenter: this.timeCenter,
      viewFocusMode: this.viewFocusMode,
      focusedInstantId: this.focusedInstantId,
      focusedSpanId: this.focusedSpanId,
      currentSelectedInstantId: this.currentSelectedInstantId,
      previousSelectedInstantId: this.previousSelectedInstantId,
      focusHistory: [...this.focusHistory],
      focusHistoryIndex: this.focusHistoryIndex,
      selectedSpanId: this.selectedSpanId,
      showImpliedSelectedNow: this.showImpliedSelectedNow,
      showImpliedSelectedPrev: this.showImpliedSelectedPrev
    }
  }
  
  public loadSnapshot(snapshot: Partial<TimelineStateSnapshot>): void {
    if (snapshot.timeWidth !== undefined) this.timeWidth = snapshot.timeWidth
    if (snapshot.timeCenter !== undefined) this.timeCenter = snapshot.timeCenter
    if (snapshot.viewFocusMode !== undefined) this.viewFocusMode = snapshot.viewFocusMode
    if (snapshot.focusedInstantId !== undefined) this.focusedInstantId = snapshot.focusedInstantId
    if (snapshot.focusedSpanId !== undefined) this.focusedSpanId = snapshot.focusedSpanId
    if (snapshot.currentSelectedInstantId !== undefined) this.currentSelectedInstantId = snapshot.currentSelectedInstantId
    if (snapshot.previousSelectedInstantId !== undefined) this.previousSelectedInstantId = snapshot.previousSelectedInstantId
    if (snapshot.focusHistory !== undefined) this.focusHistory = [...snapshot.focusHistory]
    if (snapshot.focusHistoryIndex !== undefined) this.focusHistoryIndex = snapshot.focusHistoryIndex
    if (snapshot.selectedSpanId !== undefined) this.selectedSpanId = snapshot.selectedSpanId
    if (snapshot.showImpliedSelectedNow !== undefined) this.showImpliedSelectedNow = snapshot.showImpliedSelectedNow
    if (snapshot.showImpliedSelectedPrev !== undefined) this.showImpliedSelectedPrev = snapshot.showImpliedSelectedPrev
    
    this.stateVersion++
  }
}
