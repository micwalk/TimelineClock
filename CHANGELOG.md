# Changelog

One version for the whole app (semver, in `package.json`), shown in Help and Settings. Each
entry says whether the **Android app** needs installing again: web changes reach it by
themselves, like PWA updates; only native changes (anything under `android/`,
`capacitor.config.ts`, or a native plugin) need the newer APK from
[Releases](https://github.com/micwalk/TimelineClock/releases). Installing a newer APK over
the old one keeps your data. See [docs/android.md](docs/android.md).

## 0.4.0 — 2026-10-15

**Android app: web only** (nothing to install; it updates itself).

- **The sky** (#11): the timeline's background follows the sun. Night is dark, the twilights
  run strongly through indigo, violet and orange, and day is blue, shading only slightly
  toward noon and midnight, so a.m. and p.m. never look alike. Sunrise, sunset and the civil,
  nautical and astronomical twilights are worked out on the device, offline, including polar
  day and night.
- **Settings › Sky**: shading Sun / Fixed 6a–6p / Off, and a location from a zip or city
  (looked up once at open-meteo.com, the app's only network call for your data), typed
  coordinates, or Use my location. It's stored rounded to about a kilometre. Until one is set,
  day is 6a–6p.
- **Context header** (#22): the corner date becomes a header that says what the ticks don't.
  Zoomed in to 15-minute ticks or closer it reads "Thu, Oct 15 · 8 PM"; at half hours and
  hours, the day; at days, the month. The current label sticks at the start of the timeline until the next one pushes
  it off. In vertical it runs down the left edge, reading the way time runs.
- **Every hour labeled**: hour labels are short, so each hour keeps its label until they're
  about 45px apart (22px in vertical) instead of dropping to 6AM / 12PM / 6PM much sooner.
- Where ticks meet, the coarser one names it: an hour among half hours reads "8PM" (not
  "08:00"), and midnight among hours reads "Oct 16".
- **Sunrise and sunset** (#11): with a location set, the timeline shows ☀ Sunrise and ☀ Sunset
  chips. Zoomed out, they collapse like repeats: short orange lines from the axis and one
  summary chip ("☀ Sunrise 7:19a · in 8h", a tap zooms in); further out they fade away (the sky
  still shows the days; Settings › Advanced sets where). Tap one to select it; it is kept as an
  instant (in the Agenda) only once you change it (name, alarm, star, hide, a span to it). It
  stays tied to the sun, so its alarms ring relative to it (−30m: half an hour before sunset),
  and its ⟳ tool repeats that alarm at each day's sunset, which moves with the seasons (⟳ shows
  on a sunset only once it has an alarm: the chips already show every sunset).
- **Virtual instants stay virtual**: tapping or focusing a sunrise, sunset or a repeat's far-off
  occurrence no longer saves it or lists it in the Agenda; changing it does.
- Sunrises and sunsets can't be deleted (the sun sets there again) or moved; hide one with the eye.
- **Sunrise and sunset in the Repeats tab**: two rows at the top (next time, "Daily · your place",
  how long until it) whose switches show or hide each on the timeline; a tap goes to the next one.
  (This replaces the Settings › Sky checkbox.)
- **Alarms at sunrise or sunset**: the Alarm button's time box takes "sunset" or "sunrise" (or
  tap the Sunrise / Sunset chips under it): once, or repeating at each day's sunset, with
  warnings before it. Days the sun doesn't rise or set (polar) are skipped.
- Settings no longer closes when a text box brings up the phone's keyboard; it fits to the
  space left instead (it still closes on rotation).

## 0.3.2 — 2026-10-14

**Android app: web only** (nothing to install; it updates itself).

- In vertical, the mouse wheel zooms, as it does in horizontal; **Shift + wheel** moves through
  time in both (#16).
- A hidden cursor passes over instants and Now: it no longer glides onto them, lands on them or
  selects them, so you can look around without changing what is focused (#17).
- **Stop a favorite’s lane** (#13): a favorite counting up ends its live lane chip in a ■ stop.
  One tap drops an instant at Now and saves the time since the favorite as a span; the lane
  slides over to the saved spans and the instant stops being a favorite. On a running
  stopwatch’s lane it stops the stopwatch, whose lap and run lanes now slide over the same way.
- The ★ on a favorite’s lane is now a badge, not a button, so the stop is the chip’s only
  button and a near miss can’t unfavorite it. To stop tracking without saving, tap the lane
  and use the star tool, as on the instant’s chip (it replaces the eye there).
- **The ＋ opens the new chip selected, with its tools** (#14): the name box, its time and the
  tool row (favorite, bell, repeat, hide, delete) at once, the same as renaming any selected
  chip. Tapping a tool keeps what you typed and does its thing.
- **A ＋ on the Now tag** while following Now: drops an instant at Now, selected with its name
  open, so there is a ＋ on the timeline in the most common state too.

## 0.3.1 — 2026-10-14

**Android app: web only** (nothing to install; it updates itself).

- **Snoozing adds a bell, not an instant** (TLC-2): a snoozed alarm rings again as another
  bell (⟲) on the same instant, so no more "Snooze 1: Wake up" instants and spans (old ones
  stay as history). Snoozing the alarm at an instant puts its bell after it.
- A warning before an instant never snoozes past it: snoozed that far, or to within a minute
  before it, it rings with the instant itself (a 3-minute warning snoozed for 5 minutes rings
  at the instant, not 2 minutes late, and never as a second alarm at the same moment).
- A cleaner ringing alarm: Dismiss and Snooze 5m (saying when it will ring again), then Until
  start for a warning, Other… to type any length right there (the keyboard comes up, it shows
  when it will ring as you type, and it rings exactly then, even after the start), and Dismiss all when the instant has more alarms. Or drag
  a ringing bell later on the timeline to snooze until there.
- **Cancel alarms** before they ring, the opposite of a snooze: a selected chip's bell-slash tool
  cancels all of them in one tap (adding one back is a tap too). Alarms that hadn't rung yet are
  simply gone; only alarms that rang stay as history.
- Moving an instant so an alarm it already answered is ahead again makes that alarm ring again.
- An alarm bell's line to its instant still shows when the bell itself is off screen.
- A timer finishes when the last of its snoozes is dismissed, not when it is first snoozed.
- **Repeating alarms** (TLC-2): the ⟳ tool on any instant makes it repeat: daily, on weekdays,
  weekends, chosen days, or every few days. Repeats show ⟳ on their chips. The next two weeks
  are kept (and set on the Android app), further ahead they are shown as you look, and they stay
  as history once they pass. Changing the repeat updates the ones ahead. Change one on its own
  (move it, rename it, change or cancel its bells) and it offers **Apply to all future**, which
  changes that one and the ones after it, never earlier ones still to come. Delete
  one, or it and all later ones; pause, resume or end a series from its ⟳ tool, or pick Once
  there to stop it repeating after that one.
- **Repeats tab** in the Agenda: every repeat, with or without alarms.
- The Agenda docked beside a vertical timeline sits on the left, where its drawer slides out
  from, and its tabs no longer run under its buttons when it is narrow.
- **Alarm button** (TLC-3, or L): type a time ("7", "730", "1730", "7p"), pick once or a repeat,
  pick when it rings (on time, and warnings 5m, 15m, 30m, 1h before or any length typed in
  "other"; or only the warnings) and a name. A time that could be AM or PM takes the sooner
  one and says plainly which day and time it set ("Tue 7:00a · in 7h"), with AM/PM buttons to
  switch. Recent alarms are one tap away: a tap fills the picker in from one, to change before
  setting it. Settings > Alarms picks which warnings it offers and what a new alarm starts with.
- **Alarms tab** in the Agenda: every alarm, like a clock app: repeating ones with a switch to
  pause them and a pencil to edit them (time, days, warnings, name; occurrences you changed on
  their own keep their changes), upcoming ones with a button to cancel them, and what rang in
  the last day. Set a new alarm from there too.
- Backups include repeating series.
- **Zoomed out, repeats stay calm**: a repeat whose occurrences crowd turns into amber lines
  that start at the axis and fade to a point on the chips' side (amber when it has alarms). Zooming
  out animates it: the chips shrink away, the lines draw in to the axis and turn amber from it and one chip for the series ("⟳ Wake Up · Daily 9:00a · in 3d 8h"); tap it to zoom in.
  Occurrences changed on their own keep their own chips. Zoomed out past hours, chips also drop
  their "in 3d 8h".
- The Alarm picker is a sheet at the top of the screen on phones, clear of the keyboard, with a
  cleaner layout; popovers on chips near an edge stay on screen.

## 0.3.0 — 2026-10-12

**Android app: web only** (nothing to install; it updates itself).

- **Alarms before an instant** (TLC-1): an alarm is now a bell beside its instant's chip. Drag
  the bell earlier and it rings that long before the instant ("Wake up in 15m"), at the time it
  sits on the timeline, with a short line down to the axis and a dashed line back to its
  instant. Add more bells for more warnings (the bell tool on a selected chip adds one each
  time). Bells move with their instant. Tap a bell to type how long before, or delete it.
- Zoomed out, a bell too close to its instant to stand apart folds into the instant's chip,
  whose bell then counts its alarms (one is just a bell; more read "3🔔"); tapping that zooms
  in to show them all.
- An alarm still to ring is never hidden: an instant with one can't be hidden, and adding an
  alarm to a hidden instant shows it again.
- Answered alarms are kept as history: select their instant to see them as hollow bells.
- Several bells on one instant share one line: dashed beyond the nearest bells, solid where
  more than one bell's line runs. The instant's chip ties in with a yellow line from the axis.
- A chip with an active alarm (still to ring, or ringing) has a yellow left edge.
- **Lengths show the detail that matters**, everywhere: on spans, live lanes, the Stopwatch and
  Timer buttons and alarm bells. Zoomed in shows seconds, then tenths, then milliseconds; a
  length under a minute always shows milliseconds (a stopwatch's first lap: "0:04.215") and
  one under an hour seconds ("26:13", where it used to say "26m" zoomed out). An alarm's offset
  always shows what it was set to: 1m 30s reads "1:30", never "1m".
- The Android app rings each bell on its own, shows it as the next alarm, and lets you dismiss
  or snooze it from the notification. Alarms set before this update keep ringing as they were.

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
- One rule for what the cursor is on: the cursor gliding onto an instant's line, the ＋ flowing
  into its chip and where a release lands all follow it, start on the same frame and move
  together. Chips the cursor isn't on glide out of the ＋'s way, so it never sits on one.
- The Cursor tag keeps clear of the Now tag as the pan moves, never in steps: in horizontal it
  arcs over it; in vertical it is pushed along, and as the cursor crosses Now it merges into the
  Now tag (and a release there lands on Now) instead of hopping over.
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
- CI builds the Android app only when a push changes what goes into the APK (the native
  project, the offline page, the Capacitor config or packages, the version), so web-only
  pushes no longer rebuild it, and branches build only through their pull request.
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
