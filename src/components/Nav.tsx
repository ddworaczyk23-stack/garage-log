interface NavProps {
  route: string
}

const ITEMS = [
  { href: '#/', label: 'Home', icon: '🏠', isActive: (r: string) => r === '/' },
  {
    href: '#/vehicles',
    label: 'Vehicles',
    icon: '🚗',
    isActive: (r: string) => r === '/vehicles' || r.startsWith('/vehicle/'),
  },
  {
    href: '#/documents',
    label: 'Docs',
    icon: '📁',
    isActive: (r: string) => r === '/documents' || r.startsWith('/documents/'),
  },
  { href: '#/backup', label: 'Backup', icon: '💾', isActive: (r: string) => r === '/backup' },
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
