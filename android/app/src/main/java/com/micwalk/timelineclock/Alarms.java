package com.micwalk.timelineclock;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.Context;
import android.text.format.DateFormat;
import android.util.Log;
import java.util.ArrayList;
import java.util.Date;
import java.util.List;
import java.util.Map;
import org.json.JSONException;
import org.json.JSONObject;

/**
 * The native alarms: what the page wants rung (AlarmsPlugin.sync), scheduled with
 * AlarmManager.setAlarmClock (exact, wakes the phone, not delayed by Doze), rung as an insistent
 * notification with Dismiss and Snooze (NotificationViews.ringing), and answered from that
 * notification without the page. Answers are recorded for the page to replay (AlarmStore) and
 * announced to it if it is running (AlarmsPlugin).
 *
 * Every entry point catches its own errors: a failure here must not crash the app.
 */
final class Alarms {

    private static final String TAG = "Alarms";

    private Alarms() {}

    // ---------------------------------------------------------------------------------------
    // From the page

    /** Brings the scheduled and ringing alarms in line with the page's list (see AlarmPlan.sync). */
    static void sync(Context c, List<AlarmSpec> desired, long ringMs, String unattended, int snoozeMinutes) {
        synchronized (AlarmStore.LOCK) {
            AlarmStore.saveSettings(c, ringMs, unattended, snoozeMinutes);
            Map<Integer, AlarmSpec> stored = AlarmStore.alarms(c);
            long now = System.currentTimeMillis();
            AlarmPlan.Result plan = AlarmPlan.sync(stored, desired, now, AlarmStore.ringMs(c));
            for (AlarmSpec s : plan.cancel) {
                stop(c, s);
                stored.remove(s.id);
            }
            for (AlarmSpec d : plan.schedule) {
                d.state = AlarmSpec.SCHEDULED;
                stored.put(d.id, d);
                schedule(c, d);
            }
            for (AlarmSpec d : plan.update) {
                AlarmSpec s = stored.get(d.id);
                if (s == null) continue;
                s.title = d.title;
                s.ringText = d.ringText;
                s.liveId = d.liveId;
            }
            AlarmStore.saveAlarms(c, stored);
            for (AlarmSpec d : plan.ringNow) ring(c, d, now);
        }
    }

    // ---------------------------------------------------------------------------------------
    // From AlarmReceiver

    /** It's time: ring (replacing the countdown, if any) until answered or the ring time runs out. */
    static void fire(Context c, int id) {
        synchronized (AlarmStore.LOCK) {
            AlarmSpec s = AlarmStore.get(c, id);
            if (s == null || !AlarmSpec.SCHEDULED.equals(s.state)) return;
            long now = System.currentTimeMillis();
            // A stale wake-up for an alarm that has since moved later: wait for the real one.
            if (s.at > now + 1000) {
                schedule(c, s);
                return;
            }
            ring(c, s, now);
        }
    }

    /** Nobody answered within the ring time: dismiss or snooze, per Settings › Alarms › If unanswered. */
    static void ringEnd(Context c, int id) {
        synchronized (AlarmStore.LOCK) {
            AlarmSpec s = AlarmStore.get(c, id);
            if (s == null || !AlarmSpec.RINGING.equals(s.state)) return;
            if (AlarmStore.snoozeWhenUnanswered(c)) snooze(c, id);
            else dismiss(c, id);
        }
    }

    /** Dismiss from the notification (or swiping it away): stop ringing; the page turns the alarm off. */
    static void dismiss(Context c, int id) {
        synchronized (AlarmStore.LOCK) {
            AlarmSpec s = AlarmStore.get(c, id);
            NotificationViews.cancel(c, NotificationViews.TAG_RING, id);
            cancelAlarm(c, AlarmReceiver.ACTION_RING_END, id);
            if (s == null || AlarmSpec.DISMISSED.equals(s.state)) return;
            cancelAlarm(c, AlarmReceiver.ACTION_FIRE, id);
            s.state = AlarmSpec.DISMISSED;
            s.pendingAck = true;
            AlarmStore.put(c, s);
            record(c, "dismiss", s, 0);
        }
        AlarmsPlugin.announceActions();
    }

    /**
     * Snooze from the notification: stop ringing, ring again in Settings' snooze time, and show
     * that as a countdown. The page later makes the snooze instant ("Snooze 1: …").
     */
    static void snooze(Context c, int id) {
        synchronized (AlarmStore.LOCK) {
            AlarmSpec s = AlarmStore.get(c, id);
            NotificationViews.cancel(c, NotificationViews.TAG_RING, id);
            cancelAlarm(c, AlarmReceiver.ACTION_RING_END, id);
            if (s == null || AlarmSpec.DISMISSED.equals(s.state)) return;
            long now = System.currentTimeMillis();
            long at = now + AlarmStore.snoozeMinutes(c) * 60_000L;
            s.title = AlarmPlan.snoozeTitle(s.title, AlarmPlan.nextSnoozeNumber(s.title));
            s.at = at;
            s.ringText = "Snoozed until " + clock(c, at);
            s.state = AlarmSpec.SCHEDULED;
            s.pendingAck = true;
            s.snoozes++;
            AlarmStore.put(c, s);
            schedule(c, s);
            record(c, "snooze", s, at);
            int liveId = s.liveId != 0 ? s.liveId : s.id;
            NotificationViews.post(c, NotificationViews.TAG_LIVE, liveId,
                NotificationViews.live(c, liveId, true, s.title, "Rings at " + clock(c, at), at, s.instantId));
        }
        AlarmsPlugin.announceActions();
    }

