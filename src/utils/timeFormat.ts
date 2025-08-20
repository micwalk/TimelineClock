export function formatTimeString12h(timestamp: number): string {
  const d = new Date(timestamp)
  const h = d.getHours()
  const m = d.getMinutes()
  const s = d.getSeconds()
  const displayHour = h === 0 ? 12 : h > 12 ? h - 12 : h
  const ampm = h >= 12 ? 'PM' : 'AM'
  return `${displayHour.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')} ${ampm}`
}

export function formatDurationHuman(fromTs: number, toTs: number): { text: string; sign: 1 | -1 } {
  const diffMs = toTs - fromTs
  const sign: 1 | -1 = diffMs >= 0 ? 1 : -1
  let remaining = Math.abs(diffMs)
  const msPer = {
    year: 365 * 24 * 60 * 60 * 1000,
    month: 30 * 24 * 60 * 60 * 1000,
    week: 7 * 24 * 60 * 60 * 1000,
    day: 24 * 60 * 60 * 1000,
    hour: 60 * 60 * 1000,
    minute: 60 * 1000,
    second: 1000,
  }
  const parts: Array<{ n: number; label: string }> = []
  const push = (n: number, label: string) => parts.push({ n, label })
  const years = Math.floor(remaining / msPer.year); remaining -= years * msPer.year; push(years, 'year')
  const days = Math.floor(remaining / msPer.day); remaining -= days * msPer.day; push(days, 'day')
  const hours = Math.floor(remaining / msPer.hour); remaining -= hours * msPer.hour; push(hours, 'hour')
  const minutes = Math.floor(remaining / msPer.minute); remaining -= minutes * msPer.minute; push(minutes, 'minute')
  const seconds = Math.floor(remaining / msPer.second); push(seconds, 'second')

  // Pick at least two units
  let firstIdx = parts.findIndex(p => p.n > 0)
  if (firstIdx === -1) firstIdx = parts.length - 1 // all zero → seconds
  const secondIdx = Math.min(parts.length - 1, firstIdx + 1)
  const a = parts[firstIdx]
  const b = parts[secondIdx]
  const fmt = (p: { n: number; label: string }) => `${p.n} ${p.label}${p.n !== 1 ? 's' : ''}`
  const summary = `${fmt(a)} ${fmt(b)}`
  const suffix = sign < 0 ? 'ago' : 'from now'
  return { text: `${summary} ${suffix}`, sign }
}


