// A control-bar button. `sub` adds a small second line (a live time under NOW or the stopwatch).
import type { ComponentType, ReactNode, SVGProps } from 'react'

export type Icon = ComponentType<SVGProps<SVGSVGElement>>

export function CtlButton({ icon: Icon, children, sub, onClick, variant, label, title, className, ...rest }: {
  icon?: Icon
  children?: ReactNode
  sub?: ReactNode
  onClick: () => void
  variant?: 'now' | 'danger'
  label?: string
} & Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'onClick'>) {
  const main = (
    <>
      {Icon && <Icon aria-hidden className="ctl-btn__icon" />}
      {children && <span className="ctl-btn__text">{children}</span>}
    </>
  )
  return (
    <button
      type="button"
      className={`ctl-btn glow-box glow-text${variant ? ` ctl-btn--${variant}` : ''}${sub ? ' ctl-btn--stack' : ''}${className ? ` ${className}` : ''}`}
      aria-label={label}
      title={title ?? label}
      onClick={onClick}
      {...rest}
    >
      {sub ? <span className="ctl-btn__main">{main}</span> : main}
      {sub && <span className="ctl-btn__sub mono" aria-hidden>{sub}</span>}
    </button>
  )
}
