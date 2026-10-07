import { useRef } from 'react'
import { render } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import type { Frame } from '../../engine/viewportEngine.ts'
import { engine } from '../../engine/viewportEngine.ts'
import { useChipPlacement } from './chipPlacement.ts'
import { useSavedLayoutSource } from './savedLayout.ts'
import { entities, useEntities } from '../../store/entities.ts'
import { initialViewState, useView } from '../../store/view.ts'
import { useLayout } from '../../store/layout.ts'
import { useSettings } from '../../store/settings.ts'
import { MINUTE } from '../../domain/time.ts'
import { GEOMETRY } from './geometry.ts'

beforeEach(() => {
  useSettings.setState({ tunables: {} })
  useEntities.setState({ instants: [], spans: [] })
  useView.setState(initialViewState())
  useLayout.setState({ orientation: 'horizontal', dir: 1 })
})

function Probe({ id, base }: { id: string; base: (f: Frame) => number }) {
  useSavedLayoutSource()
  const ref = useRef<HTMLDivElement>(null)
  useChipPlacement(ref, id, false, base)
  return <div ref={ref} data-testid={id} />
}

const xy = (el: HTMLElement) => /translate3d\(([-\d.]+)px,([-\d.]+)px/.exec(el.style.transform)!.slice(1).map(Number)

describe('useChipPlacement', () => {
  it('puts a chip at its line plus its layout row (horizontal: rows go down)', () => {
    const t = engine.getFrame().now - 20 * MINUTE
    const a = entities.createInstant(t, 'Rice')
    const b = entities.createInstant(t + 1000, 'Beans')
    const { getByTestId } = render(<><Probe id={a} base={f => f.pos(t)} /><Probe id={b} base={f => f.pos(t + 1000)} /></>)
    const rows = [xy(getByTestId(a))[1], xy(getByTestId(b))[1]].sort((p, q) => p - q)
    expect(rows).toEqual([0, GEOMETRY.chipRow])
    expect(xy(getByTestId(a))[0]).toBeCloseTo(engine.getFrame().pos(t), 1)
  })
})
