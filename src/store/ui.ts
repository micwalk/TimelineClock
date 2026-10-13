// Transient UI state that isn't part of the timeline model.
import { create } from 'zustand'

export type ListTab = 'instants' | 'favorites' | 'spans' | 'alarms'

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

export interface UiState {
  listTab: ListTab
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
  /** The Alarm button's picker (also opened by L). */
  alarmMenuOpen: boolean
  /** The Help / About dialog. */
  helpOpen: boolean
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
}

export const useUi = create<UiState>(() => ({
  listTab: 'instants',
  timeInput: null,
  tagMenu: null,
  laneTools: null,
  agendaOpen: false,
  droppedId: null,
  timerMenuOpen: false,
  alarmMenuOpen: false,
  helpOpen: false,
  plusMorph: null,
  plusHidden: false,
  cursorHidden: false,
  selectedBell: null,
  draggingBell: null,
  seriesHint: null,
}))

/** How long an edited occurrence offers "Apply to all future". */
export const SERIES_HINT_MS = 8000
let seriesHintTimer: ReturnType<typeof setTimeout> | null = null

export const DROP_HIGHLIGHT_MS = 900
let dropTimer: ReturnType<typeof setTimeout> | null = null

export const ui = {
  setListTab: (listTab: ListTab) => useUi.setState({ listTab }),
  openTimeInput: (timeInput: TimeInputTarget) => useUi.setState({ timeInput, tagMenu: null }),
  closeTimeInput: () => useUi.setState({ timeInput: null }),
  toggleTagMenu: (which: TagMenu) => useUi.setState(s => ({ tagMenu: s.tagMenu === which ? null : which, timeInput: null })),
  openAgenda: () => useUi.setState({ agendaOpen: true }),
  closeAgenda: () => useUi.setState({ agendaOpen: false }),
  openHelp: () => useUi.setState({ helpOpen: true }),
  closeHelp: () => useUi.setState({ helpOpen: false }),
  toggleHelp: () => useUi.setState(s => ({ helpOpen: !s.helpOpen })),
  markDropped(id: string) {
    if (dropTimer) clearTimeout(dropTimer)
    useUi.setState({ droppedId: id })
    dropTimer = setTimeout(() => { dropTimer = null; useUi.setState(s => (s.droppedId === id ? { droppedId: null } : s)) }, DROP_HIGHLIGHT_MS)
  },
  closeTagMenu: () => useUi.setState({ tagMenu: null }),
  setTimerMenu: (timerMenuOpen: boolean) => useUi.setState({ timerMenuOpen }),
  setAlarmMenu: (alarmMenuOpen: boolean) => useUi.setState({ alarmMenuOpen }),
  toggleLaneTools: (key: string) => useUi.setState(s => ({ laneTools: s.laneTools === key ? null : key })),
  closeLaneTools: () => useUi.setState({ laneTools: null }),
  setPlusMorph: (plusMorph: PlusMorph | null) => useUi.setState({ plusMorph }),
  setPlusHidden: (plusHidden: boolean) => useUi.setState({ plusHidden }),
  selectBell: (selectedBell: string | null) => useUi.setState({ selectedBell }),
  setDraggingBell: (draggingBell: string | null) => useUi.setState({ draggingBell }),
  showSeriesHint(id: string | null) {
    if (seriesHintTimer) clearTimeout(seriesHintTimer)
    seriesHintTimer = null
    useUi.setState({ seriesHint: id })
    if (id) seriesHintTimer = setTimeout(() => { seriesHintTimer = null; useUi.setState(s => (s.seriesHint === id ? { seriesHint: null } : s)) }, SERIES_HINT_MS)
  },
}
