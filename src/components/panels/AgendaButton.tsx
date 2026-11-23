// The ☰ button in the timeline's date row: opens the Agenda drawer. Shown only while the Agenda is a drawer.
import { Bars3Icon } from '@heroicons/react/24/outline'
import { useLayout } from '../../store/layout.ts'
import { ui, useUi } from '../../store/ui.ts'
import { useTodoNowCount } from '../../hooks/useTodos.ts'

export function AgendaButton() {
  const placement = useLayout(s => s.agendaPlacement)
  const open = useUi(s => s.agendaOpen)
  // Todos that rang and aren't done: a small badge (todos show nowhere else).
  const todos = useTodoNowCount()
  if (placement !== 'drawer') return null
  return (
    <button
      type="button"
      className="tl-agenda-btn glow-box"
      data-no-pan
      aria-label={todos > 0 ? `Open Agenda (${todos} to do now)` : 'Open Agenda'}
      aria-expanded={open}
      title="Agenda"
      onClick={ui.openAgenda}
    >
      <Bars3Icon aria-hidden />
      {todos > 0 && <span className="tl-agenda-btn__badge" aria-hidden>{todos}</span>}
    </button>
  )
}
