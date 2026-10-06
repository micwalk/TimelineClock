// Inside the Android app: a short log of what the page did with the native side, plus page
// errors and stalls, kept in localStorage so it survives a restart. Settings copies it
// together with the native log (Diag.java) to report a problem (see nativeApp diagnosticsText).

const KEY = 'timeline.diag.v1'
const MAX_LINES = 200
/** A timer running this late means the page was stuck (or the app was in the background). */
const STALL_MS = 3000

function read(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? '[]')
    return Array.isArray(v) ? v.filter((l): l is string => typeof l === 'string') : []
  } catch {
    return []
  }
}

const stamp = (d = new Date()) =>
  `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${d.toTimeString().slice(0, 8)}.${String(d.getMilliseconds()).padStart(3, '0')}`

/** Adds a line. Never throws. */
export function diag(message: string) {
  try {
    const lines = read()
    lines.push(`${stamp()} ${message}`)
    localStorage.setItem(KEY, JSON.stringify(lines.slice(-MAX_LINES)))
  } catch {
    // Storage full or unavailable: the log is best effort.
  }
}

export const pageLog = (): string[] => read()

export function clearPageLog() {
  try { localStorage.removeItem(KEY) } catch { /* best effort */ }
}

/** Times a native call; slow ones (2 s or more) and failures go in the log. */
export async function timed<T>(what: string, call: Promise<T>): Promise<T> {
  const t0 = performance.now()
  try {
    return await call
  } catch (err) {
    diag(`${what} failed: ${String(err)}`)
    throw err
  } finally {
    const ms = Math.round(performance.now() - t0)
    if (ms >= 2000) diag(`${what} took ${ms} ms`)
  }
}

let watching = false

/** Logs page errors, long tasks and stalls (a 1 s timer firing 3 s late while the page is visible). */
export function watchPage() {
  if (watching) return
  watching = true
  window.addEventListener('error', e => diag(`page error: ${e.message} (${e.filename}:${e.lineno})`))
  window.addEventListener('unhandledrejection', e => diag(`unhandled rejection: ${String(e.reason)}`))
  try {
    new PerformanceObserver(list => {
      for (const t of list.getEntries()) if (t.duration >= 1000) diag(`long task ${Math.round(t.duration)} ms`)
    }).observe({ type: 'longtask', buffered: false })
  } catch {
    // Long tasks aren't reported here.
  }
  let last = performance.now()
  setInterval(() => {
    const now = performance.now()
    if (now - last >= 1000 + STALL_MS && document.visibilityState === 'visible') diag(`page stalled ${Math.round(now - last - 1000)} ms`)
    last = now
  }, 1000)
}
