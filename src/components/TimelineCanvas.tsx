import React, { useRef, useEffect } from 'react'
import { TimelineRenderer } from '../canvas/TimelineRenderer.ts'
import { InstantListDomManager } from './InstantListDomManager.ts'
import type { InstantView } from '../types/instants.ts'

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

  // Helpers for navigation and cursor movement
  const moveCursorByMs = (deltaMs: number) => {
    const r = rendererRef.current
    if (!r) return
    const center = r.getTimeCenter?.() ?? Date.now()
    r.setTimeCenter(center + deltaMs)
    r.setViewFocus('cursor')
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
        r.setViewFocus('instant', target.id)
        r.setTimeCenter(target.tsEpochMs)
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
        r.setViewFocus('instant', target.id)
        r.setTimeCenter(target.tsEpochMs)
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

      // Position list below canvas
      const controlsEl = controlsRef.current
      if (controlsEl) {
        controlsEl.style.top = `${containerHeight}px`
        controlsEl.style.zIndex = '20'
      }
      if (listRef.current) {
        const controlsH = controlsEl?.getBoundingClientRect().height ?? 0
        listRef.current.style.top = `${containerHeight + Math.ceil(controlsH)}px`
        listRef.current.style.zIndex = '10'
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
        moveCursorByMs(30 * 60 * 1000)
        return
      }
      if (lower === 'z') {
        e.preventDefault()
        moveCursorByMs(-30 * 60 * 1000)
        return
      }
      if (lower === 'r') {
        e.preventDefault()
        rendererRef.current?.setViewFocus('now')
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
          const list = renderer.getOverlayElements()
          const desiredKeys = new Set<string>()
          for (const o of list) {
            if (o.type === 'instant-label' && o.id) {
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
                input.onchange = () => { renderer!.updateInstantLabel(o.id!, input!.value) }
                input.onblur = () => { renderer!.endEditing() }
                input.onkeydown = (ev) => {
                  if (ev.key === 'Enter') { (ev.target as HTMLInputElement).blur() }
                  if (ev.key === 'Escape') { (ev.target as HTMLInputElement).blur() }
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
              input.style.width = `${Math.round(o.rect.w)}px`
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
  }, [])

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
          {/* Middle controls: -30m, NOW, +30m */}
          <button
            aria-label="Minus 30 minutes"
            onClick={(e) => { e.stopPropagation(); moveCursorByMs(-30 * 60 * 1000) }}
            style={{ background: 'rgba(0,0,0,0.8)', color: '#ffffff', border: '2px solid #ffffff', padding: '8px 12px', font: 'bold 16px Arial', cursor: 'pointer' }}
          >
            -30 minutes
          </button>
          <button
            aria-label="Now"
            onClick={(e) => {
              e.stopPropagation()
              const r = rendererRef.current
              if (!r) return
              r.setViewFocus('now')
            }}
            style={{ background: 'rgba(0,0,0,0.8)', color: '#ffffff', border: '2px solid #ffffff', padding: '8px 12px', font: 'bold 16px Arial', cursor: 'pointer' }}
          >
            NOW
          </button>
          <button
            aria-label="Plus 30 minutes"
            onClick={(e) => { e.stopPropagation(); moveCursorByMs(30 * 60 * 1000) }}
            style={{ background: 'rgba(0,0,0,0.8)', color: '#ffffff', border: '2px solid #ffffff', padding: '8px 12px', font: 'bold 16px Arial', cursor: 'pointer' }}
          >
            +30 minutes
          </button>
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
      {/* Saved instants list */}
      <div ref={listRef} className="w-full" style={{ position: 'absolute', top: 600, left: 0, right: 0, padding: 16, display: 'flex', justifyContent: 'center' }} />
    </div>
  )
}
