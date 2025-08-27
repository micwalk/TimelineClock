import type { SavedInstantsStore } from '../../services/SavedInstantsStore'
import type { SavedSpansStore } from '../../services/SavedSpansStore'
import type { Option } from '../../utils/option'
import { none, toStringOrNull, fromStringOrNull } from '../../utils/option'
import { AlarmAudioManager } from '../../services/AlarmAudioManager'

export type ViewFocusMode = 'now' | 'cursor' | 'instant' | 'span'

export type TimeIncrement = 
  | '1s' | '5s' | '30s' 
  | '1m' | '5m' | '15m' | '30m' 
  | '1h' | '2h' | '6h' | '24h'

export interface TimeIncrementOption {
  value: TimeIncrement
  label: string
  milliseconds: number
}

export const TIME_INCREMENT_OPTIONS: TimeIncrementOption[] = [
  { value: '1s', label: '1 second', milliseconds: 1000 },
  { value: '5s', label: '5 seconds', milliseconds: 5 * 1000 },
  { value: '30s', label: '30 seconds', milliseconds: 30 * 1000 },
  { value: '1m', label: '1 minute', milliseconds: 60 * 1000 },
  { value: '5m', label: '5 minutes', milliseconds: 5 * 60 * 1000 },
  { value: '15m', label: '15 minutes', milliseconds: 15 * 60 * 1000 },
  { value: '30m', label: '30 minutes', milliseconds: 30 * 60 * 1000 },
  { value: '1h', label: '1 hour', milliseconds: 60 * 60 * 1000 },
  { value: '2h', label: '2 hours', milliseconds: 2 * 60 * 60 * 1000 },
  { value: '6h', label: '6 hours', milliseconds: 6 * 60 * 60 * 1000 },
  { value: '24h', label: '24 hours', milliseconds: 24 * 60 * 60 * 1000 }
]

// New: Alarm state interfaces
export interface RingingAlarm {
  instantId: string
  label: string
  tsEpochMs: number
  triggeredAt: number
}

export interface TimelineStateSnapshot {
  timeWidth: number
  timeCenter: number
  viewFocusMode: ViewFocusMode
  focusedInstantId: string | null
  focusedSpanId: string | null
  currentSelectedInstantId: string | null
  secondarySelectedInstantId: string | null
  focusHistory: string[]
  focusHistoryIndex: number
  selectedSpanId: string | null
  showImpliedSelectedNow: boolean
  showImpliedSelectedPrev: boolean
  timeIncrement: TimeIncrement
  ringingAlarms: RingingAlarm[] // New: track currently ringing alarms
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
  private focusedInstantId: Option<string> = none
  private focusedSpanId: Option<string> = none
  private currentSelectedInstantId: Option<string> = none
  private secondarySelectedInstantId: Option<string> = none
  
  // Focus history management
  private focusHistory: string[] = []
  private focusHistoryIndex: number = -1
  private suppressHistoryPush: boolean = false
  
  // Selection state
  private selectedSpanId: Option<string> = none
  
  // Visibility toggles for implied spans
  private showImpliedSelectedNow: boolean = true
  private showImpliedSelectedPrev: boolean = true
  
  // Editing state
  private editingInstantId: Option<string> = none
  private editingSpanId: Option<string> = none
  
  // Time increment state
  private timeIncrement: TimeIncrement = '30m'
  
  // New: Alarm state management with dynamic scheduling
  private ringingAlarms: RingingAlarm[] = []
  private nextAlarmCheckTime: number = 0
  private alarmCheckTimeoutId: number | null = null
  private readonly minCheckInterval: number = 100 // Minimum 100ms between checks for precision
  
  // New: Sound management
  private alarmAudioManager: AlarmAudioManager
  
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
    this.alarmAudioManager = new AlarmAudioManager()
    
    // Subscribe to store changes to increment state version and reschedule checks
    this.savedStore.subscribe(() => { 
      this.stateVersion++
      this.scheduleNextAlarmCheck()
    })
    this.spansStore.subscribe(() => { this.stateVersion++ })
    
