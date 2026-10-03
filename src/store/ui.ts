// Transient UI state that isn't part of the timeline model.
import { create } from 'zustand'

export type ListTab = 'instants' | 'favorites' | 'spans'

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

export interface UiState {
  listTab: ListTab
  timeInput: TimeInputTarget | null
  tagMenu: TagMenu | null
}

export const useUi = create<UiState>(() => ({
  listTab: 'instants',
  timeInput: null,
  tagMenu: null,
}))

export const ui = {
  setListTab: (listTab: ListTab) => useUi.setState({ listTab }),
  openTimeInput: (timeInput: TimeInputTarget) => useUi.setState({ timeInput, tagMenu: null }),
  closeTimeInput: () => useUi.setState({ timeInput: null }),
  toggleTagMenu: (which: TagMenu) => useUi.setState(s => ({ tagMenu: s.tagMenu === which ? null : which, timeInput: null })),
  closeTagMenu: () => useUi.setState({ tagMenu: null }),
}
