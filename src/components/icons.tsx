import type { DocFileType } from '../domain/documents'
import type { VehicleBody } from '../domain/vehicle'

type IconProps = { class?: string }

const WHEELS = (
  <>
    <circle cx="6.8" cy="16.5" r="2" />
    <circle cx="17.2" cy="16.5" r="2" />
  </>
)

/** Side-view vehicle in the app's thin-line style: a sedan by default, or a
 * pickup / SUV so each car in the garage reads as itself (vehicleBody()). */
export function VehicleIcon({ class: className = '', body = 'car' }: IconProps & { body?: VehicleBody }) {
  return (
    <svg class={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <g transform="translate(0 -0.6)">
        {body === 'pickup' ? (
          <>
            <path d="M4.4 16.5H3a1 1 0 0 1-1-1v-2.6a1 1 0 0 1 .8-1l2.7-.6 1.7-3.2a1 1 0 0 1 .9-.6h4.1a1 1 0 0 1 1 1V12h7.3a1 1 0 0 1 1 1v2.5a1 1 0 0 1-1 1h-1.3M9.2 16.5h5.6" />
            <path d="M13.4 12H6" />
          </>
        ) : body === 'suv' ? (
          <>
            <path d="M4.4 16.5H3a1 1 0 0 1-1-1v-2.7a1 1 0 0 1 .7-1l1.6-.5 2.1-3.6a1.5 1.5 0 0 1 1.3-.7H19a1.5 1.5 0 0 1 1.5 1.3l.5 3.6v3.6a1 1 0 0 1-1 1h-1.2M9.2 16.5h5.6" />
            <path d="M4.3 11.3H21" />
          </>
        ) : (
          <path d="M4.4 16.5H3a1 1 0 0 1-1-1v-2.4a1 1 0 0 1 .7-1l2.3-.7 2.2-2.6a2 2 0 0 1 1.5-.7h4.6a2 2 0 0 1 1.5.7l2.4 2.7 3.1.7a1 1 0 0 1 .7 1v2.3a1 1 0 0 1-1 1h-1.4M9.2 16.5h5.6" />
        )}
        {WHEELS}
      </g>
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
