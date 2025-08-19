import React, { useRef, useEffect, useState } from 'react'
import { TimelineRenderer } from '../canvas/TimelineRenderer'

interface TimelineCanvasProps {
  className?: string
}

export const TimelineCanvas: React.FC<TimelineCanvasProps> = ({ className = '' }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [currentTime, setCurrentTime] = useState<string>('')
  const [nowPosition, setNowPosition] = useState<number>(0)

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

    // Update current time and NOW position
    const updateTime = () => {
      const now = new Date()
      const currentHour = now.getHours()
      const currentMinute = now.getMinutes()
      
      // Calculate NOW position using CSS width (not canvas buffer width)
      const minutesSinceMidnight = currentHour * 60 + currentMinute
      const cssWidth = parseFloat(canvas.style.width) || canvas.offsetWidth
      const timelinePosition = (minutesSinceMidnight / (24 * 60)) * cssWidth
      setNowPosition(timelinePosition)
      
      // Format time in 12-hour format with AM/PM
      setCurrentTime(now.toLocaleTimeString('en-US', { 
        hour12: true,
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      }))
    }
    updateTime()
    const timeInterval = setInterval(updateTime, 1000)

    // Start rendering loop
    let animationId: number
    const renderLoop = () => {
      if (renderer) {
        renderer.render()
      }
      animationId = requestAnimationFrame(renderLoop)
    }
    renderLoop()

    return () => {
      window.removeEventListener('resize', handleResize)
      if (resizeTimeout) {
        clearTimeout(resizeTimeout)
      }
      cancelAnimationFrame(animationId)
      clearInterval(timeInterval)
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
      
      {/* NOW label - positioned at actual NOW line position */}
      <div 
        className="absolute top-1/2 transform -translate-y-1/2 z-10"
        style={{ 
          left: `${nowPosition}px`,
          transform: 'translate(-50%, -50%) translateY(40px)'
        }}
      >
        <div className="text-red-500 font-bold text-lg tracking-wider">
          NOW
        </div>
      </div>
      
      {/* Current time display - positioned below NOW label */}
      <div 
        className="absolute top-1/2 transform -translate-y-1/2 z-10"
        style={{ 
          left: `${nowPosition}px`,
          transform: 'translate(-50%, -50%) translateY(70px)'
        }}
      >
        <div className="text-white font-mono text-2xl font-bold tracking-wider">
          {currentTime}
        </div>
      </div>
    </div>
  )
}
