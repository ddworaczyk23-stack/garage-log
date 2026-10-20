import { toTrimVersion, uniqueVersions, type TrimVersion } from './trimCatalog'

// Make/model/trim lists bundled at deploy time from the EPA's full vehicle list
// (scripts/build-vehicle-catalog.mjs), one static file per make. A make's file
// is one same-origin request, cached by the service worker, so the model and
// trim pickers fill instantly and work offline. Anything the bundle lacks (no
// file in local dev, a model year EPA hasn't published, heavy-duty trucks EPA
// doesn't rate) falls back to the live lookups.

// [id, displ, cylinders, trany, drive, turbo, supercharged, atvType, fuelType]
export type BundleRow = [number, number | null, number | null, string, string, 0 | 1, 0 | 1, string, string]

export interface MakeBundle {
  make: string
  years: Record<string, Record<string, BundleRow[]>>
}

/** Same rule as catalogSlug() in scripts/build-vehicle-catalog.mjs. */
export function catalogSlug(make: string): string {
  return make.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

const loads = new Map<string, Promise<MakeBundle | null>>()

/** The make's bundle, or null when there isn't one (or it can't load). */
export function loadMakeBundle(make: string): Promise<MakeBundle | null> {
  const slug = catalogSlug(make)
  if (!slug) return Promise.resolve(null)
  let load = loads.get(slug)
  if (!load) {
    // A missing file can come back as the dev server's index.html, so a parse
    // failure counts as "no bundle" too.
    load = fetch(`./catalog/${slug}.json`)
      .then((res) => (res.ok ? (res.json() as Promise<MakeBundle>) : null))
      .then((bundle) => (bundle?.years ? bundle : null))
      .catch(() => null)
    loads.set(slug, load)
    // Don't remember a failure: the next pick retries (e.g. back online).
    load.then((bundle) => {
      if (!bundle) loads.delete(slug)
    })
  }
  return load
}

const byName = (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })

/** Models EPA rated for this year, sorted; empty when the year isn't bundled. */
export function bundleModels(bundle: MakeBundle, year: number): string[] {
  return Object.keys(bundle.years[year] ?? {}).sort(byName)
}

export function bundleTrims(bundle: MakeBundle, year: number, model: string): TrimVersion[] {
  const rows = bundle.years[year]?.[model] ?? []
  return uniqueVersions(
    rows.map(([id, displ, cylinders, trany, drive, turbo, supercharged, atvType, fuelType]) =>
      toTrimVersion({ id, displ, cylinders, trany, drive, tCharger: turbo === 1, sCharger: supercharged ? 'S' : null, atvType, fuelType }),
    ),
  )
}

const squash = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, '')

/**
 * Adds NHTSA models EPA doesn't rate (F-250, Ram 2500) to the bundled list.
 * A NHTSA name that only differs in punctuation ("F-150" vs EPA's "F150") is
 * the same model, and the bundled spelling stays so a pick doesn't change
 * under the user.
 */
export function mergeModelNames(bundled: string[], live: string[]): string[] {
  const known = new Set(bundled.map(squash))
  const extra = live.filter((name) => !known.has(squash(name)))
  return extra.length ? [...bundled, ...extra].sort(byName) : bundled
}
