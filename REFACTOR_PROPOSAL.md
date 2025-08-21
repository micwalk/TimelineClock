# TimelineRenderer Refactoring Proposal

## Overview
The current `TimelineRenderer.ts` is a 2,230+ line monolith that violates single responsibility principle and makes maintenance difficult. This proposal suggests breaking it into focused, testable modules.

## Current Architecture Problems

### 1. **Massive Single Class** (2,230+ lines)
- 80+ methods handling diverse responsibilities
- 50+ private fields managing different concerns
- Impossible to test individual components in isolation

### 2. **Mixed Concerns**
- Canvas rendering mixed with business logic
- Event handling tightly coupled to drawing
- State management scattered throughout

### 3. **Poor Reusability**
- Drawing logic can't be reused outside timeline
- Animation system tightly coupled to timeline
- Hit testing logic repeated in multiple places

## Proposed Architecture

### Core Structure
```
src/canvas/
├── TimelineRenderer.ts           # Main orchestrator (200-300 lines)
├── core/
│   ├── TimelineState.ts         # State management
│   ├── TimelineViewport.ts      # Viewport calculations
│   └── TimelineAnimations.ts    # Animation system
├── drawing/
│   ├── DrawingContext.ts        # Canvas wrapper
│   ├── InstantRenderer.ts       # Instant drawing logic
│   ├── SpanRenderer.ts          # Span drawing logic
│   ├── TickRenderer.ts          # Timeline ticks
│   └── IconRenderer.ts          # Icons and controls
├── interaction/
│   ├── HitTestManager.ts        # Hit testing logic
│   ├── EventHandler.ts          # Event processing
│   └── InteractionTypes.ts      # Hit target types
└── utils/
    ├── TimeCalculations.ts      # Time/position math
    └── CanvasUtils.ts           # Canvas utilities
```

## Detailed Refactoring Plan

### Phase 1: Extract Core Systems

#### 1.1 TimelineState.ts
**Purpose**: Centralized state management
**Responsibilities**:
- View focus modes and IDs
- Zoom/pan state
- Selection and history
- Implied span visibility

```typescript
export class TimelineState {
  // View state
  private viewFocusMode: ViewFocusMode = 'now'
  private focusedInstantId: string | null = null
  private focusedSpanId: string | null = null
  
  // Selection state
  private currentSelectedInstantId: string | null = null
  private previousSelectedInstantId: string | null = null
  
  // Focus history
  private focusHistory: string[] = []
  private focusHistoryIndex: number = -1
  
  public setViewFocus(mode: ViewFocusMode, instantId?: string, spanId?: string): void
  public navigateFocusHistory(delta: -1 | 1): void
  public setSelectedInstant(id: string): void
  // ... other state management methods
}
```

#### 1.2 TimelineViewport.ts
**Purpose**: Handle viewport calculations and transformations
**Responsibilities**:
- Time-to-position conversions
- Zoom calculations
- Screen bounds checking

```typescript
export class TimelineViewport {
  constructor(
    private canvas: HTMLCanvasElement,
    private state: TimelineState
  ) {}
  
  public timeToPosition(timestamp: number): number
  public positionToTime(x: number): number
  public getVisibleTimeRange(): { start: number; end: number }
  public shouldDrawSpan(aTs: number, bTs: number): boolean
  // ... viewport methods
}
```

#### 1.3 TimelineAnimations.ts
**Purpose**: Handle all animation logic
**Responsibilities**:
- Zoom/pan animations
- Smooth transitions
- Animation state management

```typescript
export class TimelineAnimations {
  private zoomPanAnim: ZoomPanAnimation | null = null
  private zoomTargetWidth: number | null = null
  
  public startZoomPanAnimation(targetCenter: number, targetWidth: number): void
  public updateAnimations(deltaTime: number): void
  public cancelAnimations(): void
  // ... animation methods
}
```

### Phase 2: Extract Drawing System

#### 2.1 DrawingContext.ts
**Purpose**: Wrap canvas context with helper methods
**Responsibilities**:
- Canvas setup and management
- Common drawing utilities
- Text measurement

```typescript
export class DrawingContext {
  constructor(private canvas: HTMLCanvasElement) {}
  
  public clear(): void
  public setupCanvas(): void
  public measureTextWidth(font: string, text: string): number
  public drawGlow(callback: () => void, color: string, blur: number): void
  // ... drawing utilities
}
```

#### 2.2 InstantRenderer.ts
**Purpose**: Handle instant drawing logic
**Responsibilities**:
- Draw instant lines and labels
- Handle instant icons (star, trash)
- Format instant information

```typescript
export class InstantRenderer {
  constructor(
    private ctx: DrawingContext,
    private viewport: TimelineViewport
  ) {}
  
  public drawInstant(timestamp: number, label: string, format: InstantFormatInfo): void
  public drawNowInstant(): void
  public drawCursorInstant(): void
  public drawStarIcon(cx: number, cy: number, filled: boolean): void
  // ... instant drawing methods
}
```

