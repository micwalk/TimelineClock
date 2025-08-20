import React, { useRef, useEffect } from 'react'
import { TimelineRenderer } from '../canvas/TimelineRenderer.ts'

interface TimelineCanvasProps {
  className?: string
}

export const TimelineCanvas: React.FC<TimelineCanvasProps> = ({ className = '' }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const overlaysRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<(HTMLDivElement & { _lastVersion?: number; _lastRenderAt?: number }) | null>(null)
  const controlsRef = useRef<HTMLDivElement>(null)
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
    const instants = r.getSavedInstantsSnapshot().slice().sort((a, b) => a.ts - b.ts)
    if (instants.length === 0) return
    const focus = r.getViewFocus?.() ?? { mode: 'now', focusedInstantId: null as string | null }
    let anchorTs: number
    if (focus.mode === 'instant' && focus.focusedInstantId) {
      const cur = instants.find(i => i.id === focus.focusedInstantId)
      anchorTs = cur ? cur.ts : Date.now()
    } else if (focus.mode === 'cursor') {
      anchorTs = r.getTimeCenter?.() ?? Date.now()
    } else {
      anchorTs = Date.now()
    }
    let target: { id: string; ts: number } | null = null
    for (let i = instants.length - 1; i >= 0; i--) {
      if (instants[i].ts < anchorTs) { target = instants[i]; break }
    }
    if (target) {
      r.setViewFocus('instant', target.id)
      r.setTimeCenter(target.ts)
    }
  }

  const goToNextInstant = () => {
    const r = rendererRef.current
    if (!r) return
    const instants = r.getSavedInstantsSnapshot().slice().sort((a, b) => a.ts - b.ts)
    if (instants.length === 0) return
    const focus = r.getViewFocus?.() ?? { mode: 'now', focusedInstantId: null as string | null }
    let anchorTs: number
    if (focus.mode === 'instant' && focus.focusedInstantId) {
      const cur = instants.find(i => i.id === focus.focusedInstantId)
      anchorTs = cur ? cur.ts : Date.now()
    } else if (focus.mode === 'cursor') {
      anchorTs = r.getTimeCenter?.() ?? Date.now()
    } else {
      anchorTs = Date.now()
    }
    const target = instants.find(i => i.ts > anchorTs) || null
    if (target) {
      r.setViewFocus('instant', target.id)
      r.setTimeCenter(target.ts)
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
        // Sync HTML list of saved instants (throttle rerenders)
        const listEl = listRef.current
        if (listEl && renderer) {
          const version = renderer.getStateVersion?.() ?? 0
          const nowTs = Date.now()
          if (listEl._lastVersion === version && listEl._lastRenderAt && nowTs - listEl._lastRenderAt < 1000) {
            // skip frequent refresh to keep DOM stable for clicks/inspect
          } else {
            listEl._lastVersion = version
            listEl._lastRenderAt = nowTs
            // Keep list positioned below controls dynamically
            const rect = canvas.getBoundingClientRect()
            const controlsH = controlsRef.current?.getBoundingClientRect().height ?? 0
            listEl.style.top = `${Math.round(rect.height + controlsH)}px`
            // Ensure tabs exist once
            let tabs = (listEl.querySelector('[data-role="instants-tabs"]') as HTMLElement) || null
            if (!tabs) {
              tabs = document.createElement('div')
              tabs.dataset.role = 'instants-tabs'
              tabs.style.display = 'flex'
              tabs.style.gap = '16px'
              tabs.style.borderBottom = '2px solid #ffffff'
              tabs.style.marginBottom = '8px'
              const tabAll = document.createElement('div')
              tabAll.textContent = 'All Instants'
              tabAll.style.font = 'bold 16px Arial'
              tabAll.style.color = '#ffffff'
              tabAll.style.padding = '6px 8px'
              tabAll.style.borderBottom = '3px solid #22d3ee'
              const tabFav = document.createElement('div')
              tabFav.textContent = 'Favorites'
              tabFav.style.font = 'bold 16px Arial'
              tabFav.style.color = '#94a3b8'
              tabFav.style.padding = '6px 8px'
              tabs.appendChild(tabAll)
              tabs.appendChild(tabFav)
              listEl.innerHTML = ''
              listEl.appendChild(tabs)
            }
            // Persistent scroller
            let scroller = (listEl.querySelector('[data-role="instants-scroller"]') as HTMLElement) || null
            if (!scroller) {
              scroller = document.createElement('div')
              scroller.dataset.role = 'instants-scroller'
              scroller.style.overflowY = 'scroll'
              scroller.style.scrollbarGutter = 'stable both-edges'
              scroller.style.width = '100%'
              scroller.style.boxSizing = 'border-box'
              scroller.style.paddingRight = '8px'
              scroller.onwheel = (evt) => { evt.stopPropagation() }
              listEl.appendChild(scroller)
            }
            // Update scroller height dynamically each frame to account for canvas size and controls height
            {
              const rect2 = canvas.getBoundingClientRect()
              const controlsH2 = controlsRef.current?.getBoundingClientRect().height ?? 0
              const maxH = `calc(100vh - ${Math.round(rect2.height)}px - 40px - ${Math.round(controlsH2)}px)`
              scroller.style.maxHeight = maxH
            }

            // Capture previous positions (FLIP)
            const prevPos = new Map<string, number>()
            Array.from(scroller.children).forEach((el) => {
              const elem = el as HTMLElement
              const key = elem.dataset.key
              if (key) prevPos.set(key, elem.getBoundingClientRect().top)
            })

            // Build unified entries
            const items = renderer.getSavedInstantsSnapshot().slice().sort((a, b) => a.ts - b.ts)
            const focus = renderer.getViewFocus?.() ?? { mode: 'now', focusedInstantId: null }
            const entries: Array<{ key: string; ts: number; name: string; focused: boolean; instantKind: 'now'|'cursor'|'instant'; id?: string }> = []
            const nowTsEntry = nowTs
            entries.push({ key: 'now', ts: nowTsEntry, name: 'Now', focused: focus.mode === 'now', instantKind: 'now' })
            if (focus.mode === 'cursor') {
              const cursorTs = renderer.getTimeCenter?.() ?? nowTsEntry
              entries.push({ key: 'cursor', ts: cursorTs, name: 'Cursor', focused: true, instantKind: 'cursor' })
            }
            for (const it of items) {
              const focused = focus.mode === 'instant' && focus.focusedInstantId === it.id
              entries.push({ key: `i:${it.id}`, ts: it.ts, name: it.label || '(unnamed)', focused, instantKind: 'instant', id: it.id })
            }
            entries.sort((a, b) => a.ts - b.ts)

            // Reconcile DOM nodes in sorted order, creating or updating as needed
            const presentKeys = new Set<string>()
            let focusedRowEl: HTMLElement | null = null
            for (const en of entries) {
              presentKeys.add(en.key)
              let card = scroller.querySelector(`[data-key="${en.key}"]`) as HTMLElement | null
              if (!card) {
                card = document.createElement('div')
                card.dataset.key = en.key
                card.style.display = 'grid'
                card.style.gridTemplateColumns = '2fr 1.3fr 1.3fr'
                card.style.alignItems = 'center'
                card.style.background = 'rgba(0,0,0,0.6)'
                card.style.color = '#ffffff'
                card.style.padding = '8px 12px'
                card.style.marginBottom = '10px'
                card.style.cursor = 'pointer'
                card.style.willChange = 'transform'
                card.onpointerdown = (ev) => { ev.stopPropagation() }
                // click handler bound below after content update
                // children
                const name = document.createElement('div'); name.dataset.role = 'name'; name.style.font = 'bold 16px Arial'
                const dt = document.createElement('div'); dt.dataset.role = 'dt'; dt.style.font = 'bold 14px monospace'
                const dur = document.createElement('div'); dur.dataset.role = 'dur'; dur.style.font = 'bold 14px monospace'; dur.style.opacity = '0.9'; dur.style.whiteSpace = 'pre'
                card.appendChild(name); card.appendChild(dt); card.appendChild(dur)
              }
              // Update content
              const nameEl = card.querySelector('[data-role="name"]') as HTMLElement
              const dtEl = card.querySelector('[data-role="dt"]') as HTMLElement
              const durEl = card.querySelector('[data-role="dur"]') as HTMLElement
              nameEl.textContent = en.name
              dtEl.textContent = new Date(en.ts).toLocaleString()
              // Signed HH:MM:SS duration relative to Now; Now shows fixed ' 00:00:00'
              if (en.instantKind === 'now') {
                durEl.textContent = ' 00:00:00'
                durEl.style.color = '#ffffff'
              } else {
                const diffMs = en.ts - Date.now()
                const sign = diffMs >= 0 ? 1 : -1
                const abs = Math.abs(diffMs)
                const totalSeconds = Math.floor(abs / 1000)
                const hours = Math.floor(totalSeconds / 3600)
                const minutes = Math.floor((totalSeconds % 3600) / 60)
                const seconds = totalSeconds % 60
                const hh = hours.toString().padStart(2, '0')
                const mm = minutes.toString().padStart(2, '0')
                const ss = seconds.toString().padStart(2, '0')
                const text = `${sign > 0 ? '+' : '-'}${hh}:${mm}:${ss}`
                durEl.textContent = text
                durEl.style.color = sign > 0 ? '#93c5fd' : '#fca5a5' // light blue / light red
              }
              card.style.border = `2px solid ${en.focused ? '#22d3ee' : '#ffffff'}`
              // Rebind click handler every update
              card.onclick = () => {
                const r = rendererRef.current
                if (!r) return
                if (en.instantKind === 'now') {
                  r.setViewFocus('now')
                } else if (en.instantKind === 'cursor') {
                  r.setViewFocus('cursor')
                } else {
                  r.setViewFocus('instant', en.id!)
                  r.setTimeCenter(en.ts)
                }
                card!.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
              }
              // Append in order (this will reorder if necessary)
              scroller.appendChild(card)
              if (en.focused) focusedRowEl = card
            }

            // Remove nodes not present
            Array.from(scroller.children).forEach((el) => {
              const elem = el as HTMLElement
              const key = elem.dataset.key
              if (key && !presentKeys.has(key)) elem.remove()
            })

            // FLIP: measure new positions and animate
            Array.from(scroller.children).forEach((el) => {
              const elem = el as HTMLElement
              const key = elem.dataset.key
              if (!key) return
              const prevTop = prevPos.get(key)
              const newTop = elem.getBoundingClientRect().top
              if (prevTop !== undefined) {
                const delta = prevTop - newTop
                if (delta !== 0) {
                  elem.style.transition = 'none'
                  elem.style.transform = `translateY(${delta}px)`
                  requestAnimationFrame(() => {
                    elem.style.transition = 'transform 280ms ease'
                    elem.style.transform = 'translateY(0)'
                  })
                }
              }
            })

            // Ensure focused row is visible
            if (focusedRowEl) focusedRowEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
          }
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
