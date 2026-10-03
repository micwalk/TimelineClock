// The tools menu that opens from a live tag. Choosing an item closes the menu.
import type { ComponentType, SVGProps } from 'react'

export interface TagMenuItem {
  label: string
  icon: ComponentType<SVGProps<SVGSVGElement>>
  onSelect: () => void
}

const stop = (e: { stopPropagation: () => void }) => e.stopPropagation()

export function TagMenu({ label, items, onClose }: { label: string; items: TagMenuItem[]; onClose: () => void }) {
  return (
    <div className="menu tl-tag__menu glow-box" role="menu" aria-label={label} data-no-pan onPointerDown={stop} onClick={stop} onDoubleClick={stop}>
      {items.map(item => (
        <button
          key={item.label}
          type="button"
          role="menuitem"
          className="menu__item tl-tag__menu-item"
          onClick={() => { onClose(); item.onSelect() }}
        >
          <item.icon aria-hidden className="tl-tag__menu-icon" />
          {item.label}
        </button>
      ))}
    </div>
  )
}
