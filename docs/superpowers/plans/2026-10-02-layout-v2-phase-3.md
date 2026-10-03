# Layout v2, Phase 3: overlap layout and clusters (brief)

> One implementer, one review. Spec: `docs/superpowers/specs/2026-10-02-layout-v2-design.md` §5.7, C1–C4, C15.
> Phases 1–2 are done (plan `2026-10-02-layout-v2-phases-1-2.md`). Pure layout is already built and tested: `src/domain/labelLayout.ts`.

**Goal:** Saved-instant chips never overlap. Lower-priority chips move to rows 2–3. Snoozes that collide with their original fold into a "⟲N" badge. Whatever still doesn't fit collapses into a "+N" chip that zooms in when tapped. Bottom lanes start below the rows actually used.

## Decisions (already made; don't reopen)

1. **Chip widths come from the DOM, not from canvas text measurement.** Each saved chip reports its width with a `ResizeObserver` into a widths map. Widths change only when content changes (renames, "9m ago" → "10m ago"), and re-running the layout then is cheap. Without `ResizeObserver` (jsdom), estimate the width as `9 × characters + 40`.
2. **Ties break by time, not by distance from the screen center.** Center distance changes on every pan frame, so equal-priority chips would swap rows mid-drag. Make `centerPos` optional in `LabelLayoutOptions`: when it's omitted, ties go to the earlier chip (`pos` ascending, then id). Update the spec's §5.7 tie rule to match.
3. **React must not see per-frame positions.** Run `layoutLabels` inside `useFrameValue`, but compare only the structural result: rows per id, `folded`, `foldCount`, and clusters as `{ id, memberIds, slot, crossOffset, topPriority }`. Positions stay out of the comparison. A cluster chip is positioned at the mean *time* of its members with `usePositionMain(ref, f => f.pos(meanTs))`. During a pure pan the result then changes only when chips enter or leave.
4. **Inputs per visible instant:**
   - `mainExtent` is the chip width.
   - `crossExtent` is 28 (the chip height).
   - `groupId` is `snoozeOriginalId`.
   - `pinned` covers focused, selected, ringing, editing and moving instants.
   - Priority: focused 0, selected 1, moving or editing 2, ringing 3, upcoming alarm 4, favorite 5, other 6.
5. **Options:**
   - `crossBudget: Infinity` (horizontal).
   - `slotGap: getTunables().chipGapPx`.
   - `maxSlots: getTunables().chipRowsMax`.
   - `cluster: { mainExtent: 46, crossExtent: 28 }`.
   - `foldBadgeExtent: 34`.
6. **Rendering:**
   - `SavedMarker` takes a `row` prop (sets `--row`) and a `foldCount` prop. With `foldCount > 0` it shows a "⟲N" badge button that zooms to fit the group.
   - A folded snooze keeps its `Marker` line (history is never hidden) but renders no chip.
   - A new `ClusterChip` shows "+N" in the most important member's accent, with 🔔 if any member has an alarm and ★ if any is a favorite. Its accessible name is "N more instants: name, name, …". A tap calls a new action, `act.zoomToTimes(ts[])`: begin a transition, cursor mode centered on the middle, width = span / 0.6, with a minimum of 2 minutes.
7. **Lane placement:** compute the layout once in `Timeline` (`useSavedLayout()`) and pass it to `SavedInstantColumns`. Pass the rows used (`max slot + 1`, at least 1) to `useBottomLanes(rowsUsed)`, so `lanesTop(rows) = chipTop + rows × chipRow + 14`.
8. **Tool strip fix (Task 6 deferred minor):** place `.tl-col__tools` absolutely to the right of the chip (`left: 100%`, margin 6px), so a selected chip stays centered on its line and the layout measures the chip alone.

## Files

- Modify `src/domain/labelLayout.ts` and its test: `centerPos` becomes optional, with time order for ties. Add a test proving the result is unchanged by panning (all `pos` shifted).
- Create `src/components/timeline/savedLayout.ts`:
  - A pure `layoutItems(...)` that builds `LabelItem[]` from instants, view state, ringing ids and widths.
  - `useSavedLayout()`.
  - `useChipWidth(ref, id)`: a `ResizeObserver` writing into a module-level widths store, a small zustand store keyed by id.
  - Tests for `layoutItems` priorities and pinning.
- Modify:
  - `InstantColumns.tsx`: the `row` and `foldCount` props, rendering for folded markers, and wiring `useChipWidth`.
  - `ClusterChip.tsx` (new).
  - `Timeline.tsx`.
  - `useBottomLanes.ts`.
  - `geometry.ts`: `lanesTop(rows)`.
  - `store/actions.ts`: `zoomToTimes`.
  - `timeline.css`: cluster chip, fold badge, tools placement.
- Tests (RTL) in `InstantColumns.test.tsx` or a new `savedLayout.test.ts`:
  - Two overlapping chips get rows 0 and 1.
  - With `chipRowsMax` 1, overflow renders a "+N" chip, and tapping it calls `zoomToTimes` (the view enters cursor mode with a narrower width).
  - A snooze next to its original renders the "⟲1" badge and no separate chip, but still renders its line.

## Done when

The suite, `tsc -b` and `eslint` are green. In a browser with the seeded cooking session, no two chips overlap at the default zoom; zooming out first stacks rows, then shows "+N" chips; tapping "+N" zooms in. Commit as "Overlap layout: rows, snooze folding and +N clusters".
