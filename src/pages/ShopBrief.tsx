import { db } from '../db/db'
import { useQuery } from '../db/useQuery'
import { getCurrentMileageEstimate } from '../db/events'
import { getVehicleReminders } from '../db/summary'
import { getPlaybook, outcomeToBriefFacts } from '../domain/playbooks'
import { composeBrief, briefFromReminder, type ShopBrief as Brief } from '../domain/shopBrief'
import { SkeletonPage, EmptyState, PageHeader } from '../components/ui'
import type { Vehicle } from '../types'
import { ShopBriefView } from '../components/ShopBriefView'

interface LoadedBrief { vehicle: Vehicle; brief: Brief }

async function loadBrief(id: string): Promise<LoadedBrief | null> {
  if (id.startsWith('concern-')) {
    const concern = await db.concerns.get(id)
    if (!concern) return null
    const vehicle = await db.vehicles.get(concern.vehicleId)
    if (!vehicle) return null
    const pb = getPlaybook(concern.playbookId)
    const outcome = pb?.outcomes.find((item) => item.id === concern.outcomeId) ?? (pb?.fallback.id === concern.outcomeId ? pb.fallback : undefined)
    if (!outcome) return null
    const [mileage, eventCount] = await Promise.all([getCurrentMileageEstimate(vehicle.id), db.events.where('vehicleId').equals(vehicle.id).count()])
    return { vehicle, brief: composeBrief(vehicle, mileage?.miles ?? null, outcomeToBriefFacts(outcome), { known: eventCount > 0 }) }
  }
  const rule = await db.reminderRules.get(id)
  if (!rule) return null
  const vehicle = await db.vehicles.get(rule.vehicleId)
  if (!vehicle) return null
  const [reminders, mileage] = await Promise.all([getVehicleReminders(vehicle.id), getCurrentMileageEstimate(vehicle.id)])
  const reminder = reminders.find((item) => item.rule.id === id)
  return reminder ? { vehicle, brief: briefFromReminder(vehicle, mileage?.miles ?? null, reminder) } : null
}

export function ShopBriefPage({ id }: { id: string }) {
  const data = useQuery(() => loadBrief(id), [id])
  if (data === undefined) return <SkeletonPage rows={3} />
  if (data === null) return <section class="page"><EmptyState title="Brief not found" hint="The item it was written for may have been removed." action={<a class="btn" href="#/">Back home</a>} /></section>
  const { vehicle, brief } = data
  return <section class="page sb">
    <PageHeader eyebrow="Shop brief" title="Show this at the counter." prefix={<a class="back-link" href={`#/vehicle/${vehicle.id}`}>‹ {vehicle.nickname ?? vehicle.name}</a>}>
      <p class="page-header-prose">Or read it out over the phone.</p>
    </PageHeader>
    <ShopBriefView brief={brief} />
    {/* A webview can't print: the store app shares the brief instead. */}
    {import.meta.env.MODE !== 'capacitor' && <div class="chk-actions sb-chrome"><button type="button" class="btn btn-secondary" onClick={() => window.print()}>Print it</button></div>}
  </section>
}
