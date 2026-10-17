import { Timeline } from './components/timeline/Timeline.tsx'
import { ControlBar } from './components/panels/ControlBar.tsx'
import { AgendaShell } from './components/panels/AgendaShell.tsx'
import { useLayout } from './store/layout.ts'
import { RingingAlarms } from './components/panels/RingingAlarms.tsx'
import { LemonPrompt } from './components/panels/LemonPrompt.tsx'
import { HelpDialog } from './components/panels/Help.tsx'
import { useHotkeys } from './hooks/useHotkeys.ts'

export default function App() {
  useHotkeys()
  const agenda = useLayout(s => s.agendaPlacement)
  return (
    <div className="app" data-agenda={agenda}>
      {/* Docked at the side, the Agenda is on the left, where the drawer slides out from. */}
      {agenda === 'side' && <AgendaShell />}
      <div className="app__main">
        <Timeline />
        <ControlBar />
      </div>
      {agenda !== 'side' && <AgendaShell />}
      <RingingAlarms />
      <LemonPrompt />
      <HelpDialog />
    </div>
  )
}
