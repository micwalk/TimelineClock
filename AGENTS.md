# Timeline Clock - Agent Rules

## Project Overview
This is a timeline-centric clock app that unifies Stopwatch, Timer, Alarm, World Clock, and lightweight Calendar concepts. Everything is an Instant, Duration, or TimeRange, surfaced on one scrolling/zoomable timeline with a "Now" marker.

* The app is already started with HMR hot module reload enabled in a spearate terminal window, so you do not need to launch it yourself.

## Core Architecture
See docs/ARCHITECTURE.md before changing the timeline.
- **Frontend**: React 19 + TypeScript + Vite
- **Timeline**: DOM, not canvas. React renders structure; the viewport engine (src/engine) moves elements with CSS transforms and updates time-dependent text. No render loop: frames run only when something changes.
- **Styling**: CSS custom-property theme in src/styles/theme.css. Components set --accent / --halo; .glow-box / .glow-text add the glow; --glow scales all glow. Everything glows.
- **State Management**: Zustand stores in src/store; every user operation lives in src/store/actions.ts
- **Storage**: localStorage (same keys/format as before); IndexedDB via idb is planned
- **PWA**: Vite PWA plugin with Workbox, installable manifest
- **Icons**: @heroicons/react
- **Testing**: Vitest (jsdom) + React Testing Library
- **Optional**: Capacitor wrapper for precise alarms

