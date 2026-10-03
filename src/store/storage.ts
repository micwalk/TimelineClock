// Tiny localStorage helpers. All access is guarded: storage can be unavailable
// (private mode, quota) and the app must keep working without it.

export function loadJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

export function saveJson(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // ignore: persistence is best-effort
  }
}

/** Debounced saver that also flushes when the page is hidden or unloaded. */
export function debouncedSaver(key: string, delayMs: number) {
  let timer: ReturnType<typeof setTimeout> | null = null
  let pending: unknown = undefined
  let hasPending = false
  const flush = () => {
    if (timer) clearTimeout(timer)
    timer = null
    if (hasPending) {
      hasPending = false
      saveJson(key, pending)
    }
  }
  if (typeof window !== 'undefined') {
    window.addEventListener('pagehide', flush)
    document.addEventListener('visibilitychange', () => { if (document.hidden) flush() })
  }
  return {
    save(value: unknown) {
      pending = value
      hasPending = true
      if (timer) clearTimeout(timer)
      timer = setTimeout(flush, delayMs)
    },
    flush,
  }
}
