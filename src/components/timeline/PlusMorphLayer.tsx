// The shapes the Cursor tag's ＋ morphs through (plusMorph.ts draws them), once per timeline:
// the shell it grows into a new chip with, and the metaball it flows into a chip with.
import { useEffect, useLayoutEffect, useRef } from 'react'
import { PlusIcon } from '@heroicons/react/20/solid'
import { attachMorphs, watchNaming } from './plusMorph.ts'

/** The ＋ glyph drawn in the blob, centred on the origin (a 20px icon). */
const GLYPH = 'M -0.9 -6 h 1.8 v 5.1 h 5.1 v 1.8 h -5.1 v 5.1 h -1.8 v -5.1 h -5.1 v -1.8 h 5.1 Z'

export function PlusMorphLayer() {
  const shellRef = useRef<HTMLDivElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  useLayoutEffect(() => {
    const shell = shellRef.current
    const svg = svgRef.current
    if (!shell || !svg) return
    const strokes = [...svg.querySelectorAll<SVGPathElement>('.tl-blob__stroke path')]
    const fills = [...svg.querySelectorAll<SVGPathElement>('.tl-blob__fill path')]
    const glyph = svg.querySelector<SVGGElement>('.tl-blob__glyph')!
    return attachMorphs(shell, { svg, strokes, fills, glyph })
  }, [])
  useEffect(() => watchNaming(), [])
  return (
    <>
      <svg ref={svgRef} className="tl-blob" aria-hidden>
        <g className="tl-blob__stroke"><path /><path /><path /></g>
        <g className="tl-blob__fill"><path /><path /><path /></g>
        <g className="tl-blob__glyph"><path d={GLYPH} /></g>
      </svg>
      <div ref={shellRef} className="tl-morph glow-box" aria-hidden>
        <PlusIcon />
      </div>
    </>
  )
}
