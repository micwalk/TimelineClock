# Alarm Feature — Product Requirements (v0.1)

## 1. Concept
- An **Alarm** is an extension of an **Instant**.  
- When **Now intersects an Instant with `alarm=true`**, the alarm *rings*.  
- This preserves the model: *everything is an Instant, alarms are just flagged instants*.  

---

## 2. Behavior

### Triggering
- Alarm fires when `Now == Instant.ts` (or as close as the runtime scheduler can guarantee).  
- Optional future extension: allow offset instants (`X − 5m`) or recurrence rules, but **not in scope for v0.1**.  

### After firing
- Alarm enters **Ring state**.  
- Default actions:
  - **Dismiss**: mark alarm as inactive.  
  - **Snooze**: create a *new Instant* at `Now + Δ` with `alarm=true` (preset snooze duration).  
    - v0.1: only one snooze preset (e.g., +5m).  
    - v0.2+: add configurable durations.  

---

## 3. Favorite vs Alarm
- **Favorite** = pin to dashboard/cards.  
- **Alarm** = ring when Now intersects.  
- Behavior:
  - Setting `alarm=true` auto-favorites the instant (so it is visible/manageable).  
  - Removing favorite does **not** disable alarm; alarms can exist “hidden” (but a banner or badge will indicate hidden alarms exist).  

---

## 4. UI/UX

### Setting alarms
- Each Instant label/card includes a 🔔 icon.  
- Toggle on = alarm enabled.  
- Toggle off = alarm disabled.  
- Visual cue:
  - Bell outline = off.  
  - Filled bell = on.  
  - (Future: pulsing/glow as the instant nears).  

### Managing alarms
- Alarmed instants appear in the **favorites list** (auto-favorited when alarmed).  
- Context menu (long-press/right-click):  
  - Enable/disable alarm.  
  - (Future: snooze presets, recurrence, ringtone).  

### Ringing state
- When Now crosses an alarmed instant:  
  - **Full-screen/modal overlay** appears.  
  - Shows Instant label and time.  
  - Large buttons: **Dismiss** / **Snooze**.  
  - Sound/vibration plays until action taken.  
- On desktop/web background: fire a system notification with Snooze/Dismiss actions.  

---

## 5. Visual design

- **Alarm glyph (bell)**:  
  - Rendered as an SVG icon (Heroicons).  
  - Standardized to 24×24 viewBox, scaled for zoom levels.  
  - Placement: next to instant label on timeline and in cards.  
- **Timeline presentation**:  
  - Alarmed instants show normal instant line + bell icon.  
  - When active and imminent (<X minutes), optional subtle highlight.  

---

## 6. Milestones

- **MVP (v0.1):**  
  - Alarms as boolean property of instants.  
  - Toggle UI (bell icon).  
  - Ring overlay with Dismiss/Snooze(+5m).  
  - Auto-favorite alarmed instants.  

- **Future (v0.2+):**  
  - Custom snooze durations.  
  - Ringtone/volume selection.  
  - Recurrence (daily/weekly).  
  - Advanced notifications (offsets, critical alerts).  
