# Timeline Clock

A timeline-centric clock app that unifies Stopwatch, Timer, Alarm, World Clock, and lightweight Calendar concepts. Everything is an Instant, Duration, or TimeRange, surfaced on one scrolling/zoomable timeline with a "Now" marker.

## 🚀 Features

- **Single Timeline View**: All time entities on one scrollable/zoomable timeline
- **Fast Creation**: Tap/drag/type to create timers/alarms/stopwatches quickly
- **Natural Language Input**: Parse inputs like `25m`, `tomorrow 8am`, `in 10m`
- **PWA Support**: Works offline, installable, cross-platform
- **Local-First**: Data stays on device unless user opts into sync
- **High Performance**: 60fps timeline rendering with optimized Canvas 2D API

## 🛠 Tech Stack

- **Frontend**: React 18 + TypeScript + Vite
- **Timeline**: Native Canvas 2D API with optimized rendering pipeline
- **Styling**: Tailwind CSS + Headless UI
- **State Management**: Zustand with persistence
- **Storage**: IndexedDB via `idb` (local-first)
- **Date/Time**: `date-fns` + `date-fns-tz` for timezone/DST handling
- **Forms**: `react-hook-form` + `zod` for validation
- **Animation**: `framer-motion` for smooth transitions
- **Testing**: Vitest + React Testing Library + Playwright
- **PWA**: Vite PWA plugin with Workbox

## 📦 Installation

```bash
# Clone the repository
git clone <repository-url>
cd TimelineClock

# Install dependencies
npm install

# Start development server
npm run dev
```

## 🧪 Development

```bash
# Development server
npm run dev

# Build for production
npm run build

# Build PWA
npm run build:pwa

# Run tests
npm test

# Run tests with coverage
npm run test:coverage

# Type checking
npm run type-check

# Linting
npm run lint
npm run lint:fix
```

## 📁 Project Structure

```
src/
├── components/     # React components
├── hooks/         # Custom React hooks
├── store/         # Zustand state management
├── utils/         # Utility functions
├── types/         # TypeScript type definitions
├── services/      # API and storage services
├── canvas/        # Canvas rendering utilities
├── parsers/       # Natural language parsing logic
└── test/          # Test setup and utilities
```

## 🎯 Development Priorities

1. **M0 (Prototype)**: Basic timeline render, Now animation, tap/drag creation
2. **M1 (MVP)**: Natural language quick-add, favorites, local storage, PWA
3. **M2 (Reliable)**: Push notifications, cross-device sync
4. **M3 (Polish)**: Accessibility, themes, calendar overlay

## 🔧 Key Design Decisions

- **Canvas over PixiJS**: Using native Canvas 2D API for better performance and smaller bundle size
- **Zustand over Redux**: Simpler state management for this use case
- **Local-first**: Data stays on device by default for privacy and offline functionality
- **PWA-first**: Progressive Web App approach for cross-platform compatibility

## 🚧 Important Constraints

- PWA limitations for wake-up alarms (need Capacitor for precise alarms)
- Handle device sleep, timezone changes, app backgrounding
- Support offline functionality
- Ensure cross-browser compatibility
- Canvas performance on low-end devices

## 📄 License

MIT License - see LICENSE file for details
