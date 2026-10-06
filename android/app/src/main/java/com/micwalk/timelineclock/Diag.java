package com.micwalk.timelineclock;

import android.content.Context;
import android.content.SharedPreferences;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import android.util.Log;
import java.text.SimpleDateFormat;
import java.util.ArrayDeque;
import java.util.Date;
import java.util.Locale;
import java.util.concurrent.atomic.AtomicLong;
import org.json.JSONArray;
import org.json.JSONException;

/**
 * A short log of what the native side did (alarms, notification taps, the activity, the page's
 * calls), kept across restarts so it can be copied from Settings after something went wrong
 * (AlarmsPlugin.getLog). Also watches the main thread: a stall of 2 s or more is logged.
 */
final class Diag {

    private static final String TAG = "TimelineClock";
    private static final String PREFS = "diag";
    private static final String KEY = "lines";
    private static final int MAX_LINES = 300;
    private static final long STALL_MS = 2000;

    private static final ArrayDeque<String> lines = new ArrayDeque<>();
    private static boolean loaded;
    private static Context app;
    private static boolean watching;

    private Diag() {}

    /** Adds a line ("12:01:02.345 fire 123"). Never throws. */
    static void log(Context c, String message) {
        Log.i(TAG, message);
        try {
            synchronized (lines) {
                load(c);
                lines.addLast(new SimpleDateFormat("MM-dd HH:mm:ss.SSS", Locale.US).format(new Date()) + " " + message);
                while (lines.size() > MAX_LINES) lines.removeFirst();
                JSONArray arr = new JSONArray();
                for (String l : lines) arr.put(l);
                prefs(c).edit().putString(KEY, arr.toString()).apply();
            }
        } catch (RuntimeException e) {
            Log.w(TAG, "Diag log failed", e);
        }
    }

    /** The log, oldest first. */
    static JSONArray lines(Context c) {
        synchronized (lines) {
            load(c);
            JSONArray arr = new JSONArray();
            for (String l : lines) arr.put(l);
            return arr;
        }
    }

    static void clear(Context c) {
        synchronized (lines) {
            load(c);
            lines.clear();
            prefs(c).edit().remove(KEY).apply();
        }
    }

    /** Starts the main-thread watchdog (once per process). */
    static void watchMainThread(Context c) {
        synchronized (lines) {
            if (watching) return;
            watching = true;
        }
        Context ctx = c.getApplicationContext();
        Handler main = new Handler(Looper.getMainLooper());
        Thread t = new Thread(() -> {
            // One ping at a time: posted to the main thread, answered when it runs.
            AtomicLong answered = new AtomicLong(0);
            long pendingSince = -1;
            boolean stalled = false;
            while (true) {
                long now = SystemClock.uptimeMillis();
                if (pendingSince < 0 || answered.get() >= pendingSince) {
                    if (stalled) {
                        stalled = false;
                        log(ctx, "main thread back after " + (answered.get() - pendingSince) + " ms");
                    }
                    pendingSince = now;
                    main.post(() -> answered.set(SystemClock.uptimeMillis()));
                } else if (!stalled && now - pendingSince >= STALL_MS) {
                    stalled = true;
                    log(ctx, "main thread not responding for " + (now - pendingSince) + " ms");
                }
                try {
                    Thread.sleep(500);
                } catch (InterruptedException e) {
                    return;
                }
            }
        }, "tc-watchdog");
        t.setDaemon(true);
        t.start();
    }

    private static void load(Context c) {
        if (loaded) return;
        loaded = true;
        app = c.getApplicationContext();
        try {
            JSONArray arr = new JSONArray(prefs(c).getString(KEY, "[]"));
            for (int i = 0; i < arr.length(); i++) lines.addLast(arr.optString(i));
        } catch (JSONException e) {
            Log.w(TAG, "Diag log unreadable; starting empty", e);
        }
    }

    private static SharedPreferences prefs(Context c) {
        return (app != null ? app : c.getApplicationContext()).getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }
}
