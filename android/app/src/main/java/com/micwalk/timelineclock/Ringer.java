package com.micwalk.timelineclock;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.Context;
import android.media.AudioAttributes;
import android.media.Ringtone;
import android.media.RingtoneManager;
import android.net.Uri;
import android.os.Handler;
import android.os.Looper;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.util.Log;

/**
 * Plays an alarm's sound in the app itself, while the app is on screen: then no notification is
 * posted (the page shows its ringing card), so the sound has to come from here. It is the sound
 * of the alarm's channel (NotificationChannels), whatever the user picked for it in Android's
 * settings, so it sounds the same as the notification would. A tone loops on the alarm stream
 * until stopped; the chime plays once on the notification stream. Also plays previews (Settings).
 */
final class Ringer {

    private static final String TAG = "Ringer";
    /** A preview stops by itself after this long. */
    private static final long PREVIEW_MS = 6000;

    private static final Object LOCK = new Object();
    private static Ringtone ringing;
    /** The alarm whose tone is ringing (0: none). */
    private static int ringingId;
    private static Ringtone once;
    private static final Handler MAIN = new Handler(Looper.getMainLooper());

    private Ringer() {}

    /** Loops alarm `id`'s tone (replacing whatever rang before). A channel turned off or set to no sound stays quiet. */
    static void ring(Context c, int id, String sound) {
        synchronized (LOCK) {
            stop(c, 0);
            ringing = play(c, sound, true);
            ringingId = ringing != null ? id : 0;
            vibrate(c, sound, true);
        }
    }

    /** Stops the looping tone if it is alarm `id`'s (0: whichever). */
    static void stop(Context c, int id) {
        synchronized (LOCK) {
            if (id != 0 && id != ringingId) return;
            stopRinging();
            Vibrator v = c.getSystemService(Vibrator.class);
            if (v != null) v.cancel();
        }
    }

    /** The alarm whose tone is ringing, 0 for none. */
    static int ringingId() {
        synchronized (LOCK) {
            return ringingId;
        }
    }

    /** Plays `sound` once: a chime with the app open, or a preview (which stops itself). */
    static void once(Context c, String sound, boolean preview) {
        synchronized (LOCK) {
            stopOnce();
            Ringtone r = play(c, sound, false);
            once = r;
            if (!preview) vibrate(c, sound, false);
            if (r != null && preview) MAIN.postDelayed(() -> { synchronized (LOCK) { if (once == r) stopOnce(); } }, PREVIEW_MS);
        }
    }

    static void stopPreview() {
        synchronized (LOCK) {
            stopOnce();
        }
    }

    private static void stopRinging() {
        if (ringing != null) {
            try { ringing.stop(); } catch (RuntimeException e) { Log.w(TAG, "stop failed", e); }
        }
        ringing = null;
        ringingId = 0;
    }

    private static void stopOnce() {
        if (once != null) {
            try { once.stop(); } catch (RuntimeException e) { Log.w(TAG, "stop failed", e); }
        }
        once = null;
    }

    /** The channel's sound, playing (looping for a tone); null when it has none or is off. */
    private static Ringtone play(Context c, String sound, boolean loop) {
        try {
            NotificationChannel ch = channel(c, sound);
            if (ch == null || ch.getImportance() == NotificationManager.IMPORTANCE_NONE) return null;
            Uri uri = ch.getSound();
            if (uri == null) return null;
            Ringtone r = RingtoneManager.getRingtone(c, uri);
            if (r == null) return null;
            boolean chime = NotificationChannels.CHIME.equals(NotificationChannels.forSound(sound));
            r.setAudioAttributes(new AudioAttributes.Builder()
                .setUsage(chime ? AudioAttributes.USAGE_NOTIFICATION : AudioAttributes.USAGE_ALARM)
                .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                .build());
            r.setLooping(loop);
            r.play();
            return r;
        } catch (RuntimeException e) {
            Log.e(TAG, "Could not play " + sound, e);
            Diag.log(c, "in-app sound failed: " + e);
            return null;
        }
    }

    /** The channel's vibration, as the notification would have it (looping for a tone). */
    private static void vibrate(Context c, String sound, boolean loop) {
        try {
            NotificationChannel ch = channel(c, sound);
            Vibrator v = c.getSystemService(Vibrator.class);
            if (ch == null || v == null || !ch.shouldVibrate() || ch.getImportance() == NotificationManager.IMPORTANCE_NONE) return;
            long[] pattern = ch.getVibrationPattern();
            if (pattern == null || pattern.length == 0) pattern = NotificationChannels.VIBRATION;
            v.vibrate(VibrationEffect.createWaveform(pattern, loop ? 0 : -1),
                new AudioAttributes.Builder().setUsage(loop ? AudioAttributes.USAGE_ALARM : AudioAttributes.USAGE_NOTIFICATION).build());
        } catch (RuntimeException e) {
            Log.w(TAG, "Could not vibrate", e);
        }
    }

    private static NotificationChannel channel(Context c, String sound) {
        NotificationManager nm = c.getSystemService(NotificationManager.class);
        return nm != null ? nm.getNotificationChannel(NotificationChannels.forSound(sound)) : null;
    }
}
