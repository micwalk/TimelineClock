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
 *
 * Alarm sounds (#18, src/domain/sounds.ts) are channels: "Alarm tone 1" to "Alarm tone 4" ring
 * over and over on the alarm stream, "Chime" sounds once on the notification stream. Each starts
 * with one of the app's own tones (res/raw, rendered from src/services/tones.ts); the user can set
 * any of them to another sound, their own file included, in Android's settings for the channel.
 * While the app is on screen no ringing notification is posted: Ringer plays the channel's sound.
 */
final class NotificationChannels {

    /** The four alarm tones, by the page's sound names ("tone1"…); also their channel ids. */
    static final String[] TONES = { "tone1", "tone2", "tone3", "tone4" };
    /** One sound, once, for alarms set to chime. */
    static final String CHIME = "chime";
    /** The running timer and stopwatch: ongoing and silent (LiveNotificationsPlugin). */
    static final String LIVE = "live";

    /** Channels from before the tones: one sound for every alarm, twice (with the app open, without a pop-up). */
    private static final String[] OLD = { "alarms", "alarms_in_app" };

    /** Each tone's sound to start with (res/raw). */
    private static final int[] TONE_RAW = { R.raw.tone_1, R.raw.tone_2, R.raw.tone_3, R.raw.tone_4 };

    static final long[] VIBRATION = { 0, 600, 400, 600, 400, 600 };

    private static final String TAG = "TimelineClock";

    private NotificationChannels() {}

    /** The channel for a sound from the page; anything unknown rings Tone 1. */
    static String forSound(String sound) {
        if (CHIME.equals(sound)) return CHIME;
        for (String t : TONES) if (t.equals(sound)) return t;
        return TONES[0];
    }

    /** Creates the channels if they don't exist yet. Never throws: a failure here must not stop the app. */
    static void ensure(Context context) {
        try {
            NotificationManager nm = context.getSystemService(NotificationManager.class);
            if (nm == null) return;

            for (int i = 0; i < TONES.length; i++) {
                NotificationChannel ch = new NotificationChannel(TONES[i], "Alarm tone " + (i + 1), NotificationManager.IMPORTANCE_HIGH);
                ch.setDescription("Alarms set to Tone " + (i + 1) + " ring with this sound until answered. Pick any sound for it here.");
                ch.setLockscreenVisibility(android.app.Notification.VISIBILITY_PUBLIC);
                ch.enableVibration(true);
                ch.setVibrationPattern(VIBRATION);
                ch.enableLights(true);
                ch.setSound(raw(context, TONE_RAW[i]), attributes(AudioAttributes.USAGE_ALARM));
                nm.createNotificationChannel(ch);
            }

            NotificationChannel chime = new NotificationChannel(CHIME, "Chime", NotificationManager.IMPORTANCE_HIGH);
            chime.setDescription("Alarms set to Chime sound once and need no answer.");
            chime.setLockscreenVisibility(android.app.Notification.VISIBILITY_PUBLIC);
            chime.enableVibration(true);
            chime.setVibrationPattern(new long[] { 0, 250 });
            chime.setSound(raw(context, R.raw.chime), attributes(AudioAttributes.USAGE_NOTIFICATION));
            nm.createNotificationChannel(chime);

            NotificationChannel live = new NotificationChannel(LIVE, "Running timers and stopwatch", NotificationManager.IMPORTANCE_DEFAULT);
            live.setDescription("Counts down a running timer and counts up the stopwatch.");
            live.setLockscreenVisibility(android.app.Notification.VISIBILITY_PUBLIC);
            live.setSound(null, null);
            live.enableVibration(false);
            live.enableLights(false);
            live.setShowBadge(false);
            nm.createNotificationChannel(live);

            for (String id : OLD) if (nm.getNotificationChannel(id) != null) nm.deleteNotificationChannel(id);
        } catch (RuntimeException e) {
            Log.e(TAG, "Could not create notification channels", e);
        }
    }

    /** The sound a channel starts with (the app's own tone for it). */
    static Uri ownSound(Context context, String sound) {
        String id = forSound(sound);
        if (CHIME.equals(id)) return raw(context, R.raw.chime);
        for (int i = 0; i < TONES.length; i++) if (TONES[i].equals(id)) return raw(context, TONE_RAW[i]);
        return raw(context, TONE_RAW[0]);
    }

    private static Uri raw(Context context, int res) {
        return Uri.parse(ContentResolver.SCHEME_ANDROID_RESOURCE + "://" + context.getPackageName() + "/" + res);
    }

    private static AudioAttributes attributes(int usage) {
        return new AudioAttributes.Builder().setUsage(usage).setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION).build();
    }
}
