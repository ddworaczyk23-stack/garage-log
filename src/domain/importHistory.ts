// Pure parser + category matcher for the service-history importer. No Dexie, no
// DOM — turns pasted lines (e.g. a Carfax Car Care service history) into
// structured rows the import screen reviews before anything is written. The
// impure side (creating events) lives in db/importHistory.ts.

import { CATEGORY_LABELS, type MaintenanceCategory } from '../types'

export interface ParsedServiceRow {
  /** ISO YYYY-MM-DD, or null when no date was found on the line. */
  date: string | null
  /** Odometer in miles, or null when none was found. */
  miles: number | null
  /** The service description text (line with date/mileage stripped out). */
  service: string
  /** Best-guess maintenance category, or null when nothing matched. */
  category: MaintenanceCategory | null
}

// Keyword → category rules, tried in order (first match wins). Order matters:
// more specific phrases come before broader ones (cabin air before air filter,
// brake fluid before brakes, oil after the filters).
const CATEGORY_RULES: { re: RegExp; category: MaintenanceCategory }[] = [
  { re: /cabin\s*air|cabin\s*filter|in-?cabin|pollen filter/i, category: 'cabin-air-filter' },
  { re: /air\s*filter|engine air/i, category: 'engine-air-filter' },
  { re: /oil (and|&) filter|oil change|changed oil|lube.*oil|oil.*chang/i, category: 'oil-change' },
  { re: /tire.*rotat|rotat.*tire|rotate/i, category: 'tire-rotation' },
  { re: /wheel align|alignment/i, category: 'wheel-alignment' },
  { re: /spark plug/i, category: 'spark-plugs' },
  { re: /coolant|antifreeze|radiator flush/i, category: 'coolant' },
  { re: /brake fluid/i, category: 'brake-fluid' },
  { re: /brake|brakes|pad(s)?\b|rotor/i, category: 'brake-inspection' },
  { re: /\bcvt\b/i, category: 'cvt-fluid' },
  { re: /transmission|trans fluid|\batf\b/i, category: 'transmission-fluid' },
  { re: /transfer case/i, category: 'transfer-case-fluid' },
  { re: /differential|\bdiff\b|axle/i, category: 'differential-fluid' },
  { re: /battery|charging system/i, category: 'battery-check' },
  { re: /wiper/i, category: 'wiper-blades' },
  {
    re: /multi-?point|maintenance inspection|pre-?purchase inspection|pre-?delivery inspection|inspection completed/i,
    category: 'multi-point-inspection',
  },
]

/** Map a free-text service description to a maintenance category, or null. */
export function mapServiceToCategory(service: string): MaintenanceCategory | null {
  for (const { re, category } of CATEGORY_RULES) {
    if (re.test(service)) return category
  }
  return null
}

const DATE_MDY = /\b(\d{1,2})\/(\d{1,2})\/(\d{2,4})\b/
const DATE_ISO = /\b(\d{4})-(\d{2})-(\d{2})\b/

function toISO(line: string): { iso: string; matched: string } | null {
  const iso = line.match(DATE_ISO)
  if (iso) return { iso: `${iso[1]}-${iso[2]}-${iso[3]}`, matched: iso[0] }
  const mdy = line.match(DATE_MDY)
  if (mdy) {
    const mm = mdy[1].padStart(2, '0')
    const dd = mdy[2].padStart(2, '0')
    let yyyy = mdy[3]
    if (yyyy.length === 2) yyyy = `20${yyyy}`
    return { iso: `${yyyy}-${mm}-${dd}`, matched: mdy[0] }
  }
  return null
}

// A comma-grouped number (95,170) or a bare 4–7 digit run, optionally followed
// by "mi". With an explicit "mi" suffix even short numbers count.
const MILES_WITH_UNIT = /(\d{1,3}(?:,\d{3})+|\d+)\s*mi\b/i
const MILES_BARE = /\b(\d{1,3}(?:,\d{3})+|\d{4,7})\b/

function extractMiles(text: string): { miles: number; matched: string } | null {
  const withUnit = text.match(MILES_WITH_UNIT)
  if (withUnit) return { miles: Number(withUnit[1].replace(/,/g, '')), matched: withUnit[0] }
  const bare = text.match(MILES_BARE)
  if (bare) return { miles: Number(bare[1].replace(/,/g, '')), matched: bare[0] }
  return null
}

