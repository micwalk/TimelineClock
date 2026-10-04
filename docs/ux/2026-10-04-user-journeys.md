# User journeys: tap counts and proposals

**Status:** for owner review (2026-10-04). Section 1 is what the app does today (counted on
the current build, after the Stopwatch/Timer buttons, the hh:mm:ss time entry, and typing
a time in move mode). Sections 2–3 are proposals; nothing in them is built. Pick or strike;
§4 lists the decisions.

**How to read the counts:** a "tap" is one press (a button, a chip, a preset). Typing a
value counts as one step however many digits it has. "Name it" (one tap on "name…" plus
typing) is left out unless it is the point of the journey.

## 1. The journeys today

| # | Journey | Today | Steps today |
|---|---|---|---|
| J1 | **Timer** (rice, 13 min, alarm) | **2** | Timer → 13m (or type `13` → Start) |
| J2 | **Stopwatch** with laps | **1** + 1 per lap + 1 | Stopwatch; Lap…; Stop; (Reset) |
| J3 | **Change a timer's length** after starting (13 → 15 min) | ~5 | tap "13m timer" chip → double-tap its time (focus) → ⇄ Move → tap chip → From Now → type → OK. You type it **from Now**, not from the start, so you do the maths, and the labels still say "13m timer". |
| J4 | **Second timer from the same start** (two things in the oven) | ~7 | Timer always starts at Now. Today: tap the start instant → cursor tag → Offset from *start*… → type 25 → OK → cursor ＋ → tap new chip → 🔔. No span start → end. |
| J5 | **Compare two instants** ("how long between leaving and arriving?") | **2** | tap A, tap B: the lane between them shows "A → B · 01:05:00" (tap 📍 to keep it). Works, but nothing tells you it exists. |
| J6 | **Instant before/after another** (arrive 10:00 → leave 9:00) | ~6 | tap "arrive" → cursor tag → Offset from *arrive*… → − → type 100 → OK → cursor ＋ (then name it). |
| J7 | **Move an instant to a time** | **3–4** | (focused) ⇄ → tap chip → type → OK; From Now for offsets. |
| J8 | **Capture now, name later** | **1** (+ name) | ＋ ; later "name…" |

J1, J2, J5, J7 and J8 are fine. J3, J4 and J6 are the slow ones, and they are really the
same journey: **make or change an instant relative to another instant**.

## 2. Proposal: one "relative to this" tool on a chip (fixes J3, J4, J6)

Selecting an instant already shows its tools (☆ 🔔 ⇄ 🗑). Add one more: **± (relative)**.
It opens the same hh:mm:ss box, in "From *rice*" mode, with the +/− toggle and one extra
toggle, 🔔:

```
 From rice        [ + ]  00:25:00   [🔔]
 13 → 13 min · 130 → 1h 30m
 [ Cancel ]                    [ Add ]
```

- **Add** with 🔔 off drops a nameless instant at *rice* ± the offset (J6: tap "arrive"
  → ± → − → `100` → Add = **4**, then name it).
- **Add** with 🔔 on is a **timer from that instant**. That means an alarmed "25m timer"
  instant plus the span *rice* → end, exactly what the Timer button makes, but anchored
  on the chip instead of Now (J4: tap "rice" → ± → `25` → 🔔 → Add = **5**, or **4** if 🔔
  defaults to on for future results).
- The Timer button's picker gets the same anchor: while an instant is selected it shows
  **"from *rice*"** as a small switch, so the presets work too (J4 = tap "rice" → Timer →
  "from rice" → 25m = **4**).

**J3, changing a timer's length.** Two options:

- **3a. Move mode gets a "From *start*" tab.** When the moving instant ends a span, the
  move box offers *Time · From Now · From rice*. Retyping `15` in "From rice" moves the
  end to rice + 15. Labels named "Nm timer" are renamed to match. (J3 = tap end chip →
  ⇄ → tap chip → From rice → `15` → OK ≈ **5**, but no maths.)
- **3b. Tap the timer's span chip → "Length…"** opens the box on the span's length;
  OK moves the end. (J3 = tap span chip → Length → `15` → OK = **4**.) This also gives
  every saved span an editable length, not just timers.

Recommendation: **3b** (it's the shorter route and it's general), plus 3a's "From
*start*" tab since it costs little once the box exists.

## 3. Smaller things found along the way

- **⇄ Move needs a focused instant**, so a selected chip shows no ⇄ until you double-tap
  its time. Proposal: show ⇄ on any selected chip.
- **J5 is invisible.** Proposal: the first time two instants are selected, show a
  one-line hint under the lane: "Tap 📍 to keep this span". (Or nothing; it may be
  discoverable enough.)
- **Timer's live lane shows "12m"** (coarse) for the countdown. Proposal (from earlier):
  show "12:41" for the last hour.
- **Typed clock times land on the cursor's day.** "930" while looking at tomorrow means
  tomorrow 9:30. That's right for planning, but surprising after scrolling away. Keep?

## 4. Decisions for the owner

1. Add the **± relative** tool on selected chips (J4, J6)? With 🔔 making it a timer from
   that instant?
2. Timer picker: **"from *selected*"** switch? Default on or off?
3. J3: **3b** (span "Length…"), **3a** (move "From *start*" tab), or both?
4. Show **⇄ Move on any selected chip** (not only focused)?
5. J5 hint: yes or no?
6. Timer lane countdown as **mm:ss** for the last hour?
