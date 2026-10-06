package com.micwalk.timelineclock;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.ContentResolver;
import android.content.Context;
import android.media.AudioAttributes;
import android.net.Uri;
import android.util.Log;

/**
 * The app's notification channels. Android keeps a channel's sound and importance once it
 * exists (only the user can change them), so changing those here needs a new channel id.
 */
final class NotificationChannels {

    /** Ringing alarms (timers and bells), posted by Alarms.java. */
    static final String ALARMS = "alarms";
    /**
     * Ringing alarms while the app is open: the same sound, but no pop-up over the app, which
     * shows its own ringing panel. Default importance is what leaves out the heads-up.
     */
    static final String ALARMS_IN_APP = "alarms_in_app";
    /** The running timer and stopwatch: ongoing and silent (LiveNotificationsPlugin). */
    static final String LIVE = "live";

    private static final String TAG = "TimelineClock";

    private NotificationChannels() {}

    /** Creates the channels if they don't exist yet. Never throws: a failure here must not stop the app. */
    static void ensure(Context context) {
        try {
            NotificationManager nm = context.getSystemService(NotificationManager.class);
            if (nm == null) return;

            nm.createNotificationChannel(alarmChannel(context, ALARMS, "Alarms and timers", NotificationManager.IMPORTANCE_HIGH,
                "Rings when a timer ends or an alarm is due."));
            nm.createNotificationChannel(alarmChannel(context, ALARMS_IN_APP, "Alarms and timers (app open)", NotificationManager.IMPORTANCE_DEFAULT,
                "Rings when a timer ends or an alarm is due while the app is open, without a pop-up over it."));

            NotificationChannel live = new NotificationChannel(LIVE, "Running timers and stopwatch", NotificationManager.IMPORTANCE_DEFAULT);
            live.setDescription("Counts down a running timer and counts up the stopwatch.");
            live.setLockscreenVisibility(android.app.Notification.VISIBILITY_PUBLIC);
            live.setSound(null, null);
            live.enableVibration(false);
            live.enableLights(false);
            live.setShowBadge(false);
            nm.createNotificationChannel(live);
        } catch (RuntimeException e) {
            Log.e(TAG, "Could not create notification channels", e);
        }
    }

    /** An alarm channel: the app's alarm sound on the alarm stream (it follows the alarm volume), and vibration. */
    private static NotificationChannel alarmChannel(Context context, String id, String name, int importance, String description) {
        NotificationChannel ch = new NotificationChannel(id, name, importance);
        ch.setDescription(description);
        ch.setLockscreenVisibility(android.app.Notification.VISIBILITY_PUBLIC);
        ch.enableVibration(true);
        ch.setVibrationPattern(new long[] { 0, 600, 400, 600, 400, 600 });
        ch.enableLights(true);
        Uri sound = Uri.parse(ContentResolver.SCHEME_ANDROID_RESOURCE + "://" + context.getPackageName() + "/" + R.raw.alarm);
        ch.setSound(
            sound,
            new AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_ALARM)
                .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                .build()
        );
        return ch;
    }
}
