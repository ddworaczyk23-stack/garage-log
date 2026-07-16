import type { ComponentChildren } from 'preact'

interface NavProps {
  route: string
}

// Monochrome stroke icons (inherit currentColor) so the tab bar reads as one
// coherent set on every OS — emoji rendered differently per platform and
// clashed with the light theme.
const stroke = {
  fill: 'none',
  stroke: 'currentColor',
  'stroke-width': '1.7',
  'stroke-linecap': 'round' as const,
  'stroke-linejoin': 'round' as const,
}

const HomeIcon = (
  <svg viewBox="0 0 24 24" {...stroke} aria-hidden="true">
    <path d="M3.5 10.8 12 3.8l8.5 7" />
    <path d="M5.5 9.5V20h13V9.5" />
    <path d="M10 20v-5.5h4V20" />
  </svg>
)

const CarIcon = (
  <svg viewBox="0 0 24 24" {...stroke} aria-hidden="true">
    <path d="M4.5 15.5 6 10.6A2 2 0 0 1 7.9 9.2h8.2a2 2 0 0 1 1.9 1.4l1.5 4.9" />
    <path d="M4 15.5h16a1 1 0 0 1 1 1v2a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-2a1 1 0 0 1 1-1Z" />
    <path d="M6.5 17.2h.01M17.5 17.2h.01" />
  </svg>
)

const FolderIcon = (
  <svg viewBox="0 0 24 24" {...stroke} aria-hidden="true">
    <path d="M3.5 6.8c0-.8.7-1.5 1.5-1.5h4.2l2 2.4H19c.8 0 1.5.7 1.5 1.5v8c0 .8-.7 1.5-1.5 1.5H5c-.8 0-1.5-.7-1.5-1.5Z" />
  </svg>
)

const BackupIcon = (
  <svg viewBox="0 0 24 24" {...stroke} aria-hidden="true">
    <path d="M4.5 4.5h15a1 1 0 0 1 1 1v3h-17v-3a1 1 0 0 1 1-1Z" />
    <path d="M4.5 8.5V19a1 1 0 0 0 1 1h13a1 1 0 0 0 1-1V8.5" />
    <path d="M10 12.5h4" />
  </svg>
)

// The raised center action — a speech bubble with a question mark. Coast's
// core verb: "something's up? get an answer." Filled white on the accent disc.
const CheckIcon = (
  <svg viewBox="0 0 28 28" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M14 5.5C9 5.5 5.5 8.8 5.5 13c0 2.1.9 4 2.4 5.3L7 22.5l4-1.7c.9.3 1.9.4 3 .4 5 0 8.5-3.3 8.5-7.5S19 5.5 14 5.5Z" />
    <path d="M14 10.5v3.2" />
    <path d="M14 16.8h.01" />
  </svg>
)

const ITEMS: {
  href: string
  label: string
  icon: ComponentChildren
  isActive: (r: string) => boolean
}[] = [
  { href: '#/', label: 'Home', icon: HomeIcon, isActive: (r) => r === '/' },
  {
    href: '#/vehicles',
    label: 'Vehicles',
    icon: CarIcon,
    isActive: (r) => r === '/vehicles' || r.startsWith('/vehicle/'),
  },
  {
    href: '#/documents',
    label: 'Docs',
    icon: FolderIcon,
    isActive: (r) => r === '/documents' || r.startsWith('/documents/'),
  },
  { href: '#/backup', label: 'Backup', icon: BackupIcon, isActive: (r) => r === '/backup' },
  // Debug is a developer view — reachable from the Backup page, kept off the
  // primary nav so the everyday bar stays uncluttered.
]

export function Nav({ route }: NavProps) {
  const checkActive = route === '/check' || route.startsWith('/check/')
  // Split the four tabs 2 + [center action] + 2 so the raised Check button
  // sits in the middle without crowding a label.
  const left = ITEMS.slice(0, 2)
  const right = ITEMS.slice(2)

  const tab = (it: (typeof ITEMS)[number]) => {
    const active = it.isActive(route)
    return (
      <a
        key={it.href}
        class={`nav-item${active ? ' is-active' : ''}`}
        href={it.href}
        aria-current={active ? 'page' : undefined}
      >
        <span class="nav-icon" aria-hidden="true">
          {it.icon}
        </span>
        <span class="nav-label">{it.label}</span>
      </a>
    )
  }

  return (
    <nav class="bottom-nav">
      {left.map(tab)}
      <a
        class={`nav-check${checkActive ? ' is-active' : ''}`}
        href="#/check"
        aria-label="Start a check"
        aria-current={checkActive ? 'page' : undefined}
      >
        <span class="nav-check-disc" aria-hidden="true">
          {CheckIcon}
        </span>
        <span class="nav-label">Check</span>
      </a>
      {right.map(tab)}
    </nav>
  )
}
