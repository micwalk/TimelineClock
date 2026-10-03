# Timeline Clock - Implementation Plan

> **Archived (Oct 2026).** This is the original plan, kept for reference. The timeline was
> first built on canvas and has since been rebuilt as DOM (see [ARCHITECTURE.md](../ARCHITECTURE.md)).
> Current plans live in [docs/handoffs/](../handoffs/).

## Project Overview
A timeline-centric clock app that unifies Stopwatch, Timer, Alarm, World Clock, and lightweight Calendar concepts. Everything is an Instant, Duration, or TimeRange, surfaced on one scrolling/zoomable timeline with a "Now" marker.

## Development Phases

### Phase 0: Foundation & Setup ✅
- [x] Project initialization with Vite + React + TypeScript
- [x] Tailwind CSS configuration
- [x] PWA setup with Vite PWA plugin
- [x] Testing framework (Vitest + React Testing Library)
- [x] Project structure and file organization
- [x] Development environment (HMR, linting, type checking)

### Phase 1: Basic Timeline View (M0 - Prototype)

#### 1.1 Timeline Canvas Foundation
- [ ] Create `/src/components/TimelineCanvas.tsx`:
  - [ ] Canvas element with proper sizing
  - [ ] Dark mode design (blue to black gradient background)
  - [ ] White timeline with blue neon glow effect
  - [ ] Responsive design (mobile/desktop)
  - [ ] Performance optimization (requestAnimationFrame)

#### 1.2 Timeline Rendering Engine
- [ ] Create `/src/canvas/TimelineRenderer.ts`:
  - [ ] Canvas context management
  - [ ] Dark mode color scheme implementation
  - [ ] Timeline axis rendering (white with blue glow)
  - [ ] "Now" line rendering (bright red, center position)
  - [ ] Current time display (white digital typeface)
  - [ ] Time ticks and labels

#### 1.3 Basic Navigation
- [ ] Implement basic zoom controls:
  - [ ] Mouse wheel zoom (desktop)
  - [ ] Zoom buttons/controls
  - [ ] Zoom level snapping
- [ ] Implement basic pan controls:
  - [ ] Drag to pan
  - [ ] Smooth panning animation
  - [ ] Pan boundaries

### Phase 2: Core Data Models & State Management (M0 - Prototype)

#### 2.1 Type Definitions
- [ ] Create `/src/types/index.ts` with core interfaces:
  - [ ] `Instant` interface
  - [ ] `Duration` interface  
  - [ ] `TimeRange` interface
  - [ ] `NotificationSpec` interface
  - [ ] `Track` interface (for grouping)
  - [ ] Timeline zoom levels enum
  - [ ] Gesture types enum

#### 2.2 Zustand Store Setup
- [ ] Create `/src/store/timelineStore.ts`:
  - [ ] Timeline state (zoom level, pan position, viewport)
  - [ ] Time entities state (instants, durations, ranges)
  - [ ] Active items state (running timers, stopwatches)
  - [ ] Favorites state
  - [ ] UI state (selected items, creation mode)
  - [ ] Actions for CRUD operations
  - [ ] Actions for timeline navigation
  - [ ] Persistence middleware with IndexedDB

#### 2.3 IndexedDB Service
- [ ] Create `/src/services/storage.ts`:
  - [ ] Database initialization
  - [ ] CRUD operations for all entity types
  - [ ] Migration system for schema updates
  - [ ] Error handling and fallbacks

### Phase 3: Entity Creation & Interaction (M0 - Prototype)

#### 3.1 Gesture System
- [ ] Create `/src/hooks/useTimelineGestures.ts`:
  - [ ] Tap detection (create Instant)
  - [ ] Press-drag detection (create TimeRange)
  - [ ] Long-press detection (context menu)
  - [ ] Multi-touch gesture handling
  - [ ] Gesture conflict resolution

#### 3.2 Entity Creation UI
- [ ] Create `/src/components/EntityCreation.tsx`:
  - [ ] Quick-add input field
  - [ ] Natural language parsing
  - [ ] Creation preview
  - [ ] Entity editing form
  - [ ] Favorite toggle

#### 3.3 Context Menus
- [ ] Create `/src/components/EntityContextMenu.tsx`:
  - [ ] Right-click/long-press menu
  - [ ] Edit, delete, favorite actions
  - [ ] Convert between entity types
  - [ ] Snooze functionality

### Phase 4: Natural Language Parser (M1 - MVP)

#### 4.1 Parser Foundation
- [ ] Create `/src/parsers/TimeParser.ts`:
  - [ ] Duration parsing (`25m`, `1h30`, `90s`)
  - [ ] Relative time parsing (`in 10m`, `tomorrow 8am`)
  - [ ] Absolute time parsing (`Sep 5 14:30 PST`)
  - [ ] Timezone handling
  - [ ] Error handling and suggestions

#### 4.2 Quick-Add Component
- [ ] Create `/src/components/QuickAdd.tsx`:
  - [ ] Input field with autocomplete
  - [ ] Preset chips (`+5m`, `+10m`, `+25m`)
  - [ ] Real-time parsing feedback
  - [ ] Keyboard shortcuts
  - [ ] History and suggestions

### Phase 5: Active Items & Cards (M1 - MVP)

#### 5.1 Active Items Management
- [ ] Create `/src/components/ActiveItems.tsx`:
  - [ ] Running timers display
  - [ ] Stopwatch controls
  - [ ] Countdown/countup display
  - [ ] Pause/resume functionality
  - [ ] Lap functionality for stopwatches

