package com.micwalk.timelineclock;

import android.app.Activity;
import android.app.NotificationManager;
import android.content.Intent;
import android.service.notification.StatusBarNotification;
import android.util.Log;
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
 * The running timer and stopwatch as ongoing notifications (src/services/native/liveSync.ts),
 * built by NotificationViews as Live Updates whose time Android keeps ticking while the page is
 * frozen. Also handles taps on any of the app's notifications: a ringing alarm goes quiet, and
 * the page is told what was tapped.
 *
 * Every method catches its own errors: nothing here may take the alarms down with it.
 */
@CapacitorPlugin(name = "LiveNotifications")
public class LiveNotificationsPlugin extends Plugin {

    private static final String TAG = "LiveNotifications";

    @Override
    public void load() {
        NotificationChannels.ensure(getContext());
        // A tap that started the app: its intent is the launch intent, not a new one.
        Activity a = getActivity();
        Intent launch = a == null ? null : a.getIntent();
        if (launch != null && (launch.getFlags() & Intent.FLAG_ACTIVITY_LAUNCHED_FROM_HISTORY) == 0) handleTap(launch);
    }

    /**
     * Shows exactly these notifications: posts or updates each item and removes any other live
     * notification. items: [{ id, kind: 'countdown' | 'stopwatch', title, text, whenMs, instantId }].
     */
    @PluginMethod
    public void sync(PluginCall call) {
        try {
            JSArray items = call.getArray("items", new JSArray());
            boolean enabled = NotificationViews.canPost(getContext());
            Set<Integer> keep = new HashSet<>();
            int posted = 0;
            for (int i = 0; i < items.length(); i++) {
                JSONObject item = items.optJSONObject(i);
                if (item == null || !item.has("id")) continue;
                int id = item.optInt("id");
                keep.add(id);
                if (!enabled) continue;
                try {
                    boolean countDown = "countdown".equals(item.optString("kind"));
                    long whenMs = item.optLong("whenMs", System.currentTimeMillis());
                    String title = item.optString("title", countDown ? "Timer" : "Stopwatch");
                    if (NotificationViews.post(getContext(), NotificationViews.TAG_LIVE, id,
                        NotificationViews.live(getContext(), id, countDown, title, item.optString("text", ""), whenMs, item.optString("instantId", "")))) {
                        posted++;
                    }
                } catch (RuntimeException e) {
                    Log.e(TAG, "Could not post live notification " + id, e);
                }
            }
            cancelExcept(keep);
            JSObject result = new JSObject();
            result.put("posted", posted);
            call.resolve(result);
        } catch (RuntimeException e) {
            Log.e(TAG, "sync failed", e);
            call.reject("sync failed: " + e.getMessage());
        }
    }

    /** Removes every live notification (never the ringing alarms). */
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

    @Override
    protected void handleOnNewIntent(Intent intent) {
        super.handleOnNewIntent(intent);
        handleTap(intent);
    }

    /** A tap on one of the app's notifications: a ringing alarm goes quiet; the page shows what was tapped. */
    private void handleTap(Intent intent) {
        try {
            if (intent == null || !NotificationViews.ACTION_OPEN.equals(intent.getAction())) return;
            int alarmId = intent.getIntExtra(NotificationViews.EXTRA_ALARM_ID, 0);
            if (alarmId != 0) Alarms.silence(getContext(), alarmId);
            String instantId = intent.getStringExtra(NotificationViews.EXTRA_INSTANT_ID);
            if (instantId == null) return;
            JSObject data = new JSObject();
            data.put("instantId", instantId);
            data.put("kind", intent.getStringExtra(NotificationViews.EXTRA_KIND));
            // Kept until the page listens: a tap may have cold-started the app.
            notifyListeners("notificationTapped", data, true);
        } catch (RuntimeException e) {
            Log.e(TAG, "Could not handle a notification tap", e);
        }
    }

    private void cancelExcept(Set<Integer> keep) {
        NotificationManager nm = getContext().getSystemService(NotificationManager.class);
        if (nm == null) return;
        for (StatusBarNotification sbn : nm.getActiveNotifications()) {
            if (NotificationViews.TAG_LIVE.equals(sbn.getTag()) && !keep.contains(sbn.getId())) {
                nm.cancel(NotificationViews.TAG_LIVE, sbn.getId());
            }
        }
    }
}
