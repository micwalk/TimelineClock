# Timeline Clock App — Product Requirements (v0.1)

## 1) Product overview

A single‑view, timeline‑centric clock that unifies Stopwatch, Timer, Alarm, World Clock, and lightweight Calendar concepts. Everything is an **Instant**, **Duration**, or **Time Range**, surfaced on one scrolling/zoomable timeline with an “Now” marker.

### Goals

- Replace four disjoint clock views with one coherent mental model.
- Make creating timers/alarms/stopwatches as fast as a tap/drag/type.
- Keep accuracy and reliability across device sleep, timezone/DST changes, and app backgrounding.
- Work as a PWA on desktop and mobile (iOS/Android), online/offline.

### Non‑goals

- Full calendar parity (recurring meetings, invites, RSVP flows).
- OS‑level exact‑time wakeups without user‑granted notifications/push.

---

## 2) Core concepts & data model

### Entities

- **Instant** `{ id, tsEpochMs, label?, tz?, favorite?: boolean, notify?: NotificationSpec[] }`
- **TimeSpan** `{ id, startInstantId, endInstantId, label?, favorite?: boolean }`
  - Derived props: `durationMs`, `isPast`, `isActive`, `timeLeftMs`.
- **Track** (optional grouping beneath the timeline) `{ id, title, entityIds[] }` for organizing favorites.

### Library behaviors

- `Instant ± Duration -> Instant`
- `Instant − Instant -> Duration`
- `TimeRange = <Instant, Instant>`
- **Favorites**: any entity pinned into “cards” under the timeline.
- **Types of features** as compositions:
  - Stopwatch: `anchorInstant = Now` + growing `TimeRange(anchorInstant, Now)`
  - Timer: `range = TimeRange(Now, Now + Duration)` + optional notification at end; on expire, continues as stopwatch from the end instant.
  - Alarm: `instant = explicit future ts` + notification at instant (no initial range).
  - World clock: `Now rendered in multiple TZ lanes; instants show local times per lane`.

### Storage

- Local first: **IndexedDB** (via `idb`).
- Sync (optional): cloud store (e.g., Supabase/Firebase) for backups and cross‑device sync.

---

## 3) UX/IA (includes "ideal interactions")

### Timeline canvas

- **Orientation**: horizontal by default; vertical optional.
- **Now line** fixed in center; content scrolls right→left with time motion (CSS transform).
- **Zoom**: pinch/trackpad pinch or `Ctrl/Cmd + mousewheel`; discrete steps (years→months→weeks→days→hours→minutes→seconds).
- **Pan**: one‑finger drag (mobile), click‑drag (desktop).
- **Snap**: to nearest tick; `Shift` disables snapping.
- **Lanes**: optional additional rows of labels for World Clock timezones, but one timeline. entities (instants, durations, time ranges) can be grouped into lanes i.e. different Calendar overlays, and personal Tracks.

### Gesture model & conflict resolution
- **Default mode = Navigate.** One‑finger drag pans; pinch zooms; tap selects.
- **Tap‑hold to create.** Press‑and‑hold (≈300ms) on empty space drops an **Instant** at the held timestamp and opens the quick popover. This avoids accidental creation while panning.
- **Drag‑from‑Now handle.** A small grab‑handle at the Now line lets you drag right to create a **Timer** (duration HUD while dragging) or left to create a **count‑up range** (Stopwatch‑style anchor). Release to commit; tap to cancel.
- **Edge handles for refine.** After creating a range, drag either end to adjust. Hold with a second finger (or Alt/Option on desktop) to **lock one end** while nudging the other by snapped increments.
- **Two‑finger always navigates.** Even in creation flows, two‑finger drag = pan, pinch = zoom.
- **Keyboard/Mouse aids (desktop):** Shift = no snap; Alt = fine‑grained nudge (10× smaller); Double‑click empty space = Instant; Click‑drag empty space = Range (creation mode appears while mouse down).

### Creation interactions (fast)

1. **Tap/Click** empty space ⇒ place **Instant** at that timestamp.
   - Quick popover: [Name field] [⭐ Favorite] [Bell] [More…].
2. **Press‑drag** across timeline ⇒ create **TimeRange**.
   - Drag handles to adjust ends; HUD shows exact duration; hold while dragging to snap to round durations.
