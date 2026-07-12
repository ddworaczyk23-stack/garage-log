import type { ComponentChildren } from 'preact'
import { useEffect, useRef, useState } from 'preact/hooks'

/**
 * Accessible animated disclosure — the one fold used across the app. Height
 * animates via the grid-rows 0fr→1fr technique; when collapsed the content is
 * marked `inert` so it leaves the tab order and a11y tree (not just clipped).
 * The header is a real button with `aria-expanded`. Collapsed content still
 * renders (so no-JS shows it via CSS), but is height-clipped when scripted.
 */
export function Collapsible({
  title,
  count,
  defaultOpen = false,
  children,
}: {
  title: ComponentChildren
  count?: ComponentChildren
  defaultOpen?: boolean
  children: ComponentChildren
}) {
  const [open, setOpen] = useState(defaultOpen)
  const innerRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = innerRef.current
    if (el) el.inert = !open
  }, [open])
  return (
    <div class={`fold${open ? ' is-open' : ''}`}>
      <button
        type="button"
        class="fold-head"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <span class="fold-titles">
          <span class="fold-title">{title}</span>
          {count != null && <span class="fold-count">{count}</span>}
        </span>
        <span class="chev" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M6 9l6 6 6-6" />
          </svg>
        </span>
      </button>
      <div class="fold-body">
        <div class="fold-inner" ref={innerRef}>
          {children}
        </div>
      </div>
    </div>
  )
}
