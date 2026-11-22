// A short note over the bottom of the timeline with one choice, gone by itself after a few
// seconds (store/ui showToast): "Laundry is back on the list · Delete todo". Esc or ✕ closes it.
// Phase 2a's Undo (docs/prd_todos_phase2.md) is meant to speak through it too.
import { useEffect } from 'react'
import { XMarkIcon } from '@heroicons/react/20/solid'
import { ui, useUi } from '../../store/ui.ts'
import { IconButton } from './IconButton.tsx'

export function Toast() {
  const toast = useUi(s => s.toast)
  useEffect(() => {
    if (!toast) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') ui.closeToast() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [toast])
  if (!toast) return null
  return (
    <div key={toast.n} className="toast glow-box" role="status" aria-live="polite" data-no-pan>
      <span className="toast__text">{toast.text}</span>
      {toast.action && (
        <button type="button" className={`toast__action glow-box${toast.action.danger ? ' is-danger' : ''}`}
          onClick={() => { toast.action!.run(); ui.closeToast() }}>
          {toast.action.label}
        </button>
      )}
      <IconButton icon={XMarkIcon} label="Close" color="var(--ink-dim)" bare onClick={() => ui.closeToast()} />
    </div>
  )
}
