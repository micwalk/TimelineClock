package com.micwalk.timelineclock;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Pattern;

/**
 * Pure decisions for the native alarms (unit tested in AlarmPlanTest): how a sync from the page
 * changes what is scheduled or ringing, and how a snoozed alarm is named.
 */
final class AlarmPlan {

    /** What a sync does. Specs in `schedule` and `ringNow` replace the stored ones. */
    static final class Result {
        final List<AlarmSpec> cancel = new ArrayList<>();
        final List<AlarmSpec> schedule = new ArrayList<>();
        final List<AlarmSpec> ringNow = new ArrayList<>();
        /** Ringing alarms whose text changed: re-post quietly. */
        final List<AlarmSpec> update = new ArrayList<>();
    }

    private AlarmPlan() {}

    /**
     * From what is stored to what the page wants. Alarms changed here (pendingAck) are left alone
     * until the page has replayed those changes. A ringing alarm keeps ringing while the page still
     * wants it; one the page dropped (dismissed in the app, turned off, deleted) stops. A new or
     * moved alarm is scheduled if it is ahead, rung now if it came due within `ringMs`, else dropped.
     */
    static Result sync(Map<Integer, AlarmSpec> stored, List<AlarmSpec> desired, long now, long ringMs) {
        Result r = new Result();
        Map<Integer, AlarmSpec> want = new HashMap<>();
        for (AlarmSpec d : desired) want.put(d.id, d);

        for (AlarmSpec s : stored.values()) {
            if (s.pendingAck) continue;
            if (!want.containsKey(s.id)) r.cancel.add(s);
        }
        for (AlarmSpec d : desired) {
            AlarmSpec s = stored.get(d.id);
            if (s != null && s.pendingAck) continue;
            if (s != null && AlarmSpec.RINGING.equals(s.state) && s.instantId.equals(d.instantId) && s.at == d.at) {
                if (!s.samePageFields(d)) r.update.add(d);
                continue;
            }
            if (s != null && AlarmSpec.SCHEDULED.equals(s.state) && s.samePageFields(d)) continue;
            if (s != null) r.cancel.add(s);
            if (d.at > now) r.schedule.add(d);
            else if (now - d.at < ringMs) r.ringNow.add(d);
        }
        return r;
    }

    private static final Pattern SNOOZE_PREFIX = Pattern.compile("^(?:Snooze\\s+\\d+:\\s*)+", Pattern.CASE_INSENSITIVE);

    /** "Snooze 2: Wake up" from "Wake up" or "Snooze 1: Wake up" (as the page names snoozes). */
    static String snoozeTitle(String title, int count) {
        String base = SNOOZE_PREFIX.matcher(title == null ? "" : title).replaceFirst("");
        return "Snooze " + count + ": " + (base.isEmpty() ? "Alarm" : base);
    }

    /** The snooze number the page would give the next snooze of an alarm with this title. */
    static int nextSnoozeNumber(String title) {
        java.util.regex.Matcher m = Pattern.compile("^Snooze\\s+(\\d+):", Pattern.CASE_INSENSITIVE).matcher(title == null ? "" : title);
        return m.find() ? Integer.parseInt(m.group(1)) + 1 : 1;
    }
}
