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

    @Override
    public void onReceive(Context context, Intent intent) {
        if (intent == null || intent.getAction() == null) return;
        Context c = context.getApplicationContext();
        try {
            NotificationChannels.ensure(c);
            int id = intent.getIntExtra(EXTRA_ID, 0);
            switch (intent.getAction()) {
                case ACTION_FIRE -> Alarms.fire(c, id);
                case ACTION_RING_END -> Alarms.ringEnd(c, id);
                case ACTION_DISMISS -> Alarms.dismiss(c, id);
                case ACTION_SNOOZE -> Alarms.snooze(c, id);
                case Intent.ACTION_BOOT_COMPLETED, Intent.ACTION_MY_PACKAGE_REPLACED -> Alarms.restore(c);
                default -> { }
            }
        } catch (RuntimeException e) {
            Log.e(TAG, "Could not handle " + intent.getAction(), e);
        }
    }
}
