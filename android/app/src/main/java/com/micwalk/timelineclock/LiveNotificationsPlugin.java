package com.micwalk.timelineclock;

import android.Manifest;
import android.app.AlarmManager;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.service.notification.StatusBarNotification;
import android.util.Log;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import androidx.core.content.ContextCompat;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.util.HashSet;
import java.util.Set;
import org.json.JSONObject;

/**
 * The running timer and stopwatch as ongoing notifications (src/services/native/liveNotifications.ts).
 * Android's own chronometer draws the time, so they stay right while the page is frozen in the
 * background; a countdown also removes itself when it reaches zero. Where Android allows it, they
 * are promoted to Live Updates (a status-bar chip).
 *
 * Every method catches its own errors: nothing here may take the alarms down with it.
 */
@CapacitorPlugin(name = "LiveNotifications")
public class LiveNotificationsPlugin extends Plugin {

    private static final String TAG = "LiveNotifications";
    /** Marks our notifications, so cancelling them never touches the alarm notifications. */
    private static final String NOTIFICATION_TAG = "tc-live";
    /** A tap opens the app with this action and the instant to go to. */
    static final String ACTION_OPEN = "com.micwalk.timelineclock.OPEN_LIVE";
    static final String EXTRA_INSTANT_ID = "instantId";

    @Override
    public void load() {
        NotificationChannels.ensure(getContext());
    }

    /**
     * Shows exactly these notifications: posts or updates each item and removes any other live
     * notification. items: [{ id, kind: 'countdown' | 'stopwatch', title, text, whenMs, instantId }].
     */
    @PluginMethod
    public void sync(PluginCall call) {
        try {
            JSArray items = call.getArray("items", new JSArray());
            NotificationManagerCompat nm = NotificationManagerCompat.from(getContext());
            boolean enabled = nm.areNotificationsEnabled();
            long now = System.currentTimeMillis();
            Set<Integer> keep = new HashSet<>();
            int posted = 0;
            for (int i = 0; i < items.length(); i++) {
                JSONObject item = items.optJSONObject(i);
                if (item == null || !item.has("id")) continue;
                int id = item.optInt("id");
                boolean countdown = "countdown".equals(item.optString("kind"));
                long whenMs = item.optLong("whenMs", now);
                // A countdown that has already ended is the alarm's moment: nothing to count.
                if (countdown && whenMs <= now) continue;
                keep.add(id);
                if (!enabled) continue;
                try {
                    if (post(nm, id, build(item, id, countdown, whenMs, now))) posted++;
                } catch (RuntimeException e) {
                    Log.e(TAG, "Could not post live notification " + id, e);
                }
            }
            cancelExcept(keep);
            JSObject result = status();
            result.put("posted", posted);
            call.resolve(result);
        } catch (RuntimeException e) {
            Log.e(TAG, "sync failed", e);
            call.reject("sync failed: " + e.getMessage());
        }
    }

    /** Removes every live notification (never the alarm notifications). */
    @PluginMethod
    public void cancelAll(PluginCall call) {
        try {
            cancelExcept(new HashSet<>());
            call.resolve();
        } catch (RuntimeException e) {
            Log.e(TAG, "cancelAll failed", e);
            call.reject("cancelAll failed: " + e.getMessage());
        }
    }

    /** What Android currently allows, for the Settings panel: { notifications, alarmChannel, exactAlarms, liveUpdates }. */
    @PluginMethod
    public void getStatus(PluginCall call) {
        try {
            call.resolve(status());
        } catch (RuntimeException e) {
            Log.e(TAG, "getStatus failed", e);
            call.reject("getStatus failed: " + e.getMessage());
        }
    }

    @Override
    protected void handleOnNewIntent(Intent intent) {
        super.handleOnNewIntent(intent);
        try {
            if (intent == null || !ACTION_OPEN.equals(intent.getAction())) return;
            String instantId = intent.getStringExtra(EXTRA_INSTANT_ID);
            if (instantId == null) return;
            JSObject data = new JSObject();
            data.put("instantId", instantId);
            // Kept until the page listens: a tap may have cold-started the app.
            notifyListeners("liveNotificationTapped", data, true);
        } catch (RuntimeException e) {
            Log.e(TAG, "Could not handle a notification tap", e);
        }
    }

    private Notification build(JSONObject item, int id, boolean countdown, long whenMs, long now) {
        Context context = getContext();
        String title = item.optString("title", countdown ? "Timer" : "Stopwatch");
        String text = item.optString("text", "");
        String instantId = item.optString("instantId", "");

        Intent open = new Intent(context, MainActivity.class);
        open.setAction(ACTION_OPEN);
        open.addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        if (!instantId.isEmpty()) open.putExtra(EXTRA_INSTANT_ID, instantId);
        PendingIntent tap = PendingIntent.getActivity(
            context,
            id,
            open,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        NotificationCompat.Builder b = new NotificationCompat.Builder(context, NotificationChannels.LIVE)
            .setSmallIcon(R.drawable.ic_stat_timeline)
            .setColor(ContextCompat.getColor(context, R.color.now_red))
            .setContentTitle(title)
            .setContentIntent(tap)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setSilent(true)
            .setLocalOnly(true)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setCategory(countdown ? NotificationCompat.CATEGORY_ALARM : NotificationCompat.CATEGORY_STOPWATCH)
            .setShowWhen(true)
            .setWhen(whenMs)
            .setUsesChronometer(true)
            .setChronometerCountDown(countdown)
            // Live Update (Android 16 status-bar chip). Android decides; if it says no, this
            // stays a plain ongoing notification.
            .setRequestPromotedOngoing(true);
        if (!text.isEmpty()) b.setContentText(text);
        // Gone by itself when the timer reaches zero, even if the page is frozen then.
        if (countdown) b.setTimeoutAfter(Math.max(1, whenMs - now));
        return b.build();
    }

    /** Posts unless notifications aren't permitted (the user can take the permission back at any time). */
    private boolean post(NotificationManagerCompat nm, int id, Notification notification) {
        if (ContextCompat.checkSelfPermission(getContext(), Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            return false;
        }
        nm.notify(NOTIFICATION_TAG, id, notification);
        return true;
    }

    private void cancelExcept(Set<Integer> keep) {
        NotificationManager nm = getContext().getSystemService(NotificationManager.class);
        if (nm == null) return;
        for (StatusBarNotification sbn : nm.getActiveNotifications()) {
            if (NOTIFICATION_TAG.equals(sbn.getTag()) && !keep.contains(sbn.getId())) {
                nm.cancel(NOTIFICATION_TAG, sbn.getId());
            }
        }
    }

    private JSObject status() {
        Context context = getContext();
        NotificationManagerCompat nmc = NotificationManagerCompat.from(context);
        JSObject result = new JSObject();
        result.put("notifications", nmc.areNotificationsEnabled());
        NotificationManager nm = context.getSystemService(NotificationManager.class);
        NotificationChannel alarms = nm != null ? nm.getNotificationChannel(NotificationChannels.ALARMS) : null;
        result.put("alarmChannel", alarms != null && alarms.getImportance() != NotificationManager.IMPORTANCE_NONE);
        AlarmManager am = context.getSystemService(AlarmManager.class);
        result.put("exactAlarms", am != null && am.canScheduleExactAlarms());
        boolean promoted = false;
        try {
            promoted = nmc.canPostPromotedNotifications();
        } catch (RuntimeException e) {
            Log.w(TAG, "canPostPromotedNotifications failed", e);
        }
        result.put("liveUpdates", promoted);
        return result;
    }
}
