import type { ComponentChildren } from 'preact'
import { useReveal, useReducedMotion } from '../../motion/hooks'

/**
 * Wraps content that should rise into view when scrolled to. No-JS / reduced-
 * motion / no-IntersectionObserver all resolve to immediately visible, so
 * nothing is ever trapped hidden. Use for cards and sections app-wide.
 */
export function Reveal({
  children,
  class: cls = '',
  style,
}: {
  children: ComponentChildren
  class?: string
  style?: string
}) {
  const reduced = useReducedMotion()
  const { ref, inView } = useReveal<HTMLDivElement>()
  const shown = reduced || inView
  return (
    <div ref={ref} class={`reveal${shown ? ' is-in' : ''}${cls ? ' ' + cls : ''}`} style={style}>
      {children}
    </div>
  )
}
