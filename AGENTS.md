# Timeline Clock - Agent Rules

## Project Overview
This is a timeline-centric clock app that unifies Stopwatch, Timer, Alarm, World Clock, and lightweight Calendar concepts. Everything is an Instant, Duration, or TimeRange, surfaced on one scrolling/zoomable timeline with a "Now" marker.

* The app is already started with HMR hot module reload enabled in a spearate terminal window, so you do not need to launch it yourself.

## Core Architecture
See docs/ARCHITECTURE.md before changing the timeline.
- **Frontend**: React 19 + TypeScript + Vite
- **Timeline**: DOM, not canvas. React renders structure; the viewport engine (src/engine) moves elements with CSS transforms and updates time-dependent text. No render loop: frames run only when something changes. Saved instants' lines are one "world" layer that pans as a whole (a camera; src/components/timeline/InstantLines.tsx); chips read their layout per frame and glide on springs (chipPlacement.ts, domain/spring.ts)
- **Styling**: CSS custom-property theme in src/styles/theme.css. Components set --accent / --halo; .glow-box / .glow-text add the glow; --glow scales all glow. Everything glows.
- **State Management**: Zustand stores in src/store; every user operation lives in src/store/actions.ts
- **Storage**: localStorage (same keys/format as before); IndexedDB via idb is planned
- **PWA**: Vite PWA plugin with Workbox, installable manifest
- **Icons**: @heroicons/react
- **Testing**: Vitest (jsdom) + React Testing Library
- **Android app** (docs/android.md): a Capacitor 8 shell that loads the live Netlify site, for alarms that ring with the app closed and live timer/stopwatch notifications. Native code in android/; its JS in src/services/native, loaded with a dynamic import only inside the app (src/services/nativeShell.ts), decisions in src/domain/nativeNotifications.ts. Android 16+ only, sideloaded from GitHub Releases
- **Versioning**: one semver in package.json, shown in Help and Settings (`__APP_VERSION__`; inside the Android app also the app's own version)

## Timeline Rendering Rules
- Never put per-frame values (pan position, zoom, the current time) in React state.
- Position along the time axis: usePositionMain(ref, f => f.pos(ts)). Time-dependent text: <LiveText compute={f => ...} />.
- Coarse viewport-derived facts (what's on screen, is it past): useFrameValue(selector), which re-renders only on change.
- Use frame.now when drawing; use engine.sample() inside actions. Avoid Date.now() in render.
- Call engine.beginTransition() before changing focus/zoom state to animate the change.
- Never read layout (offsetWidth, getBoundingClientRect) inside a frame listener: it forces a layout every frame. Measure with a ResizeObserver (useChipWidth, observeLaneChip, observeFlag) and read the cached size.
- Saved chips' geometry (row, slide) changes every zoom frame: read it per frame (savedLayoutAt) and write it to the DOM; React only gets the structure (useSavedLayoutStructure), so a zoom re-renders nothing until a chip appears, goes or joins a "+N".
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
8. **Capture, then relate**: one tap drops a nameless instant (e.g. rice goes on) with nothing popping up; name it later: tap the chip, then its "name…" hint (shown only while selected, so unnamed chips stay compact); create timers/alarms relative to it (+13m); look back at elapsed time. The Cursor tag's ＋ is the exception: it opens the new chip's name box, but leaving it costs nothing (a tap elsewhere or moving the cursor keeps it unnamed). Judge UX by how few taps this takes
9. **Everything glows**: style through theme tokens (--accent/--halo, .glow-box/.glow-text, --glow) so a future style editor can change it
10. **Propose UX changes before building them**: the owner has rejected some unrequested interaction changes
11. **Time flows**: every change moves smoothly (focus and zoom transitions, chips gliding on springs, the ＋ morphing into its chip and flowing in and out of chips, the cursor gliding onto an instant before it lands, the cursor folding away); nothing teleports. Animate from engine frames (`f.perf`) or with CSS on properties the engine doesn't write, and respect prefers-reduced-motion (`reducedMotion()`)

## UX Patterns (current)
- **Timeline**: horizontal or vertical (auto from the window shape, Settings > Orientation, or the rotate button / V key; vertical time direction is a setting). The Now line follows the clock. Saved-instant chips use the overlap layout (compact chips; chips that collide slide along the time axis in time order, earlier first, up to the "chip slide" tunable; "+N" clusters only past that; "⟲N" snooze folds; a selected chip's tools take room too, so no chip sits under them, and so does the time under a chip being named). Chips never jump: their row and slide ride critically damped springs (pushed aside smoothly; a pop to another row is a quick slide), and a chip that appears fades and grows in
- **Dropping instants** (the primary action): the big red control-bar button is a ＋ while following Now (drops at Now) and NOW otherwise; +/= and double-tapping the Cursor tag drop at the cursor. Double-tapping the Now tag goes to Now first; there, it drops an instant at Now with its name editor open (`act.activateNow`). `act.dropInstant` creates an unnamed instant, no focus/selection/editor, and flags it for a one-time pulse
- **Cursor ＋** (src/components/timeline/plusMorph.ts, `act.dropAndName`): a primary target, so it never moves (right of the tag's box in horizontal; across the axis on the saved side, on the cursor line, in vertical; pinned even while the tag leans onto an instant). It drops an instant at the cursor with its name box open: the ＋ circle drops across the axis and stretches into the new chip's pill, cross-fading into it. Naming ends with Enter, a tap elsewhere or moving the cursor (`act.endNaming`; empty keeps it unnamed); ended without moving, the cursor lands on the new instant (it is right there)
- **Capture** (src/domain/capture.ts, src/components/timeline/capture.ts): the cursor is *on* an instant when it is focused, or (a free cursor) when a drag held slowly (under `CAPTURE_MAX_SPEED`) is within the landing radius of it (where a slow release would snap), or at rest right on it. A held capture previews the landing: the cursor and its tag glide onto the instant's line, the tag takes the on-instant colour and shows the instant's time, and its chip lights up. While the cursor is on an instant the ＋ is inside that instant's chip (a drop there would only duplicate it): it flows in as a 2D metaball (a gooey SVG neck, domain/metaball.ts) and is pulled back out, the neck stretching and snapping, when the cursor leaves
- **Hiding the cursor**: the eye-slash badge on the Cursor tag (or H) folds the tag, with its ＋, into its arrowhead on the axis and fades the cursor's line (`useUi.cursorHidden`); tapping the arrowhead or H unfolds it. Nothing else changes (pans still move the cursor)
- **Gestures**: one-finger/mouse drag moves through time along the main axis (x horizontal, y vertical; free cursor at the center); a flick glides with momentum and stops where it rests (no snap after a glide); the wheel zooms in horizontal and pans in vertical (horizontal wheel pans in horizontal); Ctrl+wheel and pinch zoom; V rotates the timeline; H hides or shows the cursor; double-tap/double-click a chip focuses it, and again (once focused) renames it, for instants (`act.activateInstant`) and spans (`act.activateSpan`) alike; tap selects. Any other navigation (R/Now, an Agenda row, ± steps, zoom, rotate) cancels a glide in progress
- **Lane chips in vertical never overlap**: one shared per-frame layout (src/components/timeline/rightSideLayout.ts) places, in order, saved-side lane chips with their tools (selected/focused spans, implied selection spans), then live lanes' chips, then the flags/labels below, each at the free spot nearest where it wants to be inside its own span; lane chips keep clear of the selected or focused instant's chip and its tools (they draw on top), and live lanes' chips of the Now and Cursor tags too; it is width-aware (chip and tag sizes from a ResizeObserver), so boxes only move for boxes they would actually touch across the axis
- **Lane labels / Now flags** (vertical; src/components/timeline/NowFlags.tsx, layout in src/domain/nowFlags.ts): saved span lanes on the right get label boxes whose right edge runs into their bar. A span that contains Now (a running timer, a span you're in) gets its box at the Now line: name if named, time left (big, the lane's colour), original length small. Any other span without its own chip gets one at its middle: name and length. Boxes never overlap: each takes the free spot nearest where it wants to be inside its own span, clear of other boxes, saved chips and lane chips they would meet; a tap selects the span
- **Lane order**: a lane on screen keeps its slot when others come and go (src/domain/laneSlots.ts); saved spans that don't overlap in time share a slot (packSlots: a stopwatch's laps run on one track; a new lap joins the track it continues); new lanes take the lowest free slot; a saved span that contains another sits further out (nearer the right edge in vertical), so a stopwatch's whole-run span sits outside its laps
- **Crowded span names** (src/domain/labelGroups.ts): names on one lane that would touch fold into an "N spans" chip (horizontal, laneChipLayout.ts + LaneGroupChips.tsx) or label (vertical, in rightSideLayout/NowFlags) at their mean spot; tapping it zooms to show them. Selected and focused spans keep their own chips; the rest move off them
- **Live lane chips** (left side / live band): large (16px), named after the span, else the instant it runs from ("Stopwatch · 0:04"); the length is as precise as the zoom allows: "26m", then "26:13", "26:13.4", "26:13.457" (formatLiveSpan). The Now and Cursor tags are large too (20px; vertical axis at 140px to fit them)
- **Selected span**: its begin/end arrows sit on the lane line at its visible ends; the selected or focused span's chip, tools and arrows, and the selected or focused instant's chip and tools, draw over everything else on the timeline
- **Favorite star on lane chips**: a favorite's span to Now ends its chip in a star button; tapping it unfavorites the instant (the lane goes) without opening the lane's tools
- **Hiding instants**: the eye tool on a selected chip or an Agenda row hides an instant from the timeline (no line or chip; Previous/Next skip it) without touching its spans; it shows while selected or focused, or while a span it ends is selected or focused, and the Agenda's eye shows it again. A user choice, so it doesn't break principle 7
- **Time entry** (src/components/timeline/TimeEntryPopover.tsx, logic in src/domain/timeDigits.ts): one hh:mm:ss box with h/m/s labels; digits fill from the right, up to four mean hh:mm ("930" 9:30, "13" 13 min), five or six add seconds; untyped places stay dim; clock times take AM/PM or 24-hour ("1730") and start with the hour: one or two digits are the hour ("9" 9:00, "17" 17:00, "93" 9:30)
- **Span length**: a saved span between two instants has a clock tool, and once focused a double-tap on its length: type a length and its end moves to that far from its start (`act.setSpanLength`; a timer's end is its alarm). Its name is edited from the pencil or a double-tap on the rest of the chip
- **Move mode**: drag the timeline, or tap the moving chip (or its clock tool) to type where it goes: Time, or From Now (± offset); OK finishes the move. The moving chip shows how far it is from Now
- **Cursor tag**: stays visible when the cursor lands on an instant (instant focus), in the `--c-cursor-on` accent, showing that instant's time and how long ago; no ＋ there, and the focused chip omits its "· ago"
- **Cursor landing**: a drag released at almost no speed (below `snapMaxReleaseSpeed`) snaps onto Now or an instant within 12px touch / 8px mouse, else to a tick within `tickSnapPx` (8px); a release with speed, or the end of a glide, never snaps; ± steps and typed times land on an instant only on an exact hit. Held slowly over an instant, the drag shows the landing first (Capture)
- **Control bar**: horizontal, one row (Zoom out, Previous, step back, NOW/＋, step forward, Next, Zoom in, then Stopwatch and Timer). NOW/＋ shows the current time under it. Vertical keeps it a bottom bar but as a two-row grid that follows the screen: row 1 Zoom out, ▲, step up, row 2 Zoom in, ▼, step down, with NOW/＋ spanning both rows in column 4 and Stopwatch over Timer in column 5. Up/down respects the time direction (future down: ▲ is the previous instant and step up is −30m; future up: ▲ is the next instant and step up is +30m).
- **Agenda**: the tabbed list (All Instants / Favorites / All Spans), src/components/panels/Agenda.tsx; the dock/drawer toggle, Help (?) button and Settings gear sit in its tab bar. Help (src/components/panels/Help.tsx, also the ? key) covers concepts, controls, keys, the local-only data note and author credit; update it when controls change. It docks at the bottom (horizontal) or side (vertical) when there is room, otherwise it is a drawer opened by the ☰ button (setting: Auto / Docked / Drawer); picking a row in the drawer closes it
- **Backup**: Settings > Data exports one JSON file (settings + instants/spans; format in src/domain/backup.ts). Import picks settings, data or both; data combines (matching ids take the imported copy) or replaces
- **Stopwatch / Timer buttons** (on-ramp, not a separate clock UI; src/components/panels/QuickButtons.tsx, logic in src/domain/quickCreate.ts): they only make ordinary instants and spans. Timer (or T) picks a length (recent first, presets, or typed like 13m / 1h30 / 1:30): an instant at Now, an alarmed "13m timer" instant later whose live lane to Now is the countdown, and the saved span between them; dismissing its alarm unfavorites the end (an alarm that ends a saved span counts as a timer: domain/nativeNotifications timerSpanFor). Stopwatch: Start drops a favorited "Stopwatch" instant and focuses and selects its span to Now (always shown while running; span focus widens the view as it grows, from 30 s); then Lap (new instant, saves the lap span, favorites the new lap; by default the start stays favorited too, so both spans to Now show, lap and total; Settings > "Stopwatch laps keep the start favorited" turns that off; the view keeps the whole run: the start's span to Now stays focused) and Stop (new instant, saves the last lap's span, and saves the whole run start→stop as a "Stopwatch" span, which is focused and selected and is the reading on Reset; start and last lap are unfavorited), each showing its live time; then Reset (stops tracking; everything stays as history)
- **Planned** (see docs/handoffs): Agenda swipe gestures, natural-language quick add. Already shipped in layout v2: vertical layout, momentum, label-overlap layout, arrow-shaped tags, Agenda dock/drawer

## Technical Requirements
- **Performance**: 60fps timeline, <2s cold start, <500ms warm start
- **Accuracy**: Use `performance.now()` for monotonic timing
- **Notifications**: browser: local notifications while the page runs. Android app: exact native alarm notifications and live notifications (docs/android.md). No Web Push: the server stays static files on Netlify
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

## Versions and releases
- Bump the version in package.json (semver) with each change that ships, and add a CHANGELOG.md entry for it.
- Each entry says whether the Android app needs installing again: yes when anything native changes (android/, capacitor.config.ts, android-offline/, a Capacitor plugin), else "web only". Web changes reach the app by themselves.
- Merging a new version to main makes the Android app workflow (.github/workflows/android.yml) publish GitHub Release v<version> with a signed APK. Signing comes only from repository secrets: never commit a key, keystore or password (the repo is public).
- The app runs whatever Netlify serves from main, so web code the native side needs must ship first or together.
- To try a pull request on the phone before merging: TC Preview (docs/android.md#testing-a-pull-request-tc-preview), a separate app published as the "preview" pre-release for PRs that change native code; it loads the PR's Netlify deploy preview, chosen by PR number in the app.

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
- `/android/` - The Android app's native project (Capacitor); `/android-offline/` - its "Can't reach the site" page
- `/src/services/native/` - The Android app's JS side (only loaded inside the app)
