// Transient UI state that isn't part of the timeline model.
import { create } from 'zustand'

export type ListTab = 'instants' | 'favorites' | 'todos' | 'spans' | 'alarms' | 'groups'

/** Which time-entry popover is open, if any. */
export type TimeInputTarget =
  /** Cursor offset from Now, from the Cursor tag's tools. */
  | { kind: 'duration'; reference: 'now' }
  /** Cursor offset from the selected instant, from the Cursor tag's tools. */
  | { kind: 'duration'; reference: 'selected' }
  /** Wall-clock time for the cursor, from the Now or Cursor tag's tools. */
  | { kind: 'clock'; anchor: 'now' | 'cursor' }

/** A live tag whose tools menu is open. */
export type TagMenu = 'now' | 'cursor'

/**
 * The Cursor tag's ＋ growing into a new instant's chip (components/timeline/plusMorph): the
 * chip shows once the ＋ arrives.
 */
export interface PlusMorph { id: string; phase: 'in' }

/** A part of Settings that can be opened from elsewhere (its section gets `data-settings="<name>"`). */
export type SettingsSection = 'sounds'

export interface UiState {
  listTab: ListTab
  /** The group whose zoom strip is open in the Groups tab. */
  groupOpen: string | null
  /** The instant whose Visibility is open under its Agenda row. */
  visibilityOpen: string | null
  timeInput: TimeInputTarget | null
  tagMenu: TagMenu | null
  /** The live lane (by key) whose chip was tapped: its tools show until the next outside tap. */
  laneTools: string | null
  /** The Agenda drawer (only meaningful while the Agenda is placed in the drawer). */
  agendaOpen: boolean
  /** The instant just dropped; its chip pulses once, then this clears. */
  droppedId: string | null
  /** The Timer button's length picker (also opened by T). */
  timerMenuOpen: boolean
  /** The Alarm button's picker (also opened by L, and from the Alarms tab). */
  alarmMenuOpen: boolean
  /** Opened from the Alarms tab (a sheet on every screen, not a menu from the button). */
  alarmMenuFromList: boolean
  /** The series the picker edits (from the Alarms tab), or null for a new alarm. */
  alarmEditSeries: string | null
  /** The control bar's clock: its time box (go to a typed time; also opened by G). */
  jumpOpen: boolean
  /** The Help / About dialog. */
  helpOpen: boolean
  /** Settings was asked to open at this section (SettingsPanel opens it and clears this). */
  settingsRequest: SettingsSection | null
  plusMorph: PlusMorph | null
  /** The Cursor tag's ＋ is away: inside the chip of the instant the cursor is on, or on its way. */
  plusHidden: boolean
  /** The Cursor tag is folded into its arrowhead and its line hidden, for looking around. */
  cursorHidden: boolean
  /** The alarm (by id) whose bell was tapped: its tools show until the next outside tap. */
  selectedBell: string | null
  /** The bell being dragged (its alarm's id): it follows the pointer (timeline/bellDrag). */
  draggingBell: string | null
  /** An occurrence of a repeating series just edited on its own: its chip offers "Apply to all future" for a while. */
  seriesHint: string | null
  /** The todo capture box (N, or the Todos tab's ＋): a name and Enter, over whatever is on screen. */
  captureOpen: boolean
  /**
   * A todo just done: the ✓ instant (its chip flares, sparks fly from it) and the todo (its row
   * flares). `n` tells one celebration from the next.
   */
  celebrating: { instantId: string; todoId: string; n: number } | null
  /** A todo to find in the Todos tab (a long-press on its chip's box): its row scrolls into view and lights up. */
  foundTodo: { id: string; n: number } | null
  /** A short note over the timeline with one choice (components/common/Toast); gone by itself after TOAST_MS. */
  toast: Toast | null
}

/**
 * What a toast says, and its one choice: "Laundry is back on the list · Delete todo". `n` tells
 * one from the next. (Phase 2a's Undo, docs/prd_todos_phase2.md, is meant to speak through it.)
 */
export interface Toast {
  n: number
  text: string
  action?: { label: string; danger?: boolean; run: () => void }
}

export const useUi = create<UiState>(() => ({
  listTab: 'instants',
  groupOpen: null,
  visibilityOpen: null,
  timeInput: null,
  tagMenu: null,
  laneTools: null,
  agendaOpen: false,
  droppedId: null,
  timerMenuOpen: false,
  alarmMenuOpen: false,
  jumpOpen: false,
  alarmMenuFromList: false,
  alarmEditSeries: null,
  helpOpen: false,
  settingsRequest: null,
  plusMorph: null,
  plusHidden: false,
  cursorHidden: false,
  selectedBell: null,
  draggingBell: null,
  seriesHint: null,
  captureOpen: false,
  celebrating: null,
  foundTodo: null,
  toast: null,
}))

/** How long a toast stays. */
export const TOAST_MS = 6000
let toastTimer: ReturnType<typeof setTimeout> | null = null
let toasts = 0

/** How long a found todo's row stays lit. */
export const FOUND_MS = 1600
let foundTimer: ReturnType<typeof setTimeout> | null = null
let founds = 0

