// The Android app (docs/android.md): a Capacitor shell that loads the live site, so web
// changes reach it like PWA updates do. Only native changes need a reinstall.
import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  // Permanent once installed: Android treats a different id as a different app.
  appId: 'com.micwalk.timelineclock',
  appName: 'TimelineClock',
  // Not dist: bundling the app would run it on a second origin with separate storage.
  // This folder holds only the page shown when the site can't be reached.
  webDir: 'android-offline',
  server: {
    url: 'https://timelineclockapp.netlify.app',
    errorPath: 'index.html',
  },
  // The app's background (theme.css) while the page loads, instead of a white flash.
  backgroundColor: '#02040c',
  plugins: {
    // Light status-bar icons: the app is dark whatever the phone's theme.
    SystemBars: {
      style: 'DARK',
    },
    LocalNotifications: {
      smallIcon: 'ic_stat_timeline',
      iconColor: '#ff3b5c',
    },
  },
}

export default config
