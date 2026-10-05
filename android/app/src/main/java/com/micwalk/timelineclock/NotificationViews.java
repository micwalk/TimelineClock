package com.micwalk.timelineclock;

import android.Manifest;
import android.app.Notification;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.util.Log;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import androidx.core.content.ContextCompat;
import java.time.Instant;

/**
 * Builds and posts the app's notifications: the running timer / stopwatch ("live", silent) and
 * the ringing alarm. All of them are Live Updates (promoted ongoing notifications): pinned at
 * the top of the shade and the lock screen, expanded, and shown as a status-bar chip. Live
 * Updates can't use custom layouts, so the time comes from Android itself and keeps ticking
 * while the page is frozen:
 * - Android 17+: MetricStyle, the time as the big live value (and the chip's text).
 * - Android 16: the header's chronometer; a countdown also shows in the chip.
 */
final class NotificationViews {

    private static final String TAG = "NotificationViews";

    /** Live notifications (the running timer and stopwatch). */
    static final String TAG_LIVE = "tc-live";
    /** Ringing alarms. */
    static final String TAG_RING = "tc-ring";

    /** A tap opens the app with this action, the kind and the instant (handled by LiveNotificationsPlugin). */
    static final String ACTION_OPEN = "com.micwalk.timelineclock.OPEN_LIVE";
    static final String EXTRA_INSTANT_ID = "instantId";
    static final String EXTRA_KIND = "kind";
    /** On a ringing alarm's tap: which alarm to silence. */
    static final String EXTRA_ALARM_ID = "alarmId";

    /** Android 17 (MetricStyle). */
    private static final int API_METRIC_STYLE = 37;

    private NotificationViews() {}

