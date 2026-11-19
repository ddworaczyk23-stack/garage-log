import type { ComponentChildren } from 'preact'
import { useLayoutEffect, useState } from 'preact/hooks'
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
  // Content already on screen when it mounts (every tab switch) shows at once.
  // Fading it up from invisible reads as a blank flash; only content that
  // scrolls into view later gets the rise.
  const [instant, setInstant] = useState(false)
  useLayoutEffect(() => {
    const el = ref.current
    if (el && el.getBoundingClientRect().top < window.innerHeight * 0.94) setInstant(true)
  }, [])
  const shown = reduced || inView || instant
  return (
    <div
      ref={ref}
      class={`reveal${shown ? ' is-in' : ''}${instant ? ' is-instant' : ''}${cls ? ' ' + cls : ''}`}
      style={style}
    >
      {children}
    </div>
  )
}
