// A saved span's reading, the same on its label box (vertical) and its chip (both orientations):
// its name, then while it contains Now the time left (big, in the lane's colour) and its length
// small ("/3m"), otherwise its length, as precise as the zoom allows.
import type { ReactNode } from 'react'
import { LiveText } from '../../engine/LiveText.tsx'
import { truncateText } from '../../domain/format.ts'
import type { TimeRef } from '../../domain/spans.ts'
import { spanReadingTotal, spanReadingValue } from '../../domain/spans.ts'

export function SpanReading({ name, nameMax = 14, a, b, nameSlot, onValueDoubleClick }: {
  /** The span's name ('' for none). */
  name: string
  /** Truncate the name to this many characters (the same on label boxes and chips). */
  nameMax?: number
  a: TimeRef
  b: TimeRef
  /** Replaces the name (the rename box). */
  nameSlot?: ReactNode
  /** Double-tap on the time: type the length instead. */
  onValueDoubleClick?: () => void
}) {
  const shown = truncateText(name, nameMax)
  return (
    <>
      {nameSlot ?? (name && <span className="span-read__name" title={shown !== name ? name : undefined}>{shown}</span>)}
      <span
        className="span-read__time"
        onDoubleClick={onValueDoubleClick && (e => { e.stopPropagation(); onValueDoubleClick() })}
      >
        <LiveText className="span-read__value mono" compute={f => spanReadingValue(a, b, f)} />
        <LiveText className="span-read__total mono" compute={f => spanReadingTotal(a, b, f)} />
      </span>
    </>
  )
}
