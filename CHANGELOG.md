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
  the alarm's name and the time past it ("−0:42"), ringing on the alarm volume until
  **Dismiss** or **Snooze 5 min** on the notification (or the ring time runs out). A timer's
  countdown turns into its ringing alarm at zero.
- A running timer counts down, and a running stopwatch counts up, in a notification on the
  lock screen and in the shade.
- The timer, stopwatch and ringing alarm notifications are Live Updates: pinned at the top of
  the lock screen and the shade, and a chip in the status bar. On Android 17 the time is the
  notification's big main value; on Android 16 it is the timer in its header.
- Tapping a notification opens the app at the stopwatch's run, a running timer's span, or an
  alarm's overtime. Tapping a ringing alarm also silences it (it stays until answered), and
  Silence in the app silences the notification too.
- Snooze in the app goes to the snooze: its span from the alarm is focused and selected.
- Dismissing a timer's alarm unfavorites its end; the star on a favorite's lane chip
  unfavorites it.
- TC Preview: a separate test app, published for pull requests, that loads a PR's Netlify
  deploy preview (picked by PR number in the app), to try changes on the phone before merging.
- The installed app is called **TimelineClock** under its icon (web app and Android app;
  it was "Timeline" for the web app).
- Version numbers: Help and Settings show the version ("Web 0.1.0 · Android app 0.1.0"
  inside the Android app). Settings in the Android app also lists what Android allows
  (notifications, alarm sound, exact alarms, Live Updates).