3. **Quick‑Add field** (natural language):
   - Accepts strings like `25m`, `1h30`, `tomorrow 8am`, `in 10m`, `next Mon 9`, `90s`, `Sep 5 14:30 PST`.
   - Parsed to either Instant or Duration+Timer depending on intent keywords: `in`, `for`, `at`, `on`.
   - Presets: chips (`+5m`, `+10m`, `+25m`, `+45m`, `+1h`).
   - **Precision refine:** After creating by drag, an inline editor appears with a tokenized duration/time field (e.g., `1 h 25 m 30 s`). Arrow keys or scrubbers adjust units; direct typing overwrites. Enter commits; Esc cancels.
4. **Long‑press** an item ⇒ context menu: Favorite/Unfavorite, Rename, Color/Emoji, Snooze (+5m/+10m/custom), Duplicate, Convert (timer ↔ alarm), Delete. ⇒ context menu: Favorite/Unfavorite, Rename, Color/Emoji, Snooze (+5m/+10m/custom), Duplicate, Convert (timer ↔ alarm), Delete.
5. **Keyboard‑first** (desktop):
   - `T` = new **Timer** (prompts duration),
   - `A` = new **Alarm** (prompts time),
   - `S` = **Stopwatch** (start/pause/lap),
   - `I` = **Instant** (now),
   - `Space` = pause/resume focused active item.

### Active area (below timeline)

- Shows **cards** for favorites & actives in priority order: active timers first by time‑left, then alarms, then stopwatches.
- Card layout: name • big value (countdown/up) • subtle sub‑value (absolute time) • controls: Start/Pause/Reset/Lap/Snooze/Dismiss • color band.
- A **Lap** creates a child Instant on the stopwatch’s range; laps render as ticks on the range.

### World clock

- Toggle lanes: display Now as local time per timezone; instant popovers show localized times across enabled TZs.

### Calendar overlay (lightweight)

- Optional read‑only iCal feeds (e.g., device calendar). Events render as translucent ranges on a dedicated lane. No editing here.

### Empty states & guidance

- First‑run highlights: tap to drop an instant; drag to make a timer; type `25m`.
- Undo/redo for destructive ops.

### Accessibility

- Full keyboard support; prefers‑reduced‑motion; haptics on mobile; screen‑reader names for Now/Instants; sufficient contrast; larger tap targets.

---

## 4) Visual design

- Minimal, high‑contrast timeline.
- Major/minor ticks adapt to zoom; labels at round boundaries.
- Cards below with color accents; light/dark themes; emoji/color per item for quick recognition.

---

## 5) Accuracy & timekeeping

- **Monotonic timing** for running stopwatches/timers: `performance.now()` deltas accumulated; store `lastMonotonic` + `offset`. Protects from wall‑clock jumps.
- Convert to wall time for display using TZ of item (default device TZ).
- **DST/ambiguous times**: when creating alarms by wall time, store the intended zone and the corresponding epoch at creation; if ambiguous (fall‑back hour), ask user to choose first/second occurrence.
- **Leap seconds**: ignore in display; base on Unix time.

---

## 6) PWA platform plan

- **Frontend**: React + TypeScript + Vite; DOM‑based timeline (React components positioned by CSS transforms, rendered on demand; see docs/ARCHITECTURE.md) for smooth 60fps; CSS-variable theme; state via Zustand; data in localStorage today, IndexedDB via `idb` planned.
- **Service Worker**: Workbox (precaching, runtime caching, offline).
- **Installability**: manifest with icons/splash; proper scopes.
- **Audio**: short local sound files; gate playback behind user gesture to satisfy autoplay policies.
- **Wake‑lock**: Screen Wake Lock API (fallback keep‑alive animation) when a timer is running and app is foregrounded.

### Wake‑from‑sleep / wake‑up alarm feasibility
- **Bottom line:** A web‑only PWA is **not reliably sufficient** for wake‑up alarms on mobile when the app is backgrounded or killed. Use a **hybrid approach**: PWA UI + tiny native companion (Capacitor) for exact alarms.
- **iOS (Safari/PWA):**
  - PWAs cannot schedule precise local alarms to fire when the app is closed; background timers are suspended.
  - Web Push can deliver notifications, but delivery timing may be delayed by system policies, Focus/Do Not Disturb, battery state; sound/vibration is not guaranteed and cannot override Silent/Mute.
- **Android (Chrome PWA):**
  - PWAs can show push notifications, but exact‑time firing while the app is killed is not guaranteed. Precise wake‑ups require native `SCHEDULE_EXACT_ALARM` / ForegroundService.
