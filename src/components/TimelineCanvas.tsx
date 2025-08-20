import React, { useRef, useEffect } from 'react'
import { TimelineRenderer } from '../canvas/TimelineRenderer'

interface TimelineCanvasProps {
  className?: string
}

export const TimelineCanvas: React.FC<TimelineCanvasProps> = ({ className = '' }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

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
      const containerHeight = window.innerHeight
      
      // Set CSS size first (this is what the user sees)
      canvas.style.width = `${containerWidth}px`
      canvas.style.height = `${containerHeight}px`
      
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
    let lastX = 0
    const onPointerDown = (e: PointerEvent) => {
      isPointerDown = true
      lastX = e.clientX
      canvas.setPointerCapture(e.pointerId)
      if (renderer) renderer.setViewMode('cursor')
    }
    const onPointerMove = (e: PointerEvent) => {
      if (!isPointerDown || !renderer) return
      const dx = e.clientX - lastX
      lastX = e.clientX
      renderer.panByPixels(dx)
    }
    const onPointerUp = (e: PointerEvent) => {
      if (!isPointerDown) return
      isPointerDown = false
      canvas.releasePointerCapture(e.pointerId)
      if (renderer) {
        // If center is near now, snap back to now mode
        const snapped = renderer.snapToNowIfClose(12)
        if (!snapped) {
          renderer.setViewMode('cursor')
        }
      }
    }

    resizeCanvas()
    window.addEventListener('resize', handleResize)
    canvas.addEventListener('wheel', handleWheel, { passive: false })
    canvas.addEventListener('pointerdown', onPointerDown)
    canvas.addEventListener('pointermove', onPointerMove)
    canvas.addEventListener('pointerup', onPointerUp)
    canvas.addEventListener('pointercancel', onPointerUp)

    // Start rendering loop
    let animationId: number
    const renderLoop = () => {
      if (renderer) {
        renderer.render()
      }
      animationId = requestAnimationFrame(renderLoop)
    }
    renderLoop()

    // Cleanup function
    return () => {
      window.removeEventListener('resize', handleResize)
      canvas.removeEventListener('wheel', handleWheel)
      canvas.removeEventListener('pointerdown', onPointerDown)
      canvas.removeEventListener('pointermove', onPointerMove)
      canvas.removeEventListener('pointerup', onPointerUp)
      canvas.removeEventListener('pointercancel', onPointerUp)
      if (resizeTimeout) {
        clearTimeout(resizeTimeout)
      }
      if (animationId) {
        cancelAnimationFrame(animationId)
      }
      if (renderer) {
        renderer.destroy()
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
    </div>
  )
}
