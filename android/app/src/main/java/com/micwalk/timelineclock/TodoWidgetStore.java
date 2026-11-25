package com.micwalk.timelineclock;

import android.content.Context;
import android.content.SharedPreferences;
import java.util.HashSet;
import java.util.Set;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

/**
 * What the todo widgets and the page share (docs/prd_todo_import_widgets.md §3–4): the page's
 * snapshot of its todos, and an inbox of what the widgets asked for while the page wasn't
 * looking (text from quick add, todos ticked done, a todo to open), which the page drains
 * (TodoWidgetPlugin). Also each list widget's settings.
 */
final class TodoWidgetStore {

    private static final String PREFS = "todo_widgets";
    private static final String SNAPSHOT = "snapshot";
    private static final String ADDS = "adds";
    private static final String DONES = "dones";
    private static final String OPEN = "open";
    private static final Object LOCK = new Object();

    private TodoWidgetStore() {}

    private static SharedPreferences prefs(Context c) {
        return c.getApplicationContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    private static JSONArray array(SharedPreferences p, String key) {
        try {
            return new JSONArray(p.getString(key, "[]"));
        } catch (JSONException e) {
            return new JSONArray();
        }
    }

    // --- The page's snapshot

    static void setSnapshot(Context c, String json) {
        synchronized (LOCK) {
            SharedPreferences p = prefs(c);
            // Ticks the page has now taken in (done, or gone) need no marking any more.
            JSONArray dones = array(p, DONES);
            JSONArray keep = new JSONArray();
            Set<String> open = new HashSet<>();
            try {
                JSONArray todos = new JSONObject(json).optJSONArray("todos");
                for (int k = 0; todos != null && k < todos.length(); k++) {
                    JSONObject t = todos.optJSONObject(k);
                    if (t != null && "open".equals(t.optString("status"))) open.add(t.optString("id"));
                }
            } catch (JSONException e) {
                return;
            }
            for (int k = 0; k < dones.length(); k++) {
                JSONObject d = dones.optJSONObject(k);
                if (d != null && open.contains(d.optString("id"))) keep.put(d);
            }
            p.edit().putString(SNAPSHOT, json).putString(DONES, keep.toString()).apply();
        }
    }

    static JSONObject snapshot(Context c) {
        try {
            return new JSONObject(prefs(c).getString(SNAPSHOT, "{}"));
        } catch (JSONException e) {
            return new JSONObject();
        }
    }

    // --- The inbox

    /** Text from quick add (dictated or typed), for the page to read and show. */
    static void addText(Context c, String text) {
        synchronized (LOCK) {
            SharedPreferences p = prefs(c);
            JSONArray adds = array(p, ADDS);
            try {
                adds.put(new JSONObject().put("text", text).put("at", System.currentTimeMillis()));
            } catch (JSONException e) {
                return;
            }
            p.edit().putString(ADDS, adds.toString()).apply();
        }
    }

    /** A todo ticked done on a list widget, at `at`. */
    static void addDone(Context c, String id, long at) {
        synchronized (LOCK) {
            SharedPreferences p = prefs(c);
            JSONArray dones = array(p, DONES);
            for (int k = 0; k < dones.length(); k++) {
                JSONObject d = dones.optJSONObject(k);
                if (d != null && id.equals(d.optString("id"))) return;
            }
            try {
                dones.put(new JSONObject().put("id", id).put("at", at));
            } catch (JSONException e) {
                return;
            }
            p.edit().putString(DONES, dones.toString()).apply();
        }
    }

    /** A todo to open ("" for the Todos tab), from a tap on a widget. */
    static void setOpen(Context c, String id) {
        prefs(c).edit().putString(OPEN, id == null ? "" : id).apply();
    }

    /** Todos ticked on a widget that the page hasn't shown done yet (drawn ticked meanwhile). */
    static Set<String> pendingDone(Context c) {
        Set<String> out = new HashSet<>();
        JSONArray dones = array(prefs(c), DONES);
        for (int k = 0; k < dones.length(); k++) {
            JSONObject d = dones.optJSONObject(k);
            if (d != null) out.add(d.optString("id"));
        }
        return out;
    }

    /**
     * What the widgets asked for, for the page; then forgotten (ticks stay marked as taken, so
     * the widget keeps them ticked until the page's next snapshot says they are done).
     */
    static JSONObject drain(Context c) {
        synchronized (LOCK) {
            SharedPreferences p = prefs(c);
            JSONObject out = new JSONObject();
            JSONArray dones = array(p, DONES);
            JSONArray fresh = new JSONArray();
            JSONArray marked = new JSONArray();
            try {
                for (int k = 0; k < dones.length(); k++) {
                    JSONObject d = dones.optJSONObject(k);
                    if (d == null) continue;
                    if (!d.optBoolean("taken", false)) fresh.put(new JSONObject().put("id", d.optString("id")).put("at", d.optLong("at")));
                    marked.put(d.put("taken", true));
                }
                out.put("adds", array(p, ADDS));
                out.put("dones", fresh);
                if (p.contains(OPEN)) out.put("open", p.getString(OPEN, ""));
            } catch (JSONException e) {
                return out;
            }
            p.edit().remove(ADDS).remove(OPEN).putString(DONES, marked.toString()).apply();
            return out;
        }
    }

    // --- A list widget's settings

    static int statuses(Context c, int widgetId) {
        return prefs(c).getInt("statuses_" + widgetId, TodoWidgetFilter.DEFAULT_STATUSES);
    }

    static int days(Context c, int widgetId) {
        return prefs(c).getInt("days_" + widgetId, TodoWidgetFilter.DEFAULT_DAYS);
    }

    static void setFilter(Context c, int widgetId, int statuses, int days) {
        prefs(c).edit().putInt("statuses_" + widgetId, statuses).putInt("days_" + widgetId, days).apply();
    }

    static void forget(Context c, int widgetId) {
        prefs(c).edit().remove("statuses_" + widgetId).remove("days_" + widgetId).apply();
    }
}
