// The ☰ button in the timeline's date row: opens the Agenda drawer. Shown only while the Agenda is a drawer.
import { Bars3Icon } from '@heroicons/react/24/outline'
import { useLayout } from '../../store/layout.ts'
import { ui, useUi } from '../../store/ui.ts'

export function AgendaButton() {
  const placement = useLayout(s => s.agendaPlacement)
  const open = useUi(s => s.agendaOpen)
  if (placement !== 'drawer') return null
  return (
    <button
      type="button"
      className="tl-agenda-btn glow-box"
      data-no-pan
      aria-label="Open Agenda"
      aria-expanded={open}
      title="Agenda"
      onClick={ui.openAgenda}
    >
      <Bars3Icon aria-hidden />
    </button>
  )
}
