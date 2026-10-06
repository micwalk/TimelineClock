package com.micwalk.timelineclock;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.util.Log;

/**
 * Wake-ups and notification buttons for the native alarms (Alarms): an alarm coming due, its
 * ring time running out, Dismiss and Snooze. Also the restart and app-update broadcasts, which
 * set the alarms again. Runs without the page.
 */
public class AlarmReceiver extends BroadcastReceiver {

    static final String ACTION_FIRE = "com.micwalk.timelineclock.ALARM_FIRE";
    static final String ACTION_RING_END = "com.micwalk.timelineclock.ALARM_RING_END";
    static final String ACTION_DISMISS = "com.micwalk.timelineclock.ALARM_DISMISS";
    static final String ACTION_SNOOZE = "com.micwalk.timelineclock.ALARM_SNOOZE";
    static final String EXTRA_ID = "id";

    private static final String TAG = "AlarmReceiver";

    /** Runs off the main thread (goAsync), so storage and notification work never holds up the app's screen. */
    @Override
    public void onReceive(Context context, Intent intent) {
        if (intent == null || intent.getAction() == null) return;
        Context c = context.getApplicationContext();
        String action = intent.getAction();
        int id = intent.getIntExtra(EXTRA_ID, 0);
        PendingResult pending = goAsync();
        Alarms.run(() -> {
            try {
                Diag.log(c, "receiver " + action.substring(action.lastIndexOf('.') + 1) + " " + id + (Alarms.appOpen ? " (app open)" : ""));
                NotificationChannels.ensure(c);
                switch (action) {
                    case ACTION_FIRE -> Alarms.fire(c, id);
                    case ACTION_RING_END -> Alarms.ringEnd(c, id);
                    case ACTION_DISMISS -> Alarms.dismiss(c, id);
                    case ACTION_SNOOZE -> Alarms.snooze(c, id);
                    case Intent.ACTION_BOOT_COMPLETED, Intent.ACTION_MY_PACKAGE_REPLACED -> Alarms.restore(c);
                    default -> { }
                }
            } catch (RuntimeException e) {
                Log.e(TAG, "Could not handle " + action, e);
                Diag.log(c, "receiver " + action + " failed: " + e);
            } finally {
                pending.finish();
            }
        });
    }
}