#### 5.2 Card System
- [ ] Create `/src/components/TimelineCards.tsx`:
  - [ ] Favorite items cards
  - [ ] Active items cards
  - [ ] Card layout and styling
  - [ ] Card interactions
  - [ ] Color coding and emojis

### Phase 6: Timer & Stopwatch Logic (M1 - MVP)

#### 6.1 Timer Engine
- [ ] Create `/src/services/TimerEngine.ts`:
  - [ ] Monotonic timing with `performance.now()`
  - [ ] Timer state management
  - [ ] Countdown logic
  - [ ] Expiration handling
  - [ ] Auto-convert to stopwatch

#### 6.2 Stopwatch Engine
- [ ] Create `/src/services/StopwatchEngine.ts`:
  - [ ] Lap timing
  - [ ] Pause/resume functionality
  - [ ] Time accumulation
  - [ ] Lap history

### Phase 7: Notifications & Alarms (M2 - Reliable)

#### 7.1 Local Notifications
- [ ] Create `/src/services/NotificationService.ts`:
  - [ ] Notification permission handling
  - [ ] Local notification scheduling
  - [ ] Sound and vibration
  - [ ] Notification actions

#### 7.2 Push Notifications
- [ ] Create `/src/services/PushService.ts`:
  - [ ] Web Push setup
  - [ ] Background notification scheduling
  - [ ] Cross-device sync
  - [ ] Notification delivery tracking

### Phase 8: World Clock & Timezones (M1 - MVP)

#### 8.1 Timezone Management
- [ ] Create `/src/services/TimezoneService.ts`:
  - [ ] Timezone detection
  - [ ] DST handling
  - [ ] Timezone conversion
  - [ ] Timezone selection UI

#### 8.2 World Clock Display
- [ ] Create `/src/components/WorldClock.tsx`:
  - [ ] Multiple timezone lanes
  - [ ] Current time display
  - [ ] Timezone selection
  - [ ] Localized time formatting

### Phase 9: Calendar Overlay (M3 - Polish)

#### 9.1 Calendar Integration
- [ ] Create `/src/services/CalendarService.ts`:
  - [ ] iCal feed parsing
  - [ ] Event rendering on timeline
  - [ ] Calendar selection
  - [ ] Event details display

### Phase 10: PWA & Offline Support (M1 - MVP)

#### 10.1 Service Worker
- [ ] Configure Workbox in Vite config
- [ ] Offline caching strategies
- [ ] Background sync
- [ ] Push notification handling

#### 10.2 PWA Manifest
- [ ] App icons and splash screens
- [ ] Install prompts
- [ ] App-like experience
- [ ] Offline functionality

### Phase 11: Accessibility & Polish (M3 - Polish)

#### 11.1 Accessibility
- [ ] Screen reader support
- [ ] Keyboard navigation
- [ ] High contrast mode
- [ ] Reduced motion support
- [ ] ARIA labels and roles

#### 11.2 Performance Optimization
- [ ] Canvas rendering optimization
- [ ] Virtual scrolling for large datasets
- [ ] Memory management
- [ ] Bundle size optimization
- [ ] Loading states and skeletons

### Phase 12: Testing & Quality Assurance

#### 12.1 Unit Tests
- [ ] Test all utility functions
- [ ] Test state management
- [ ] Test parsing logic
- [ ] Test timing engines

#### 12.2 Integration Tests
- [ ] Test timeline interactions
- [ ] Test entity creation
- [ ] Test navigation
- [ ] Test notifications

#### 12.3 E2E Tests
- [ ] Test critical user flows
- [ ] Test PWA functionality
- [ ] Test offline scenarios
- [ ] Test cross-browser compatibility

## Technical Milestones

### M0 (Prototype) - 2-3 weeks
- Basic timeline render with dark mode design
- Now animation with current time display
- Basic zoom and pan navigation
- Tap/drag creation
- Basic cards
- One running timer with sound

### M1 (MVP) - 4-6 weeks
- Natural language quick-add
- Favorites system
- Local storage
- Installable PWA
- Basic notifications (foreground)
- World clock lanes

### M2 (Reliable) - 2-3 weeks
- Push backend for scheduled notifications
- Cross-device sync opt-in
- Enhanced reliability

### M3 (Polish) - 2-3 weeks
- Accessibility improvements
- Theme system
- Calendar overlay
- Import/export functionality

## Success Criteria

### Performance
- 60fps timeline rendering
- <2s cold start
- <500ms warm start
- <500KB initial bundle size

### Functionality
- All core features working
- Offline functionality
- Cross-browser compatibility
- PWA installable

### Quality
- Comprehensive test coverage
- Accessibility compliance
- Error handling
- User feedback integration

## Risk Mitigation

### Technical Risks
- **Canvas Performance**: Implement proper optimization and fallbacks
- **PWA Limitations**: Plan for Capacitor wrapper for precise alarms
- **Browser Compatibility**: Test on multiple browsers early
- **Memory Management**: Monitor and optimize for long-running sessions

### Timeline Risks
- **Scope Creep**: Stick to M0-M1 features for initial release
- **Complexity**: Start simple and iterate
- **Dependencies**: Have fallback plans for external services

## Next Steps

1. **Start with Phase 1**: Create basic timeline canvas with dark mode design
2. **Build visual foundation**: Implement the timeline rendering with Now line
3. **Add basic navigation**: Zoom and pan controls
4. **Iterate quickly**: Focus on M0 prototype first
5. **Test early**: Set up testing from the beginning
6. **Document progress**: Update this plan as we progress