- **Recommendation:**
  - Ship as a PWA for everything **except** guaranteed wake‑ups.
  - Offer an optional **Capacitor** (or Flutter/React Native) wrapper granting precise alarms:
    - iOS: local notifications with critical alert entitlement (optional), background fetch for rescheduling.
    - Android: `AlarmManager` (exact) with wake lock + foreground service at fire time.
  - Keep one shared codebase: React UI runs inside the native WebView; native module handles scheduling.

### Background notifications

- **Local notifications** while app open/foreground.
- **Scheduled notifications** when app is backgrounded: require **Web Push** with a lightweight backend to schedule exact‑time pushes (iOS/Android PWA limitations prevent exact local scheduling when closed).
- Backend options: a small Cloudflare Worker/Supabase Edge Function that stores pending alarms and sends a push at `tsEpochMs`.

- **Local notifications** while app open/foreground.
- **Scheduled notifications** when app is backgrounded: require **Web Push** with a lightweight backend to schedule exact‑time pushes (iOS/Android PWA limitations prevent exact local scheduling when closed).
- Backend options: a small Cloudflare Worker/Supabase Edge Function that stores pending alarms and sends a push at `tsEpochMs`.

---

## 7) Security & privacy

- No tracking by default.
- Data stays on‑device unless user opts into sync.
- Push tokens stored encrypted; server stores minimal fields: `{ userId, instantId, fireAt }`.

---

## 8) Performance targets

- 60 fps timeline pan/zoom on mid‑range phones.
- <2s cold start, <500ms warm.
- 1000+ items without frame drops (virtualization + culling).

---

## 9) Error states & resilience

- If SW not installed, degrade gracefully (no offline).
- If notifications denied, show banner on alarm/timer creation with “Enable notifications” or “Keep silent”.
- Battery optimizations (Android): show guidance if pushes delayed.

---

## 10) Internationalization

- 12/24‑hour preference; locale‑aware formats; RTL layout support; week start day.

---

## 11) Telemetry (optional, local‑first)

- Anonymous counts for feature usage, failures (e.g., missed alarms), performance timings.

---

## 12) Open questions

- Should timeline auto‑scroll when Now approaches edge during manual review? Initial thought: Default view is an animated display where the view is focused on an offset from now, such that now+offset is in a fixed pixel position. Optionally, can switch to a non-animated display where NOW will become a moving line, and the timeline is fixed. By default animated timeline when NOW visible, and fixed timeline when NOW is off-screen.
- Do we allow recurrence rules (RRULE) for repeating alarms within this UI—or punt to Calendar overlay? Initial thought: Allow basic ones for alarms but not calendar events (weekly occurence w/ daily selection only), phase 2 post mvp sprint focused on "Enhanced Alarms"
- How to present overlapping long ranges vs short timers (multi‑scale clutter)? Initial thought: auto-split durations to separate lanes based on length.
- Natural‑language parser scope (include time‑zone parsing like “8am Paris”)? Initial thought: save for phase 3.
- Is a PWA feasible for a mobile app to survive waking up from sleep? Is it reliable enough to serve as a wake up alarm? 

---

## 13) Milestones

**M0: Prototype (2–3 weeks)**

- Timeline render, Now animation, tap/drag to create instants/ranges, basic cards, one running timer with sound.

**M1: MVP**

- NL quick‑add, favorites, snooze, stopwatch laps, local storage, installable PWA, basic notifications (foreground), world‑clock lanes.

**M2: Reliable alarms**

- Push backend for scheduled notifications, cross‑device sync opt‑in.

**M3: Polish**

- Accessibility, themes, calendar overlay, import/export.

---

## 14) Appendices

### Example TypeScript types

```ts
type InstantId = string;
interface Instant { id: InstantId; ts: number; label?: string; tz?: string; favorite?: boolean; notify?: NotificationSpec[] }
interface Duration { id: string; ms: number; label?: string }
interface TimeRange { id: string; start: InstantId; end: InstantId; label?: string; favorite?: boolean }
interface NotificationSpec { id: string; fireAtTs: number; repeat?: 'none'|'daily'|'weekly'; sound?: string; }
```

### Key algorithms

- **Animation loop**: `requestAnimationFrame` → compute delta via `performance.now()` → translate timeline layer by `deltaMs * pxPerMs` → recycle tick labels offscreen.
- **Monotonic stopwatch**: store `{ startedAtMonotonic, accumulatedMs }`; on pause/resume update accordingly; display `accumulatedMs + (nowMono - startedAtMonotonic)`.

