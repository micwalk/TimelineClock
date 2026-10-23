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
  [['H'], 'Hide or show the cursor'],
  [['T'], 'Start a timer (pick a length)'],
  [['L'], 'Set an alarm (time, repeat, warnings)'],
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
            <dd>The centre of the timeline when you move away from Now. Its tag shows the time there and how far it is from Now. Its eye badge folds it into a small arrowhead (and hides its line and lane) while you just look around: hidden, it passes over instants and Now without catching or landing on them. Tap the arrowhead to bring it back.</dd>
            <dt>Instant</dt>
            <dd>A saved point in time, shown as a chip. Drop one with no name; later, tap it and then its “name…” hint. Star it as a favorite to keep its time to Now in view (its lane), or give a future one an alarm.</dd>
            <dt>Span</dt>
            <dd>The time between two instants (or an instant and Now or the cursor), drawn as a lane with its length. Lanes appear on their own as you select things; tap the pin to keep one. Spans that follow each other share a lane (a stopwatch’s laps); names that would crowd it fold into “N spans”, which zooms in when tapped.</dd>
            <dt>Sky and header</dt>
            <dd>The background follows the sun: dark at night, purple and orange through dawn and dusk, blue by day, so a.m. and p.m. never look alike. Set where you are in Settings › Sky (until then day is 6a–6p); its Colors can be Rainbow road. Along the top (the left edge when vertical) a header says what the ticks don’t: the day, and the hour when zoomed in to minutes. With a location, <b>Sunrise</b> and <b>Sunset</b> chips show too (zoomed out they gather into one chip, then fade away; the <b>Groups</b> tab switches each on or off): tap one to select it (it is kept, and listed, only once you change it), give it an alarm (−30m rings half an hour before sunset) or repeat it at every sunset with ⟳. The Alarm button takes “sunset” or “sunrise” as a time as well. Clock changes (daylight saving) show as instants too, and around one the header names the zone (“1 AM PDT”, then “1 AM PST”).</dd>
            <dt>Agenda</dt>
            <dd>The list of every instant, your favorites, your saved spans, your alarms, and your groups. Tap a row to go there.</dd>
            <dt>Label, Mark, Hidden</dt>
            <dd>As you zoom out, an instant goes from its <b>Label</b> (its chip) to a <b>Mark</b> (a short line on the axis), then <b>Hidden</b>; zooming back in brings it back. How far out depends on it: something set days ahead, a favorite counting down or the end of a long span stays longer. Tap a Mark to select it (its Label comes back). Its eye opens <b>Visibility</b> to set it yourself (drag “Label up to” and “Mark up to”; Auto goes back), or Hide everywhere; on a repeat or a sunrise it sets the whole series. Each repeat, and sunrise and sunset, has one setting for all of its days in the <b>Groups</b> tab (the sliders button on a row). Unnamed instants keep their Label out to a day (Settings › Advanced).</dd>
            <dt>Groups</dt>
            <dd>Every instant is in one group: <b>Default</b> until you pick another from the Group box at the top of its Visibility (or make a <b>New group…</b> there). A repeat's group is its whole series'. In the <b>Groups</b> tab, a group's switch hides or shows everything in it (an alarm still to ring always shows); rename it with the pencil, or delete it, moving what's in it to Default or deleting that too (a second tap confirms). Settings › Data exports only the groups you tick (untick Settings to share them), and an import puts each of the file's groups into a new group, one of yours, or leaves it out.</dd>
          </dl>
        </section>

        <section className="settings__group">
          <h3>Touch and mouse</h3>
          <ul className="help__list">
            <li><b>Drag</b> to move through time; <b>flick</b> to glide.</li>
            <li>The <b>wheel</b>, <b>pinch</b> or <b>Ctrl + wheel</b> zooms; <b>Shift + wheel</b> moves through time.</li>
            <li><b>Tap</b> a chip to select it and show its tools; <b>double-tap</b> it to focus it, and again to rename it. The same goes for a span’s chip; once a span is focused, double-tap its length (or its clock tool) to type a new length.</li>
            <li>Tap the <b>Now</b> or <b>Cursor</b> tag for more tools: type a time, offset (+13m), save a span. Double-tap the Now tag to go to Now, and again to add an instant there and name it.</li>
            <li>The round <b>＋</b> across the axis from the Cursor tag (or from the Now tag, while following Now) drops an instant there, selected with its tools and its name open: type one, or just tap elsewhere, move on or use a tool to leave it unnamed. Double-tap the Cursor tag (or press <b>+</b>) to drop one without naming it.</li>
            <li>Drag slowly over an instant (or Now) and the cursor catches it: it glides onto its line and shows its time, so you can see where it will land when you let go, and the ＋ tucks into the instant’s chip (over Now, the Cursor tag merges into the Now tag). Other chips step out of the ＋’s way.</li>
            <li>The big red button drops an instant at Now (＋), or brings you back to <b>NOW</b>.</li>
            <li>The other buttons zoom, step the cursor (the arrow beside a step picks its size, up to a week, a month or a year), and jump to the previous or next instant.</li>
            <li>Zoomed out to days and beyond, the Now and Cursor tags show the date (and the year far out), and chips their dates. <b>Type a time…</b> has a date as well, and offsets take days, so the cursor can go months or years away.</li>
            <li><b>Stopwatch</b> drops an instant and counts up from it; then <b>Lap</b>, <b>Stop</b> and <b>Reset</b>. <b>Timer</b> picks a length and sets an alarm at the end. <b>Alarm</b> (or L) sets one at a time you type (7, 730, 1730, 7p: it shows which day and AM or PM it took), once (on today or tomorrow, or on a <b>Date</b> you pick, months away if you like) or repeating, on time and/or with warnings before it (pick 5m to 1h, or type any length in <i>other</i>); tap a recent one to fill the picker in from it. Settings &gt; Alarms sets which warnings it offers and what a new alarm starts with. They just make instants, spans and series, kept as history.</li>
            <li><b>Repeat</b>: the ⟳ tool on a selected chip makes it repeat (daily, weekdays, weekends, chosen days, every N days). Repeats show ⟳ on their chips; the next two weeks are kept (and sent to the Android app), and further ahead they’re shown as you look. Change one on its own and it offers <b>Apply to all future</b> (that one and later ones; earlier ones keep the old rule); delete one, or it and all later ones; pick <b>Once</b> in the ⟳ tool to stop it repeating after that one; pause, resume or end the series from the ⟳ tool, the <b>Groups</b> tab (every repeat, alarms or not) or the <b>Alarms</b> tab, which lists every alarm (repeating, upcoming and recent), sets new ones, and edits a repeat’s time, days, warnings and name (the pencil). Zoomed out, a repeat whose occurrences crowd becomes a row of amber lines fading out from the axis and one chip for the series (“⟳ Wake Up · Daily 9:00a · in 3d”); tap it to zoom in.</li>
            <li>The <b>■ stop</b> on a favorite’s lane ends it here: an instant drops at Now and the time between is saved as a span (the lane moves over to the saved spans). To stop tracking it without saving, tap the lane and use its <b>star</b>. Dismissing a timer’s alarm unfavorites its end.</li>
            <li><b>Alarms</b>: the bell tool on a selected chip adds an alarm, a bell beside the chip. <b>Drag the bell earlier</b> to ring before the instant (say 15 minutes before a meeting); add more bells for more warnings. Each one stays tied to its instant and moves with it. Tap a bell to type how long before, or delete it. Zoomed out, bells close to their instant fold into its bell, which then shows how many there are (3🔔). An instant with an alarm still to ring can’t be hidden; answered alarms show as hollow bells when you select their instant.</li>
            <li><b>Snooze</b> adds another bell to the same instant (⟲): 5 minutes, until the instant starts (for a warning), or <b>Other…</b> to type a length; or drag a ringing bell later to snooze until there. A warning before an instant never snoozes past it: it lands on the instant. <b>Cancel</b> is the opposite: the bell-slash tool on a selected chip cancels all its alarms, and a ringing alarm offers <b>Dismiss all</b>. Cancelled alarms that hadn’t rung are simply gone. Move an instant so an alarm it already answered is ahead again and that alarm rings again.</li>
            <li>In a browser, alarms ring while the app is open. The <a href={ANDROID_URL} target="_blank" rel="noreferrer">Android app</a> also rings them when it’s closed, and shows a running timer or stopwatch in the notifications.</li>
            <li>Typing a time: digits fill from the right, so <b>930</b> is 9:30 and <b>13</b> is 13 minutes. A clock time starts with the hour: <b>9</b> is 9:00.</li>
            <li>Moving an instant: drag the timeline, or tap the moving chip to type the time or an offset from Now.</li>
            <li>The <b>eye</b> on a selected chip or an Agenda row opens its <b>Visibility</b>: Label, Mark and Hidden by zoom, Auto, or Hide everywhere (its spans stay).</li>
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
            The one exception is a zip code or city typed in Settings › Sky, which is looked up once at open-meteo.com.
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
