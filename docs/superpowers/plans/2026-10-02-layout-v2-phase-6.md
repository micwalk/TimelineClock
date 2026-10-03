# Layout v2, Phase 6: the Agenda dock and drawer (brief)

> Spec: `docs/superpowers/specs/2026-10-02-layout-v2-design.md`. Read §2 (Agenda), §5.3 (`resolveAgendaPlacement`), §5.10, and C6, C11, C17.
> Already built and tested:
> - `domain/layoutMode.ts` `resolveAgendaPlacement(orientation, setting, override, shape, w, h, limits)` → `'bottom' | 'side' | 'drawer'`.
> - Tunables `sideDockMinWidthPx` (900) and `bottomDockMinHeightPx` (600).
> - `useLayout` (orientation, dir, shape, override) with `startLayoutTracking()`.

1. **Rename** `components/panels/ListPanel.tsx` to `Agenda.tsx`, with the component renamed to `Agenda`. Update imports, `docs/ARCHITECTURE.md` and the `AGENTS.md`/`.cursorrules` mentions. Rename CSS classes only where you touch them.
2. **Setting:** `agendaPlacement: 'auto' | 'docked' | 'drawer'`, default `'auto'`, persisted. Add a Settings > Timeline select: "Agenda: Auto / Docked / Drawer".
3. **Layout store:**
   - Add `agendaPlacement: AgendaPlacement` and `agendaOverride: AgendaOverride | null`, resolved alongside the orientation (same recompute path, including resize and settings changes).
   - Add `act.toggleAgendaDock()`:
     - It sets `agendaOverride = { placement: current === 'drawer' ? 'docked' : 'drawer', shape }`.
     - If the result equals what the settings alone give, it clears the override instead.
     - The override lapses when the shape changes, as the rotate override does.
4. **App shell** (`App.tsx` and `panels.css`): `.app` gets `data-agenda="bottom|side|drawer"`.
   - **bottom:** today's column layout.
   - **side:** `.app` becomes a row. The left column holds the timeline and the control bar; the right holds the Agenda at a fixed width token `--agenda-width: 360px` and full height, scrolling.
   - **drawer:**
     - The Agenda is portaled into a drawer that slides in from the left, `width: min(85vw, 400px)`, with a scrim behind it.
     - `role="dialog"`, `aria-modal="true"`, `aria-label="Agenda"`.
     - Esc or a scrim tap closes it. Focus moves into the drawer on open and returns to ☰ on close.
     - Open state lives in `useUi`: `agendaOpen`, with `ui.openAgenda` and `ui.closeAgenda`.
     - With prefers-reduced-motion, it opens without the slide.
   - Remove phase 4's 30vh Agenda cap for vertical. In vertical, phones now use the drawer and wide windows use the side dock.
5. **☰ button** (`components/panels/AgendaButton.tsx`):
   - Shown only when the placement is drawer.
   - 40px, glowing, Heroicons `Bars3Icon`, `aria-label="Open Agenda"`, `aria-expanded`, `data-no-pan`.
   - Placed in the timeline's date row, before the date: top-left in both orientations (C17).
   - Shift the date label right so they don't overlap.
6. **Dock/drawer toggle** in the Agenda's tab bar, next to the Settings gear:
   - An icon button. Heroicons `ArrowsPointingOutIcon` when docked ("Undock Agenda") and `ArrowsPointingInIcon` in the drawer ("Dock Agenda").
   - Calls `act.toggleAgendaDock`.
   - Hidden when docking isn't possible on this screen, i.e. when `resolveAgendaPlacement` with `'docked'` still gives `'drawer'`.
7. **Tests:**
   - Store: phone portrait gives the drawer, a wide window in vertical gives side, horizontal at 1400×900 gives bottom, the toggle sets and clears the override, and a shape change clears it.
   - RTL:
     - With the drawer placement, ☰ opens the dialog.
     - Esc and a scrim click close it, and focus returns to ☰.
     - With a bottom placement there is no ☰.
     - The toggle switches placement.
   - Settings persistence.

## Done when

The suite, `tsc -b` and `eslint` are green. In the browser:
- At 390×844 (vertical) the Agenda is behind ☰ as a drawer and the timeline gets the full height.
- At 1400×900 horizontal it's the bottom dock, as today.
- At 1400×900 after rotating to vertical, it's docked at the side.
- Phone landscape (844×390) gives the drawer.

Commit as "Agenda: bottom dock, side dock or drawer".
