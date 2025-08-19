# Timeline Clock

A timeline-centric clock app that unifies Stopwatch, Timer, Alarm, World Clock, and lightweight Calendar concepts. Everything is an Instant, Duration, or TimeRange, surfaced on one scrolling/zoomable timeline with a "Now" marker.

## 🚀 Current Status

**Phase 0: Foundation & Setup** ✅ **COMPLETE**
- Project initialized with Vite + React + TypeScript
- Tailwind CSS v4 configured and working
- PWA setup with Vite PWA plugin
- Testing framework (Vitest + React Testing Library) ready
- Development environment with HMR working

**Next: Phase 1 - Core Data Models & State Management** 🎯

## 📋 Implementation Plan

See [IMPLEMENTATION_PLAN.md](./IMPLEMENTATION_PLAN.md) for detailed feature-by-feature development steps and milestones.

## 🛠 Tech Stack

- **Frontend**: React 18 + TypeScript + Vite
- **Timeline**: Native Canvas 2D API with optimized rendering pipeline
- **Styling**: Tailwind CSS v4 + Headless UI
- **State Management**: Zustand with persistence
- **Storage**: IndexedDB via `idb` (local-first)
- **Date/Time**: `date-fns` + `date-fns-tz` for timezone/DST handling
- **Forms**: `react-hook-form` + `zod` for validation
- **Animation**: `framer-motion` for smooth transitions
- **Testing**: Vitest + React Testing Library + Playwright
- **PWA**: Vite PWA plugin with Workbox

## 📦 Quick Start

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build

# Run tests
npm test
```

## 🧪 Development Commands

```bash
# Development
npm run dev              # Start dev server
npm run build            # Build for production
npm run build:pwa        # Build PWA
npm run preview          # Preview production build

# Testing
npm test                 # Run tests
npm run test:coverage    # Run tests with coverage
npm run test:watch       # Run tests in watch mode

# Code Quality
npm run lint             # Run linter
npm run lint:fix         # Fix linting issues
npm run type-check       # TypeScript type checking
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

## 🎯 Development Milestones

1. **M0 (Prototype)** - 2-3 weeks: Basic timeline render, Now animation, tap/drag creation
2. **M1 (MVP)** - 4-6 weeks: Natural language quick-add, favorites, local storage, PWA
3. **M2 (Reliable)** - 2-3 weeks: Push notifications, cross-device sync
4. **M3 (Polish)** - 2-3 weeks: Accessibility, themes, calendar overlay

## 🔧 Key Design Decisions

- **Canvas over PixiJS**: Using native Canvas 2D API for better performance and smaller bundle size
- **Zustand over Redux**: Simpler state management for this use case
- **Local-first**: Data stays on device by default for privacy and offline functionality
- **PWA-first**: Progressive Web App approach for cross-platform compatibility
- **Tailwind CSS v4**: Latest version with improved performance and features

## 🚧 Important Constraints

- PWA limitations for wake-up alarms (need Capacitor for precise alarms)
- Handle device sleep, timezone changes, app backgrounding
- Support offline functionality
- Ensure cross-browser compatibility
- Canvas performance on low-end devices

## 📄 License

MIT License - see LICENSE file for details
