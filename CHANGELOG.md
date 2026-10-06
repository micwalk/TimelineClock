# Changelog

One version for the whole app (semver, in `package.json`), shown in Help and Settings. Each
entry says whether the **Android app** needs installing again: web changes reach it by
themselves, like PWA updates; only native changes (anything under `android/`,
`capacitor.config.ts`, or a native plugin) need the newer APK from
[Releases](https://github.com/micwalk/TimelineClock/releases). Installing a newer APK over
the old one keeps your data. See [docs/android.md](docs/android.md).

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
