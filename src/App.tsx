import { Timeline } from './components/timeline/Timeline.tsx'
import { ControlBar } from './components/panels/ControlBar.tsx'
import { AgendaShell } from './components/panels/AgendaShell.tsx'
import { useLayout } from './store/layout.ts'
import { RingingAlarms } from './components/panels/RingingAlarms.tsx'
import { useHotkeys } from './hooks/useHotkeys.ts'

export default function App() {
  useHotkeys()
  const agenda = useLayout(s => s.agendaPlacement)
  return (
    <div className="app" data-agenda={agenda}>
      <div className="app__main">
        <Timeline />
        <ControlBar />
      </div>
      <AgendaShell />
      <RingingAlarms />
    </div>
  )
}