    /** After a restart or an app update: set the alarms again, and catch up on what came due meanwhile. */
    static void restore(Context c) {
        synchronized (AlarmStore.LOCK) {
            long now = System.currentTimeMillis();
            long ringMs = AlarmStore.ringMs(c);
            List<Integer> overdue = new ArrayList<>();
            for (AlarmSpec s : AlarmStore.alarms(c).values()) {
                if (AlarmSpec.SCHEDULED.equals(s.state)) {
                    if (s.at > now) schedule(c, s);
                    else if (now - s.at < ringMs) ring(c, s, now);
                    else overdue.add(s.id);
                } else if (AlarmSpec.RINGING.equals(s.state)) {
                    if (now - s.ringingSince < ringMs) ring(c, s, s.ringingSince);
                    else overdue.add(s.id);
                }
            }
            for (int id : overdue) {
                AlarmSpec s = AlarmStore.get(c, id);
                if (s == null) continue;
                s.state = AlarmSpec.RINGING; // so ringEnd answers it as unanswered
                AlarmStore.put(c, s);
                ringEnd(c, id);
            }
        }
    }

    // ---------------------------------------------------------------------------------------

    /** Rings `s` from `since`: ringing notification, countdown gone, and the unanswered timeout. */
    private static void ring(Context c, AlarmSpec s, long since) {
        s.state = AlarmSpec.RINGING;
        s.ringingSince = since;
        AlarmStore.put(c, s);
        if (s.liveId != 0) NotificationViews.cancel(c, NotificationViews.TAG_LIVE, s.liveId);
        try {
            NotificationViews.post(c, NotificationViews.TAG_RING, s.id, NotificationViews.ringing(c, s, AlarmStore.snoozeMinutes(c)));
        } catch (RuntimeException e) {
            Log.e(TAG, "Could not post the ringing notification", e);
        }
        setWhileIdle(c, AlarmReceiver.ACTION_RING_END, s.id, since + AlarmStore.ringMs(c));
    }

    /** Stops everything about `s`: its wake-ups and its ringing notification. */
    private static void stop(Context c, AlarmSpec s) {
        cancelAlarm(c, AlarmReceiver.ACTION_FIRE, s.id);
        cancelAlarm(c, AlarmReceiver.ACTION_RING_END, s.id);
        NotificationViews.cancel(c, NotificationViews.TAG_RING, s.id);
    }

    /** setAlarmClock: exact, wakes the phone, not delayed by Doze, shown as the next alarm. */
    private static void schedule(Context c, AlarmSpec s) {
        AlarmManager am = c.getSystemService(AlarmManager.class);
        if (am == null) return;
        PendingIntent fire = NotificationViews.alarmBroadcast(c, AlarmReceiver.ACTION_FIRE, s.id);
        try {
            if (am.canScheduleExactAlarms()) {
                PendingIntent show = NotificationViews.openApp(c, "alarm", s.instantId, s.id ^ 0x20000000);
                am.setAlarmClock(new AlarmManager.AlarmClockInfo(s.at, show), fire);
                return;
            }
        } catch (SecurityException e) {
            Log.w(TAG, "Exact alarms not allowed; falling back", e);
        }
        am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, s.at, fire);
    }

    private static void setWhileIdle(Context c, String action, int id, long at) {
        AlarmManager am = c.getSystemService(AlarmManager.class);
        if (am == null) return;
        PendingIntent pi = NotificationViews.alarmBroadcast(c, action, id);
        try {
            if (am.canScheduleExactAlarms()) {
                am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pi);
                return;
            }
        } catch (SecurityException e) {
            Log.w(TAG, "Exact alarms not allowed; falling back", e);
        }
        am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pi);
    }

    private static void cancelAlarm(Context c, String action, int id) {
        AlarmManager am = c.getSystemService(AlarmManager.class);
        if (am != null) am.cancel(NotificationViews.alarmBroadcast(c, action, id));
    }

    /** An answer for the page to replay: { type, instantId, at (snooze: when it rings again), t }. */
    private static void record(Context c, String type, AlarmSpec s, long at) {
        try {
            JSONObject a = new JSONObject().put("type", type).put("instantId", s.instantId).put("t", System.currentTimeMillis());
            if (at > 0) a.put("at", at);
            AlarmStore.addAction(c, a);
        } catch (JSONException e) {
            Log.e(TAG, "Could not record " + type, e);
        }
    }

    private static String clock(Context c, long t) {
        return DateFormat.getTimeFormat(c).format(new Date(t));
    }
}
