import { Component, type ComponentChildren } from 'preact'
import { useState } from 'preact/hooks'

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

  if (!armed) {
    return (
      <button type="button" class={className} onClick={() => setArmed(true)}>
        {label}
      </button>
    )
  }

  return (
    <span class="confirm-inline">
      <button
        type="button"
        class={className}
        disabled={busy}
        onClick={async () => {
          setBusy(true)
          try {
            await onConfirm()
          } finally {
            setBusy(false)
            setArmed(false)
          }
        }}
      >
        {busy ? busyLabel : confirmLabel}
      </button>
      <button type="button" class="btn-link" disabled={busy} onClick={() => setArmed(false)}>
        Cancel
      </button>
    </span>
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
