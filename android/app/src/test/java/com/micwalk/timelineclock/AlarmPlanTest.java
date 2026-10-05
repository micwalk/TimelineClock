package com.micwalk.timelineclock;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.json.JSONObject;
import org.junit.Test;

public class AlarmPlanTest {

    private static final long NOW = 1_800_000_000_000L;
    private static final long MIN = 60_000L;
    private static final long RING = 5 * MIN;

    private static AlarmSpec spec(int id, long at) {
        AlarmSpec s = new AlarmSpec();
        s.id = id;
        s.instantId = "i" + id;
        s.at = at;
        s.title = "Alarm " + id;
        s.ringText = "Time's up";
        return s;
    }

    private static Map<Integer, AlarmSpec> stored(AlarmSpec... specs) {
        Map<Integer, AlarmSpec> m = new HashMap<>();
        for (AlarmSpec s : specs) m.put(s.id, s);
        return m;
    }

    private static List<Integer> ids(List<AlarmSpec> specs) {
        List<Integer> out = new ArrayList<>();
        for (AlarmSpec s : specs) out.add(s.id);
        return out;
    }

    @Test
    public void schedulesNewFutureAlarmsAndCancelsDroppedOnes() {
        AlarmPlan.Result r = AlarmPlan.sync(stored(spec(1, NOW + MIN)), List.of(spec(2, NOW + 2 * MIN)), NOW, RING);
        assertEquals(List.of(1), ids(r.cancel));
        assertEquals(List.of(2), ids(r.schedule));
        assertTrue(r.ringNow.isEmpty());
    }

    @Test
    public void leavesUnchangedAlarmsAlone() {
        AlarmPlan.Result r = AlarmPlan.sync(stored(spec(1, NOW + MIN)), List.of(spec(1, NOW + MIN)), NOW, RING);
        assertTrue(r.cancel.isEmpty());
        assertTrue(r.schedule.isEmpty());
    }

    @Test
    public void reschedulesAMovedOrRenamedAlarm() {
        AlarmSpec renamed = spec(1, NOW + MIN);
        renamed.title = "Tea";
        AlarmPlan.Result r = AlarmPlan.sync(stored(spec(1, NOW + MIN), spec(2, NOW + MIN)), List.of(renamed, spec(2, NOW + 3 * MIN)), NOW, RING);
        assertEquals(2, r.cancel.size());
        assertEquals(List.of(1, 2), ids(r.schedule));
    }

    @Test
    public void ringsANewAlarmThatIsAlreadyDueWithinTheRingTime() {
        AlarmPlan.Result r = AlarmPlan.sync(stored(), List.of(spec(1, NOW - MIN), spec(2, NOW - 10 * MIN)), NOW, RING);
        assertEquals(List.of(1), ids(r.ringNow));
        assertTrue(r.schedule.isEmpty());
    }

    @Test
    public void keepsRingingWhileThePageStillWantsIt() {
        AlarmSpec ringing = spec(1, NOW - MIN);
        ringing.state = AlarmSpec.RINGING;
        AlarmPlan.Result r = AlarmPlan.sync(stored(ringing), List.of(spec(1, NOW - MIN)), NOW, RING);
        assertTrue(r.cancel.isEmpty());
        assertTrue(r.ringNow.isEmpty());
    }

    @Test
    public void stopsRingingWhenThePageDropsIt() {
        AlarmSpec ringing = spec(1, NOW - MIN);
        ringing.state = AlarmSpec.RINGING;
        AlarmPlan.Result r = AlarmPlan.sync(stored(ringing), List.of(), NOW, RING);
        assertEquals(List.of(1), ids(r.cancel));
    }

    @Test
    public void leavesAlarmsAnsweredFromTheNotificationUntilThePageCatchesUp() {
        AlarmSpec dismissed = spec(1, NOW - MIN);
        dismissed.state = AlarmSpec.DISMISSED;
        dismissed.pendingAck = true;
        AlarmSpec snoozed = spec(2, NOW + 5 * MIN);
        snoozed.pendingAck = true;
        // The page hasn't replayed yet, so it still lists both at their old times.
        AlarmPlan.Result r = AlarmPlan.sync(stored(dismissed, snoozed), List.of(spec(1, NOW - MIN), spec(2, NOW - MIN)), NOW, RING);
        assertTrue(r.cancel.isEmpty());
        assertTrue(r.schedule.isEmpty());
        assertTrue(r.ringNow.isEmpty());
        // Nor are they cancelled when the page no longer lists them.
        assertTrue(AlarmPlan.sync(stored(dismissed, snoozed), List.of(), NOW, RING).cancel.isEmpty());
    }

    @Test
    public void namesSnoozesLikeThePage() {
        assertEquals("Snooze 1: 5m timer", AlarmPlan.snoozeTitle("5m timer", AlarmPlan.nextSnoozeNumber("5m timer")));
        assertEquals("Snooze 3: Wake up", AlarmPlan.snoozeTitle("Snooze 2: Wake up", AlarmPlan.nextSnoozeNumber("Snooze 2: Wake up")));
        assertEquals("Snooze 1: Alarm", AlarmPlan.snoozeTitle("", 1));
    }

    @Test
    public void specRoundTripsThroughJson() throws Exception {
        AlarmSpec s = spec(7, NOW);
        s.liveId = 99;
        s.state = AlarmSpec.RINGING;
        s.ringingSince = NOW + 1;
        s.pendingAck = true;
        AlarmSpec back = AlarmSpec.fromJson(new JSONObject(s.toJson().toString()));
        assertNotNull(back);
        assertTrue(s.samePageFields(back));
        assertEquals(AlarmSpec.RINGING, back.state);
        assertEquals(NOW + 1, back.ringingSince);
        assertTrue(back.pendingAck);
    }

    @Test
    public void rejectsUnusableSpecs() throws Exception {
        assertNull(AlarmSpec.fromJson(null));
        assertNull(AlarmSpec.fromJson(new JSONObject().put("id", 1)));
        assertNull(AlarmSpec.fromJson(new JSONObject().put("id", 1).put("at", NOW)));
    }
}
