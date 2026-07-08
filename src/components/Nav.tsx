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
  return (
    <nav class="bottom-nav">
      {ITEMS.map((it) => {
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
      })}
    </nav>
  )
}
