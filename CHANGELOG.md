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
- Timers and alarms ring with the app closed or the phone asleep: exact Android alarm
  notifications on an "Alarms and timers" channel, with sound on the alarm volume. Tapping one
  opens the app at the alarm.
- A running timer counts down, and a running stopwatch counts up, in an ongoing notification
  on the lock screen and in the shade, promoted to a Live Update (status-bar chip) where
  Android allows.
- TC Preview: a separate test app, published for pull requests, that loads a PR's Netlify
  deploy preview (picked by PR number in the app), to try changes on the phone before merging.
- Version numbers: Help and Settings show the version ("Web 0.1.0 · Android app 0.1.0"
  inside the Android app). Settings in the Android app also lists what Android allows
  (notifications, alarm sound, exact alarms, Live Updates).