/** How long a Done's celebration lasts (its glow; the sparks have their own tunable). */
export const CELEBRATE_MS = 1600
let celebrateTimer: ReturnType<typeof setTimeout> | null = null
let celebrations = 0

/** How long an edited occurrence offers "Apply to all future". */
export const SERIES_HINT_MS = 8000
let seriesHintTimer: ReturnType<typeof setTimeout> | null = null

export const DROP_HIGHLIGHT_MS = 900
let dropTimer: ReturnType<typeof setTimeout> | null = null

export const ui = {
  setListTab: (listTab: ListTab) => useUi.setState({ listTab }),
  setGroupOpen: (groupOpen: string | null) => useUi.setState({ groupOpen }),
  setVisibilityOpen: (visibilityOpen: string | null) => useUi.setState({ visibilityOpen }),
  openTimeInput: (timeInput: TimeInputTarget) => useUi.setState({ timeInput, tagMenu: null }),
  closeTimeInput: () => useUi.setState({ timeInput: null }),
  toggleTagMenu: (which: TagMenu) => useUi.setState(s => ({ tagMenu: s.tagMenu === which ? null : which, timeInput: null })),
  openAgenda: () => useUi.setState({ agendaOpen: true }),
  closeAgenda: () => useUi.setState({ agendaOpen: false }),
  openHelp: () => useUi.setState({ helpOpen: true }),
  closeHelp: () => useUi.setState({ helpOpen: false }),
  /** Opens Settings at `section`, opening the Agenda drawer first when the gear is in it. */
  openSettings: (section: SettingsSection) => useUi.setState({ settingsRequest: section, agendaOpen: true }),
  clearSettingsRequest: () => useUi.setState({ settingsRequest: null }),
  toggleHelp: () => useUi.setState(s => ({ helpOpen: !s.helpOpen })),
  markDropped(id: string) {
    if (dropTimer) clearTimeout(dropTimer)
    useUi.setState({ droppedId: id })
    dropTimer = setTimeout(() => { dropTimer = null; useUi.setState(s => (s.droppedId === id ? { droppedId: null } : s)) }, DROP_HIGHLIGHT_MS)
  },
  closeTagMenu: () => useUi.setState({ tagMenu: null }),
  setTimerMenu: (timerMenuOpen: boolean) => useUi.setState({ timerMenuOpen }),
  setJump: (jumpOpen: boolean) => useUi.setState({ jumpOpen }),
  setAlarmMenu: (alarmMenuOpen: boolean) => useUi.setState({ alarmMenuOpen, alarmMenuFromList: false, alarmEditSeries: null }),
  /** From the Alarms tab: a new alarm, or editing a series. */
  openAlarmEditor: (seriesId: string | null) => useUi.setState({ alarmMenuOpen: true, alarmMenuFromList: true, alarmEditSeries: seriesId }),
  toggleLaneTools: (key: string) => useUi.setState(s => ({ laneTools: s.laneTools === key ? null : key })),
  closeLaneTools: () => useUi.setState({ laneTools: null }),
  setPlusMorph: (plusMorph: PlusMorph | null) => useUi.setState({ plusMorph }),
  setPlusHidden: (plusHidden: boolean) => useUi.setState({ plusHidden }),
  selectBell: (selectedBell: string | null) => useUi.setState({ selectedBell }),
  setDraggingBell: (draggingBell: string | null) => useUi.setState({ draggingBell }),
  setCapture: (captureOpen: boolean) => useUi.setState({ captureOpen }),
  celebrate(instantId: string, todoId: string) {
    if (celebrateTimer) clearTimeout(celebrateTimer)
    const n = ++celebrations
    useUi.setState({ celebrating: { instantId, todoId, n } })
    celebrateTimer = setTimeout(() => { celebrateTimer = null; useUi.setState(s => (s.celebrating?.n === n ? { celebrating: null } : s)) }, CELEBRATE_MS)
  },
  findTodo(id: string) {
    if (foundTimer) clearTimeout(foundTimer)
    const n = ++founds
    useUi.setState({ foundTodo: { id, n } })
    foundTimer = setTimeout(() => { foundTimer = null; useUi.setState(s => (s.foundTodo?.n === n ? { foundTodo: null } : s)) }, FOUND_MS)
  },
  showToast(text: string, action?: Toast['action']) {
    if (toastTimer) clearTimeout(toastTimer)
    const n = ++toasts
    useUi.setState({ toast: { n, text, ...(action ? { action } : {}) } })
    toastTimer = setTimeout(() => { toastTimer = null; useUi.setState(s => (s.toast?.n === n ? { toast: null } : s)) }, TOAST_MS)
  },
  closeToast() {
    if (toastTimer) clearTimeout(toastTimer)
    toastTimer = null
    useUi.setState({ toast: null })
  },
  showSeriesHint(id: string | null) {
    if (seriesHintTimer) clearTimeout(seriesHintTimer)
    seriesHintTimer = null
    useUi.setState({ seriesHint: id })
    if (id) seriesHintTimer = setTimeout(() => { seriesHintTimer = null; useUi.setState(s => (s.seriesHint === id ? { seriesHint: null } : s)) }, SERIES_HINT_MS)
  },
}
