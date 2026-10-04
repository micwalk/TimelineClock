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

    /** Alarmed instants (timers and bells), posted by the LocalNotifications plugin (src/services/native). */
    static final String ALARMS = "alarms";
    /** The running timer and stopwatch: ongoing and silent (LiveNotificationsPlugin). */
    static final String LIVE = "live";

    private static final String TAG = "TimelineClock";

    private NotificationChannels() {}

    /** Creates the channels if they don't exist yet. Never throws: a failure here must not stop the app. */
    static void ensure(Context context) {
        try {
            NotificationManager nm = context.getSystemService(NotificationManager.class);
            if (nm == null) return;

            NotificationChannel alarms = new NotificationChannel(ALARMS, "Alarms and timers", NotificationManager.IMPORTANCE_HIGH);
            alarms.setDescription("Rings when a timer ends or an alarm is due.");
            alarms.setLockscreenVisibility(android.app.Notification.VISIBILITY_PUBLIC);
            alarms.enableVibration(true);
            alarms.setVibrationPattern(new long[] { 0, 600, 400, 600, 400, 600 });
            alarms.enableLights(true);
            // The alarm stream, so it follows the alarm volume rather than the notification volume.
            Uri sound = Uri.parse(ContentResolver.SCHEME_ANDROID_RESOURCE + "://" + context.getPackageName() + "/" + R.raw.alarm);
            alarms.setSound(
                sound,
                new AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_ALARM)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                    .build()
            );
            nm.createNotificationChannel(alarms);

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
}
