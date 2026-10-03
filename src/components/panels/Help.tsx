// Help / About: the "?" button (beside the Settings gear) and the dialog it opens.
// The dialog lives at the app root so the ? key opens it even while the Agenda drawer is closed.
import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { QuestionMarkCircleIcon, XMarkIcon } from '@heroicons/react/24/outline'
import { ui, useUi } from '../../store/ui.ts'

const AUTHOR_URL = 'https://github.com/micwalk'
const REPO_URL = 'https://github.com/micwalk/TimelineClock'

const KEYS: [string[], string][] = [
  [['+', '='], 'Drop an instant (at Now, or at the cursor)'],
  [['R'], 'Jump back to Now'],
  [['A', 'D', '←', '→', '↑', '↓'], 'Previous / next instant'],
  [['Z', 'X'], 'Step the cursor back / forward'],
  [['I', 'W'], 'Zoom in'],
  [['O', 'S'], 'Zoom out'],
  [['Q', 'E'], 'Back / forward through where you have been'],
  [['V'], 'Rotate the timeline'],
  [['Esc'], 'Deselect, or cancel a move'],
  [['Enter'], 'Confirm a move'],
  [['?'], 'This help'],
]

const FOCUSABLE = 'button, [href]'

export function HelpButton() {
  const open = useUi(s => s.helpOpen)
  return (
    <button
      type="button"
      className={`settings__gear help__btn glow-box${open ? ' is-open' : ''}`}
      aria-label="Help and about"
      aria-haspopup="dialog"
      title="Help (?)"
      onClick={ui.openHelp}
    >
      <QuestionMarkCircleIcon aria-hidden />
    </button>
  )
}

export function HelpDialog() {
  const open = useUi(s => s.helpOpen)
  return open ? <HelpContent /> : null
}

function HelpContent() {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const el = ref.current
    el?.querySelector<HTMLElement>('.help__close')?.focus()
    // Esc is handled by the global hotkeys; here, keep Tab inside the dialog.
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Tab' || !el) return
      const items = Array.from(el.querySelectorAll<HTMLElement>(FOCUSABLE))
      const first = items[0]
      const last = items[items.length - 1]
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      if (opener?.isConnected) opener.focus()
    }
  }, [])

  return createPortal(
    <>
      <div className="help__scrim" onClick={ui.closeHelp} />
      <div ref={ref} className="help glow-box" role="dialog" aria-modal="true" aria-labelledby="help-title">
        <header className="help__header">
          <h2 id="help-title" className="settings__title glow-text">Timeline Clock</h2>
          <button type="button" className="help__close" aria-label="Close help" onClick={ui.closeHelp}>
            <XMarkIcon aria-hidden />
          </button>
        </header>

        <p className="help__lede">
          A clock where everything lives on one timeline. Capture a moment with one tap, then relate
          to it later: name it, set an alarm from it, or look back at how long ago it was.
        </p>

        <section className="settings__group">
          <h3>Concepts</h3>
          <dl className="help__terms">
            <dt className="help__now">Now</dt>
            <dd>The red line. It follows the clock.</dd>
            <dt className="help__cursor">Cursor</dt>
            <dd>The centre of the timeline when you move away from Now. Its tag shows the time there and how far it is from Now.</dd>
            <dt>Instant</dt>
            <dd>A saved point in time, shown as a chip. Drop one with no name, then tap its “name…” hint later. Star it as a favorite, or give a future one an alarm.</dd>
            <dt>Span</dt>
            <dd>The time between two instants (or an instant and Now or the cursor), drawn as a lane with its length. Lanes appear on their own as you select things; tap the pin to keep one.</dd>
            <dt>Agenda</dt>
            <dd>The list of every instant, your favorites, and your saved spans. Tap a row to go there.</dd>
          </dl>
        </section>

        <section className="settings__group">
          <h3>Touch and mouse</h3>
          <ul className="help__list">
            <li><b>Drag</b> to move through time; <b>flick</b> to glide.</li>
            <li><b>Pinch</b> or <b>Ctrl + wheel</b> to zoom. The wheel zooms (horizontal) or scrolls (vertical).</li>
            <li><b>Tap</b> a chip to select it and show its tools; <b>double-tap</b> its name to rename it.</li>
            <li>Tap the <b>Now</b> or <b>Cursor</b> tag for more tools: type a time, offset (+13m), save a span.</li>
            <li>The big red button drops an instant at Now (＋), or brings you back to <b>NOW</b>.</li>
            <li>The other buttons zoom, step the cursor, and jump to the previous or next instant.</li>
          </ul>
        </section>

        <section className="settings__group">
          <h3>Keyboard</h3>
          <table className="help__keys">
            <tbody>
              {KEYS.map(([keys, what]) => (
                <tr key={what}>
                  <th scope="row">{keys.map(k => <kbd key={k}>{k}</kbd>)}</th>
                  <td>{what}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="settings__group">
          <h3>Your data</h3>
          <p>
            Everything you save is stored only in this browser, on this device. Nothing is sent to a
            server or synced to a database, so it won’t appear on your other devices, and clearing
            this site’s data deletes it.
          </p>
        </section>

        <section className="settings__group help__credit">
          <p>
            Made by <a href={AUTHOR_URL} target="_blank" rel="noreferrer">micwalk</a> ·{' '}
            <a href={REPO_URL} target="_blank" rel="noreferrer">Source on GitHub</a>
          </p>
        </section>
      </div>
    </>,
    document.body,
  )
}
