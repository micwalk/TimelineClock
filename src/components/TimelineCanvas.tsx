import React, { useRef, useEffect, useState } from 'react'
import { TimelineRenderer } from '../canvas/TimelineRenderer'

interface TimelineCanvasProps {
  className?: string
}

export const TimelineCanvas: React.FC<TimelineCanvasProps> = ({ className = '' }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [currentTime, setCurrentTime] = useState<string>('')
  const [nowPosition, setNowPosition] = useState<number>(0)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    // Set canvas size
    const resizeCanvas = () => {
      const rect = canvas.getBoundingClientRect()
      canvas.width = rect.width * window.devicePixelRatio
      canvas.height = rect.height * window.devicePixelRatio
      canvas.style.width = `${rect.width}px`
      canvas.style.height = `${rect.height}px`
    }

    resizeCanvas()
    window.addEventListener('resize', resizeCanvas)

    // Initialize renderer
    const newRenderer = new TimelineRenderer(canvas)

    // Start rendering loop
    let animationId: number
    const renderLoop = () => {
      newRenderer.render()
      animationId = requestAnimationFrame(renderLoop)
    }
    renderLoop()

    // Update current time and NOW position
    const updateTime = () => {
      const now = new Date()
      const currentHour = now.getHours()
      const currentMinute = now.getMinutes()
      
      // Calculate NOW position for proper centering
      const minutesSinceMidnight = currentHour * 60 + currentMinute
      const timelinePosition = (minutesSinceMidnight / (24 * 60)) * canvas.width
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

    return () => {
      window.removeEventListener('resize', resizeCanvas)
      cancelAnimationFrame(animationId)
      clearInterval(timeInterval)
      newRenderer.destroy()
    }
  }, [])

  return (
    <div className={`relative w-full h-full ${className}`}>
      {/* Canvas */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full"
        style={{ touchAction: 'none' }}
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
