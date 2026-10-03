import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { ArrowTag } from './ArrowTag.tsx'
import { useLayout } from '../../store/layout.ts'
import { verticalTagMaxWidth } from './geometry.ts'

const tag = () => (
  <ArrowTag hint="h" slot={0} onClick={() => {}} onDoubleClick={() => {}} menuOpen={false} onDismissMenu={() => {}}>12:58:29a</ArrowTag>
)

beforeEach(() => useLayout.setState({ orientation: 'horizontal', dir: 1 }))

describe('ArrowTag box width', () => {
  it('is capped by the vertical geometry so it fits left of the axis', () => {
    useLayout.setState({ orientation: 'vertical' })
    render(tag())
    expect(screen.getByRole('button').style.maxWidth).toBe(`${verticalTagMaxWidth()}px`)
  })

  it('is uncapped when horizontal', () => {
    render(tag())
    expect(screen.getByRole('button').style.maxWidth).toBe('')
  })
})
