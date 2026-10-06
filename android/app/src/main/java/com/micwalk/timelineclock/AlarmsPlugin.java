package com.micwalk.timelineclock;

import android.Manifest;
import android.app.AlarmManager;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.Context;
import android.os.Build;
import android.util.Log;
import androidx.core.app.NotificationManagerCompat;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import java.util.ArrayList;
import java.util.List;
import org.json.JSONArray;

/**
 * The page's side of the native alarms (src/services/native/alarmSync.ts): sync the alarmed
 * instants, take the answers given from notifications, read what Android allows, and ask for
 * notification permission (checkPermissions / requestPermissions, alias "notifications").
 */
@CapacitorPlugin(
    name = "Alarms",
    permissions = { @Permission(strings = { Manifest.permission.POST_NOTIFICATIONS }, alias = "notifications") }
)
public class AlarmsPlugin extends Plugin {

    private static final String TAG = "AlarmsPlugin";

    /** The running page's plugin, if any, to tell it about answers right away. */
    private static volatile AlarmsPlugin current;

    @Override
    public void load() {
        current = this;
        NotificationChannels.ensure(getContext());
    }

    @Override
    protected void handleOnDestroy() {
        if (current == this) current = null;
        super.handleOnDestroy();
    }

    /** Called after an answer from a notification: the page (if running) takes it now. */
    static void announceActions() {
        AlarmsPlugin p = current;
        if (p == null) return;
        try {
            p.notifyListeners("actions", new JSObject(), true);
        } catch (RuntimeException e) {
            Log.w(TAG, "Could not tell the page about an answer", e);
        }
    }

    /**
     * alarms: [{ id, instantId, at, title, ringText, liveId }], plus ringMs, unattended
     * ("dismiss" | "snooze") and snoozeMinutes from Settings.
     */
    @PluginMethod
    public void sync(PluginCall call) {
        try {
            JSArray arr = call.getArray("alarms", new JSArray());
            List<AlarmSpec> desired = new ArrayList<>();
            for (int i = 0; i < arr.length(); i++) {
                AlarmSpec s = AlarmSpec.fromJson(arr.optJSONObject(i));
                if (s != null) desired.add(s);
            }
            long ringMs = call.getData().optLong("ringMs", AlarmStore.DEFAULT_RING_MS);
            String unattended = call.getString("unattended", "dismiss");
            int snoozeMinutes = call.getInt("snoozeMinutes", AlarmStore.DEFAULT_SNOOZE_MIN);
            Alarms.sync(getContext(), desired, ringMs, unattended, snoozeMinutes);
            call.resolve(status(getContext()));
        } catch (RuntimeException e) {
            Log.e(TAG, "sync failed", e);
            call.reject("sync failed: " + e.getMessage());
        }
    }

    /** Answers given from notifications since last asked: [{ type: "dismiss" | "snooze", instantId, at?, t }]. */
    @PluginMethod
    public void takeActions(PluginCall call) {
        try {
            JSONArray actions;
            synchronized (AlarmStore.LOCK) {
                actions = AlarmStore.takeActions(getContext());
            }
            JSObject result = new JSObject();
            result.put("actions", actions);
            call.resolve(result);
        } catch (RuntimeException e) {
            Log.e(TAG, "takeActions failed", e);
            call.reject("takeActions failed: " + e.getMessage());
        }
    }

    /** Silence in the app: stops the sound of every ringing alarm; they stay on the lock screen until answered. */
    @PluginMethod
    public void silence(PluginCall call) {
        try {
            Alarms.silence(getContext(), 0);
            call.resolve();
        } catch (RuntimeException e) {
            Log.e(TAG, "silence failed", e);
            call.reject("silence failed: " + e.getMessage());
        }
    }

    /** What Android currently allows, for the Settings panel: { notifications, alarmChannel, exactAlarms, liveUpdates, android }. */
    @PluginMethod
    public void getStatus(PluginCall call) {
        try {
            call.resolve(status(getContext()));
        } catch (RuntimeException e) {
            Log.e(TAG, "getStatus failed", e);
            call.reject("getStatus failed: " + e.getMessage());
        }
    }

    private static boolean channelOn(NotificationManager nm, String id) {
        NotificationChannel ch = nm != null ? nm.getNotificationChannel(id) : null;
        return ch != null && ch.getImportance() != NotificationManager.IMPORTANCE_NONE;
    }

    static JSObject status(Context c) {
        JSObject result = new JSObject();
        result.put("notifications", NotificationViews.canPost(c));
        NotificationManager nm = c.getSystemService(NotificationManager.class);
        result.put("alarmChannel", channelOn(nm, NotificationChannels.ALARMS) && channelOn(nm, NotificationChannels.ALARMS_IN_APP));
        AlarmManager am = c.getSystemService(AlarmManager.class);
        result.put("exactAlarms", am != null && am.canScheduleExactAlarms());
        // Live Updates: the timer, stopwatch and ringing alarm pinned on the lock screen and as a status-bar chip.
        result.put("liveUpdates", NotificationManagerCompat.from(c).canPostPromotedNotifications());
        result.put("android", Build.VERSION.RELEASE);
        return result;
    }
}
