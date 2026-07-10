import { useEffect, useState } from 'preact/hooks'
import { Nav } from './components/Nav'
import { Dashboard } from './pages/Dashboard'
import { Vehicles } from './pages/Vehicles'
import { VehicleDetail } from './pages/VehicleDetail'
import { Documents } from './pages/Documents'
import { Costs } from './pages/Costs'
import { Backup } from './pages/Backup'
import { Debug } from './pages/Debug'
import { TemplateAdmin } from './pages/TemplateAdmin'
import { ReminderDebug } from './pages/ReminderDebug'

// Tiny hash-based router.
//
// Hash routing (rather than the History API) is deliberate: it deep-links
// correctly on GitHub Pages / static hosts with no 404-rewrite config, and
// survives the `base: './'` relative-path setup. Routes:
//   #/                      -> Dashboard
//   #/vehicles              -> Vehicle list
//   #/vehicle/<id>          -> Vehicle detail
//   #/documents             -> Cross-vehicle document browser
//   #/documents/<vehicleId> -> …pre-filtered to one vehicle
//   #/costs                 -> Cost summary (per-category spend)
//   #/backup                -> Backup & restore
//   #/debug                 -> IndexedDB debug view
function useHashRoute(): string {
  const [hash, setHash] = useState(() => window.location.hash || '#/')
  useEffect(() => {
    const onChange = () => setHash(window.location.hash || '#/')
    window.addEventListener('hashchange', onChange)
    return () => window.removeEventListener('hashchange', onChange)
  }, [])
  return hash.replace(/^#/, '') || '/'
}

export function App() {
  const route = useHashRoute()

  let page
  if (route === '/vehicles') page = <Vehicles />
  else if (route.startsWith('/vehicle/'))
    page = <VehicleDetail id={route.slice('/vehicle/'.length)} />
  else if (route === '/documents') page = <Documents />
  else if (route.startsWith('/documents/'))
    page = <Documents initialVehicleId={route.slice('/documents/'.length)} />
  else if (route === '/costs') page = <Costs />
  else if (route === '/backup') page = <Backup />
  else if (route === '/debug') page = <Debug />
  else if (route === '/template') page = <TemplateAdmin />
  else if (route === '/reminders-debug') page = <ReminderDebug />
  else page = <Dashboard />

  return (
    <div class="app-shell">
      <header class="app-header">
        <h1 class="app-title">Garage Log</h1>
      </header>
      <main class="app-main">{page}</main>
      <Nav route={route} />
    </div>
  )
}
