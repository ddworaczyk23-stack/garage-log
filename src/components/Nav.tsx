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
  { href: '#/debug', label: 'Debug', icon: '🛠️', isActive: (r: string) => r === '/debug' },
]

export function Nav({ route }: NavProps) {
  return (
    <nav class="bottom-nav">
      {ITEMS.map((it) => (
        <a
          key={it.href}
          class={`nav-item${it.isActive(route) ? ' is-active' : ''}`}
          href={it.href}
        >
          <span class="nav-icon" aria-hidden="true">
            {it.icon}
          </span>
          <span class="nav-label">{it.label}</span>
        </a>
      ))}
    </nav>
  )
}
