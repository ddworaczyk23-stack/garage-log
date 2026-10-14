import type { DocFileType } from '../domain/documents'

type IconProps = { class?: string }

export function VehicleIcon({ class: className = '' }: IconProps) {
  return (
    <svg class={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
      <path d="M4 14.5v-2.2l1.7-4.1A2 2 0 0 1 7.6 7h8.8a2 2 0 0 1 1.9 1.2l1.7 4.1v2.2" />
      <path d="M3 14.5h18v3H3zM6 17.5v1.8M18 17.5v1.8M7 11.5h10" />
      <circle cx="7" cy="15.8" r=".8" fill="currentColor" stroke="none" />
      <circle cx="17" cy="15.8" r=".8" fill="currentColor" stroke="none" />
    </svg>
  )
}

export function DocumentIcon({ type = 'other', class: className = '' }: IconProps & { type?: DocFileType }) {
  if (type === 'image') {
    return (
      <svg class={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
        <rect x="3.5" y="4.5" width="17" height="15" rx="2" />
        <circle cx="9" cy="10" r="1.5" />
        <path d="m5.5 17 4.2-4.2 3 2.7 2.2-2.2 3.6 3.7" />
      </svg>
    )
  }

  if (type === 'pdf') {
    return (
      <svg class={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
        <path d="M6 2.8h8l4 4V21H6zM14 2.8V7h4M8.5 16.5h7M8.5 13h7M8.5 9.5h2.5" />
      </svg>
    )
  }

  return (
    <svg class={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
      <path d="m9 12.5 5.1-5.1a3 3 0 0 1 4.2 4.2l-7 7a4.5 4.5 0 0 1-6.4-6.4l7.4-7.4" />
      <path d="m7.5 14 7-7" />
    </svg>
  )
}

export function WarningIcon({ class: className = '' }: IconProps) {
  return (
    <svg class={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
      <path d="M12 3.5 21 20H3z" />
      <path d="M12 9v5M12 17.2v.2" stroke-linecap="round" />
    </svg>
  )
}

/** Edit affordance (pencil), e.g. next to the vehicle name. */
export function PencilIcon({ class: className = '' }: IconProps) {
  return (
    <svg class={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16z" />
      <path d="M13.5 6.5l4 4" />
    </svg>
  )
}

/** Row affordance: "opens a page". One chevron everywhere (no text "›"). */
export function ChevronRightIcon({ class: className = 'chevron-icon' }: IconProps) {
  return (
    <svg class={className} viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M7.5 4 13.5 10l-6 6" />
    </svg>
  )
}

/** Disclosure: points right when closed, rotates down when open (CSS). */
export function DisclosureIcon({ open }: { open: boolean }) {
  return (
    <svg class={`disclosure-icon${open ? ' is-open' : ''}`} viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M7.5 4 13.5 10l-6 6" />
    </svg>
  )
}

/** In-app link arrow (→). The diagonal ↗ read as "leaves the app". */
export function ArrowRightIcon({ class: className = '' }: IconProps) {
  return (
    <svg class={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  )
}
