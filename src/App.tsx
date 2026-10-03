import { Timeline } from './components/timeline/Timeline.tsx'
import { ControlBar } from './components/panels/ControlBar.tsx'
import { ListPanel } from './components/panels/ListPanel.tsx'
import { RingingAlarms } from './components/panels/RingingAlarms.tsx'
import { SettingsPanel } from './components/panels/SettingsPanel.tsx'
import { useHotkeys } from './hooks/useHotkeys.ts'

export default function App() {
  useHotkeys()
  return (
    <div className="app">
      <Timeline />
      <ControlBar />
      <ListPanel />
      <RingingAlarms />
      <SettingsPanel />
    </div>
  )
}
