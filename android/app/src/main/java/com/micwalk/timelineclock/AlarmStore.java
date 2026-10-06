package com.micwalk.timelineclock;

import android.content.Context;
import android.content.SharedPreferences;
import android.util.Log;
import java.util.LinkedHashMap;
import java.util.Map;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

/**
 * The native alarms' state, in SharedPreferences so it survives the page being frozen, the
 * process dying and reboots: the alarms, the ring settings, and the actions taken from
 * notifications that the page hasn't replayed yet. All access goes through LOCK (the plugin
 * thread and broadcast receivers both use it).
 */
final class AlarmStore {

    static final Object LOCK = new Object();

    private static final String TAG = "AlarmStore";
    private static final String PREFS = "native_alarms";
    private static final String KEY_ALARMS = "alarms";
    private static final String KEY_ACTIONS = "actions";
    private static final String KEY_RING_MS = "ringMs";
    private static final String KEY_UNATTENDED = "unattended";
    private static final String KEY_SNOOZE_MIN = "snoozeMinutes";

    static final long DEFAULT_RING_MS = 5 * 60_000L;
    static final int DEFAULT_SNOOZE_MIN = 5;

    private AlarmStore() {}

    private static SharedPreferences prefs(Context c) {
        return c.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    static Map<Integer, AlarmSpec> alarms(Context c) {
        Map<Integer, AlarmSpec> out = new LinkedHashMap<>();
        try {
            JSONArray arr = new JSONArray(prefs(c).getString(KEY_ALARMS, "[]"));
            for (int i = 0; i < arr.length(); i++) {
                AlarmSpec s = AlarmSpec.fromJson(arr.optJSONObject(i));
                if (s != null) out.put(s.id, s);
            }
        } catch (JSONException e) {
            Log.e(TAG, "Stored alarms unreadable; starting empty", e);
        }
        return out;
    }

    static void saveAlarms(Context c, Map<Integer, AlarmSpec> alarms) {
        JSONArray arr = new JSONArray();
        try {
            for (AlarmSpec s : alarms.values()) arr.put(s.toJson());
        } catch (JSONException e) {
            Log.e(TAG, "Could not store alarms", e);
            return;
        }
        prefs(c).edit().putString(KEY_ALARMS, arr.toString()).commit();
    }

    static AlarmSpec get(Context c, int id) {
        return alarms(c).get(id);
    }

    static void put(Context c, AlarmSpec s) {
        Map<Integer, AlarmSpec> all = alarms(c);
        all.put(s.id, s);
        saveAlarms(c, all);
    }

    static void remove(Context c, int id) {
        Map<Integer, AlarmSpec> all = alarms(c);
        if (all.remove(id) != null) saveAlarms(c, all);
    }

    // Settings from the page (Settings › Alarms).

    static long ringMs(Context c) {
        return prefs(c).getLong(KEY_RING_MS, DEFAULT_RING_MS);
    }

    static boolean snoozeWhenUnanswered(Context c) {
        return "snooze".equals(prefs(c).getString(KEY_UNATTENDED, "dismiss"));
    }

    static int snoozeMinutes(Context c) {
        return prefs(c).getInt(KEY_SNOOZE_MIN, DEFAULT_SNOOZE_MIN);
    }

    static void saveSettings(Context c, long ringMs, String unattended, int snoozeMinutes) {
        prefs(c).edit()
            .putLong(KEY_RING_MS, ringMs > 0 ? ringMs : DEFAULT_RING_MS)
            .putString(KEY_UNATTENDED, "snooze".equals(unattended) ? "snooze" : "dismiss")
            .putInt(KEY_SNOOZE_MIN, snoozeMinutes > 0 ? snoozeMinutes : DEFAULT_SNOOZE_MIN)
            .commit();
    }

    // Actions from notifications, waiting for the page.

    static void addAction(Context c, JSONObject action) {
        try {
            JSONArray arr = new JSONArray(prefs(c).getString(KEY_ACTIONS, "[]"));
            arr.put(action);
            prefs(c).edit().putString(KEY_ACTIONS, arr.toString()).commit();
        } catch (JSONException e) {
            Log.e(TAG, "Could not record an action", e);
        }
    }

    /**
     * Hands the waiting actions to the page and forgets them; the alarms they changed go back to
     * following the page (dismissed ones are dropped).
     */
    static JSONArray takeActions(Context c) {
        JSONArray arr;
        try {
            arr = new JSONArray(prefs(c).getString(KEY_ACTIONS, "[]"));
        } catch (JSONException e) {
            arr = new JSONArray();
        }
        Map<Integer, AlarmSpec> all = alarms(c);
        boolean changed = false;
        for (AlarmSpec s : all.values().toArray(new AlarmSpec[0])) {
            if (!s.pendingAck) continue;
            changed = true;
            if (AlarmSpec.DISMISSED.equals(s.state)) all.remove(s.id);
            else {
                s.pendingAck = false;
                s.snoozes = 0;
            }
        }
        SharedPreferences.Editor e = prefs(c).edit().putString(KEY_ACTIONS, "[]");
        e.commit();
        if (changed) saveAlarms(c, all);
        return arr;
    }
}
