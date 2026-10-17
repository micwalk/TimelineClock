// "You bad lemon 🍋": shown for a moment whenever you add something to the timeline (an
// instant, a timer, an alarm; ui.callLemon). Never in the way: taps go through it, and it
// goes by itself.
import { useUi } from '../../store/ui.ts'

export function LemonToast() {
  const at = useUi(s => s.lemonAt)
  if (!at) return null
  // Keyed by when it started, so another add plays it again from the start.
  return (
    <div key={at} className="lemon-toast glow-box glow-text" role="status">
      You bad lemon <span aria-hidden>🍋</span>
    </div>
  )
}
