import { useState } from 'preact/hooks'
import type { ComponentChildren } from 'preact'

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
