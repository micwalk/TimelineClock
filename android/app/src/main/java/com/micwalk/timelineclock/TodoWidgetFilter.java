package com.micwalk.timelineclock;

import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.time.format.TextStyle;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import org.json.JSONArray;
import org.json.JSONObject;

/**
 * Which todos a list widget shows, and how each reads (docs/prd_todo_import_widgets.md §4). Pure,
 * so it is tested off the device (TodoWidgetFilterTest). The page writes the snapshot
 * (src/domain/todoWidget.ts WidgetSnapshot); the widget filters it itself, so it stays right
 * across midnight and as its settings change without the page running.
 */
final class TodoWidgetFilter {

    static final int NOW = 1;
    static final int SCHEDULED = 2;
    static final int UNSCHEDULED = 4;
    static final int DONE = 8;
    static final int DEFAULT_STATUSES = NOW | SCHEDULED | UNSCHEDULED;
    /** Look ahead: today only. 0 is no limit. */
    static final int DEFAULT_DAYS = 1;
    /** A widget shows a screenful; more than this is never needed. */
    static final int MAX_ROWS = 80;

    private TodoWidgetFilter() {}

    /** One row: its todo, its name, what is under it, and whether its box is ticked. */
    static final class Row {
        final String id;
        final String name;
        final String sub;
        final boolean ticked;
        final int kind;
        final long sort;

        Row(String id, String name, String sub, boolean ticked, int kind, long sort) {
            this.id = id;
            this.name = name;
            this.sub = sub;
            this.ticked = ticked;
            this.kind = kind;
            this.sort = sort;
        }
    }

    /** The rows a widget shows: `statuses` (NOW | SCHEDULED | …), scheduled ones within `days` (0: all). */
    static List<Row> rows(JSONObject snapshot, int statuses, int days, long now, Set<String> pendingDone, ZoneId zone) {
        List<Row> out = new ArrayList<>();
        JSONArray todos = snapshot == null ? null : snapshot.optJSONArray("todos");
        if (todos == null) return out;
        ZonedDateTime today = Instant.ofEpochMilli(now).atZone(zone).toLocalDate().atStartOfDay(zone);
        long dayStart = today.toInstant().toEpochMilli();
        long horizon = days <= 0 ? Long.MAX_VALUE : today.plusDays(days).toInstant().toEpochMilli();
        for (int k = 0; k < todos.length(); k++) {
            JSONObject t = todos.optJSONObject(k);
            if (t == null) continue;
            String id = t.optString("id", "");
            if (id.isEmpty()) continue;
            String name = t.optString("label", "");
            String status = t.optString("status", "open");
            long dur = t.optLong("durationMs", 0);
            String len = dur > 0 ? " · " + length(dur) : "";
            boolean ticked = pendingDone != null && pendingDone.contains(id);
            if (ticked || !"open".equals(status)) {
                long closed = ticked ? now : t.optLong("closedAt", 0);
                if ((statuses & DONE) == 0 || closed < dayStart) continue;
                String word = ticked || "done".equals(status) ? "✓ done" : "dropped".equals(status) ? "won't do" : "passed";
                out.add(new Row(id, name, word, true, DONE, -closed));
                continue;
            }
            boolean counting = t.optBoolean("counting", false);
            boolean hasAt = t.has("at");
            long at = t.optLong("at", 0);
            String clock = t.optString("clock", "");
            if (counting || (hasAt && at <= now)) {
                if ((statuses & NOW) == 0) continue;
                String sub = counting ? "▶ counting" : "since " + (clock.isEmpty() ? "" : clock);
                out.add(new Row(id, name, sub + len, false, NOW, counting ? Long.MIN_VALUE + at : at));
            } else if (hasAt) {
                if ((statuses & SCHEDULED) == 0 || at >= horizon) continue;
                String sub = dayWord(at, now, zone) + clock + (t.optBoolean("repeats", false) ? " ⟳" : "");
                out.add(new Row(id, name, sub + len, false, SCHEDULED, at));
            } else {
                if ((statuses & UNSCHEDULED) == 0) continue;
                String sub = t.optBoolean("paused", false) ? "⏸ paused" + len : dur > 0 ? length(dur) : "";
                out.add(new Row(id, name, sub, false, UNSCHEDULED, t.optLong("order", 0)));
            }
        }
        // Now, then scheduled by time, then unscheduled in their order, then done (latest first).
        Collections.sort(out, (a, b) -> a.kind != b.kind ? Integer.compare(a.kind, b.kind) : Long.compare(a.sort, b.sort));
        return out.size() > MAX_ROWS ? new ArrayList<>(out.subList(0, MAX_ROWS)) : out;
    }

    /** "", "Tomorrow ", "Fri ", "Nov 28 ": the day before a time, as the Todos tab says it. */
    static String dayWord(long at, long now, ZoneId zone) {
        LocalDate day = Instant.ofEpochMilli(at).atZone(zone).toLocalDate();
        LocalDate today = Instant.ofEpochMilli(now).atZone(zone).toLocalDate();
        if (day.equals(today)) return "";
        if (day.equals(today.plusDays(1))) return "Tomorrow ";
        if (day.isAfter(today) && day.isBefore(today.plusDays(7))) return day.getDayOfWeek().getDisplayName(TextStyle.SHORT, Locale.getDefault()) + " ";
        return day.getMonth().getDisplayName(TextStyle.SHORT, Locale.getDefault()) + " " + day.getDayOfMonth() + " ";
    }

    /** "20m", "1h", "1h 30m". */
    static String length(long ms) {
        long min = Math.round(ms / 60_000.0);
        if (min < 60) return min + "m";
        long h = min / 60;
        long m = min % 60;
        return m == 0 ? h + "h" : h + "h " + m + "m";
    }

    /** A widget's settings in words, for its header ("Today · Now, Scheduled"). */
    static String summary(int statuses, int days) {
        List<String> parts = new ArrayList<>();
        if ((statuses & NOW) != 0) parts.add("Now");
        if ((statuses & SCHEDULED) != 0) parts.add("Scheduled");
        if ((statuses & UNSCHEDULED) != 0) parts.add("Unscheduled");
        if ((statuses & DONE) != 0) parts.add("Done");
        String ahead = (statuses & SCHEDULED) == 0 ? "" : days <= 0 ? "All days · " : days == 1 ? "Today · " : days + " days · ";
        return ahead + String.join(", ", parts);
    }
}
