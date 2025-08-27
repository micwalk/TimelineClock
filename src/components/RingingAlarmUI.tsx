import React from 'react'
import type { RingingAlarm } from '../canvas/core/TimelineState'

interface RingingAlarmUIProps {
  ringingAlarms: RingingAlarm[]
  onDismiss: (instantId: string) => void
  onSnooze: (instantId: string, minutes?: number) => void
  onSilence: () => void
}

export const RingingAlarmUI: React.FC<RingingAlarmUIProps> = ({
  ringingAlarms,
  onDismiss,
  onSnooze,
  onSilence
}) => {
  if (ringingAlarms.length === 0) {
    return null
  }

  return (
    <div 
      style={{
        position: 'fixed',
        top: '20px',
        right: '20px',
        zIndex: 1000,
        background: 'rgba(239, 68, 68, 0.95)',
        border: '2px solid #ffffff',
        borderRadius: '12px',
        padding: '16px',
        minWidth: '300px',
        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3)',
        animation: 'pulse 2s infinite'
      }}
    >
      <style>
        {`
          @keyframes pulse {
            0%, 100% { transform: scale(1); }
            50% { transform: scale(1.02); }
          }
        `}
      </style>
      
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: '12px' }}>
        <div style={{ 
          fontSize: '24px', 
          marginRight: '12px',
          animation: 'shake 0.5s infinite'
        }}>
          🔔
        </div>
        <div style={{ 
          fontSize: '18px', 
          fontWeight: 'bold', 
          color: '#ffffff' 
        }}>
          ALARM
        </div>
      </div>
      
      <style>
        {`
          @keyframes shake {
            0%, 100% { transform: translateX(0); }
            25% { transform: translateX(-2px); }
            75% { transform: translateX(2px); }
          }
        `}
      </style>

      {ringingAlarms.map((alarm) => (
        <div 
          key={alarm.instantId}
          style={{
            background: 'rgba(255, 255, 255, 0.1)',
            borderRadius: '8px',
            padding: '12px',
            marginBottom: '8px'
          }}
        >
          <div style={{ 
            fontSize: '16px', 
            fontWeight: 'bold', 
            color: '#ffffff',
            marginBottom: '4px'
          }}>
            {alarm.label || 'Alarm'}
          </div>
          <div style={{ 
            fontSize: '14px', 
            color: 'rgba(255, 255, 255, 0.8)',
            marginBottom: '8px'
          }}>
            {new Date(alarm.tsEpochMs).toLocaleTimeString()}
          </div>
          
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              onClick={() => onDismiss(alarm.instantId)}
              style={{
                background: '#dc2626',
                color: '#ffffff',
                border: 'none',
                borderRadius: '6px',
                padding: '8px 12px',
                fontSize: '14px',
                fontWeight: 'bold',
                cursor: 'pointer',
                flex: 1
              }}
            >
              Dismiss
            </button>
            <button
              onClick={() => onSnooze(alarm.instantId, 5)}
              style={{
                background: '#f59e0b',
                color: '#ffffff',
                border: 'none',
                borderRadius: '6px',
                padding: '8px 12px',
                fontSize: '14px',
                fontWeight: 'bold',
                cursor: 'pointer',
                flex: 1
              }}
            >
              Snooze (5m)
            </button>
          </div>
        </div>
      ))}
      
      <button
        onClick={onSilence}
        style={{
          background: 'rgba(255, 255, 255, 0.2)',
          color: '#ffffff',
          border: '1px solid rgba(255, 255, 255, 0.3)',
          borderRadius: '6px',
          padding: '8px 16px',
          fontSize: '14px',
          fontWeight: 'bold',
          cursor: 'pointer',
          width: '100%',
          marginTop: '8px'
        }}
      >
        Silence Sound
      </button>
    </div>
  )
}
