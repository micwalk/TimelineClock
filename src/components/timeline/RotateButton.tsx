// Round glowing button in the timeline's bottom-right corner: flips horizontal/vertical.
import { ArrowPathIcon } from '@heroicons/react/24/outline'
import * as act from '../../store/actions.ts'

export function RotateButton() {
  return (
    <button type="button" className="tl-rotate glow-box" data-no-pan aria-label="Rotate timeline" title="Rotate (V)" onClick={act.rotate}>
      <ArrowPathIcon aria-hidden />
    </button>
  )
}
