package com.micwalk.timelineclock;

import android.Manifest;
import android.app.AlarmManager;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.Context;
import android.content.Intent;
import android.media.Ringtone;
import android.media.RingtoneManager;
import android.net.Uri;
import android.provider.Settings;
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
        Diag.log(p.getContext(), "announce answers to the page");
        // From the plugin thread, like every other message to the page.
        p.getBridge().execute(() -> {
            try {
                p.notifyListeners("actions", new JSObject(), true);
            } catch (RuntimeException e) {
                Log.w(TAG, "Could not tell the page about an answer", e);
                Diag.log(p.getContext(), "announce failed: " + e);
            }
        });
    }

    /**
     * alarms: [{ id, instantId, at, title, ringText, liveId, sound }], plus ringMs, unattended
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

    /** Answers given from notifications since last asked: [{ type: "dismiss" | "snooze" | "chime", instantId, at?, t }]. */
    @PluginMethod
    public void takeActions(PluginCall call) {
        try {
            JSONArray actions;
            synchronized (AlarmStore.LOCK) {
                actions = AlarmStore.takeActions(getContext());
            }
            if (actions.length() > 0) Diag.log(getContext(), "page took " + actions.length() + " answer(s)");
            JSObject result = new JSObject();
            result.put("actions", actions);
            call.resolve(result);
        } catch (RuntimeException e) {
            Log.e(TAG, "takeActions failed", e);
            call.reject("takeActions failed: " + e.getMessage());
        }
    }

    /** The diagnostics log (Diag) plus `log`, lines the page adds: { lines }. */
    @PluginMethod
    public void getLog(PluginCall call) {
        try {
            JSObject result = new JSObject();
            result.put("lines", Diag.lines(getContext()));
            call.resolve(result);
        } catch (RuntimeException e) {
            call.reject("getLog failed: " + e.getMessage());
        }
    }

    @PluginMethod
    public void clearLog(PluginCall call) {
        Diag.clear(getContext());
        call.resolve();
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

    /**
     * The alarm sounds' channels, for Settings › Alarms: { sounds: [{ sound, own, title, on }] }.
     * `own`: still the app's tone (the page names it); else `title` is what Android calls the
     * sound the user picked ("" for none). `on`: the channel isn't turned off.
     */
    @PluginMethod
    public void getSounds(PluginCall call) {
        try {
            Context c = getContext();
            NotificationChannels.ensure(c);
            NotificationManager nm = c.getSystemService(NotificationManager.class);
            JSArray sounds = new JSArray();
            List<String> ids = new ArrayList<>(java.util.Arrays.asList(NotificationChannels.TONES));
            ids.add(NotificationChannels.CHIME);
            for (String id : ids) {
                NotificationChannel ch = nm != null ? nm.getNotificationChannel(id) : null;
                Uri uri = ch != null ? ch.getSound() : null;
                boolean own = uri != null && uri.equals(NotificationChannels.ownSound(c, id));
                JSObject o = new JSObject();
                o.put("sound", id);
                o.put("own", own);
                o.put("title", own || uri == null ? "" : soundTitle(c, uri));
                o.put("on", channelOn(nm, id));
                sounds.put(o);
            }
            JSObject result = new JSObject();
            result.put("sounds", sounds);
            call.resolve(result);
        } catch (RuntimeException e) {
            Log.e(TAG, "getSounds failed", e);
            call.reject("getSounds failed: " + e.getMessage());
        }
    }

    private static String soundTitle(Context c, Uri uri) {
        try {
            Ringtone r = RingtoneManager.getRingtone(c, uri);
            String t = r != null ? r.getTitle(c) : null;
            return t != null ? t : "";
        } catch (RuntimeException e) {
            return "";
        }
    }

    /** Opens Android's settings for one sound's channel ({ sound }), where any sound can be picked for it. */
    @PluginMethod
    public void openSoundSettings(PluginCall call) {
        try {
            Context c = getContext();
            NotificationChannels.ensure(c);
            Intent i = new Intent(Settings.ACTION_CHANNEL_NOTIFICATION_SETTINGS)
                .putExtra(Settings.EXTRA_APP_PACKAGE, c.getPackageName())
                .putExtra(Settings.EXTRA_CHANNEL_ID, NotificationChannels.forSound(call.getString("sound", "")))
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            c.startActivity(i);
            call.resolve();
        } catch (RuntimeException e) {
            Log.e(TAG, "openSoundSettings failed", e);
            call.reject("openSoundSettings failed: " + e.getMessage());
        }
    }

    /** Plays a sound's channel sound once, as it is set now ({ sound }); it stops by itself. */
    @PluginMethod
    public void previewSound(PluginCall call) {
        try {
            Ringer.once(getContext(), call.getString("sound", ""), true);
            call.resolve();
        } catch (RuntimeException e) {
            call.reject("previewSound failed: " + e.getMessage());
        }
    }

    @PluginMethod
    public void stopPreview(PluginCall call) {
        Ringer.stopPreview();
        call.resolve();
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
        boolean tonesOn = true;
        for (String t : NotificationChannels.TONES) tonesOn &= channelOn(nm, t);
        result.put("alarmChannel", tonesOn);
        AlarmManager am = c.getSystemService(AlarmManager.class);
        result.put("exactAlarms", am != null && am.canScheduleExactAlarms());
        // Live Updates: the timer, stopwatch and ringing alarm pinned on the lock screen and as a status-bar chip.
        result.put("liveUpdates", NotificationManagerCompat.from(c).canPostPromotedNotifications());
        result.put("android", Build.VERSION.RELEASE);
        return result;
    }
}