    static boolean canPost(Context c) {
        return ContextCompat.checkSelfPermission(c, Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED
            && NotificationManagerCompat.from(c).areNotificationsEnabled();
    }

    /** Posts unless notifications aren't permitted (the user can take the permission back at any time). */
    static boolean post(Context c, String tag, int id, Notification n) {
        if (ContextCompat.checkSelfPermission(c, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) return false;
        NotificationManagerCompat.from(c).notify(tag, id, n);
        return true;
    }

    static void cancel(Context c, String tag, int id) {
        NotificationManagerCompat.from(c).cancel(tag, id);
    }

    /** Opens the app at the instant; `kind` ("countdown", "stopwatch", "alarm") decides what it shows. */
    static PendingIntent openApp(Context c, String kind, String instantId, int requestCode, int alarmId) {
        Intent open = new Intent(c, MainActivity.class);
        open.setAction(ACTION_OPEN);
        open.addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        open.putExtra(EXTRA_KIND, kind);
        if (instantId != null && !instantId.isEmpty()) open.putExtra(EXTRA_INSTANT_ID, instantId);
        if (alarmId != 0) open.putExtra(EXTRA_ALARM_ID, alarmId);
        return PendingIntent.getActivity(c, requestCode, open, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    /** A broadcast to AlarmReceiver for alarm `id` (fire, ring end, dismiss, snooze). */
    static PendingIntent alarmBroadcast(Context c, String action, int id) {
        Intent i = new Intent(c, AlarmReceiver.class);
        i.setAction(action);
        // The data makes each alarm's intents distinct, whatever the request code.
        i.setData(Uri.parse("timelineclock://alarm/" + id));
        i.putExtra(AlarmReceiver.EXTRA_ID, id);
        return PendingIntent.getBroadcast(c, id, i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    /** Shared by every kind: title, text, the chronometer to or from `whenMs`, and the Live Update request. */
    private static NotificationCompat.Builder base(Context c, String channel, long whenMs, boolean countDown, String title, String text) {
        return new NotificationCompat.Builder(c, channel)
            .setSmallIcon(R.drawable.ic_stat_timeline)
            .setColor(ContextCompat.getColor(c, R.color.now_red))
            .setContentTitle(title)
            .setContentText(text)
            .setShowWhen(true)
            .setWhen(whenMs)
            .setUsesChronometer(true)
            .setChronometerCountDown(countDown)
            .setOngoing(true)
            .setLocalOnly(true)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            // Live Update: pinned, expanded, and a chip. Android decides; if it says no, this
            // stays a plain ongoing notification.
            .setRequestPromotedOngoing(true);
    }

    /** A running timer (countdown to `whenMs`) or the stopwatch (up from `whenMs`): ongoing and silent. */
    static Notification live(Context c, int id, boolean countDown, String title, String text, long whenMs, String instantId) {
        Notification n = base(c, NotificationChannels.LIVE, whenMs, countDown, title, text)
            .setContentIntent(openApp(c, countDown ? "countdown" : "stopwatch", instantId, id, 0))
            .setOnlyAlertOnce(true)
            .setSilent(true)
            .setCategory(countDown ? NotificationCompat.CATEGORY_ALARM : NotificationCompat.CATEGORY_STOPWATCH)
            .build();
        return withBigTime(c, n, whenMs, countDown, countDown ? "left" : "elapsed");
    }

    /**
     * A ringing alarm: its name, the time past it (a countdown past zero shows "−0:42" in the
     * header; Android 17 shows it big as "over"), Dismiss and Snooze. On the alarm channel,
     * sounding over and over (FLAG_INSISTENT) until answered or the ring time runs out, unless
     * `silent` (after a tap on it). Swiping it away dismisses it.
     */
    static Notification ringing(Context c, AlarmSpec s, int snoozeMinutes, boolean silent) {
        NotificationCompat.Builder b = base(c, NotificationChannels.ALARMS, s.at, true, s.title, s.ringText)
            // Its own request code range, so it never shares a PendingIntent with a live notification.
            .setContentIntent(openApp(c, "alarm", s.instantId, s.id ^ 0x40000000, s.id))
            .setDeleteIntent(alarmBroadcast(c, AlarmReceiver.ACTION_DISMISS, s.id))
            .addAction(0, "Dismiss", alarmBroadcast(c, AlarmReceiver.ACTION_DISMISS, s.id))
            .addAction(0, "Snooze " + snoozeMinutes + " min", alarmBroadcast(c, AlarmReceiver.ACTION_SNOOZE, s.id))
            .setCategory(NotificationCompat.CATEGORY_ALARM)
            .setPriority(NotificationCompat.PRIORITY_MAX)
            .setAutoCancel(false);
        if (silent) b.setSilent(true).setOnlyAlertOnce(true);
        Notification n = withBigTime(c, b.build(), s.at, false, "over");
        if (!silent) n.flags |= Notification.FLAG_INSISTENT;
        return n;
    }

    /**
     * Android 17+: the time as MetricStyle's big live value, also the chip's text (the critical
     * metric). `countDown`: a timer to `whenMs`; otherwise a stopwatch from it. Anything that
     * goes wrong leaves the plain notification.
     */
    private static Notification withBigTime(Context c, Notification n, long whenMs, boolean countDown, String label) {
        if (Build.VERSION.SDK_INT < API_METRIC_STYLE) return n;
        try {
            Instant at = Instant.ofEpochMilli(whenMs);
            Notification.Metric.MetricValue value = countDown
                ? Notification.Metric.TimeDifference.forTimer(at, Notification.Metric.TimeDifference.FORMAT_CHRONOMETER)
                : Notification.Metric.TimeDifference.forStopwatch(at, Notification.Metric.TimeDifference.FORMAT_CHRONOMETER);
            Notification.Builder rb = Notification.Builder.recoverBuilder(c, n);
            rb.setStyle(new Notification.MetricStyle().addMetric(new Notification.Metric(value, label)).setCriticalMetric(0));
            Notification out = rb.build();
            out.flags |= n.flags;
            return out;
        } catch (RuntimeException e) {
            Log.w(TAG, "MetricStyle failed; plain notification", e);
            return n;
        }
    }
}
