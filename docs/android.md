# The Android app

Timeline Clock as an Android app, for one reason: **timers and alarms ring when the app is
closed or the phone is asleep.** The web app (PWA) can't do that: Android freezes a web page
in the background, and no web feature can wake it at a set time.

The Android app is a thin shell around the live site (`https://timelineclockapp.netlify.app`).
Web changes reach it by themselves, like PWA updates. You install the app again only when
its native part changes; [CHANGELOG.md](../CHANGELOG.md) says when.

What it adds:

- **Ringing alarms** for every alarmed instant (timers and bells), exact to the second, with
  the app closed, the phone asleep, or after a restart. The notification shows its name
  ("5m timer") and how long it has been ringing, counting up ("0:42", also in the status-bar
  chip), and rings on the **alarm volume** until you tap **Dismiss** or **Snooze 5 min** on it (they work from the lock
  screen; swiping it away dismisses it) or the ring time in Settings runs out. Tapping the
  notification itself silences it and opens the app; it stays until answered. Answers given
  there reach the app the next time it runs.
- **Live notifications**: a running timer counts down, and a running stopwatch counts up, on
  the lock screen and in the notification shade. At zero a timer's countdown turns into its
  ringing alarm.
- All of them are **Live Updates**: pinned at the top of the lock screen and the shade, always
  expanded, and shown as a chip in the status bar (a timer's chip counts down). On Android
  17 the time is the notification's big main value; on Android 16 it is the smaller timer in
  the notification's header (and the chip).
- Tapping a notification opens the app at what it is about: the stopwatch's run, a running
  timer's span, or an alarm's overtime.
- With the app open, the alarm rings without a pop-up over the app, which shows its own
  ringing panel (the notification is still in the shade); the panel's Dismiss / Snooze /
  Silence stop it. Snooze goes to the snooze's span, which stays on the timeline.

It needs **Android 16 or newer** (it was made for a Pixel 10). It isn't on the Play Store;
you install it from this repository's
[Releases](https://github.com/micwalk/TimelineClock/releases) page ("sideloading").

---

## One-time setup: the signing key (owner only, before the first release)

Android only installs an update over an app if both are signed with the **same key**.
Otherwise you would have to uninstall first, **which deletes the app's data**. So every
release is signed with one key that you keep. The repository is public, so the key is
**never** committed: it lives in GitHub's encrypted repository secrets, which only the
build can read. Until the secrets exist, builds come out unsigned (they can't be installed
at all), and no release is made.

You do this once, on a computer.

### 1. Make the key

You need `keytool`, which comes with Java (any JDK, or Android Studio). In a terminal, in a
folder that is **not** inside the repository:

```sh
keytool -genkeypair -v -storetype PKCS12 -keystore timelineclock-release.jks \
  -alias timelineclock -keyalg RSA -keysize 4096 -validity 36500 \
  -dname "CN=Timeline Clock"
```

It asks for a password twice. Pick a strong one and save it in your password manager.

### 2. Back it up (optional, but easy now)

GitHub never shows a secret again, so the secrets are not a backup. You don't need the file
day to day either: every build signs with the secret for as long as it exists. A backup only
matters if the secret is ever lost (deleted, or the repository moved). So, if it's handy, save
`timelineclock-release.jks` **and** its password in a password manager that takes files; if
not, delete the file once the secrets are in. Without a backup, losing the secret costs a new
key and a reinstall, not your data (see "If you ever lose the key").

Use a password made just for this key (a password manager can generate one), not one you use
anywhere else. To check you typed it right, copy it from the password manager and run
`keytool -list -keystore timelineclock-release.jks -storepass "$(pbpaste)"` (macOS): it lists
the `timelineclock` entry, or says the password was incorrect.

### 3. Add the four secrets to GitHub

On github.com: the repository › **Settings** › **Secrets and variables** › **Actions** ›
**New repository secret**. Add:

| Name | Value |
|------|-------|
| `ANDROID_KEYSTORE_BASE64` | the key file as base64 text (below) |
| `ANDROID_KEYSTORE_PASSWORD` | the password you chose |
| `ANDROID_KEY_ALIAS` | `timelineclock` |
| `ANDROID_KEY_PASSWORD` | the same password (a PKCS12 key uses the store's password) |

To get the base64 text and copy it to the clipboard:

- macOS: `base64 -i timelineclock-release.jks | pbcopy`
- Linux: `base64 -w0 timelineclock-release.jks | xclip -selection clipboard` (or print it
  without `| xclip ...` and copy it)
- Windows (PowerShell):
  `[Convert]::ToBase64String([IO.File]::ReadAllBytes("timelineclock-release.jks")) | Set-Clipboard`

Or, with the GitHub CLI: `base64 -w0 timelineclock-release.jks | gh secret set ANDROID_KEYSTORE_BASE64 -R micwalk/TimelineClock`
(and `gh secret set` for the other three; it prompts for the value).

Never paste these values into an issue, a pull request, a commit or a chat that others can read.

### 4. Make the first release

Releases are made by the **Android app** workflow on `main`: whenever `main` has a version
(in `package.json`) that has no release yet, it builds the app, signs it and publishes
release `v<version>` with the APK attached.

- If the secrets were in place before the change reached `main`, the release appears by
  itself a few minutes after the merge.
- If you add them later, the release step fails with "built without the signing secrets".
  Then go to **Actions** › **Android app** › **Run workflow** (branch `main`) and it builds
  and releases again, signed.

**Order matters on the first install:** the app runs whatever Netlify serves from `main`.
Merge the pull request, wait until Netlify has deployed it, then install the app.

---

## Install it (on the phone)

1. On the phone, open **https://github.com/micwalk/TimelineClock/releases/latest** in Chrome.
2. Under **Assets**, tap `timeline-clock-<version>.apk`. Chrome may warn that this type of
   file can harm your device: tap **Download anyway**.
3. Tap **Open** on the download notice (or open **Files** › **Downloads** and tap the file).
4. The first time, Android says it isn't allowed to install unknown apps from this source:
   tap **Settings**, turn on **Allow from this source**, and go back.
5. Tap **Install**. Google Play Protect may say the app is from an unknown developer or ask
   to scan it: let it scan, and if it still warns, choose **More details** › **Install anyway**.
6. Open **TimelineClock**. When Android asks whether it may send notifications, tap **Allow**.

You can turn **Allow from this source** off again afterwards; turn it back on when you
install an update.

Google is rolling out developer verification for sideloaded apps (in a few countries first,
from September 2026). If your phone ever refuses the install because the developer isn't
verified, the app itself is fine: installing over USB with `adb install` still works, or ask
an agent to look at the current options.

## Check that it's set up

In the app, open **Settings** (the gear). At the bottom:

- The version line shows **"Web 0.1.0 · Android app 0.1.0"** (with the current numbers). If
  it shows only "Version …", the page isn't talking to the Android app: close the app fully
  (swipe it away in Recents) and open it again.
- Below it, the Android version ("Android 16"), then a checklist: **Notifications**, **Alarm sound**, **Exact alarms**, **Live
  Updates**, each with ✓. Anything with ✗ says what to turn on:
  - Notifications: Android **Settings** › **Apps** › **TimelineClock** › **Notifications** ›
    allow.
  - Alarm sound: same screen, both **Alarms and timers** categories must be on (one is for
    when the app is open).
  - Exact alarms: **Settings** › **Apps** › **TimelineClock** › **Alarms & reminders** (this
    is normally allowed automatically).
  - Live Updates: the app's **Notifications** screen, **Live updates** on. Without it, the
    timer, stopwatch and ringing alarm are ordinary notifications: no status-bar chip, and
    not pinned at the top of the lock screen.

Optional, if alarms ever come late: **Settings** › **Apps** › **TimelineClock** › **App
battery usage** › **Unrestricted**.

## Bring your data over from the browser app

The Android app keeps its own data, separate from the web app installed from Chrome (each
has its own storage). Move it once:

1. In the **web app** (Chrome): **Settings** › **Data** › **Export**. This saves a `.json`
   backup file.
2. In the **Android app**: **Settings** › **Data** › **Import**, pick that file, choose what
   to bring (settings, data, or both) and whether to combine it with what's there or
   replace it.

After that, use the Android app for timers and alarms; the browser app won't know about
anything you add in the Android app (and vice versa).

## Try it

1. Start a **1m** timer (Timer button › 1m). A notification appears counting down.
2. Lock the phone, or switch to another app, and wait.
3. At zero it turns into the ringing alarm, on the lock screen too: the time past zero
   counting on ("−0:05"), on the alarm volume. Tap **Snooze 5 min** (it counts down again) or
   **Dismiss**. Or tap the notification itself: the app opens at the timer's overtime, still
   ringing, and its own Dismiss stops it.
4. Start the **Stopwatch**: a notification counts up until you **Stop** or **Reset**.

Try one alarm with the phone on vibrate or silent, to see how your phone handles the sound.

## Updates

- **Web changes** arrive by themselves, exactly like the PWA: the app picks up the new
  version and reloads when it won't get in your way (as you open it, or while it's in the
  background; never while an alarm is ringing).
- **Android app changes** come as a new release. [CHANGELOG.md](../CHANGELOG.md) says, for
  each version, whether the Android app needs installing again. To update, download the new
  APK from Releases and install it over the old one (same steps as above; Android says
  **Update**). **Your data stays.** Never uninstall to update.

How to tell the versions apart: Settings and Help show **"Web X · Android app Y"**. X is
the site the app is running (it updates by itself); Y is the installed Android app.

## If something's wrong

- **"Can't reach the site"**: the first start needs the internet, to load the site. After
  that the app starts offline too. Tap **Retry** once you're online. Alarms you already set
  still ring while offline.
- **No alarm sound**: check the Settings checklist, the **alarm** volume, and Do Not Disturb
  (it lets alarms through by default).
- **Something froze or misbehaved**: Settings › **Copy diagnostics log** (at the bottom, under
  the checklist) copies what the app logged: alarms ringing and answered, notification taps,
  the app pausing and resuming, slow calls, stalls and page errors. Paste it into a message
  or an issue. **Clear** empties it, so the next copy shows only a fresh attempt.
- **Uninstalling deletes the app's data.** Export a backup first (Settings › Data).

### If you ever lose the key

A build signed with a new key can't install over the old app. Export your data from the app
(Settings › Data › Export), uninstall it, install the new build, and import the backup.
Then put the new key in the secrets (steps 1–3 above).

---

## Testing a pull request (TC Preview)

The real app loads the live site, built from `main`. To try a pull request on the phone
before merging, use **TC Preview**: a separate test app that loads a PR's Netlify deploy
preview instead (`https://deploy-preview-<PR number>--timelineclockapp.netlify.app`, which
Netlify builds for every pull request).

- **Get it** from the **preview** pre-release: on the phone, open
  https://github.com/micwalk/TimelineClock/releases/download/preview/timeline-clock-preview.apk
  and install it like the real app. CI publishes it for pull requests that change the native
  side, signed with the same key; each build replaces the last one, at the same link.
  (Actions › Android app › Run workflow with **preview** ticked builds one from any branch.)
- **Pick the PR**: on its first start it asks *Which preview?*. Type the pull request's
  number (or paste a preview address) and tap **Open**; it remembers it. To switch, long-press
  the app icon › **Change preview**. If the preview can't be loaded (wrong number, or Netlify
  is still building it), it asks again. **Live site** loads the live site instead.
- It is its own app (`com.micwalk.timelineclock.preview`, version `x.y.z-preview`): it
  installs next to TimelineClock, never replaces it, and has its own data, separate for each
  preview address. Use throwaway test timers there. Its notifications and Settings checklist
  work like the real app's.
- A PR's **web** changes reach TC Preview through its deploy preview on every push; only
  **native** changes need a new build of TC Preview.
- Uninstall it when you're done; nothing else depends on it.

## For developers

- `capacitor.config.ts`: the shell (app id `com.micwalk.timelineclock`, permanent once
  installed). `server.url` is the live site; `webDir` is `android-offline/`, which holds only
  the "Can't reach the site" page. Never point `webDir` at `dist`: the app would run on a
  second origin with separate storage.
- `android/`: the native project (Capacitor 8, minSdk/targetSdk 36). Version name and code
  come from `package.json` (`versionCode` = major×10000 + minor×100 + patch). Release signing
  comes only from the `TC_SIGNING_*` environment variables (see `android/app/build.gradle`);
  without them the release APK is unsigned.
  - `MainActivity.java` creates the notification channels and registers the app's plugins.
  - `NotificationChannels.java`: "Alarms and timers" (high importance, `res/raw/alarm.ogg` on
    the alarm stream), "Alarms and timers (app open)" (the same sound at default importance,
    which leaves out the heads-up pop-up: used while `MainActivity` is resumed, as the page
    shows its own ringing panel) and "Running timers and stopwatch" (silent). Android keeps a channel's
    sound and importance once created, so changing them needs a new channel id.
  - `NotificationViews.java`: the notifications, all Live Updates (promoted ongoing:
    `setRequestPromotedOngoing`, the `POST_PROMOTED_NOTIFICATIONS` permission). Promotion
    rules out custom layouts and colorized notifications, so Android draws the time, which
    keeps ticking while the page is frozen: on Android 17+ as `Notification.MetricStyle`'s
    big value (a timer or stopwatch `TimeDifference`, also the chip's text), else the
    header's chronometer, which goes negative past zero. The app module compiles against SDK
    37 for MetricStyle and calls it only on Android 17+.
  - Native alarms: `AlarmsPlugin.java` (sync from the page, answers back, status,
    permission), `Alarms.java` (schedule with `setAlarmClock`, ring with `FLAG_INSISTENT`,
    Dismiss / Snooze, restore after a restart or update), `AlarmReceiver.java`,
    `AlarmStore.java` (SharedPreferences), and the pure, unit-tested `AlarmPlan.java`.
    Answers given from a notification are kept until the page replays them
    (`replayAlarmActions`); until then a sync leaves those alarms alone.
  - `Diag.java`: the diagnostics log (300 lines in SharedPreferences) and a main-thread
    watchdog; the page adds its own lines (`src/services/native/diagLog.ts`) and Settings
    copies both (`AlarmsPlugin.getLog`). `AlarmReceiver` does its work off the main thread
    (`goAsync`), and messages to the page go out from the plugin thread.
  - `LiveNotificationsPlugin.java`: the running timer / stopwatch notifications, and taps on
    any of the app's notifications (including the tap that started the app). A tap on a
    ringing alarm silences it (`Alarms.silence`: the notification is posted again without
    sound); Silence in the app does the same for every ringing alarm.
- `src/services/nativeShell.ts` detects the shell (`window.Capacitor`, set by the shell before
  the page runs) and loads `src/services/native/` with a dynamic `import()`, so browsers never
  download it. The decisions are pure and tested in `src/domain/nativeNotifications.ts`.
- Alarms use `AlarmManager.setAlarmClock`: exact, wakes the phone, not held back by Doze,
  and shown as the next alarm on the lock screen. The page plays no alarm sound inside the
  app (the notification rings), unless Android won't show notifications.
- Build locally: JDK 21 and the Android SDK (platform 37; Gradle can fetch it), then
  `npx cap sync android && cd android && ./gradlew assembleRelease` (add `-PtcPreview` for TC
  Preview; `:app:testReleaseUnitTest` runs the native unit tests). CI:
  `.github/workflows/android.yml`, with the shared setup in `.github/actions/android-setup`.
- TC Preview (`-PtcPreview`): `applicationIdSuffix ".preview"`, label "TC Preview",
  `BuildConfig.PREVIEW`. `SiteChoice.java` saves the chosen address and starts the bridge with
  the bundled config's `server.url` swapped for it; `SiteAddress.java` (unit tested) accepts
  only the live site and its Netlify deploys (`<name>--timelineclockapp.netlify.app`).
- **Merge order:** the app runs whatever Netlify serves from `main`, so web code the native
  side depends on must be deployed before (or with) the APK that needs it.