    // Initialize alarm checking
    this.scheduleNextAlarmCheck()
  }

  // New: Dynamic alarm scheduling and checking
  
  /**
   * Schedule the next alarm check based on upcoming alarms
   */
  private scheduleNextAlarmCheck(): void {
    // Clear existing timeout
    if (this.alarmCheckTimeoutId !== null) {
      clearTimeout(this.alarmCheckTimeoutId)
      this.alarmCheckTimeoutId = null
    }
    
    const now = Date.now()
    const nextAlarmTime = this.savedStore.getNextAlarmTime()
    
    if (nextAlarmTime === null) {
      // No future alarms, check again in 1 minute
      this.nextAlarmCheckTime = now + 60000
      this.alarmCheckTimeoutId = window.setTimeout(() => this.checkAlarms(), 60000)
      return
    }
    
    // Calculate time until next alarm
    const timeUntilAlarm = nextAlarmTime - now
    
    if (timeUntilAlarm <= 0) {
      // Alarm is due now, check immediately
      this.checkAlarms()
      return
    }
    
    // Schedule check slightly before the alarm time for precision
    const checkOffset = Math.max(this.minCheckInterval, Math.min(timeUntilAlarm - 50, 1000))
    this.nextAlarmCheckTime = now + checkOffset
    
    this.alarmCheckTimeoutId = window.setTimeout(() => this.checkAlarms(), checkOffset)
  }
  
  /**
   * Check for triggered alarms with precise timing
   */
  public checkAlarms(): void {
    const now = Date.now()
    const alarmedInstants = this.savedStore.getAlarmedInstants()
    const newlyTriggered: RingingAlarm[] = []
    
    // Check for newly triggered alarms with sub-second precision
    for (const instant of alarmedInstants) {
      // Alarm triggers when Now intersects the instant (within 100ms tolerance for precision)
      if (Math.abs(now - instant.tsEpochMs) <= 100) {
        // Check if this alarm is already ringing
        const alreadyRinging = this.ringingAlarms.some(ra => ra.instantId === instant.id)
        if (!alreadyRinging) {
          newlyTriggered.push({
            instantId: instant.id,
            label: instant.label,
            tsEpochMs: instant.tsEpochMs,
            triggeredAt: now
          })
        }
      }
    }
    
    // Add newly triggered alarms to ringing list and start sound
    if (newlyTriggered.length > 0) {
      this.ringingAlarms.push(...newlyTriggered)
      this.startAlarmSound()
      this.stateVersion++
    }
    
    // Schedule next check
    this.scheduleNextAlarmCheck()
  }
  
  /**
   * Start repeating alarm sound when alarms trigger
   */
  private startAlarmSound(): void {
    this.alarmAudioManager.startAlarmSound(() => this.hasRingingAlarms())
  }
  
  /**
   * Stop the repeating alarm sound
   */
  private stopAlarmSound(): void {
    this.alarmAudioManager.stopAlarmSound()
  }
  
  /**
   * Play a single alarm sound
   */
  private playAlarmSound(): void {
    this.alarmAudioManager.playAlarmSound()
  }
  
  /**
   * Dismiss a ringing alarm
   */
  public dismissAlarm(instantId: string): void {
    this.ringingAlarms = this.ringingAlarms.filter(ra => ra.instantId !== instantId)
    
    // Clear the alarm state from the instant when dismissed
    this.savedStore.setAlarm(instantId, false)
    
    // Stop sound if no more ringing alarms
    if (this.ringingAlarms.length === 0) {
      this.stopAlarmSound()
    }
    
    this.stateVersion++
  }
  
  /**
   * Snooze a ringing alarm (creates new instant with alarm)
   */
  public snoozeAlarm(instantId: string, snoozeMinutes: number = 5): string | null {
    const ringingAlarm = this.ringingAlarms.find(ra => ra.instantId === instantId)
    if (!ringingAlarm) return null
    
    // Create new instant with alarm at Now + snooze duration
    const snoozeTime = Date.now() + (snoozeMinutes * 60 * 1000)
    const snoozeLabel = `Snooze: ${ringingAlarm.label}`
    const newInstantId = this.savedStore.create(snoozeTime, snoozeLabel, true)
    
    // Dismiss the original alarm
    this.dismissAlarm(instantId)
    
    return newInstantId
  }
  
  /**
   * Get currently ringing alarms
   */
  public getRingingAlarms(): RingingAlarm[] {
    return [...this.ringingAlarms]
  }
  
  /**
   * Check if any alarms are currently ringing
   */
  public hasRingingAlarms(): boolean {
    return this.ringingAlarms.length > 0
  }
  
  /**
   * Silence the alarm sound without dismissing alarms
   */
  public silenceAlarm(): void {
    this.alarmAudioManager.stopAlarmSound()
  }
  
  /**
   * Clear all ringing alarms (useful for testing or reset)
   */
  public clearAllRingingAlarms(): void {
    this.ringingAlarms = []
    this.stopAlarmSound()
    this.stateVersion++
  }
  
  /**
   * Get time until next alarm check (for debugging/monitoring)
   */
  public getTimeUntilNextAlarmCheck(): number {
    return Math.max(0, this.nextAlarmCheckTime - Date.now())
  }

  /**
   * Clean up resources
   */
  public dispose(): void {
    if (this.alarmCheckTimeoutId !== null) {
      clearTimeout(this.alarmCheckTimeoutId)
      this.alarmCheckTimeoutId = null
    }
    this.alarmAudioManager.dispose()
  }
  
  // === View Focus Management ===
  
  public setViewFocus(mode: ViewFocusMode, instantId?: string, spanId?: string): void {
    if (mode === 'instant') {
      const currentSelected = toStringOrNull(this.currentSelectedInstantId)
      if (currentSelected && instantId && currentSelected !== instantId) {
        this.secondarySelectedInstantId = this.currentSelectedInstantId
      }
      this.currentSelectedInstantId = fromStringOrNull(instantId)
    }
    
    // Handle focus history for instant transitions
    
    this.viewFocusMode = mode
    this.focusedInstantId = fromStringOrNull(instantId)
    this.focusedSpanId = fromStringOrNull(spanId)
    
    // Update focus history when focusing an instant
    if (mode === 'instant' && instantId && !this.suppressHistoryPush) {
      this.pushToFocusHistory(instantId)
    }
    // When leaving instant mode, position index just after the end so that
    // pressing "q" (back) jumps to the last focused instant
    else if (mode !== 'instant' && !this.suppressHistoryPush) {
      this.focusHistoryIndex = this.focusHistory.length
    }
    
    this.stateVersion++
  }
  
  public getViewFocus(): { mode: ViewFocusMode; focusedInstantId: string | null; focusedSpanId?: string | null } {
    return {
      mode: this.viewFocusMode,
      focusedInstantId: toStringOrNull(this.focusedInstantId),
      focusedSpanId: toStringOrNull(this.focusedSpanId)
    }
  }
  
  // === Focus History Management ===
  
  private pushToFocusHistory(instantId: string): void {
    if (this.suppressHistoryPush) return
    
    // Remove any existing occurrence from the top of the stack only
    if (this.focusHistory.length > 0 && this.focusHistory[this.focusHistory.length - 1] === instantId) {
      // Don't add if it's already at the top
      return
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
    // When navigating through history, return the previous item in the history sequence
    if (this.focusHistoryIndex > 0) {
      return this.focusHistory[this.focusHistoryIndex - 1]
    }
    // When not navigating through history, return the most recent item that's not the current one
    const currentId = toStringOrNull(this.focusedInstantId)
    // If we're not focused on any instant (cursor/now mode), return the most recent one
    if (!currentId) {
      return this.focusHistory[this.focusHistory.length - 1] || null
    }
    // If we are focused on an instant, return the most recent one that's not the current one
    for (let i = this.focusHistory.length - 1; i >= 0; i--) {
      const id = this.focusHistory[i]
      if (id !== currentId) return id
    }
    return null
  }
  
  // === Selection Management ===
  
  public setSelectedInstant(instantId: string | null): void {
    const newOption = fromStringOrNull(instantId)
    if (this.currentSelectedInstantId !== newOption) {
      this.secondarySelectedInstantId = this.currentSelectedInstantId
    }
    this.currentSelectedInstantId = newOption
    this.stateVersion++
  }
  
  public setSelectedSpan(spanId: string | null): void {
    this.selectedSpanId = fromStringOrNull(spanId)
    this.stateVersion++
  }
  
  public deselectInstants(): void {
    // First clear the secondary selected instant if it exists
    if (this.secondarySelectedInstantId !== none) {
      this.secondarySelectedInstantId = none
      this.stateVersion++
      return
    }
    
    // If no secondary selected instant, clear the current selected instant
    if (this.currentSelectedInstantId !== none) {
      this.currentSelectedInstantId = none
      this.stateVersion++
    }
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
  
  // === Time Increment Management ===
  
  public getTimeIncrement(): TimeIncrement {
    return this.timeIncrement
  }
  
  public setTimeIncrement(increment: TimeIncrement): void {
    this.timeIncrement = increment
    this.stateVersion++
  }
  
  public getTimeIncrementMs(): number {
    const option = TIME_INCREMENT_OPTIONS.find(opt => opt.value === this.timeIncrement)
    return option?.milliseconds ?? 30 * 60 * 1000 // fallback to 30 minutes
  }
  
  public getTimeIncrementLabel(): string {
    const option = TIME_INCREMENT_OPTIONS.find(opt => opt.value === this.timeIncrement)
    return option?.label ?? '30 minutes'
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
    this.editingInstantId = fromStringOrNull(id)
    this.stateVersion++
  }
  
  public setEditingSpan(id: string | null): void {
    this.editingSpanId = fromStringOrNull(id)
    this.stateVersion++
  }
  
  public getEditingInstantId(): string | null {
    return toStringOrNull(this.editingInstantId)
  }
  
  public getEditingSpanId(): string | null {
    return toStringOrNull(this.editingSpanId)
  }
  
  public endEditing(): void {
    this.editingInstantId = none
    this.editingSpanId = none
    this.stateVersion++
  }
  
  // === State Access ===
  
  public getStateVersion(): number {
    return this.stateVersion
  }
  
  public getCurrentSelectedInstantId(): string | null {
    return toStringOrNull(this.currentSelectedInstantId)
  }
  
  public getSecondarySelectedInstantId(): string | null {
    return toStringOrNull(this.secondarySelectedInstantId)
  }
  
  public getSelectedSpanId(): string | null {
    return toStringOrNull(this.selectedSpanId)
  }
  
  // === State Persistence ===
  
  public getSnapshot(): TimelineStateSnapshot {
    return {
      timeWidth: this.timeWidth,
      timeCenter: this.timeCenter,
      viewFocusMode: this.viewFocusMode,
      focusedInstantId: toStringOrNull(this.focusedInstantId),
      focusedSpanId: toStringOrNull(this.focusedSpanId),
      currentSelectedInstantId: toStringOrNull(this.currentSelectedInstantId),
      secondarySelectedInstantId: toStringOrNull(this.secondarySelectedInstantId),
      focusHistory: [...this.focusHistory],
      focusHistoryIndex: this.focusHistoryIndex,
      selectedSpanId: toStringOrNull(this.selectedSpanId),
      showImpliedSelectedNow: this.showImpliedSelectedNow,
      showImpliedSelectedPrev: this.showImpliedSelectedPrev,
      timeIncrement: this.timeIncrement,
      ringingAlarms: [...this.ringingAlarms] // New: include ringing alarms in snapshot
    }
  }
  
  public loadSnapshot(snapshot: Partial<TimelineStateSnapshot>): void {
    if (snapshot.timeWidth !== undefined) this.timeWidth = snapshot.timeWidth
    if (snapshot.timeCenter !== undefined) this.timeCenter = snapshot.timeCenter
    if (snapshot.viewFocusMode !== undefined) this.viewFocusMode = snapshot.viewFocusMode
    if (snapshot.focusedInstantId !== undefined) this.focusedInstantId = fromStringOrNull(snapshot.focusedInstantId)
    if (snapshot.focusedSpanId !== undefined) this.focusedSpanId = fromStringOrNull(snapshot.focusedSpanId)
    if (snapshot.currentSelectedInstantId !== undefined) this.currentSelectedInstantId = fromStringOrNull(snapshot.currentSelectedInstantId)
    if (snapshot.secondarySelectedInstantId !== undefined) this.secondarySelectedInstantId = fromStringOrNull(snapshot.secondarySelectedInstantId)
    if (snapshot.focusHistory !== undefined) this.focusHistory = [...snapshot.focusHistory]
    if (snapshot.focusHistoryIndex !== undefined) this.focusHistoryIndex = snapshot.focusHistoryIndex
    if (snapshot.selectedSpanId !== undefined) this.selectedSpanId = fromStringOrNull(snapshot.selectedSpanId)
    if (snapshot.showImpliedSelectedNow !== undefined) this.showImpliedSelectedNow = snapshot.showImpliedSelectedNow
    if (snapshot.showImpliedSelectedPrev !== undefined) this.showImpliedSelectedPrev = snapshot.showImpliedSelectedPrev
    if (snapshot.timeIncrement !== undefined) this.timeIncrement = snapshot.timeIncrement
    if (snapshot.ringingAlarms !== undefined) this.ringingAlarms = [...snapshot.ringingAlarms] // New: load ringing alarms from snapshot
    
    this.stateVersion++
  }
}
