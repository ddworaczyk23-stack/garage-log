import { useEffect, useState } from 'preact/hooks'
import { Nav } from './components/Nav'
import { AccountBar } from './components/AccountBar'
import { ErrorBoundary } from './components/ui'
import { Dashboard } from './pages/Dashboard'
import { Vehicles } from './pages/Vehicles'
import { AddVehicle } from './pages/AddVehicle'
import { VehicleDetail } from './pages/VehicleDetail'
import { Check } from './pages/Check'
import { ShopBriefPage } from './pages/ShopBrief'
import { Documents } from './pages/Documents'
import { Costs } from './pages/Costs'
import { ImportHistory } from './pages/ImportHistory'
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
//   #/add-vehicle           -> Add a new car (VIN or manual entry)
//   #/vehicle/<id>          -> Vehicle detail
//   #/check                 -> Start a triage check (pick a vehicle)
//   #/check/<id>            -> …the triage flow for one vehicle
//   #/brief/<id>            -> Shop brief (id = concern id OR reminder-rule id)
//   #/documents             -> Cross-vehicle document browser
//   #/documents/<vehicleId> -> …pre-filtered to one vehicle
//   #/costs                 -> Cost summary (per-category spend)
//   #/import/<vehicleId>    -> Import past service history
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
  else if (route === '/add-vehicle') page = <AddVehicle />
  else if (route.startsWith('/vehicle/'))
    page = <VehicleDetail id={route.slice('/vehicle/'.length)} />
  else if (route === '/check') page = <Check />
  else if (route.startsWith('/check/')) page = <Check vehicleId={route.slice('/check/'.length)} />
  else if (route.startsWith('/brief/')) page = <ShopBriefPage id={route.slice('/brief/'.length)} />
  else if (route === '/documents') page = <Documents />
  else if (route.startsWith('/documents/'))
    page = <Documents initialVehicleId={route.slice('/documents/'.length)} />
  else if (route === '/costs') page = <Costs />
  else if (route.startsWith('/import/'))
    page = <ImportHistory vehicleId={route.slice('/import/'.length)} />
  else if (route === '/backup') page = <Backup />
  else if (route === '/debug') page = <Debug />
  else if (route === '/template') page = <TemplateAdmin />
  else if (route === '/reminders-debug') page = <ReminderDebug />
  else page = <Dashboard />

  return (
    <div class="app-shell">
      <header class="app-header">
        <svg class="app-mark" viewBox="0 0 22 22" aria-hidden="true">
          <circle cx="11" cy="11" r="9" fill="none" stroke="currentColor" stroke-width="2.6" />
          <path
            d="M6.5 12.5c2-3.5 7-3.5 9-1"
            fill="none"
            stroke="currentColor"
            stroke-width="2.2"
            stroke-linecap="round"
          />
        </svg>
        <h1 class="app-title">Coast</h1>
      </header>
      <AccountBar />
      <main
        class={`app-main${route === '/' || route.startsWith('/vehicle/') ? ' app-main-wide' : ''}`}
      >
        <ErrorBoundary key={route}>{page}</ErrorBoundary>
      </main>
      <Nav route={route} />
    </div>
  )
}
