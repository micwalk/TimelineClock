import React, { useState, useRef, useEffect, useCallback } from 'react'

interface TimeInputProps {
  initialValue: string // Format: "hh:mm:ss" or "-hh:mm:ss"
  onConfirm: (timeString: string) => void
  onCancel: () => void
  position: { x: number; y: number }
}

export const TimeInput: React.FC<TimeInputProps> = ({
  initialValue,
  onConfirm,
  onCancel,
  position
}) => {
  console.log('TimeInput component rendering with:', { initialValue, position })
  
  const [hours, setHours] = useState('')
  const [minutes, setMinutes] = useState('')
  const [seconds, setSeconds] = useState('')
  const [isNegative, setIsNegative] = useState(false)
  
  const hoursRef = useRef<HTMLInputElement>(null)
  const minutesRef = useRef<HTMLInputElement>(null)
  const secondsRef = useRef<HTMLInputElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  // Parse initial value
  useEffect(() => {
    const cleanValue = initialValue.replace(/^[+-]/, '')
    const parts = cleanValue.split(':')
    if (parts.length === 3) {
      setHours(parts[0])
      setMinutes(parts[1])
      setSeconds(parts[2])
      setIsNegative(initialValue.startsWith('-'))
    }
  }, [initialValue])

  // Focus first input on mount
  useEffect(() => {
    if (hoursRef.current) {
      hoursRef.current.focus()
      hoursRef.current.select()
    }
  }, [])

  // Handle outside clicks
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        onCancel()
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [onCancel])

  // Handle escape key
  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onCancel()
      }
    }

    document.addEventListener('keydown', handleEscape)
    return () => document.removeEventListener('keydown', handleEscape)
  }, [onCancel])

  const formatTimeString = useCallback(() => {
    const sign = isNegative ? '-' : ''
    const hh = hours.padStart(2, '0')
    const mm = minutes.padStart(2, '0')
    const ss = seconds.padStart(2, '0')
    return `${sign}${hh}:${mm}:${ss}`
  }, [hours, minutes, seconds, isNegative])

  const handleConfirm = useCallback(() => {
    const timeString = formatTimeString()
    onConfirm(timeString)
  }, [formatTimeString, onConfirm])

  const handleKeyDown = useCallback((event: React.KeyboardEvent, currentRef: React.RefObject<HTMLInputElement>, nextRef?: React.RefObject<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault()
      handleConfirm()
      return
    }

    if (event.key === 'Tab') {
      event.preventDefault()
      if (nextRef?.current) {
        nextRef.current.focus()
        nextRef.current.select()
      }
      return
    }

    // Allow only numbers and backspace
    if (!/^\d$/.test(event.key) && event.key !== 'Backspace' && event.key !== 'Delete' && event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') {
      event.preventDefault()
      return
    }

    // Auto-advance to next field when 2 digits are entered
    if (/^\d$/.test(event.key) && currentRef.current) {
      const currentValue = currentRef.current.value
      if (currentValue.length === 1) {
        // Will become 2 digits, advance to next field
        setTimeout(() => {
          if (nextRef?.current) {
            nextRef.current.focus()
            nextRef.current.select()
          }
        }, 0)
      }
    }
  }, [handleConfirm])

  const handleInputChange = useCallback((value: string, setter: (val: string) => void, maxValue: number) => {
    // Remove non-digits
    const cleanValue = value.replace(/\D/g, '')
    
    // Limit to maxValue
    const numValue = parseInt(cleanValue, 10)
    if (numValue > maxValue) {
      setter(maxValue.toString().padStart(2, '0'))
    } else {
      setter(cleanValue)
    }
  }, [])

  return (
    <div
      ref={containerRef}
      className="absolute bg-black bg-opacity-90 border border-white rounded-lg p-3 shadow-lg"
      style={{
        left: `${position.x}px`,
        top: `${position.y}px`,
        transform: 'translate(-50%, -100%)',
        marginTop: '-5px',
        zIndex: 20000,
        position: 'absolute'
      }}
    >
      <div className="flex items-center space-x-1">
        <button
          onClick={() => setIsNegative(!isNegative)}
          className={`px-2 py-1 text-sm font-mono rounded ${
            isNegative ? 'bg-red-600 text-white' : 'bg-gray-600 text-gray-300'
          }`}
        >
          {isNegative ? '-' : '+'}
        </button>
        
        <input
          ref={hoursRef}
          type="text"
          value={hours}
          onChange={(e) => handleInputChange(e.target.value, setHours, 23)}
          onKeyDown={(e) => handleKeyDown(e, hoursRef, minutesRef)}
          className="w-12 h-8 text-center bg-transparent border border-white text-white font-mono text-lg rounded"
          maxLength={2}
          placeholder="00"
        />
        
        <span className="text-white font-mono text-lg">:</span>
        
        <input
          ref={minutesRef}
          type="text"
          value={minutes}
          onChange={(e) => handleInputChange(e.target.value, setMinutes, 59)}
          onKeyDown={(e) => handleKeyDown(e, minutesRef, secondsRef)}
          className="w-12 h-8 text-center bg-transparent border border-white text-white font-mono text-lg rounded"
          maxLength={2}
          placeholder="00"
        />
        
        <span className="text-white font-mono text-lg">:</span>
        
        <input
          ref={secondsRef}
          type="text"
          value={seconds}
          onChange={(e) => handleInputChange(e.target.value, setSeconds, 59)}
          onKeyDown={(e) => handleKeyDown(e, secondsRef)}
          className="w-12 h-8 text-center bg-transparent border border-white text-white font-mono text-lg rounded"
          maxLength={2}
          placeholder="00"
        />
      </div>
      
      <div className="flex justify-between mt-2">
        <button
          onClick={onCancel}
          className="px-3 py-1 text-sm bg-gray-600 text-white rounded hover:bg-gray-500"
        >
          Cancel
        </button>
        <button
          onClick={handleConfirm}
          className="px-3 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-500"
        >
          OK
        </button>
      </div>
    </div>
  )
}
