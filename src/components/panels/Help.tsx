// Help / About: the "?" button (beside the Settings gear) and the dialog it opens.
// The dialog lives at the app root so the ? key opens it even while the Agenda drawer is closed.
import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { QuestionMarkCircleIcon, XMarkIcon } from '@heroicons/react/24/outline'
import { ui, useUi } from '../../store/ui.ts'
import { AppVersion } from './AppVersion.tsx'

const AUTHOR_URL = 'https://github.com/micwalk'
const REPO_URL = 'https://github.com/micwalk/TimelineClock'
const ANDROID_URL = `${REPO_URL}/blob/main/docs/android.md`

const KEYS: [string[], string][] = [
  [['+', '='], 'Drop an instant (at Now, or at the cursor)'],
  [['R'], 'Jump back to Now'],
  [['A', 'D', '←', '→', '↑', '↓'], 'Previous / next instant'],
  [['Z', 'X'], 'Step the cursor back / forward'],
  [['I', 'W'], 'Zoom in'],
  [['O', 'S'], 'Zoom out'],
  [['Q', 'E'], 'Back / forward through where you have been'],
  [['V'], 'Rotate the timeline'],
  [['T'], 'Start a timer (pick a length)'],
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
            <li><b>Stopwatch</b> drops an instant and counts up from it; then <b>Lap</b>, <b>Stop</b> and <b>Reset</b>. <b>Timer</b> picks a length and sets an alarm at the end. Both just make instants and spans, kept as history.</li>
            <li>In a browser, alarms ring while the app is open. The <a href={ANDROID_URL} target="_blank" rel="noreferrer">Android app</a> also rings them when it’s closed, and shows a running timer or stopwatch in the notifications.</li>
            <li>Typing a time: digits fill from the right, so <b>930</b> is 9:30 and <b>13</b> is 13 minutes.</li>
            <li>Moving an instant: drag the timeline, or tap the moving chip to type the time or an offset from Now.</li>
            <li>The <b>eye</b> on a selected chip or an Agenda row hides an instant from the timeline; its spans stay. Tap the eye in the Agenda to show it again.</li>
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
            this site’s data deletes it. To keep a copy or move it, use Settings › Data to export a backup.
            The Android app keeps its own copy, separate from the browser’s: move data between them the same way.
          </p>
        </section>

        <section className="settings__group help__credit">
          <p>
            Made by <a href={AUTHOR_URL} target="_blank" rel="noreferrer">Michael Walker</a> ·{' '}
            <a href={REPO_URL} target="_blank" rel="noreferrer">Source on GitHub</a>
          </p>
          <AppVersion className="help__version mono" />
        </section>
      </div>
    </>,
    document.body,
  )
}
