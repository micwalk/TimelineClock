import type { ComponentType, CSSProperties, SVGProps } from 'react'

type Icon = ComponentType<SVGProps<SVGSVGElement>>

interface IconButtonProps {
  icon: Icon
  label: string
  onClick: () => void
  /** CSS color for the icon and its glow. */
  color?: string
  bare?: boolean
  className?: string
  pressed?: boolean
}

export function IconButton({ icon: Icon, label, onClick, color, bare, className = '', pressed }: IconButtonProps) {
  return (
    <button
      type="button"
      className={`icon-btn${bare ? ' is-bare' : ''} ${className}`}
      style={color ? ({ '--accent': color } as CSSProperties) : undefined}
      aria-label={label}
      aria-pressed={pressed}
      title={label}
      onClick={e => {
        e.stopPropagation()
        onClick()
      }}
      onDoubleClick={e => e.stopPropagation()}
    >
      <Icon aria-hidden />
    </button>
  )
}
