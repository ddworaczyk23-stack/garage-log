import type { VehicleTraits } from '../db/traitTemplates'

// "Engine & drive" choices for "Add a car" manual entry, from the EPA's free
// fueleconomy.gov web services (no key). EPA lists engine/transmission/drive
// versions, not badge trims like "SL" or "STX" (no free official source has
// those), so the form types the trim separately. A version is what the
// maintenance schedule cares about, so picking one fills the trait pickers.
const EPA = 'https://www.fueleconomy.gov/ws/rest'

export interface TrimVersion {
  id: string
  label: string // dropdown text: "2.7L 6-cyl Turbo · 10-spd auto · 4WD"
  engine: string // "2.7L 6-cyl Turbo"
  power?: VehicleTraits['power']
  trans?: VehicleTraits['trans']
  drive?: 'FWD' | 'RWD' | 'AWD' | '4WD'
}

export type TrimListResult = { ok: true; versions: TrimVersion[] } | { ok: false }

// The subset of EPA's vehicle record this reads.
export interface EpaVehicle {
  id?: number | string
  displ?: number | string | null
  cylinders?: number | string | null
  trany?: string | null
  drive?: string | null
  tCharger?: boolean | string | null
  sCharger?: string | null
  atvType?: string | null
  fuelType?: string | null
}

interface EpaMenuItem {
  text?: string
  value?: string
}

const squash = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, '')

// EPA menus come back as `{ menuItem: [...] }`, or a bare object when there is
// only one entry.
function menuItems(body: unknown): EpaMenuItem[] {
  const raw = (body as { menuItem?: EpaMenuItem | EpaMenuItem[] } | null)?.menuItem
  const items = Array.isArray(raw) ? raw : raw ? [raw] : []
  return items.filter((item) => item.value?.trim())
}

function menuValues(body: unknown): string[] {
  return menuItems(body).map((item) => item.value!.trim())
}

/**
 * EPA names models differently from NHTSA ("F150 Pickup 4WD" for "F-150",
 * "Rogue AWD" for "Rogue"), so match on a punctuation-free prefix. A longer
 * NHTSA model that also matches wins ("Rogue Sport" isn't a "Rogue").
 */
export function matchEpaModels(model: string, epaModels: string[], allModels: string[], make = ''): string[] {
  const target = squash(model)
  if (!target) return []
  const longer = allModels.map(squash).filter((m) => m.length > target.length && m.startsWith(target))
  const makeKey = squash(make)
  return epaModels.filter((epa) => {
    let name = squash(epa)
    // "Ram 1500 Pickup" vs NHTSA's "1500"
    if (makeKey && !name.startsWith(target) && name.startsWith(makeKey)) name = name.slice(makeKey.length)
    return name.startsWith(target) && !longer.some((m) => name.startsWith(m))
  })
}

function transOf(trany: string): { trans?: VehicleTraits['trans']; text: string } {
  const t = trany.toLowerCase()
  const speeds = trany.match(/(\d+)(?:-spd|\))/i)?.[1]
  const spd = speeds ? `${speeds}-spd ` : ''
  if (t.includes('variable') || /\bav\b|\(av/.test(t)) return { trans: 'cvt', text: 'CVT' }
  if (/\(am/.test(t)) return { trans: 'dct', text: `${spd}dual-clutch` }
  if (t.startsWith('man')) return { trans: 'manual', text: `${spd}manual` }
  if (t.startsWith('auto')) return { trans: 'auto', text: `${spd}auto` }
  return { text: '' }
}

function driveOf(drive: string): TrimVersion['drive'] {
  const d = drive.toLowerCase()
  if (d.includes('4-wheel or all-wheel')) return undefined // older EPA rows lump these
  if (d.includes('4-wheel')) return '4WD'
  if (d.includes('all-wheel')) return 'AWD'
  if (d.includes('front')) return 'FWD'
  if (d.includes('rear')) return 'RWD'
  return undefined
}

function isTrue(value: boolean | string | null | undefined): boolean {
  if (typeof value === 'boolean') return value
  const v = value?.trim().toLowerCase() ?? ''
  return v !== '' && v !== 'false' && v !== 'null'
}

/** One EPA vehicle record -> a dropdown entry with its schedule traits. */
export function toTrimVersion(v: EpaVehicle): TrimVersion | null {
  if (v.id == null) return null
  const atv = v.atvType?.toLowerCase() ?? ''
  const fuel = v.fuelType?.toLowerCase() ?? ''
  const ev = atv === 'ev' || fuel === 'electricity'
  const hybrid = atv.includes('hybrid')
  const forced = isTrue(v.tCharger) || isTrue(v.sCharger)
  const power: VehicleTraits['power'] = ev ? 'ev' : hybrid ? 'hybrid' : atv === 'diesel' || fuel.includes('diesel') ? 'diesel' : forced ? 'turbo' : 'gas'

  const displ = Number(v.displ)
  const cyl = Number(v.cylinders)
  const cylText = cyl ? `${cyl}-cyl` : ''
  const engine = ev
    ? 'Electric'
    : [displ ? `${displ.toFixed(1)}L` : '', cylText, isTrue(v.tCharger) ? 'Turbo' : isTrue(v.sCharger) ? 'Supercharged' : '', hybrid ? 'Hybrid' : power === 'diesel' ? 'Diesel' : '']
        .filter(Boolean)
        .join(' ')
  const { trans, text: transText } = ev ? { trans: undefined, text: '' } : transOf(v.trany ?? '')
  const drive = driveOf(v.drive ?? '')

  const label = [engine, transText, drive].filter(Boolean).join(' · ')
  if (!label) return null
  return { id: String(v.id), label, engine, power, trans, drive }
}

/** De-dupes identical-looking rows (flex-fuel twins etc.) and sorts by label. */
export function uniqueVersions(versions: (TrimVersion | null)[]): TrimVersion[] {
  const byLabel = new Map<string, TrimVersion>()
  for (const v of versions) if (v && !byLabel.has(v.label)) byLabel.set(v.label, v)
  return [...byLabel.values()].sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true }))
}

