// The shell the Cursor tag's ＋ morphs through (plusMorph.ts draws it), once per timeline.
import { useEffect, useLayoutEffect, useRef } from 'react'
import { PlusIcon } from '@heroicons/react/20/solid'
import { attachShell, watchNaming } from './plusMorph.ts'

export function PlusMorphLayer() {
  const ref = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => (ref.current ? attachShell(ref.current) : undefined), [])
  useEffect(() => watchNaming(), [])
  return (
    <div ref={ref} className="tl-morph glow-box" aria-hidden>
      <PlusIcon />
    </div>
  )
}