#### 2.3 SpanRenderer.ts
**Purpose**: Handle span drawing logic
**Responsibilities**:
- Draw span visuals
- Handle span controls
- Draw implied spans

```typescript
export class SpanRenderer {
  constructor(
    private ctx: DrawingContext,
    private viewport: TimelineViewport,
    private iconRenderer: IconRenderer
  ) {}
  
  public drawSpanVisual(aTs: number, bTs: number, options: SpanOptions): void
  public drawImpliedSpans(state: TimelineState): void
  public shouldShowSpanControls(options: SpanControlOptions): boolean
  // ... span drawing methods
}
```

### Phase 3: Extract Interaction System

#### 3.1 HitTestManager.ts
**Purpose**: Handle hit testing logic
**Responsibilities**:
- Manage hit targets
- Test point intersections
- Provide interaction context

```typescript
export class HitTestManager {
  private hitTargets: HitTarget[] = []
  
  public addHitTarget(target: HitTarget): void
  public clearHitTargets(): void
  public getTargetAt(x: number, y: number): HitTarget | null
  public getOverlayElements(): OverlayElement[]
  // ... hit testing methods
}
```

#### 3.2 EventHandler.ts
**Purpose**: Process user interactions
**Responsibilities**:
- Handle click/double-click events
- Coordinate with other systems
- Trigger appropriate actions

```typescript
export class EventHandler {
  constructor(
    private state: TimelineState,
    private hitTestManager: HitTestManager,
    private animations: TimelineAnimations
  ) {}
  
  public handleClick(x: number, y: number): void
  public handleDoubleClick(x: number, y: number): void
  public handleZoom(factor: number): void
  // ... event handling methods
}
```

### Phase 4: Main Orchestrator

#### 4.1 Refactored TimelineRenderer.ts
**Purpose**: Orchestrate all systems
**Responsibilities**:
- Coordinate subsystems
- Public API
- Render loop coordination

```typescript
export class TimelineRenderer {
  private state: TimelineState
  private viewport: TimelineViewport
  private animations: TimelineAnimations
  private drawingContext: DrawingContext
  private instantRenderer: InstantRenderer
  private spanRenderer: SpanRenderer
  private tickRenderer: TickRenderer
  private hitTestManager: HitTestManager
  private eventHandler: EventHandler
  
  constructor(canvas: HTMLCanvasElement, deps?: Dependencies) {
    // Initialize all subsystems
    this.state = new TimelineState()
    this.viewport = new TimelineViewport(canvas, this.state)
    // ... initialize other systems
  }
  
  public render(): void {
    // Coordinate the rendering process
    this.animations.updateAnimations()
    this.viewport.updateViewport()
    this.drawingContext.clear()
    
    this.tickRenderer.drawTicks()
    this.instantRenderer.drawInstants()
    this.spanRenderer.drawSpans()
    
    this.hitTestManager.clearHitTargets()
    // ... coordinate all rendering
  }
  
  // Public API methods delegate to appropriate subsystems
  public handleClick(x: number, y: number): void {
    this.eventHandler.handleClick(x, y)
  }
  
  public setViewFocus(mode: ViewFocusMode, instantId?: string, spanId?: string): void {
    this.state.setViewFocus(mode, instantId, spanId)
  }
  
  // ... other public API methods
}
```

## Benefits of This Refactoring

### 1. **Single Responsibility**
- Each class has one clear purpose
- Easier to understand and maintain
- Better error isolation

### 2. **Testability**
- Individual components can be unit tested
- Mock dependencies for isolated testing
- Clear interfaces between components

### 3. **Reusability**
- Drawing components can be reused elsewhere
- Animation system can be extracted for other uses
- Hit testing logic can be shared

### 4. **Maintainability**
- Changes to drawing don't affect state management
- Animation changes don't affect interaction logic
- Easier to add new features

### 5. **Performance**
- Selective updates possible
- Better separation of concerns allows optimization
- Clearer dependency injection

## Implementation Strategy

### Phase 1: Foundation (Week 1-2)
1. Extract `TimelineState` class
2. Extract `TimelineViewport` class
3. Extract `TimelineAnimations` class
4. Update tests to use new structure

### Phase 2: Drawing System (Week 3-4)
1. Extract `DrawingContext` wrapper
2. Extract `InstantRenderer` class
3. Extract `SpanRenderer` class
4. Extract `TickRenderer` class
5. Extract `IconRenderer` class

### Phase 3: Interaction System (Week 5)
1. Extract `HitTestManager` class
2. Extract `EventHandler` class
3. Define interaction types

### Phase 4: Integration (Week 6)
1. Refactor main `TimelineRenderer` to orchestrate
2. Update all public APIs to delegate
3. Comprehensive testing
4. Performance validation

## Migration Strategy

1. **Incremental Extraction**: Extract one system at a time
2. **Maintain Public API**: Keep existing public interface during transition
3. **Test Coverage**: Ensure tests pass after each extraction
4. **Performance Monitoring**: Verify no performance regression

This refactoring will transform a 2,230-line monolith into a modular, testable, and maintainable architecture while preserving all existing functionality.
