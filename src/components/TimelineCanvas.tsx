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

    resizeCanvas()
    window.addEventListener('resize', handleResize)

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
