// Transient UI state that isn't part of the timeline model.
import { create } from 'zustand'

export type ListTab = 'instants' | 'favorites' | 'spans'

/** Which time-entry popover is open, if any. */
export type TimeInputTarget =
  /** Duration relative to Now, edited from the Cursor↔Now span. */
  | { kind: 'duration'; reference: 'now' }
  /** Duration relative to the selected instant, edited from the Selected↔Cursor span. */
  | { kind: 'duration'; reference: 'selected' }
  /** Wall-clock time, edited from the Now or Cursor time chip. */
  | { kind: 'clock'; anchor: 'now' | 'cursor' }

export interface UiState {
  listTab: ListTab
  timeInput: TimeInputTarget | null
}

export const useUi = create<UiState>(() => ({
  listTab: 'instants',
  timeInput: null,
}))

export const ui = {
  setListTab: (listTab: ListTab) => useUi.setState({ listTab }),
  openTimeInput: (timeInput: TimeInputTarget) => useUi.setState({ timeInput }),
  closeTimeInput: () => useUi.setState({ timeInput: null }),
}
