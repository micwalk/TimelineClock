import React, { useRef, useEffect, useState, useCallback } from 'react'
import { TimelineRenderer } from '../canvas/TimelineRenderer.ts'
import { InstantListDomManager } from './InstantListDomManager.ts'
import { TimeIncrementDropdown } from './TimeIncrementDropdown.tsx'
import type { InstantView } from '../types/instants.ts'
import type { TimeIncrement } from '../canvas/core/TimelineState.ts'

interface TimelineCanvasProps {
  className?: string
}

export const TimelineCanvas: React.FC<TimelineCanvasProps> = ({ className = '' }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const overlaysRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<(HTMLDivElement & { _lastVersion?: number; _lastRenderAt?: number }) | null>(null)
  const controlsRef = useRef<HTMLDivElement>(null)
  const listManagerRef = useRef<InstantListDomManager | null>(null)
  const rendererRef = useRef<TimelineRenderer | null>(null)
  
  // Time increment dropdown state
  const [isDropdownOpen, setIsDropdownOpen] = useState(false)
  const [dropdownTrigger, setDropdownTrigger] = useState<'plus' | 'minus' | null>(null)
  const plusButtonRef = useRef<HTMLButtonElement>(null)
  const minusButtonRef = useRef<HTMLButtonElement>(null)

  // Time input overlay DOM node (managed like label overlays)
  const timeInputRef = useRef<HTMLDivElement | null>(null)
  const timeInputModeRef = useRef<'cursor-now' | 'selected-cursor' | null>(null)

  // Helpers for navigation and cursor movement
  const moveCursorByMs = useCallback((deltaMs: number) => {
    const r = rendererRef.current
    if (!r) return
    const center = r.getTimeCenter?.() ?? Date.now()
    r.setTimeCenter(center + deltaMs)
    r.setViewFocus('cursor')
  }, [])

  const moveCursorByIncrement = useCallback((direction: 1 | -1) => {
    const r = rendererRef.current
    if (!r) return
    const incrementMs = r.getTimeIncrementMs?.() ?? 30 * 60 * 1000
    moveCursorByMs(direction * incrementMs)
  }, [moveCursorByMs])

  const getCurrentIncrementLabel = (): string => {
    const r = rendererRef.current
    if (!r) return '30 minutes'
    return r.getTimeIncrementLabel?.() ?? '30 minutes'
  }

  const handleIncrementChange = (increment: TimeIncrement) => {
    const r = rendererRef.current
    if (!r) return
    r.setTimeIncrement?.(increment)
  }

  const handleLongPress = (trigger: 'plus' | 'minus') => {
    setDropdownTrigger(trigger)
    setIsDropdownOpen(true)
  }

  // Long press detection
  const useLongPress = (callback: () => void, ms = 500) => {
    const timeoutRef = useRef<number | undefined>(undefined)
    const isLongPress = useRef(false)

    const start = () => {
      isLongPress.current = false
      timeoutRef.current = window.setTimeout(() => {
        isLongPress.current = true
        callback()
      }, ms)
    }

    const stop = () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
      }
    }

    return { start, stop, isLongPress }
  }

  const plusLongPress = useLongPress(() => handleLongPress('plus'))
  const minusLongPress = useLongPress(() => handleLongPress('minus'))

  // Time input helpers
  const handleTimeInput = (timeString: string) => {
    const r = rendererRef.current
    const mode = timeInputModeRef.current
    if (!r || !mode) return

    try {
      if (mode === 'cursor-now') {
        // Move cursor relative to now
        r.moveCursorToTime(timeString, Date.now())
      } else if (mode === 'selected-cursor') {
        // Move cursor relative to selected instant
        const selectedId = r.getViewFocus().focusedInstantId || r.getCurrentSelectedInstantId?.()
        if (selectedId) {
          const selectedInstant = r.getSavedInstantsSnapshot?.().find(i => i.id === selectedId)
          if (selectedInstant) {
            r.moveCursorToTime(timeString, selectedInstant.ts)
          }
        }
      }
      // Close overlay if open
      if (timeInputRef.current) {
        timeInputRef.current.remove()
        timeInputRef.current = null
      }
      timeInputModeRef.current = null
    } catch (error) {
      console.error('Invalid time format:', error)
    }
  }

  const formatDurationForInput = (ms: number): string => {
    const isNegative = ms < 0
    const absDuration = Math.abs(ms)
    
    const hours = Math.floor(absDuration / (60 * 60 * 1000))
    const minutes = Math.floor((absDuration % (60 * 60 * 1000)) / (60 * 1000))
    const seconds = Math.floor((absDuration % (60 * 1000)) / 1000)
    
    const sign = isNegative ? '-' : ''
    return `${sign}${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
  }

  const goToPreviousInstant = () => {
    const r = rendererRef.current
    if (!r) return
    const instants: InstantView[] = r.getAllInstantsView()
    if (instants.length === 0) return
    const focus = r.getViewFocus?.() ?? { mode: 'now', focusedInstantId: null as string | null }
    let anchorTs: number
    if (focus.mode === 'instant' && focus.focusedInstantId) {
      const cur = instants.find(i => i.kind === 'saved' && i.id === focus.focusedInstantId)
      anchorTs = cur ? cur.tsEpochMs : Date.now()
    } else if (focus.mode === 'cursor') {
      const cur = instants.find(i => i.kind === 'cursor' && i.visible)
      anchorTs = cur ? cur.tsEpochMs : (r.getTimeCenter?.() ?? Date.now())
    } else {
      anchorTs = Date.now()
    }
    let target: InstantView | null = null
    for (let i = instants.length - 1; i >= 0; i--) {
      const it = instants[i]
      if (it.tsEpochMs < anchorTs) { target = it; break }
    }
    if (target) {
      if (target.kind === 'saved') {
        const rr = r as unknown as { focusInstantAnimated?: (id?: string, ts?: number) => void }
        rr.focusInstantAnimated?.(target.id, target.tsEpochMs)
      } else if (target.kind === 'cursor') {
        r.setViewFocus('cursor')
        r.setTimeCenter(target.tsEpochMs)
      } else {
        r.setViewFocus('now')
      }
    }
  }

  const goToNextInstant = () => {
    const r = rendererRef.current
    if (!r) return
    const instants: InstantView[] = r.getAllInstantsView()
    if (instants.length === 0) return
    const focus = r.getViewFocus?.() ?? { mode: 'now', focusedInstantId: null as string | null }
    let anchorTs: number
    if (focus.mode === 'instant' && focus.focusedInstantId) {
      const cur = instants.find(i => i.kind === 'saved' && i.id === focus.focusedInstantId)
      anchorTs = cur ? cur.tsEpochMs : Date.now()
    } else if (focus.mode === 'cursor') {
      const cur = instants.find(i => i.kind === 'cursor' && i.visible)
      anchorTs = cur ? cur.tsEpochMs : (r.getTimeCenter?.() ?? Date.now())
    } else {
      anchorTs = Date.now()
    }
    const target = instants.find(i => i.tsEpochMs > anchorTs) || null
    if (target) {
      if (target.kind === 'saved') {
        const rr = r as unknown as { focusInstantAnimated?: (id?: string, ts?: number) => void }
        rr.focusInstantAnimated?.(target.id, target.tsEpochMs)
      } else if (target.kind === 'cursor') {
        r.setViewFocus('cursor')
        r.setTimeCenter(target.tsEpochMs)
      } else {
        r.setViewFocus('now')
      }
    }
  }

  useEffect(() => {
    const canvas = canvasRef.current
    const container = containerRef.current
    if (!canvas || !container) return

    let renderer: TimelineRenderer | null = null
    let resizeTimeout: number | null = null

    // Set canvas size to match container
    const resizeCanvas = () => {
      const dpr = window.devicePixelRatio || 1
      
      // Use viewport height for stable sizing
      const containerWidth = window.innerWidth
      const containerHeight = Math.min(window.innerHeight, 600)
      
      // Set CSS size first (this is what the user sees)
      canvas.style.width = `${containerWidth}px`
      canvas.style.height = `${containerHeight}px`
      canvas.style.top = '0px'
      canvas.style.left = '0px'
      canvas.style.bottom = 'auto'
      canvas.style.zIndex = '0'
      
      // Then set the actual canvas buffer size for high DPI
      canvas.width = containerWidth * dpr
      canvas.height = containerHeight * dpr
      
      // Force canvas to take full width
      canvas.style.maxWidth = 'none'
      canvas.style.minWidth = '100%'
      
      // Reinitialize renderer with new canvas size
      if (renderer) {
        renderer.destroy()
      }
      renderer = new TimelineRenderer(canvas)
      rendererRef.current = renderer
      ;(window as unknown as { getRenderer?: () => TimelineRenderer | null }).getRenderer = () => rendererRef.current

      // Position list below canvas
      const controlsEl = controlsRef.current
      if (controlsEl) {
        controlsEl.style.top = `${containerHeight}px`
        controlsEl.style.zIndex = '20'
      }
      if (listRef.current) {
        const controlsH = controlsEl?.getBoundingClientRect().height ?? 0
        listRef.current.style.top = `${containerHeight + Math.ceil(controlsH)}px`
        listRef.current.style.zIndex = '1000'
        listRef.current.style.pointerEvents = 'auto'
        ;(window as unknown as { getListEl?: () => HTMLDivElement | null }).getListEl = () => listRef.current
      }
    }

    // Debounced resize handler
    const handleResize = () => {
      if (resizeTimeout) {
        clearTimeout(resizeTimeout)
      }
      resizeTimeout = window.setTimeout(resizeCanvas, 16) // ~60fps
    }

    // Wheel handler for zoom
    const handleWheel = (e: WheelEvent) => {
      e.preventDefault()
      if (!renderer) return
      if (e.deltaY > 0) {
        renderer.zoomOut()
      } else if (e.deltaY < 0) {
        renderer.zoomIn()
      }
    }

    // Drag to pan
    let isPointerDown = false
    let dragDistance = 0
    let hasDragActivated = false
    let skipNextClick = false
    let lastX = 0
    const onPointerDown = (e: PointerEvent) => {
      isPointerDown = true
      dragDistance = 0
      hasDragActivated = false
      lastX = e.clientX
      canvas.setPointerCapture(e.pointerId)
      // Don't switch to cursor yet; wait until small movement threshold
    }
    const onPointerMove = (e: PointerEvent) => {
      if (!isPointerDown || !renderer) return
      const dx = e.clientX - lastX
      lastX = e.clientX
      dragDistance += Math.abs(dx)
      if (!hasDragActivated && dragDistance >= 2) {
        hasDragActivated = true
        renderer.setViewFocus('cursor')
      }
      if (hasDragActivated) {
        renderer.panByPixels(dx)
      }
    }
    const onPointerUp = (e: PointerEvent) => {
      if (!isPointerDown) return
      isPointerDown = false
      canvas.releasePointerCapture(e.pointerId)
      if (renderer && hasDragActivated) {
        // If center is near now, snap back to now mode
        const snappedNow = renderer.snapToNowIfClose(12)
        const snappedInstant = renderer.snapToInstantIfClose(12)
        if (!snappedNow && !snappedInstant) {
          renderer.setViewFocus('cursor')
        }
      }
      if (dragDistance > 3) {
        skipNextClick = true
      }
    }

    resizeCanvas()
    window.addEventListener('resize', handleResize)
    canvas.addEventListener('wheel', handleWheel, { passive: false })
    canvas.addEventListener('pointerdown', onPointerDown)
    canvas.addEventListener('pointermove', onPointerMove)
    canvas.addEventListener('pointerup', onPointerUp)
    canvas.addEventListener('pointercancel', onPointerUp)
    const onDblClick = (e: MouseEvent) => {
      if (!renderer) return
      const rect = canvas.getBoundingClientRect()
      const x = e.clientX - rect.left
      const y = e.clientY - rect.top
      renderer.handleDoubleClick(x, y)
    }
    canvas.addEventListener('dblclick', onDblClick)

    // Custom event listener for span time input
    const onSpanTimeInput = (e: CustomEvent) => {
      console.log('span-time-input event received:', e.detail)
      const { type, position } = e.detail
      const r = rendererRef.current
      if (!r) return

      // Convert canvas coordinates to page coordinates (match label overlays)
      const rect = canvas.getBoundingClientRect()
      const pagePosition = {
        x: Math.round(position.x + rect.left),
        y: Math.round(position.y + rect.top - 1)
      }

      let initialValue = ''
      if (type === 'cursor-now') {
        const now = Date.now()
        const cursorTime = r.getTimeCenter()
        const diff = cursorTime - now
        initialValue = formatDurationForInput(diff)
      } else if (type === 'selected-cursor') {
        const selectedId = r.getViewFocus().focusedInstantId || r.getCurrentSelectedInstantId?.()
        if (selectedId) {
          const selectedInstant = r.getSavedInstantsSnapshot?.().find(i => i.id === selectedId)
          if (selectedInstant) {
            const cursorTime = r.getTimeCenter()
            const diff = cursorTime - selectedInstant.ts
            initialValue = formatDurationForInput(diff)
          }
        }
      }

      // Create DOM overlay like label overlays
      // Clean up existing instance
      if (timeInputRef.current) {
        timeInputRef.current.remove()
        timeInputRef.current = null
      }

      timeInputModeRef.current = type

      const overlays = overlaysRef.current
      if (!overlays) return

      const container = document.createElement('div')
      container.style.position = 'absolute'
      container.style.left = `${pagePosition.x}px`
      container.style.top = `${pagePosition.y}px`
      container.style.transform = 'translateX(-50%)'
      container.style.background = 'rgba(0,0,0,0.9)'
      container.style.color = '#ffffff'
      container.style.border = '2px solid #ffffff'
      container.style.borderRadius = '6px'
      container.style.padding = '8px'
      container.style.boxShadow = '0 6px 16px rgba(0,0,0,0.5)'
      container.style.pointerEvents = 'none'
      container.style.zIndex = '10000'

      // Stop canvas interactions when using inputs
      container.onpointerdown = (ev) => { ev.stopPropagation() }
      container.onmousedown = (ev) => { ev.stopPropagation() }
      container.onwheel = (ev) => { ev.stopPropagation() }

      const row = document.createElement('div')
      row.style.display = 'flex'
      row.style.alignItems = 'center'
      row.style.gap = '4px'

      const signBtn = document.createElement('button')
      signBtn.textContent = initialValue.startsWith('-') ? '-' : '+'
      signBtn.style.padding = '2px 6px'
      signBtn.style.fontFamily = 'monospace'
      signBtn.style.background = initialValue.startsWith('-') ? '#dc2626' : '#4b5563'
      signBtn.style.color = '#ffffff'
      signBtn.style.border = 'none'
      signBtn.style.borderRadius = '4px'
      ;(signBtn.style as CSSStyleDeclaration).pointerEvents = 'auto'
      let isNegative = initialValue.startsWith('-')
      signBtn.onclick = (ev) => {
        ev.stopPropagation()
        isNegative = !isNegative
        signBtn.textContent = isNegative ? '-' : '+'
        signBtn.style.background = isNegative ? '#dc2626' : '#4b5563'
      }

      const buildInput = (val: string, max: number) => {
        const input = document.createElement('input')
        input.type = 'text'
        input.value = val
        input.maxLength = 2
        input.style.width = '48px'
        input.style.height = '32px'
        input.style.textAlign = 'center'
        input.style.background = 'transparent'
        input.style.border = '2px solid #ffffff'
        input.style.color = '#ffffff'
        input.style.fontFamily = 'monospace'
        input.style.fontSize = '18px'
        input.style.borderRadius = '4px'
        ;(input.style as CSSStyleDeclaration).pointerEvents = 'auto'
        input.onpointerdown = (ev) => { ev.stopPropagation() }
        input.onmousedown = (ev) => { ev.stopPropagation() }
        input.onwheel = (ev) => { ev.stopPropagation() }
        input.oninput = () => {
          const clean = input.value.replace(/\D/g, '')
          const num = clean === '' ? '' : Math.min(parseInt(clean, 10), max).toString()
          input.value = (num as string).padStart(Math.min(2, (num as string).length || 0), '0')
        }
        input.onkeydown = (ev) => {
          if (ev.key === 'Escape') { closeOverlay(); return }
          if (ev.key === 'Enter' || ev.key === 'Tab') {
            ev.preventDefault()
            if (ev.target === secondsInput) {
              confirm()
            } else if (ev.target === hoursInput) {
              minutesInput.focus(); minutesInput.select()
            } else if (ev.target === minutesInput) {
              secondsInput.focus(); secondsInput.select()
            }
          }
          if (ev.key === 'ArrowLeft') {
            if (ev.target === minutesInput) { hoursInput.focus(); hoursInput.select() }
            if (ev.target === secondsInput) { minutesInput.focus(); minutesInput.select() }
          }
          if (ev.key === 'ArrowRight') {
            if (ev.target === hoursInput) { minutesInput.focus(); minutesInput.select() }
            if (ev.target === minutesInput) { secondsInput.focus(); secondsInput.select() }
          }
        }
        return input
      }

      const parts = initialValue.replace(/^[+-]/, '').split(':')
      const hoursInput = buildInput(parts[0] || '00', 99)
      const minutesInput = buildInput(parts[1] || '00', 59)
      const secondsInput = buildInput(parts[2] || '00', 59)

      const colon1 = document.createElement('span')
      colon1.textContent = ':'
      colon1.style.color = '#ffffff'
      colon1.style.fontFamily = 'monospace'
      colon1.style.fontSize = '18px'
      const colon2 = colon1.cloneNode(true) as HTMLSpanElement

      row.appendChild(signBtn)
      row.appendChild(hoursInput)
      row.appendChild(colon1)
      row.appendChild(minutesInput)
      row.appendChild(colon2)
      row.appendChild(secondsInput)

      const actions = document.createElement('div')
      actions.style.display = 'flex'
      actions.style.justifyContent = 'space-between'
      actions.style.marginTop = '8px'

      const cancelBtn = document.createElement('button')
      cancelBtn.textContent = 'Cancel'
      cancelBtn.style.padding = '4px 8px'
      cancelBtn.style.background = '#4b5563'
      cancelBtn.style.color = '#ffffff'
      cancelBtn.style.border = 'none'
      cancelBtn.style.borderRadius = '4px'
      ;(cancelBtn.style as CSSStyleDeclaration).pointerEvents = 'auto'
      cancelBtn.onclick = (ev) => { ev.stopPropagation(); closeOverlay() }

      const okBtn = document.createElement('button')
      okBtn.textContent = 'OK'
      okBtn.style.padding = '4px 8px'
      okBtn.style.background = '#2563eb'
      okBtn.style.color = '#ffffff'
      okBtn.style.border = 'none'
      okBtn.style.borderRadius = '4px'
      ;(okBtn.style as CSSStyleDeclaration).pointerEvents = 'auto'
      okBtn.onclick = (ev) => { ev.stopPropagation(); confirm() }

      actions.appendChild(cancelBtn)
      actions.appendChild(okBtn)

      container.appendChild(row)
      container.appendChild(actions)
      overlays.appendChild(container)
      timeInputRef.current = container

      const closeOnOutside = (ev: MouseEvent) => {
        if (!timeInputRef.current) return
        if (!timeInputRef.current.contains(ev.target as Node)) {
          closeOverlay()
        }
      }
      document.addEventListener('mousedown', closeOnOutside, { capture: true } as AddEventListenerOptions)

      const closeOnEscape = (ev: KeyboardEvent) => {
        if (ev.key === 'Escape') closeOverlay()
      }
      document.addEventListener('keydown', closeOnEscape)

      function closeOverlay() {
        document.removeEventListener('mousedown', closeOnOutside, { capture: true } as EventListenerOptions)
        document.removeEventListener('keydown', closeOnEscape)
        if (timeInputRef.current) {
          timeInputRef.current.remove()
          timeInputRef.current = null
        }
        timeInputModeRef.current = null
      }

      function confirm() {
        const hh = hoursInput.value.padStart(2, '0')
        const mm = minutesInput.value.padStart(2, '0')
        const ss = secondsInput.value.padStart(2, '0')
        const sign = isNegative ? '-' : ''
        const str = `${sign}${hh}:${mm}:${ss}`
        handleTimeInput(str)
        closeOverlay()
      }

      // Focus first
      setTimeout(() => { hoursInput.focus(); hoursInput.select() }, 0)
    }
    canvas.addEventListener('span-time-input', onSpanTimeInput as EventListener)

    // Instant time input for Now/Cursor
    const onInstantTimeInput = (e: CustomEvent) => {
      const { type, position, initial } = e.detail as { type: 'now' | 'cursor'; position: { x: number; y: number }; initial: string }
      const r = rendererRef.current
      if (!r) return

      // Convert to page coords
      const rect = canvas.getBoundingClientRect()
      const pagePosition = { x: Math.round(position.x + rect.left), y: Math.round(position.y + rect.top - 1) }

      // Build overlay like labels
      if (timeInputRef.current) { timeInputRef.current.remove(); timeInputRef.current = null }
      timeInputModeRef.current = type === 'now' ? 'cursor-now' : 'cursor-now'

      const overlays = overlaysRef.current
      if (!overlays) return
      const container = document.createElement('div')
      container.style.position = 'absolute'
      container.style.left = `${pagePosition.x}px`
      container.style.top = `${pagePosition.y}px`
      container.style.transform = 'translateX(-50%)'
      container.style.background = 'rgba(0,0,0,0.9)'
      container.style.color = '#ffffff'
      container.style.border = '2px solid #ffffff'
      container.style.borderRadius = '6px'
      container.style.padding = '8px'
      container.style.boxShadow = '0 6px 16px rgba(0,0,0,0.5)'
      container.style.pointerEvents = 'none'
      container.style.zIndex = '10000'

      const row = document.createElement('div')
      row.style.display = 'flex'
      row.style.alignItems = 'center'
      row.style.gap = '4px'

      const parts = initial.split(':')
      const buildInput = (val: string, max: number) => {
        const input = document.createElement('input')
        input.type = 'text'
        input.value = val
        input.maxLength = 2
        input.style.width = '48px'
        input.style.height = '32px'
        input.style.textAlign = 'center'
        input.style.background = 'transparent'
        input.style.border = '2px solid #ffffff'
        input.style.color = '#ffffff'
        input.style.fontFamily = 'monospace'
        input.style.fontSize = '18px'
        input.style.borderRadius = '4px'
        ;(input.style as CSSStyleDeclaration).pointerEvents = 'auto'
        input.oninput = () => {
          const clean = input.value.replace(/\D/g, '')
          const num = clean === '' ? '' : Math.min(parseInt(clean, 10), max).toString()
          input.value = (num as string).padStart(Math.min(2, (num as string).length || 0), '0')
        }
        return input
      }

      const hoursInput = buildInput(parts[0] || '00', 23)
      const minutesInput = buildInput(parts[1] || '00', 59)
      const secondsInput = buildInput(parts[2] || '00', 59)

      const colon1 = document.createElement('span'); colon1.textContent = ':'; colon1.style.color = '#ffffff'; colon1.style.fontFamily = 'monospace'; colon1.style.fontSize = '18px'
      const colon2 = colon1.cloneNode(true) as HTMLSpanElement

      row.appendChild(hoursInput); row.appendChild(colon1); row.appendChild(minutesInput); row.appendChild(colon2); row.appendChild(secondsInput)

      const actions = document.createElement('div')
      actions.style.display = 'flex'; actions.style.justifyContent = 'space-between'; actions.style.marginTop = '8px'
      const cancelBtn = document.createElement('button'); cancelBtn.textContent = 'Cancel'; cancelBtn.style.padding = '4px 8px'; cancelBtn.style.background = '#4b5563'; cancelBtn.style.color = '#ffffff'; cancelBtn.style.border = 'none'; cancelBtn.style.borderRadius = '4px'; (cancelBtn.style as CSSStyleDeclaration).pointerEvents = 'auto'
      const okBtn = document.createElement('button'); okBtn.textContent = 'OK'; okBtn.style.padding = '4px 8px'; okBtn.style.background = '#2563eb'; okBtn.style.color = '#ffffff'; okBtn.style.border = 'none'; okBtn.style.borderRadius = '4px'; (okBtn.style as CSSStyleDeclaration).pointerEvents = 'auto'

      const close = () => { if (timeInputRef.current) { timeInputRef.current.remove(); timeInputRef.current = null } }
      cancelBtn.onclick = (ev) => { ev.stopPropagation(); close() }
      okBtn.onclick = (ev) => {
        ev.stopPropagation()
        const hh = hoursInput.value.padStart(2, '0')
        const mm = minutesInput.value.padStart(2, '0')
        const ss = secondsInput.value.padStart(2, '0')
        // Always forward in time from now
        const now = new Date()
        const target = new Date(now)
        target.setHours(parseInt(hh, 10), parseInt(mm, 10), parseInt(ss, 10), 0)
        let targetTs = target.getTime()
        if (targetTs <= now.getTime()) {
          // if past, push to next day
          target.setDate(target.getDate() + 1)
          targetTs = target.getTime()
        }
        const r2 = rendererRef.current
        if (r2) { r2.setViewFocus('cursor'); r2.setTimeCenter(targetTs) }
        close()
      }

      actions.appendChild(cancelBtn); actions.appendChild(okBtn)
      container.appendChild(row); container.appendChild(actions)
      overlays.appendChild(container); timeInputRef.current = container
      setTimeout(() => { hoursInput.focus(); hoursInput.select() }, 0)
    }
    canvas.addEventListener('instant-time-input', onInstantTimeInput as EventListener)

    // Keyboard hotkeys
    const onKeyDown = (e: KeyboardEvent) => {
      // Ignore when typing
      const active = document.activeElement as HTMLElement | null
      if (active && ((active.tagName === 'INPUT') || (active.tagName === 'TEXTAREA') || active.isContentEditable)) {
        return
      }
      const key = e.key
      const lower = key.toLowerCase()
      if (lower === 'i' || lower === 'w') {
        e.preventDefault()
        rendererRef.current?.zoomIn()
        return
      }
      if (lower === 'o' || lower === 's') {
        e.preventDefault()
        rendererRef.current?.zoomOut()
        return
      }
      if (lower === 'x') {
        e.preventDefault()
        moveCursorByIncrement(1)
        return
      }
      if (lower === 'z') {
        e.preventDefault()
        moveCursorByIncrement(-1)
        return
      }
      if (lower === 'r') {
        e.preventDefault()
        const rr = rendererRef.current as unknown as { focusNowAnimated?: () => void }
        rr.focusNowAnimated?.()
        return
      }
      if (lower === 'd' || key === 'ArrowRight' || key === 'ArrowDown') {
        e.preventDefault()
        goToNextInstant()
        return
      }
      if (lower === 'a' || key === 'ArrowLeft' || key === 'ArrowUp') {
        e.preventDefault()
        goToPreviousInstant()
        return
      }
      if (lower === 'q') {
        e.preventDefault()
        rendererRef.current?.navigateFocusHistory(-1)
        return
      }
      if (lower === 'e') {
        e.preventDefault()
        rendererRef.current?.navigateFocusHistory(1)
        return
      }
      if (key === 'Escape') {
        e.preventDefault()
        rendererRef.current?.deselectInstants()
        return
      }
    }
    window.addEventListener('keydown', onKeyDown)

    // Start rendering loop
    let animationId: number
    // Cache of overlay DOM nodes to avoid recreating every frame
    const overlayNodes: Map<string, HTMLInputElement> = new Map()

    const renderLoop = () => {
      if (renderer) {
        renderer.render()
        // Sync overlays
        const overlays = overlaysRef.current
        if (overlays) {
          const rect = canvas.getBoundingClientRect()
          const measureCtx = canvas.getContext('2d')
          const computeWidth = (text: string) => {
            if (!measureCtx) return 0
            measureCtx.font = 'bold 16px Arial'
            const w = measureCtx.measureText(text).width
            return Math.ceil(w) + 10 // match canvas label padding
          }
          const list = renderer.getOverlayElements()
          const desiredKeys = new Set<string>()
          for (const o of list) {
            if ((o.type === 'instant-label' || o.type === 'span-label') && o.id) {
              const key = `${o.type}:${o.id}`
              desiredKeys.add(key)
              let input = overlayNodes.get(key)
              if (!input) {
                input = document.createElement('input')
                input.type = 'text'
                input.value = o.text ?? ''
                // Match canvas styling
                input.className = ''
                input.style.background = 'rgba(0,0,0,1)'
                input.style.color = '#ffffff'
                input.style.border = '2px solid #ffffff'
                input.style.borderRadius = '0px'
                input.style.font = 'bold 16px Arial'
                input.style.padding = '0px'
                input.style.position = 'absolute'
                input.style.pointerEvents = 'auto'
                input.style.zIndex = '10000'
                input.onpointerdown = (ev) => { ev.stopPropagation() }
                input.onmousedown = (ev) => { ev.stopPropagation() }
                input.onwheel = (ev) => { ev.stopPropagation() }
                input.onchange = () => { if (o.type === 'instant-label') { renderer!.updateInstantLabel(o.id!, input!.value) } else { renderer!.updateSpanLabel(o.id!, input!.value) } }
                input.onblur = () => { renderer!.endEditing() }
                input.onkeydown = (ev) => {
                  if (ev.key === 'Enter') { (ev.target as HTMLInputElement).blur() }
                  if (ev.key === 'Escape') { (ev.target as HTMLInputElement).blur() }
                }
                // Initialize min width to the overlay rect width
                const minW = Math.round(o.rect.w)
                input.style.minWidth = `${minW}px`
                // Grow width as user types
                input.oninput = () => {
                  const desired = computeWidth(input!.value)
                  const finalW = Math.max(minW, desired)
                  input!.style.width = `${finalW}px`
                }
                overlays.appendChild(input)
                overlayNodes.set(key, input)
                if (o.focused) {
                  setTimeout(() => { input!.focus(); input!.select() }, 0)
                }
              }
              // Update position/size only; do not overwrite value during typing
              input.style.left = `${Math.round(o.rect.x + rect.left)}px`
              input.style.top = `${Math.round(o.rect.y + rect.top - 1)}px`
              {
                const minW = parseInt(input.style.minWidth || `${Math.round(o.rect.w)}`, 10) || Math.round(o.rect.w)
                const desired = computeWidth(input.value)
                const finalW = Math.max(minW, desired)
                input.style.width = `${finalW}px`
              }
              input.style.height = `${Math.round(o.rect.h)}px`
            }
          }
          // Remove stale nodes
          for (const [key, node] of overlayNodes) {
            if (!desiredKeys.has(key)) {
              node.remove()
              overlayNodes.delete(key)
            }
          }
        }
        // Sync HTML list of saved instants via manager
        const listEl = listRef.current
        if (listEl && renderer) {
          if (!listManagerRef.current) {
            listManagerRef.current = new InstantListDomManager(listEl, controlsRef.current)
          }
          listManagerRef.current.update({ canvas, renderer })
        }
      }
      animationId = requestAnimationFrame(renderLoop)
    }
    renderLoop()

    // Click support for save/rename/delete
    const onClick = (e: MouseEvent) => {
      if (!renderer) return
      if (skipNextClick) { skipNextClick = false; return }
      const rect = canvas.getBoundingClientRect()
      const x = e.clientX - rect.left
      const y = e.clientY - rect.top
      renderer.handleClick(x, y)
    }
    canvas.addEventListener('click', onClick)

    // Cleanup function
    return () => {
      window.removeEventListener('resize', handleResize)
      canvas.removeEventListener('wheel', handleWheel)
      canvas.removeEventListener('pointerdown', onPointerDown)
      canvas.removeEventListener('pointermove', onPointerMove)
      canvas.removeEventListener('pointerup', onPointerUp)
      canvas.removeEventListener('pointercancel', onPointerUp)
      canvas.removeEventListener('dblclick', onDblClick)
      canvas.removeEventListener('span-time-input', onSpanTimeInput as EventListener)
      canvas.removeEventListener('instant-time-input', onInstantTimeInput as EventListener)
      canvas.removeEventListener('click', onClick)
      window.removeEventListener('keydown', onKeyDown)
      if (resizeTimeout) {
        clearTimeout(resizeTimeout)
      }
      if (animationId) {
        cancelAnimationFrame(animationId)
      }
      if (renderer) {
        renderer.destroy()
      }
      rendererRef.current = null
      if (listManagerRef.current) {
        listManagerRef.current.destroy()
        listManagerRef.current = null
      }
    }
  }, [moveCursorByIncrement])

  return (
    <div ref={containerRef} className={`relative w-full h-full ${className}`}>
      {/* Canvas */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full"
        style={{ 
          touchAction: 'none',
          maxWidth: 'none',
          minWidth: '100%'
        }}
      />
      {/* Controls row between canvas and list */}
      <div
        ref={controlsRef}
        style={{ position: 'absolute', top: 600, left: 0, right: 0, display: 'flex', justifyContent: 'center', gap: 12, padding: '8px 16px' }}
      >
        <div style={{ display: 'flex', gap: 12, background: 'rgba(0,0,0,0.4)', padding: 8, border: '2px solid #ffffff', boxShadow: '0 4px 12px rgba(0,0,0,0.4)' }}>
          <button
            aria-label="Zoom out"
            onClick={(e) => { e.stopPropagation(); rendererRef.current?.zoomOut() }}
            style={{ background: 'rgba(0,0,0,0.8)', color: '#ffffff', border: '2px solid #ffffff', padding: '8px 12px', font: 'bold 16px Arial', cursor: 'pointer' }}
          >
            Zoom out
          </button>
          <button
            aria-label="Previous instant"
            onClick={(e) => { e.stopPropagation(); goToPreviousInstant() }}
            style={{ background: 'rgba(0,0,0,0.8)', color: '#ffffff', border: '2px solid #ffffff', padding: '8px 12px', font: 'bold 16px Arial', cursor: 'pointer' }}
          >
            Previous instant
          </button>
          {/* Middle controls: -increment, NOW, +increment */}
          <div style={{ position: 'relative' }}>
            <button
              ref={minusButtonRef}
              aria-label={`Minus ${getCurrentIncrementLabel()}`}
              onClick={(e) => { 
                e.stopPropagation()
                minusLongPress.stop()
                moveCursorByIncrement(-1)
              }}
              onMouseDown={(e) => {
                e.stopPropagation()
                minusLongPress.start()
              }}
              onMouseUp={(e) => {
                e.stopPropagation()
                minusLongPress.stop()
              }}
              onMouseLeave={() => minusLongPress.stop()}
              onTouchStart={(e) => {
                e.stopPropagation()
                minusLongPress.start()
              }}
              onTouchEnd={(e) => {
                e.stopPropagation()
                minusLongPress.stop()
              }}
              style={{ background: 'rgba(0,0,0,0.8)', color: '#ffffff', border: '2px solid #ffffff', padding: '8px 12px', font: 'bold 16px Arial', cursor: 'pointer' }}
            >
              -{getCurrentIncrementLabel()}
            </button>
            {isDropdownOpen && dropdownTrigger === 'minus' && (
              <TimeIncrementDropdown
                currentIncrement={rendererRef.current?.getTimeIncrement?.() ?? '30m'}
                onIncrementChange={handleIncrementChange}
                isOpen={isDropdownOpen}
                onToggle={() => setIsDropdownOpen(false)}
                triggerRef={minusButtonRef}
              />
            )}
          </div>
          <button
            aria-label="Now"
            onClick={(e) => {
              e.stopPropagation()
              const r = rendererRef.current
              if (!r) return
              r.setViewFocus('now')
            }}
            style={{ background: 'rgba(0,0,0,0.8)', color: '#ef4444', border: '2px solid #ef4444', padding: '8px 12px', font: 'bold 16px Arial', cursor: 'pointer' }}
          >
            NOW
          </button>
          <div style={{ position: 'relative' }}>
            <button
              ref={plusButtonRef}
              aria-label={`Plus ${getCurrentIncrementLabel()}`}
              onClick={(e) => { 
                e.stopPropagation()
                plusLongPress.stop()
                moveCursorByIncrement(1)
              }}
              onMouseDown={(e) => {
                e.stopPropagation()
                plusLongPress.start()
              }}
              onMouseUp={(e) => {
                e.stopPropagation()
                plusLongPress.stop()
              }}
              onMouseLeave={() => plusLongPress.stop()}
              onTouchStart={(e) => {
                e.stopPropagation()
                plusLongPress.start()
              }}
              onTouchEnd={(e) => {
                e.stopPropagation()
                plusLongPress.stop()
              }}
              style={{ background: 'rgba(0,0,0,0.8)', color: '#ffffff', border: '2px solid #ffffff', padding: '8px 12px', font: 'bold 16px Arial', cursor: 'pointer' }}
            >
              +{getCurrentIncrementLabel()}
            </button>
            {isDropdownOpen && dropdownTrigger === 'plus' && (
              <TimeIncrementDropdown
                currentIncrement={rendererRef.current?.getTimeIncrement?.() ?? '30m'}
                onIncrementChange={handleIncrementChange}
                isOpen={isDropdownOpen}
                onToggle={() => setIsDropdownOpen(false)}
                triggerRef={plusButtonRef}
              />
            )}
          </div>
          <button
            aria-label="Next instant"
            onClick={(e) => { e.stopPropagation(); goToNextInstant() }}
            style={{ background: 'rgba(0,0,0,0.8)', color: '#ffffff', border: '2px solid #ffffff', padding: '8px 12px', font: 'bold 16px Arial', cursor: 'pointer' }}
          >
            Next instant
          </button>
          <button
            aria-label="Zoom in"
            onClick={(e) => { e.stopPropagation(); rendererRef.current?.zoomIn() }}
            style={{ background: 'rgba(0,0,0,0.8)', color: '#ffffff', border: '2px solid #ffffff', padding: '8px 12px', font: 'bold 16px Arial', cursor: 'pointer' }}
          >
            Zoom in
          </button>
        </div>
      </div>
      {/* HTML overlays (no pointer events except on children we enable) */}
      <div ref={overlaysRef} style={{ position: 'fixed', inset: 0, pointerEvents: 'none' }} />
      {/* Time input overlay is now managed as DOM overlay like label editors */}
      {/* Saved instants list */}
      <div ref={listRef} className="w-full" style={{ position: 'absolute', top: 600, left: 0, right: 0, padding: 16, display: 'flex', justifyContent: 'center' }} />
    </div>
  )
}
