package com.micwalk.timelineclock;

import android.Manifest;
import android.app.Notification;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.SystemClock;
import android.widget.RemoteViews;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import androidx.core.content.ContextCompat;

/**
 * Builds and posts the app's notifications: the running timer / stopwatch ("live", silent) and
 * the ringing alarm. Both put the time first, big and bold, in a custom layout around Android's
 * own Chronometer, which keeps ticking in the system UI while the page is frozen. A countdown
 * carries on past zero as "−0:42", which is how a ringing timer shows its overtime.
 */
final class NotificationViews {

    /** Live notifications (the running timer and stopwatch). */
    static final String TAG_LIVE = "tc-live";
    /** Ringing alarms. */
    static final String TAG_RING = "tc-ring";

    /** A tap opens the app with this action, the kind and the instant (handled by LiveNotificationsPlugin). */
    static final String ACTION_OPEN = "com.micwalk.timelineclock.OPEN_LIVE";
    static final String EXTRA_INSTANT_ID = "instantId";
    static final String EXTRA_KIND = "kind";

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
    static PendingIntent openApp(Context c, String kind, String instantId, int requestCode) {
        Intent open = new Intent(c, MainActivity.class);
        open.setAction(ACTION_OPEN);
        open.addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        open.putExtra(EXTRA_KIND, kind);
        if (instantId != null && !instantId.isEmpty()) open.putExtra(EXTRA_INSTANT_ID, instantId);
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

    /** The time view, counting from or to `whenMs`, plus the name (and, expanded, the detail line). */
    private static RemoteViews timeViews(Context c, int layout, long whenMs, boolean countDown, String title, String text) {
        RemoteViews v = new RemoteViews(c.getPackageName(), layout);
        long base = SystemClock.elapsedRealtime() + (whenMs - System.currentTimeMillis());
        v.setChronometer(R.id.notif_time, base, null, true);
        v.setChronometerCountDown(R.id.notif_time, countDown);
        v.setTextViewText(R.id.notif_title, title);
        if (layout == R.layout.notification_time_big) v.setTextViewText(R.id.notif_text, text == null ? "" : text);
        return v;
    }

    private static NotificationCompat.Builder base(Context c, String channel, long whenMs, boolean countDown, String title, String text) {
        RemoteViews small = timeViews(c, R.layout.notification_time, whenMs, countDown, title, text);
        RemoteViews big = timeViews(c, R.layout.notification_time_big, whenMs, countDown, title, text);
        return new NotificationCompat.Builder(c, channel)
            .setSmallIcon(R.drawable.ic_stat_timeline)
            .setColor(ContextCompat.getColor(c, R.color.now_red))
            // Also the text for screen readers and for anywhere the custom layout isn't shown.
            .setContentTitle(title)
            .setContentText(text)
            .setStyle(new NotificationCompat.DecoratedCustomViewStyle())
            .setCustomContentView(small)
            .setCustomBigContentView(big)
            .setCustomHeadsUpContentView(small)
            .setShowWhen(false)
            .setLocalOnly(true)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC);
    }

    /** A running timer (countdown to `whenMs`) or the stopwatch (up from `whenMs`): ongoing and silent. */
    static Notification live(Context c, int id, boolean countDown, String title, String text, long whenMs, String instantId) {
        return base(c, NotificationChannels.LIVE, whenMs, countDown, title, text)
            .setContentIntent(openApp(c, countDown ? "countdown" : "stopwatch", instantId, id))
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setSilent(true)
            .setCategory(countDown ? NotificationCompat.CATEGORY_ALARM : NotificationCompat.CATEGORY_STOPWATCH)
            .build();
    }

    /**
     * A ringing alarm: the time past it ("−0:42"), its name, Dismiss and Snooze. On the alarm
     * channel, sounding over and over (FLAG_INSISTENT) until it is answered or the ring time
     * runs out; swiping it away dismisses it.
     */
    static Notification ringing(Context c, AlarmSpec s, int snoozeMinutes) {
        Notification n = base(c, NotificationChannels.ALARMS, s.at, true, s.title, s.ringText)
            // Its own request code range, so it never shares a PendingIntent with a live notification.
            .setContentIntent(openApp(c, "alarm", s.instantId, s.id ^ 0x40000000))
            .setDeleteIntent(alarmBroadcast(c, AlarmReceiver.ACTION_DISMISS, s.id))
            .addAction(0, "Dismiss", alarmBroadcast(c, AlarmReceiver.ACTION_DISMISS, s.id))
            .addAction(0, "Snooze " + snoozeMinutes + " min", alarmBroadcast(c, AlarmReceiver.ACTION_SNOOZE, s.id))
            .setCategory(NotificationCompat.CATEGORY_ALARM)
            .setPriority(NotificationCompat.PRIORITY_MAX)
            .setOngoing(true)
            .setAutoCancel(false)
            .build();
        n.flags |= Notification.FLAG_INSISTENT;
        return n;
    }
}