## Timeline Rendering Rules
- Never put per-frame values (pan position, zoom, the current time) in React state.
- Position along the time axis: usePositionMain(ref, f => f.pos(ts)). Time-dependent text: <LiveText compute={f => ...} />.
- Coarse viewport-derived facts (what's on screen, is it past): useFrameValue(selector), which re-renders only on change.
- Use frame.now when drawing; use engine.sample() inside actions. Avoid Date.now() in render.
- Call engine.beginTransition() before changing focus/zoom state to animate the change.
- Put pure logic in src/domain with unit tests.

## Core Concepts
* Instant -- A point in time. Rendered on the timeline as a vertical line with label. An instant can be saved, or it can represent a concept like "Now" or the current cursor position.
* Span -- A pair of Instants with a duration between them. One of the instants could be Now or the Cursor. A span can be saved, or it can be implied. Implied spans are automatically generated temporarily based on context: the lane from the selection to the previous selection or to the Cursor (a pin saves it); Selected→Now is opt-in. **Live vs saved lanes:** a span with an endpoint at Now or the Cursor (saved spans to Now, Selected→Now, Selected→Cursor) draws on the live side as a thin lane with a short colour-coded chip (Now red, cursor accent; "26m", "1h 5m"; its tools show after a tap): a band above the tags in horizontal, bars at the left edge in vertical. Lanes between two saved instants stay on the saved side (below the chips, or the right edge).

## Main UI Components
1. Timeline view -- DOM-rendered horizontally scrolling timeline (src/components/timeline)
2. Controls + List View -- control bar and tabbed list below the timeline (src/components/panels)

## Key Principles
1. **Single Timeline View**: All time entities (instants, durations, ranges) on one scrollable/zoomable timeline
2. **Fast Creation**: Tap/drag/type to create timers/alarms/stopwatches quickly
3. **Accuracy**: Monotonic timing for running items, handle DST/timezone changes
4. **PWA First**: Works offline, installable, cross-platform
5. **Local-First**: Data stays on device unless user opts into sync
6. **Performance First**: Optimize for 60fps timeline rendering and smooth interactions
7. **History is core**: never fade, dim or hide past instants/spans to reduce clutter; fix clutter with layout
8. **Capture, then relate**: one tap drops a nameless instant (e.g. rice goes on) with nothing popping up; name it later with one tap on the chip's "name…" hint; create timers/alarms relative to it (+13m); look back at elapsed time. Judge UX by how few taps this takes
9. **Everything glows**: style through theme tokens (--accent/--halo, .glow-box/.glow-text, --glow) so a future style editor can change it
10. **Propose UX changes before building them**: the owner has rejected some unrequested interaction changes

## UX Patterns (current)
- **Timeline**: horizontal or vertical (auto from the window shape, Settings > Orientation, or the rotate button / V key; vertical time direction is a setting). The Now line follows the clock. Saved-instant chips use the overlap layout (compact chips; chips that collide slide along the time axis in time order, earlier first, up to the "chip slide" tunable; "+N" clusters only past that; "⟲N" snooze folds)
- **Dropping instants** (the primary action): the big red control-bar button is a ＋ while following Now (drops at Now) and NOW otherwise; the Cursor tag has a round ＋ (drops at the cursor); +/= and double-tapping the Now or Cursor tag do the same. `act.dropInstant` creates an unnamed instant, no focus/selection/editor, and flags it for a one-time pulse
- **Gestures**: one-finger/mouse drag moves through time along the main axis (x horizontal, y vertical; free cursor at the center); a flick glides with momentum and stops where it rests (no snap after a glide); the wheel zooms in horizontal and pans in vertical (horizontal wheel pans in horizontal); Ctrl+wheel and pinch zoom; V rotates the timeline; double-tap/double-click a chip's name to rename it; tap selects. Any other navigation (R/Now, an Agenda row, ± steps, zoom, rotate) cancels a glide in progress
- **Lane chips in vertical never overlap**: one shared per-frame layout (src/components/timeline/rightSideLayout.ts) places, in order, saved-side lane chips with their tools (selected/focused spans, implied selection spans), then live lanes' chips, then the flags/labels below, each at the free spot nearest where it wants to be inside its own span; it is width-aware (chip widths from a ResizeObserver), so boxes only move for boxes they would actually touch across the axis
- **Lane labels / Now flags** (vertical; src/components/timeline/NowFlags.tsx, layout in src/domain/nowFlags.ts): saved span lanes on the right get label boxes whose right edge runs into their bar. A span that contains Now (a running timer, a span you're in) gets its box at the Now line: name if named, time left (big, the lane's colour), original length small. Any other span without its own chip gets one at its middle: name and length. Boxes never overlap: each takes the free spot nearest where it wants to be inside its own span, clear of other boxes, saved chips and lane chips they would meet; a tap selects the span
- **Lane order**: a lane on screen keeps its slot when others come and go (src/domain/laneSlots.ts); new lanes take the lowest free slot; a saved span that contains another sits further out (nearer the right edge in vertical), swapping past what it contains (nestSlots), so a stopwatch's whole-run span sits outside its laps
- **Live lane chips** (left side / live band): large (16px), named after the span, else the instant it runs from ("Stopwatch · 0:04"); the length is as precise as the zoom allows: "26m", then "26:13", "26:13.4", "26:13.457" (formatLiveSpan). The Now and Cursor tags are large too (20px; vertical axis at 140px to fit them)
- **Selected span**: its begin/end arrows sit on the lane line at its visible ends; the selected or focused span's chip, tools and arrows, and the selected or focused instant's chip and tools, draw over everything else on the timeline
- **Hiding instants**: the eye tool on a selected chip or an Agenda row hides an instant from the timeline (no line or chip; Previous/Next skip it) without touching its spans; it shows while selected or focused, or while a span it ends is selected or focused, and the Agenda's eye shows it again. A user choice, so it doesn't break principle 7
- **Cursor ＋**: right of the Cursor tag's box in horizontal; across the axis on the saved side (where the instant appears), on the cursor line, in vertical
- **Time entry** (src/components/timeline/TimeEntryPopover.tsx, logic in src/domain/timeDigits.ts): one hh:mm:ss box with h/m/s labels; digits fill from the right, up to four mean hh:mm ("930" 9:30, "13" 13 min), five or six add seconds; untyped places stay dim; clock times take AM/PM or 24-hour ("1730")
- **Move mode**: drag the timeline, or tap the moving chip (or its clock tool) to type where it goes: Time, or From Now (± offset); OK finishes the move. The moving chip shows how far it is from Now
- **Cursor tag**: stays visible when the cursor lands on an instant (instant focus), in the `--c-cursor-on` accent, showing that instant's time and how long ago; no ＋ there, and the focused chip omits its "· ago"
- **Cursor landing**: a drag released at almost no speed (below `snapMaxReleaseSpeed`) snaps onto Now or an instant within 12px touch / 8px mouse, else to a tick within `tickSnapPx` (8px); a release with speed, or the end of a glide, never snaps; ± steps and typed times land on an instant only on an exact hit
- **Control bar**: horizontal, one row (Zoom out, Previous, step back, NOW/＋, step forward, Next, Zoom in, then Stopwatch and Timer). NOW/＋ shows the current time under it. Vertical keeps it a bottom bar but as a two-row grid that follows the screen: row 1 Zoom out, ▲, step up, row 2 Zoom in, ▼, step down, with NOW/＋ spanning both rows in column 4 and Stopwatch over Timer in column 5. Up/down respects the time direction (future down: ▲ is the previous instant and step up is −30m; future up: ▲ is the next instant and step up is +30m).
- **Agenda**: the tabbed list (All Instants / Favorites / All Spans), src/components/panels/Agenda.tsx; the dock/drawer toggle, Help (?) button and Settings gear sit in its tab bar. Help (src/components/panels/Help.tsx, also the ? key) covers concepts, controls, keys, the local-only data note and author credit; update it when controls change. It docks at the bottom (horizontal) or side (vertical) when there is room, otherwise it is a drawer opened by the ☰ button (setting: Auto / Docked / Drawer); picking a row in the drawer closes it
- **Backup**: Settings > Data exports one JSON file (settings + instants/spans; format in src/domain/backup.ts). Import picks settings, data or both; data combines (matching ids take the imported copy) or replaces
- **Stopwatch / Timer buttons** (on-ramp, not a separate clock UI; src/components/panels/QuickButtons.tsx, logic in src/domain/quickCreate.ts): they only make ordinary instants and spans. Timer (or T) picks a length (recent first, presets, or typed like 13m / 1h30 / 1:30): an instant at Now, an alarmed "13m timer" instant later whose live lane to Now is the countdown, and the saved span between them. Stopwatch: Start drops a favorited "Stopwatch" instant and focuses and selects its span to Now (always shown while running; span focus widens the view as it grows, from 30 s); then Lap (new instant, saves the lap span, favorites the new lap; by default the start stays favorited too, so both spans to Now show, lap and total; Settings > "Stopwatch laps keep the start favorited" turns that off; the view keeps the whole run: the start's span to Now stays focused) and Stop (new instant, saves the last lap's span, and saves the whole run start→stop as a "Stopwatch" span, which is focused and selected and is the reading on Reset; start and last lap are unfavorited), each showing its live time; then Reset (stops tracking; everything stays as history)
- **Planned** (see docs/handoffs): Agenda swipe gestures, natural-language quick add. Already shipped in layout v2: vertical layout, momentum, label-overlap layout, arrow-shaped tags, Agenda dock/drawer

## Technical Requirements
- **Performance**: 60fps timeline, <2s cold start, <500ms warm start
- **Accuracy**: Use `performance.now()` for monotonic timing
- **Notifications**: Local when app open, Web Push when backgrounded
- **Accessibility**: Full keyboard support, screen reader friendly, prefers-reduced-motion
- **Internationalization**: 12/24-hour, locale-aware formats, RTL support
- **Bundle Size**: <500KB initial load, <1MB total with code splitting

## Code Style
- Use TypeScript strictly - no `any` types
- Prefer functional components with hooks
- Use semantic HTML and ARIA attributes
- Follow React best practices for performance
- Implement proper error boundaries
- Use proper TypeScript interfaces for all data structures
- Use React.memo() for expensive timeline components
- Keep components small; logic goes in domain/ or store/actions.ts

## File Organization
- `/src/domain/` - Pure logic: time math, ticks, spans, navigation, alarms (with tests)
- `/src/store/` - Zustand stores and actions.ts
- `/src/engine/` - Viewport engine and hooks
- `/src/components/timeline/` - Timeline pieces (columns, lanes, ticks, popovers)
- `/src/components/panels/` - Control bar, list, alarms, settings
- `/src/hooks/` - Gestures, hotkeys, animation helpers
- `/src/services/` - Alarm scheduler, audio, notifications
- `/src/styles/` - Theme tokens and component CSS
- `/public/` - Static assets and PWA files
