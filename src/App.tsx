import { TimelineCanvas } from './components/TimelineCanvas'

function App() {
  return (
    <div 
      style={{ 
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100vw',
        height: '100vh',
        margin: 0,
        padding: 0,
        background: 'linear-gradient(to bottom, #0f172a 0%, #000000 100%)',
        backgroundAttachment: 'fixed',
        backgroundSize: 'cover',
        backgroundRepeat: 'no-repeat',
        overflow: 'hidden'
      }}
    >
      <div style={{ width: '100%', height: '100%' }}>
        <TimelineCanvas />
      </div>
    </div>
  )
}

export default App
