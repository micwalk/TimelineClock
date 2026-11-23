// Todo marks drawn as icons (they scale and take the theme's colour, unlike the text glyphs in
// config/labels MARKS, which stay for names and text): a stopwatch for a todo's duration, and the
// todo's box: open (empty), done (checked), passed (an arrow on), dropped (a dash).
import type { SVGProps } from 'react'

/** A stopwatch: how long a todo takes ("⏱ 20m"). */
export function StopwatchIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" {...props}>
      <circle cx="10" cy="11.4" r="6.1" />
      <path d="M8 2.4h4M10 2.6v2.7M15 5.3l1.3-1.3M10 11.4V8.2" />
    </svg>
  )
}

export type TodoBoxState = 'open' | 'done' | 'passed' | 'dropped'

/** A todo's box: empty while open, checked once done, an arrow when passed, a dash when dropped. */
export function TodoBoxIcon({ state = 'open', ...props }: { state?: TodoBoxState } & SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" {...props}>
      <rect x="2.6" y="2.6" width="14.8" height="14.8" rx="3.6" />
      {state === 'done' && <path d="M6 10.4l2.8 2.8 5.4-6" strokeWidth={2.6} />}
      {state === 'passed' && <path d="M6.2 10h7.2M10.8 7.2l2.8 2.8-2.8 2.8" />}
      {state === 'dropped' && <path d="M6.5 10h7" />}
    </svg>
  )
}

/** Not a todo (un-todo): the box struck through. */
export function NotTodoIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" {...props}>
      <rect x="2.6" y="2.6" width="14.8" height="14.8" rx="3.6" />
      <path d="M1.6 18.4L18.4 1.6" />
    </svg>
  )
}

/** The Todo button's icon: a checked box. */
export const TodoIcon = (props: SVGProps<SVGSVGElement>) => <TodoBoxIcon state="done" {...props} />
