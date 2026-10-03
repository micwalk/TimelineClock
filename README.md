# Timeline Clock

A timeline-centric clock app that unifies Stopwatch, Timer, Alarm, World Clock, and lightweight Calendar concepts. Everything is an Instant, Duration, or TimeRange, surfaced on one scrolling/zoomable timeline with a "Now" marker.

## Status

Working prototype:

- Zoomable, pannable timeline with Now, a free cursor (optionally locked to an offset from Now), and saved instants
- Instants: create, rename, favorite, alarm, move, delete; focus history and next/previous navigation
- Spans between instants (saved and implied), with live durations
- Alarms with sound, browser notifications, snooze, and a ringing panel
- List of instants, favorites and spans
- Settings: glow intensity, alarm ring duration and unanswered behavior, debug buttons

The timeline is rendered as DOM (React + CSS transforms), not canvas. See
[docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md) for how rendering, state and styling fit together.

## Tech stack

- **Frontend**: React 19 + TypeScript + Vite
- **Timeline**: React components positioned by a small on-demand viewport engine (`src/engine`)
- **State**: Zustand stores persisted to localStorage
- **Styling**: CSS custom-property theme (`src/styles/theme.css`) with a global glow knob; Tailwind v4 available for utilities
- **Icons**: Heroicons
- **Testing**: Vitest (jsdom) + Testing Library
- **PWA**: vite-plugin-pwa (Workbox)

## Quick start

```bash
npm install
npm run dev        # dev server
npm test           # unit tests (watch mode); `npx vitest run` for a single run
npm run build      # type-check + production build
npm run lint
```

## Project structure

```
src/
├── domain/      # Pure logic: time math, ticks, spans, navigation, alarms (+ tests)
├── store/       # Zustand stores and actions.ts (all user operations) (+ tests)
├── engine/      # Viewport engine and hooks: usePositionX, useFrameValue, LiveText
├── components/
│   ├── timeline/  # Timeline, instant columns, span lanes, ticks, time-entry popovers
│   ├── panels/    # Control bar, list panel, ringing alarms, settings
│   └── common/    # Icon button, inline input
├── hooks/       # Pan/zoom gestures, hotkeys, FLIP list animation
├── services/    # Alarm scheduler, audio, notifications
└── styles/      # theme.css (tokens), timeline.css, panels.css
```

## Keyboard

| Key | Action |
|-----|--------|
| `I` / `W`, `O` / `S` | Zoom in / out |
| `Z` / `X` | Move cursor back / forward by the step (long-press ± to change it) |
| `A` / `D` (or arrows) | Previous / next instant |
| `Q` / `E` | Focus history back / forward |
| `R` | Focus Now |
| `Esc` | Clear secondary selection, then selection; cancels a move |
| `Enter` | Confirm a move |

## Development milestones

1. **M0 (Prototype)**: Basic timeline render, Now animation, tap/drag creation
2. **M1 (MVP)**: Natural language quick-add, favorites, local storage, PWA
3. **M2 (Reliable)**: Push notifications, cross-device sync
4. **M3 (Polish)**: Accessibility, themes, calendar overlay

## Important constraints

- PWA limitations for wake-up alarms (need Capacitor for precise alarms)
- Handle device sleep, timezone changes, app backgrounding
- Offline support and cross-browser compatibility

## License

MIT License - see LICENSE file for details
