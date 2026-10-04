# The Android app

Timeline Clock as an Android app, for one reason: **timers and alarms ring when the app is
closed or the phone is asleep.** The web app (PWA) can't do that: Android freezes a web page
in the background, and no web feature can wake it at a set time.

The Android app is a thin shell around the live site (`https://timelineclockapp.netlify.app`).
Web changes reach it by themselves, like PWA updates. You install the app again only when
its native part changes; [CHANGELOG.md](../CHANGELOG.md) says when.

What it adds:

- **Alarm notifications** for every alarmed instant (timers and bells), exact to the second,
  firing with the app closed, the phone idle, or after a restart. The sound plays on the
  **alarm volume**. Tapping the notification opens the app at that alarm.
- **Live notifications**: a running timer counts down, and a running stopwatch counts up,
  on the lock screen and in the notification shade. Where Android allows it, they also
  appear as a **Live Update** chip in the status bar.
- The in-app ringing (Dismiss / Snooze) works as before whenever the app is open.

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

### 2. Back it up

Save `timelineclock-release.jks` **and** its password somewhere safe (a password manager
that takes files, or a private cloud folder). If the key is lost, future builds can't
update the installed app; you would export your data, uninstall, install the new build and
import (see "If you ever lose the key").

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
6. Open **Timeline Clock**. When Android asks whether it may send notifications, tap **Allow**.

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
- Below it, a checklist: **Notifications**, **Alarm sound**, **Exact alarms**, **Live
  Updates**, each with ✓. Anything with ✗ says what to turn on:
  - Notifications: Android **Settings** › **Apps** › **Timeline Clock** › **Notifications** ›
    allow.
  - Alarm sound: same screen, the **Alarms and timers** category must be on.
  - Exact alarms: **Settings** › **Apps** › **Timeline Clock** › **Alarms & reminders** (this
    is normally allowed automatically).
  - Live Updates (optional): in the app's notification settings, allow **Live Updates** /
    promoted notifications. Without it, the running timer still shows as a normal
    notification.

Optional, if alarms ever come late: **Settings** › **Apps** › **Timeline Clock** › **App
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
3. At zero the countdown disappears and an **alarm notification** rings (on the alarm
   volume). Tap it: the app opens at the timer and rings in the app too; **Dismiss** there
   clears the notification.
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
- **Uninstalling deletes the app's data.** Export a backup first (Settings › Data).

### If you ever lose the key

A build signed with a new key can't install over the old app. Export your data from the app
(Settings › Data › Export), uninstall it, install the new build, and import the backup.
Then put the new key in the secrets (steps 1–3 above).

---

## For developers

- `capacitor.config.ts`: the shell (app id `com.micwalk.timelineclock`, permanent once
  installed). `server.url` is the live site; `webDir` is `android-offline/`, which holds only
  the "Can't reach the site" page. Never point `webDir` at `dist`: the app would run on a
  second origin with separate storage.
- `android/`: the native project (Capacitor 8, minSdk/targetSdk 36). Version name and code
  come from `package.json` (`versionCode` = major×10000 + minor×100 + patch). Release signing
  comes only from the `TC_SIGNING_*` environment variables (see `android/app/build.gradle`);
  without them the release APK is unsigned.
  - `MainActivity.java` creates the notification channels and registers the app's plugin.
  - `NotificationChannels.java`: "Alarms and timers" (high importance, `res/raw/alarm.ogg` on
    the alarm stream) and "Running timers and stopwatch" (silent). Android keeps a channel's
    sound and importance once created, so changing them needs a new channel id.
  - `LiveNotificationsPlugin.java`: ongoing chronometer notifications, Live Update requests,
    tap events and a status check.
- `src/services/nativeShell.ts` detects the shell (`window.Capacitor`, set by the shell before
  the page runs) and loads `src/services/native/` with a dynamic `import()`, so browsers never
  download it. The decisions are pure and tested in `src/domain/nativeNotifications.ts`.
- Alarms are scheduled through `@capacitor/local-notifications` (exact,
  `setExactAndAllowWhileIdle`; restored after a reboot). In Doze, Android lets each app's
  while-idle alarms fire at most about once every 9 minutes, which only matters for alarms
  minutes apart while the phone sleeps.
- Build locally: JDK 21 and the Android SDK (platform 36), then
  `npx cap sync android && cd android && ./gradlew assembleRelease`. CI:
  `.github/workflows/android.yml`.
- **Merge order:** the app runs whatever Netlify serves from `main`, so web code the native
  side depends on must be deployed before (or with) the APK that needs it.
