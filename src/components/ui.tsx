import { Component, type ComponentChildren } from 'preact'
import { useEffect, useId, useRef, useState } from 'preact/hooks'

// Small shared presentational primitives introduced in Milestone 9 so loading,
// empty, and destructive-action UI look and behave the same everywhere. No data
// logic lives here.

/** Consistent loading indicator (spinner + polite live-region text). */
export function Loading({ label = 'Loading…' }: { label?: string }) {
  return (
    <p class="loading" role="status" aria-live="polite">
      <span class="spinner" aria-hidden="true" />
      {label}
    </p>
  )
}

/** One shimmering placeholder block. Compose into page-shaped skeletons. */
export function Skel({ class: className = '', style }: { class?: string; style?: string }) {
  return <span class={`skel ${className}`} style={style} aria-hidden="true" />
}

/**
 * Generic page skeleton for routes with no bespoke shape — a title bar plus
 * a few list rows. Used as the fallback so every `<Loading/>` full-page spot
 * still reads as "content is coming" instead of a bare spinner, without
 * hand-building a layout per page.
 */
export function SkeletonPage({ rows = 4 }: { rows?: number }) {
  return (
    <section class="page" role="status" aria-live="polite" aria-label="Loading">
      <Skel class="skel-title" />
      <div class="skel-list">
        {Array.from({ length: rows }, (_, i) => (
          <Skel key={i} class="skel-row" />
        ))}
      </div>
    </section>
  )
}

/**
 * Styled tooltip for icon-only controls. Wraps a single focusable child and
 * shows `label` on hover/focus via CSS only (no JS, no library) — see
 * `.tooltip` in app.css. `hover`-media-gated so it's inert on touch, where
 * there's no hover to trigger it; the child's own `aria-label`/`title` stays
 * the accessible name.
 */
export function Tooltip({ label, children }: { label: string; children: ComponentChildren }) {
  return (
    <span class="tooltip" data-tip={label}>
      {children}
    </span>
  )
}

/**
 * A small circled "?" that reveals an explanatory sentence — for the
 * "how does this number work" context that's too long for a hover-only
 * `Tooltip` and doesn't need to sit inline as permanent body text. Hover or
 * focus opens it on desktop (CSS `:hover`/`:focus-within`); a click toggles
 * it open/closed on any device, since touch has no hover. Closes on outside
 * click or Escape.
 */
export function InfoTip({ label = 'More info', children }: { label?: string; children: ComponentChildren }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLSpanElement>(null)
  const id = useId()

  useEffect(() => {
    if (!open) return
    function onDocClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('click', onDocClick)
    window.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('click', onDocClick)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <span class={`infotip${open ? ' is-open' : ''}`} ref={ref}>
      <button
        type="button"
        class="infotip-btn"
        aria-expanded={open}
        aria-controls={id}
        aria-label={label}
        onClick={(e) => {
          e.stopPropagation()
          setOpen((o) => !o)
        }}
      >
        ?
      </button>
      <span id={id} role="tooltip" class="infotip-pop">
        {children}
      </span>
    </span>
  )
}

/** Consistent empty state: icon + headline + optional hint/action. */
export function EmptyState({
  icon,
  title,
  hint,
  action,
}: {
  icon?: string
  title: string
  hint?: string
  action?: ComponentChildren
}) {
  return (
    <div class="empty-state">
      {icon && (
        <span class="empty-icon" aria-hidden="true">
          {icon}
        </span>
      )}
      <p class="empty-title">{title}</p>
      {hint && <p class="muted small">{hint}</p>}
      {action}
    </div>
  )
}

/**
 * Two-step destructive button: the first click "arms" it and reveals an explicit
 * confirm + cancel, so a delete/remove/restore always takes a deliberate second
 * tap. Replaces bare `window.confirm` (which is easy to reflexively dismiss and
 * looks out of place in a standalone PWA) with inline, styled, mobile-friendly
 * confirmation. `onConfirm` may be async; the button shows a busy label while it
 * runs and re-disarms afterward.
 */
export function ConfirmButton({
  label,
  confirmLabel = 'Confirm',
  busyLabel = 'Working…',
  onConfirm,
  class: className = 'btn-link btn-link-danger',
}: {
  label: string
  confirmLabel?: string
  busyLabel?: string
  onConfirm: () => void | Promise<void>
  class?: string
}) {
  const [armed, setArmed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  if (!armed) {
    return (
      <button
        type="button"
        class={className}
        onClick={() => {
          setArmed(true)
          setError('')
        }}
      >
        {label}
      </button>
    )
  }

  return (
    <>
      <span class="confirm-inline">
        <button
          type="button"
          class={className}
          disabled={busy}
          onClick={async () => {
            setBusy(true)
            setError('')
            try {
              await onConfirm()
              setArmed(false)
            } catch (err) {
              console.error('[ConfirmButton]', err)
              setError('Something went wrong. Please try again.')
            } finally {
              setBusy(false)
            }
          }}
        >
          {busy ? busyLabel : confirmLabel}
        </button>
        <button type="button" class="btn-link" disabled={busy} onClick={() => setArmed(false)}>
          Cancel
        </button>
      </span>
      {error && (
        <span class="notice notice-error confirm-error" role="alert">
          {error}
        </span>
      )}
    </>
  )
}

/**
 * Catches render/query errors anywhere below it (in particular a failed
 * `useQuery` liveQuery — see db/useQuery.ts) and shows a recoverable error
 * card instead of leaving the page stuck on a spinner or a blank crash.
 */
export class ErrorBoundary extends Component<{ children: ComponentChildren }, { error: unknown }> {
  state = { error: null as unknown }

  static getDerivedStateFromError(error: unknown) {
    return { error }
  }

  componentDidCatch(error: unknown) {
    console.error('[ErrorBoundary]', error)
  }

  render() {
    if (this.state.error) {
      return (
        <div class="empty-state">
          <span class="empty-icon" aria-hidden="true">
            ⚠️
          </span>
          <p class="empty-title">Something went wrong</p>
          <p class="muted small">This screen hit an unexpected error and couldn't load.</p>
          <button class="btn" type="button" onClick={() => this.setState({ error: null })}>
            Try again
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
