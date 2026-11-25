package com.micwalk.timelineclock;

import static org.junit.Assert.assertEquals;

import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.Test;

public class TodoWidgetFilterTest {

    private static final ZoneId ZONE = ZoneId.of("America/Los_Angeles");
    private static final long MIN = 60_000L;

    /** Wed Nov 25 2026 at h:m, local. */
    private static long at(int day, int h, int m) {
        return LocalDateTime.of(2026, 11, day, h, m).atZone(ZONE).toInstant().toEpochMilli();
    }

    private static final long NOW = at(25, 12, 0);

    private static JSONObject todo(String id, String status) throws Exception {
        return new JSONObject().put("id", id).put("label", id).put("status", status).put("order", 0);
    }

    private static JSONObject snapshot(JSONObject... todos) throws Exception {
        JSONArray a = new JSONArray();
        for (JSONObject t : todos) a.put(t);
        return new JSONObject().put("v", 1).put("todos", a);
    }

    private static List<String> lines(List<TodoWidgetFilter.Row> rows) {
        List<String> out = new ArrayList<>();
        for (TodoWidgetFilter.Row r : rows) out.add((r.ticked ? "[x] " : "[ ] ") + r.name + (r.sub.isEmpty() ? "" : " | " + r.sub));
        return out;
    }

    private JSONObject sample() throws Exception {
        return snapshot(
            todo("waiting", "open").put("at", at(25, 7, 0)).put("clock", "7:00a"),
            todo("counting", "open").put("at", at(25, 11, 0)).put("clock", "11:00a").put("counting", true),
            todo("later today", "open").put("at", at(25, 16, 0)).put("clock", "4:00p").put("durationMs", 20 * MIN),
            todo("tomorrow", "open").put("at", at(26, 9, 0)).put("clock", "9:00a").put("repeats", true),
            todo("next week", "open").put("at", at(30, 9, 0)).put("clock", "9:00a"),
            todo("list", "open").put("order", 2),
            todo("paused", "open").put("order", 1).put("paused", true).put("durationMs", 90 * MIN),
            todo("done today", "done").put("closedAt", at(25, 10, 0)),
            todo("done yesterday", "done").put("closedAt", at(24, 10, 0)),
            todo("dropped", "dropped").put("closedAt", at(25, 11, 0)));
    }

    @Test
    public void defaultShowsNowTodayAndTheList() throws Exception {
        List<TodoWidgetFilter.Row> rows = TodoWidgetFilter.rows(sample(), TodoWidgetFilter.DEFAULT_STATUSES, 1, NOW, Collections.emptySet(), ZONE);
        assertEquals(List.of(
            "[ ] counting | ▶ counting",
            "[ ] waiting | since 7:00a",
            "[ ] later today | 4:00p · 20m",
            "[ ] paused | ⏸ paused · 1h 30m",
            "[ ] list"), lines(rows));
    }

    @Test
    public void lookAheadAndDone() throws Exception {
        int scheduledAndDone = TodoWidgetFilter.SCHEDULED | TodoWidgetFilter.DONE;
        assertEquals(List.of(
            "[ ] later today | 4:00p · 20m",
            "[ ] tomorrow | Tomorrow 9:00a ⟳",
            "[x] dropped | won't do",
            "[x] done today | ✓ done"), lines(TodoWidgetFilter.rows(sample(), scheduledAndDone, 3, NOW, Collections.emptySet(), ZONE)));
        assertEquals(3, TodoWidgetFilter.rows(sample(), TodoWidgetFilter.SCHEDULED, 0, NOW, Collections.emptySet(), ZONE).size());
    }

    @Test
    public void aTickedTodoShowsDoneUntilThePageSaysSo() throws Exception {
        Set<String> ticked = new HashSet<>(List.of("list"));
        assertEquals(List.of("[ ] paused | ⏸ paused · 1h 30m"),
            lines(TodoWidgetFilter.rows(sample(), TodoWidgetFilter.UNSCHEDULED, 1, NOW, ticked, ZONE)));
        assertEquals("[x] list | ✓ done",
            lines(TodoWidgetFilter.rows(sample(), TodoWidgetFilter.DONE, 1, NOW, ticked, ZONE)).get(0));
    }

    @Test
    public void wordsForLengthsAndSettings() {
        assertEquals("20m", TodoWidgetFilter.length(20 * MIN));
        assertEquals("1h", TodoWidgetFilter.length(60 * MIN));
        assertEquals("Today · Now, Scheduled", TodoWidgetFilter.summary(TodoWidgetFilter.NOW | TodoWidgetFilter.SCHEDULED, 1));
        assertEquals("Unscheduled", TodoWidgetFilter.summary(TodoWidgetFilter.UNSCHEDULED, 7));
    }

    @Test
    public void nextChangeIsTheSoonestTimeAheadOrMidnight() throws Exception {
        // "later today" at 4:00p is the soonest open todo ahead (done and passed times don't count).
        assertEquals(at(25, 16, 0), TodoWidgetFilter.nextChange(sample(), NOW, ZONE));
        // Past it, tomorrow's 9:00a is after midnight: midnight comes first.
        assertEquals(at(26, 0, 0), TodoWidgetFilter.nextChange(sample(), at(25, 16, 0), ZONE));
        assertEquals(at(26, 0, 0), TodoWidgetFilter.nextChange(null, NOW, ZONE));
    }
}
