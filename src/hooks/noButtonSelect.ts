// A long press on a button never selects its text or opens the phone's callout (Android's WebView
// starts a selection on a text node that changes every second, the NOW clock's, past user-select).
// CSS does most of it (theme.css); this cancels any selection or callout that still starts
// inside a button. Typing boxes inside a button-like chip (a name being edited) stay selectable.

const BUTTONISH = 'button, [role="button"], [role="tab"], [role="radio"], [role="menuitem"], [role="switch"]'
const EDITABLE = 'input, textarea, select, [contenteditable=""], [contenteditable="true"]'

/** Whether a selection or callout starting at `target` should be cancelled: inside a button, not in a box to type in. */
export function isButtonText(target: EventTarget | null): boolean {
  const el = target instanceof Element ? target : target instanceof Node ? target.parentElement : null
  if (!el || el.closest(EDITABLE)) return false
  return !!el.closest(BUTTONISH)
}

let installed = false

export function startNoButtonSelect() {
  if (installed || typeof document === 'undefined') return
  installed = true
  const cancel = (e: Event) => { if (isButtonText(e.target)) e.preventDefault() }
  document.addEventListener('selectstart', cancel, true)
  document.addEventListener('contextmenu', cancel, true)
}
