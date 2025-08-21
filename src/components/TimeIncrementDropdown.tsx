import React, { useState, useRef, useEffect } from 'react'
import type { TimeIncrement, TimeIncrementOption } from '../canvas/core/TimelineState'
import { TIME_INCREMENT_OPTIONS } from '../canvas/core/TimelineState'

interface TimeIncrementDropdownProps {
  currentIncrement: TimeIncrement
  onIncrementChange: (increment: TimeIncrement) => void
  isOpen: boolean
  onToggle: () => void
  triggerRef?: React.RefObject<HTMLElement | null>
}

export const TimeIncrementDropdown: React.FC<TimeIncrementDropdownProps> = ({
  currentIncrement,
  onIncrementChange,
  isOpen,
  onToggle,
  triggerRef
}) => {
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node) &&
        triggerRef?.current &&
        !triggerRef.current.contains(event.target as Node)
      ) {
        onToggle()
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isOpen, onToggle, triggerRef])

  // Close dropdown on escape key
  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && isOpen) {
        onToggle()
      }
    }

    if (isOpen) {
      document.addEventListener('keydown', handleEscape)
      return () => document.removeEventListener('keydown', handleEscape)
    }
  }, [isOpen, onToggle])

  if (!isOpen) return null

  const handleOptionClick = (increment: TimeIncrement) => {
    onIncrementChange(increment)
    onToggle()
  }

  return (
    <div
      ref={dropdownRef}
      className="absolute z-50 mt-2 w-48 rounded-md shadow-lg bg-white dark:bg-gray-800 ring-1 ring-black ring-opacity-5"
      style={{
        background: 'rgba(0,0,0,0.9)',
        border: '2px solid #ffffff',
        boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
        minWidth: '200px'
      }}
    >
      <div className="py-1" role="menu" aria-orientation="vertical">
        {TIME_INCREMENT_OPTIONS.map((option) => (
          <button
            key={option.value}
            onClick={() => handleOptionClick(option.value)}
            className={`block w-full text-left px-4 py-2 text-sm transition-colors duration-150 ${
              currentIncrement === option.value
                ? 'bg-blue-600 text-white'
                : 'text-white hover:bg-gray-700'
            }`}
            style={{
              background: currentIncrement === option.value ? 'rgba(59, 130, 246, 0.8)' : 'transparent',
              color: '#ffffff',
              font: 'bold 14px Arial',
              border: 'none',
              cursor: 'pointer'
            }}
            role="menuitem"
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  )
}