/**
 * One EPA options-menu entry -> a vehicle record, so the live path needs no
 * per-vehicle calls. The text reads like "Auto (S10), 6 cyl, 2.7 L, Turbo";
 * drive isn't in it, but EPA's model name carries it ("F150 Pickup 4WD").
 */
export function optionToVehicle(id: string, text: string, epaModel: string): EpaVehicle {
  const parts = text.split(',').map((part) => part.trim())
  const cylinders = text.match(/(\d+)\s*cyl/i)?.[1] ?? null
  const displ = text.match(/([\d.]+)\s*L\b/)?.[1] ?? null
  const m = ` ${epaModel.toUpperCase()} `
  const drive = /[ -](4WD|4X4)[ -]/.test(m) ? '4-Wheel Drive' : /[ -]AWD[ -]/.test(m) ? 'All-Wheel Drive' : /[ -]FWD[ -]/.test(m) ? 'Front-Wheel Drive' : /[ -](RWD|2WD)[ -]/.test(m) ? 'Rear-Wheel Drive' : ''
  const hybrid = /hybrid/i.test(text) || /hybrid/i.test(epaModel)
  const ev = !cylinders && !displ
  return {
    id,
    displ,
    cylinders,
    trany: parts[0] ?? '',
    drive,
    tCharger: /\bturbo\b/i.test(text),
    sCharger: /charge(r|d)?\b/i.test(text.replace(/turbo/gi, '')) ? 'S' : null,
    atvType: ev ? 'EV' : hybrid ? 'Hybrid' : /diesel/i.test(text) ? 'Diesel' : '',
  }
}

async function getJson(url: string): Promise<unknown> {
  const res = await fetch(url, { headers: { Accept: 'application/json' } })
  if (!res.ok) throw new Error(`EPA ${res.status}`)
  return res.json()
}

const cache = new Map<string, TrimVersion[]>()

/**
 * Trims for one NHTSA model, live from EPA: the model menu, then one options
 * menu per matching EPA model (all in parallel). `allModels` is the NHTSA
 * model list for this make/year, used to keep "Rogue Sport" out of "Rogue".
 */
export async function fetchTrims(make: string, model: string, year: number, allModels: string[]): Promise<TrimListResult> {
  const key = `${make}|${model}|${year}`.toUpperCase()
  const cached = cache.get(key)
  if (cached) return { ok: true, versions: cached }

  try {
    const q = `year=${year}&make=${encodeURIComponent(make)}`
    const epaModels = menuValues(await getJson(`${EPA}/vehicle/menu/model?${q}`))
    const matched = matchEpaModels(model, epaModels, allModels, make)
    const options = await Promise.all(
      matched.map(async (m) =>
        menuItems(await getJson(`${EPA}/vehicle/menu/options?${q}&model=${encodeURIComponent(m)}`)).map((item) =>
          toTrimVersion(optionToVehicle(item.value!.trim(), item.text ?? '', m)),
        ),
      ),
    )
    const versions = uniqueVersions(options.flat())
    if (versions.length) cache.set(key, versions)
    return { ok: true, versions }
  } catch {
    return { ok: false }
  }
}
