// Done ahead of its time, never started (store/actions completeTodo): the todo's chip travels along
// the timeline to Now, then pops there (owner 2026-11-23). The view was zoomed out first, if need
// be, so both show (act.revealTimes); once it settles, a copy of the chip (the real one hides)
// winds up, away from Now, and swooshes onto the Now line (domain/doneTravel), the Done swoosh
// playing as it goes. Measured once at the start, never in a frame listener. Resolves to where its
// box landed (the pop's origin), or null when its chip isn't on screen to travel.
import { engine, reducedMotion } from '../../engine/viewportEngine.ts'
import type { DoneOrigin } from '../../domain/doneBurst.ts'
import { travelKeyframes, travelMs } from '../../domain/doneTravel.ts'
import { useEntities } from '../../store/entities.ts'
import { useSettings } from '../../store/settings.ts'
import { playDoneSound } from '../../services/AlarmScheduler.ts'
import { doneOrigin } from '../common/doneOrigin.ts'

/** The reveal's zoom (the engine's 350ms transition) and a frame to lay the chips out. */
const SETTLE_MS = 400

const onScreen = (r: DOMRect) => r.width > 0 && r.right > 0 && r.bottom > 0 && r.left < window.innerWidth && r.top < window.innerHeight

export function travelToNow(_todoId: string, atId: string, zoomed: boolean): Promise<DoneOrigin | null> {
  return new Promise(resolve => {
    setTimeout(() => {
      const at = useEntities.getState().instants.find(i => i.id === atId)
      const col = document.querySelector<HTMLElement>(`.tl-col--label[data-instant="${CSS.escape(atId)}"]`)
      const chip = col?.querySelector<HTMLElement>('.chip')
      const rect = chip?.getBoundingClientRect()
      if (!at || !chip || !rect || !onScreen(rect) || reducedMotion() || typeof chip.animate !== 'function') { resolve(null); return }
      const f = engine.getFrame()
      const along = f.pos(f.now) - f.pos(at.tsEpochMs)
      const [dx, dy] = f.orientation === 'vertical' ? [0, along] : [along, 0]
      // The copy: where the chip is, in its colours (they come from the timeline around it).
      const css = getComputedStyle(chip)
      const copy = chip.cloneNode(true) as HTMLElement
      copy.classList.add('done-travel')
      Object.assign(copy.style, { left: `${rect.left}px`, top: `${rect.top}px`, width: `${rect.width}px`, height: `${rect.height}px` })
      for (const v of ['--accent', '--halo']) copy.style.setProperty(v, css.getPropertyValue(v))
      document.body.appendChild(copy)
      chip.style.visibility = 'hidden'
      const ms = travelMs(along)
      const { doneFanfare, fanfareVolume } = useSettings.getState()
      if (doneFanfare) playDoneSound('charge', fanfareVolume, ms / 1000)
      const flight = copy.animate(travelKeyframes(dx, dy), { duration: ms, fill: 'forwards' })
      const finish = () => {
        const box = copy.querySelector('svg.chip__todo, .chip__todo-btn svg')
        const landed = box ? doneOrigin(box) : null
        chip.style.visibility = ''
        resolve(landed)
        // The pop draws over it from here (components/timeline/Celebration).
        setTimeout(() => copy.remove(), 80)
      }
      flight.addEventListener('finish', finish, { once: true })
      flight.addEventListener('cancel', finish, { once: true })
    }, zoomed ? SETTLE_MS : 0)
  })
}