function cleanService(text: string): string {
  return text
    .replace(/\b(odometer|date|services? performed|mi)\b/gi, ' ')
    .replace(/[|\t,]+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .replace(/^[\s\-–—:]+|[\s\-–—:]+$/g, '')
    .trim()
}

/**
 * Parse pasted text into service rows. Auto-detects two shapes:
 *  - CARFAX BLOCK (what you get copying a Carfax "Service History" page): each
 *    record spans lines — shop, "Date", <date>, "Odometer", <miles>, "Services
 *    Performed", then one service per line. Detected by the "Services Performed"
 *    label.
 *  - ONE-PER-LINE (`date, miles, service`): the compact fallback format; field
 *    order and separators (comma / tab / pipe / spaces) don't matter.
 * Either way, noise lines just map to a null category and are excluded in the
 * review step, so a rough paste is safe.
 */
export function parseHistoryText(text: string): ParsedServiceRow[] {
  if (/services performed/i.test(text)) return parseCarfaxBlocks(text)
  return parseLines(text)
}

function parseLines(text: string): ParsedServiceRow[] {
  const rows: ParsedServiceRow[] = []
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line) continue

    const date = toISO(line)
    if (!date) continue // no date → not a record line

    const withoutDate = line.replace(date.matched, ' ')
    const milesHit = extractMiles(withoutDate)
    const withoutMiles = milesHit ? withoutDate.replace(milesHit.matched, ' ') : withoutDate

    const service = cleanService(withoutMiles)
    if (!service) continue // date only, no description → skip

    rows.push({
      date: date.iso,
      miles: milesHit ? milesHit.miles : null,
      service,
      category: mapServiceToCategory(service),
    })
  }
  return rows
}

// A new shop or Carfax page chrome — ends the current record's service list.
const CARFAX_BOUNDARY = /\(https:\/\//i
const CARFAX_CHROME =
  /^(edit record|add note|upload receipts|view receipt|add record|invite shop|back to top|rate service|something wrong|get help|products|resources|about us|contact us|learn more|dashboard|service history|maintenance schedule|repair costs|garage|download our|used cars|shop the app|carfax|terms of use|privacy|ad choices|your privacy|©|\d+\/\d+$)/i
const MILES_ONLY = /^([\d,]+)\s*mi\b/i

/** Extract records from Carfax-style multi-line blocks. Tracks the current
 * date/mileage as the labels go by and emits one row per service line under
 * "Services Performed". Generic "Vehicle serviced" headers are skipped; anything
 * unrecognized still comes through with a null category for the user to sort out. */
function parseCarfaxBlocks(text: string): ParsedServiceRow[] {
  const rows: ParsedServiceRow[] = []
  let curDate: string | null = null
  let curMiles: number | null = null
  let inServices = false

  for (const raw of text.split(/\r?\n/)) {
    const l = raw.trim()
    if (!l) continue

    if (CARFAX_BOUNDARY.test(l) || CARFAX_CHROME.test(l)) {
      // next shop / page furniture → close the block and start a fresh record
      inServices = false
      curDate = null
      curMiles = null
      continue
    }
    if (/^date$/i.test(l) || /^odometer$/i.test(l)) {
      inServices = false
      continue
    }
    if (/^services performed$/i.test(l)) {
      inServices = true
      continue
    }
    const dateOnly = toISO(l)
    if (dateOnly && l.replace(/\s/g, '').length <= 10) {
      curDate = dateOnly.iso
      inServices = false
      continue
    }
    const milesOnly = l.match(MILES_ONLY)
    if (milesOnly) {
      curMiles = Number(milesOnly[1].replace(/,/g, ''))
      inServices = false
      continue
    }
    if (inServices) {
      if (/^vehicle serviced$/i.test(l)) continue // Carfax generic header, not a service
      rows.push({ date: curDate, miles: curMiles, service: l, category: mapServiceToCategory(l) })
    }
  }
  return rows
}

/** A row is ready to import when it has a date, a mileage, and a category. */
export function isImportable(row: ParsedServiceRow): boolean {
  return row.date !== null && row.miles !== null && row.category !== null
}

/** Distinct categories that a set of rows would establish a baseline for. */
export function baselineCategories(rows: ParsedServiceRow[]): string[] {
  const set = new Set<string>()
  for (const r of rows) {
    if (r.category) set.add(CATEGORY_LABELS[r.category])
  }
  return [...set].sort()
}
