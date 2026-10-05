package com.micwalk.timelineclock;

import org.json.JSONException;
import org.json.JSONObject;

/**
 * One alarm the app wants rung (from the page's alarmed instants), plus what the native side
 * has done with it. Stored as JSON by AlarmStore.
 */
final class AlarmSpec {

    static final String SCHEDULED = "scheduled";
    static final String RINGING = "ringing";
    /** Dismissed from the notification; kept until the page has heard about it. */
    static final String DISMISSED = "dismissed";

    /** Notification id (a hash of the instant id, from the page). */
    int id;
    String instantId = "";
    /** When it rings, epoch ms. */
    long at;
    /** "5m timer", "Wake up". */
    String title = "";
    /** The line under the time while it rings: "Time's up · 11:41:02a". */
    String ringText = "";
    /** The countdown notification to replace when it rings (0: none). */
    int liveId;

    String state = SCHEDULED;
    long ringingSince;
    /** Changed here (dismissed or snoozed from the notification); the page hasn't caught up yet. */
    boolean pendingAck;
    /** Snoozes from the notification since the page last caught up. */
    int snoozes;

    /** Same alarm as far as the page is concerned (it doesn't know about native state). */
    boolean samePageFields(AlarmSpec o) {
        return id == o.id && at == o.at && instantId.equals(o.instantId) && title.equals(o.title) && ringText.equals(o.ringText) && liveId == o.liveId;
    }

    JSONObject toJson() throws JSONException {
        return new JSONObject()
            .put("id", id)
            .put("instantId", instantId)
            .put("at", at)
            .put("title", title)
            .put("ringText", ringText)
            .put("liveId", liveId)
            .put("state", state)
            .put("ringingSince", ringingSince)
            .put("pendingAck", pendingAck)
            .put("snoozes", snoozes);
    }

    /** From the page's sync call or from storage; null if it isn't a usable alarm. */
    static AlarmSpec fromJson(JSONObject o) {
        if (o == null || !o.has("id") || !o.has("at")) return null;
        AlarmSpec s = new AlarmSpec();
        s.id = o.optInt("id");
        s.instantId = o.optString("instantId", "");
        s.at = o.optLong("at");
        s.title = o.optString("title", "");
        s.ringText = o.optString("ringText", "");
        s.liveId = o.optInt("liveId", 0);
        s.state = o.optString("state", SCHEDULED);
        s.ringingSince = o.optLong("ringingSince", 0);
        s.pendingAck = o.optBoolean("pendingAck", false);
        s.snoozes = o.optInt("snoozes", 0);
        if (s.at <= 0 || s.instantId.isEmpty()) return null;
        return s;
    }
}
