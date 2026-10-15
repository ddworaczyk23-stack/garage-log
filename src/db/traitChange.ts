import { db } from './db'
import { rulesForVehicle, templateEntries } from './scheduleTemplates'
import { traitsKey, type VehicleTraits } from './traitTemplates'
import { canChangeTraits, diffSchedules } from '../domain/traitChange'
import { matchesRule } from '../domain/reminderEngine'

export async function changeVehicleTraits(vehicleId: string, traits: VehicleTraits): Promise<void> {
  const newKey = traitsKey(traits)
  await db.transaction('rw', db.reminderRules, db.events, async () => {
    const current = await db.reminderRules.where('vehicleId').equals(vehicleId).toArray()
    if (!current.length || !canChangeTraits(current[0].templateKey)) throw new Error('This vehicle has a curated schedule.')
    const diff = diffSchedules(current, newKey)
    const labels = new Map(templateEntries(newKey).map((entry) => [entry.category, entry.label]))
    for (const rule of diff.kept) await db.reminderRules.update(rule.id, { templateKey: newKey, label: labels.get(rule.category) ?? rule.label })
    await db.reminderRules.bulkDelete(diff.removed.map((rule) => rule.id))
    const events = await db.events.where('vehicleId').equals(vehicleId).toArray()
    const additions = rulesForVehicle(vehicleId, newKey).filter((rule) => diff.added.includes(rule.category)).map((rule) => {
      const matches = events.filter((event) => matchesRule(event, rule)).sort((a, b) => a.date < b.date ? 1 : -1)
      const last = matches[0]
      return last ? { ...rule, lastDoneDate: last.date, lastDoneMiles: last.odometerMiles } : rule
    })
    await db.reminderRules.bulkAdd(additions)
  })
}
