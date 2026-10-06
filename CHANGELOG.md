# Changelog

One version for the whole app (semver, in `package.json`), shown in Help and Settings. Each
entry says whether the **Android app** needs installing again: web changes reach it by
themselves, like PWA updates; only native changes (anything under `android/`,
`capacitor.config.ts`, or a native plugin) need the newer APK from
[Releases](https://github.com/micwalk/TimelineClock/releases). Installing a newer APK over
the old one keeps your data. See [docs/android.md](docs/android.md).

## 0.2.0 — 2026-10-06

**Android app: web only** (nothing to install; it updates itself).

- Smoother on phones, zooming especially: about 50% more frames per second when zooming and
  10–25% more when panning on a slowed-down CPU, and more with many instants and spans. The
  saved instants' lines now pan as one layer, chips no longer make the whole timeline redraw
  while zooming, and nothing measures the page in the middle of a frame.
- The Cursor tag's round **＋** now sits across the axis from the tag in horizontal too (below
  it, where new chips appear), as it already did in vertical. Tapping it drops an instant and
  opens its name: the ＋ stretches into the new chip. Type a name, or just tap elsewhere or move
  on to leave it unnamed; named in place, the cursor lands on it. (Double-tap the Cursor tag, or
  +, to drop one without naming it.)
- Dragging slowly over an instant shows where you'll land before you let go: the cursor glides
  onto its line and shows its time, and its chip lights up. While the cursor is on an instant,
  the ＋ flows into that instant's chip like a drop of liquid, and is pulled back out when you
  move on (the ＋ itself never moves).
- Chips glide out of each other's way instead of jumping, and slide quickly when they have to
  pop to another row; new chips fade in. Colours ease as things are selected, and tools pop in.
- **Hide the cursor**: the eye badge on the Cursor tag (or H) folds the tag into its arrowhead
  and hides its line, to look around without it; tap the arrowhead (or H) to bring it back.
- Spans that follow each other share a lane: a stopwatch's laps run along one track instead of
  one lane each. Names that would crowd a lane fold into **N spans**, which zooms in when tapped.
- While naming a chip, the time shown under it no longer covers the chip below.
- The Cursor tag glides out of the Now tag's way (and back) instead of jumping; its ＋ stays put.
- Span chips read like the label boxes beside the lanes in vertical, in both orientations: the
  name, then while the span contains Now the time left (big, in the lane's colour) and its
  length small ("3m timer 01:58 /3m"), otherwise its length. Selecting a span no longer adds a
  second chip spelling out its ends: its label box turns into the chip, with its tools, in the
  same spot (at Now while it contains Now).
- A selected span's end arrows stay whole on screen; in vertical the lanes sit a little further
  in from the edge.
- Hiding the cursor hides its lane too (from the selected instant to the cursor).
- In horizontal, a selected chip's tools sit in a row under it, as in vertical.
- The name box of a new instant no longer sits on a dark box after the ＋ turns into it.
- Unnamed instants are named by their time wherever a name is shown (lane chips, the Agenda,
  menus), never "?".
- A favorite now means its span to Now is tracked: unfavoriting deletes that span (it used to
  stay, hidden), and hiding a span to Now unfavorites its instant. Setting an alarm no longer
  makes the instant a favorite (a timer's end still is: its span to Now is the countdown).
  Saved data is brought into line when it loads.
- TC Preview (the test app) is updated in place on each build instead of deleted and made
  again, which failed when the old release was still there. It can also be published as
  another release (`preview_tag` in Run workflow, or the `TC_PREVIEW_TAG` repository variable;
  docs/android.md).

## 0.1.0 — 2026-10-04

**Android app: new.** Install it from this release (docs/android.md).

- The Android app: the live site in an Android shell (Android 16+), so web updates still
  arrive by themselves.
- Timers and alarms ring with the app closed or the phone asleep, on the lock screen too:
  the alarm's name and how long it has been ringing ("0:42", also in the status-bar chip),
  ringing on the alarm volume until **Dismiss** or **Snooze 5 min** on the notification (or
  the ring time runs out). A timer's countdown turns into its ringing alarm at zero. With the
  app open, the alarm rings without popping up over the app's own ringing panel.
- A running timer counts down, and a running stopwatch counts up, in a notification on the
  lock screen and in the shade.
- The timer, stopwatch and ringing alarm notifications are Live Updates: pinned at the top of
  the lock screen and the shade, and a chip in the status bar. On Android 17 the time is the
  notification's big main value; on Android 16 it is the timer in its header.
- Tapping a notification opens the app at the stopwatch's run, a running timer's span, or an
  alarm's overtime (at least two minutes of it). Tapping a ringing alarm also silences it (it
  stays until answered), and Silence in the app silences the notification too.
- Snooze goes to the snooze: its span from the alarm is focused and selected, and it now
  stays on the timeline like any saved span (it used to be hidden).
- Double-tap a chip to focus it, and again to rename it (spans already worked this way).
  Double-tap the Now tag to go to Now, and again to add an instant there and name it.
- A focused span's length can be typed (its clock tool, or a double-tap on the length): its
  end moves, so a timer's length changes with it.
- Typing a clock time starts with the hour: **9** is 9:00 (it was 9 minutes past midnight).
- An unnamed chip shows just its time; its "name…" hint appears once it's selected.
- Settings in the Android app can copy a diagnostics log (alarm events, notification taps,
  stalls and page errors) to report a problem. Answers from a notification are handled off
  the app's main thread, and a crashed page reloads instead of staying dead.
- Chips no longer hide under the selected chip or its tools, and live chips keep clear of the
  Now and Cursor tags.
- Dismissing a timer's alarm unfavorites its end; the star on a favorite's lane chip
  unfavorites it.
- TC Preview: a separate test app, published for pull requests, that loads a PR's Netlify
  deploy preview (picked by PR number in the app), to try changes on the phone before merging.
- The installed app is called **TimelineClock** under its icon (web app and Android app;
  it was "Timeline" for the web app).
- Version numbers: Help and Settings show the version ("Web 0.1.0 · Android app 0.1.0"
  inside the Android app). Settings in the Android app also shows the Android version and
  lists what Android allows (notifications, alarm sound, exact alarms, Live Updates).
