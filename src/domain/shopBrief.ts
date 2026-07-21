import type { ComputedReminder } from './reminderEngine'
import type { MaintenanceCategory, Vehicle } from '../types'
import type { SignalBand } from './verdict'
import { bandFromStatus } from './verdict'
import { formatMiles, formatMoney, formatShortDate, localDateISO } from './format'

// ---------------------------------------------------------------------------
// Coast shop brief (Stage 3 of design/COAST-PLAN.md) — the "show this at the
// counter" composer. Pure text assembly: vehicle + mileage + item facts in,
// a structured ShopBrief out; the page (Stage 3 UI, after Stage 2 lands)
// only renders fields, it never writes copy.
//
// Two entry points:
//   - composeBrief(vehicle, miles, facts)   — generic; Stage 2's triage
//     concerns adapt into BriefFacts with a one-line mapper (the playbook
//     research already carries symptom/request/cost text per branch).
//   - briefFromReminder(vehicle, miles, r)  — works TODAY from any engine
//     reminder, no concerns table needed (a due item is a scheduled brief).
// No DOM, no Dexie, no I/O — unit-tested in tests/shopBrief.test.ts.
// ---------------------------------------------------------------------------

/** The facts a brief is written from. Everything optional degrades gracefully. */
export interface BriefFacts {
  /** Item name as the owner knows it, e.g. "Front brakes — grinding". */
  title: string
  band: SignalBand
  /** Owner-language symptom summary ("Customer reports …" is added here). */
  symptom?: string | null
  /** The "please inspect X and report Y" instruction, mechanic-language. */
  request?: string | null
  likelyCause?: string | null
  /** Fair range at an independent shop (the anchor price). */
  costLow?: number | null
  costHigh?: number | null
  /** Optional DIY parts range, shown as leverage/context. */
  diyLow?: number | null
  diyHigh?: number | null
  /** "Treat it as fix-now if …" bullets. */
  escalationTriggers?: string[]
  /** Add-ons a decent shop might reasonably suggest alongside this job. */
  reasonableIfSuggested?: string[]
  /** Common upsells that are fine to decline today. */
  fineToDecline?: string[]
}

export interface BriefHistory {
  /** True when the app actually knows when this was last done. */
  known: boolean
  lastDoneDate?: string | null
  lastDoneMiles?: number | null
}

export interface ShopBrief {
  /** "2020 Ford F-150 STX" (nickname deliberately NOT used — shops need the car). */
  vehicleLine: string
  /** "84,231 mi · prepared Jul 15, 2026" (em-dash mileage when unknown). */
  metaLine: string
  title: string
  band: SignalBand
  symptom: string
  request: string
  /** "$300–700 at an independent shop", null when no cost facts exist. */
  fairRange: string | null
  /** Raw fair-range bounds behind `fairRange` — the price anchor Stage 5C's
   *  quote checker reads. Both null when the brief has no cost facts. */
  fairLow: number | null
  fairHigh: number | null
  /** "Doing it yourself: roughly $100–300 in parts.", null when absent. */
  diyNote: string | null
  reasonableIfSuggested: string[]
  fineToDecline: string[]
  /** Unknown-history caveats the shop should hear, possibly empty. */
  historyNotes: string[]
  escalationTriggers: string[]
  /** "Quotes above this range deserve a written explanation…" etc. */
  footerNote: string
}

/** Per-category brief content for schedule-driven items (briefFromReminder).
 * Categories without an entry fall back to GENERIC_* below — a brief is never
 * blocked on missing curation. Cost fields are 2025-2026 US independent-shop /
 * DIY-parts-only ranges from design/perplexity-prompts.md Prompt 7 — a fair
 * anchor, not the cheapest coupon price. Dealer figures from that research
 * aren't stored here; nothing in the UI renders them yet. */
const CATEGORY_BRIEFS: Partial<
  Record<
    MaintenanceCategory,
    Pick<BriefFacts, 'request' | 'reasonableIfSuggested' | 'fineToDecline' | 'costLow' | 'costHigh' | 'diyLow' | 'diyHigh'>
  >
> = {
  'oil-change': {
    request:
      'Oil and filter change to the factory spec. Please note the oil weight used on the invoice.',
    reasonableIfSuggested: ['Tire rotation while it’s on the lift', 'Topping off washer fluid'],
    fineToDecline: ['Engine or injection “flush” services', 'Cabin air filter at shop markup — it’s a cheap DIY'],
    costLow: 35,
    costHigh: 130,
    diyLow: 20,
    diyHigh: 55,
  },
  'tire-rotation': {
    request: 'Rotate tires per the factory pattern. Please report tread depth per corner (in 32nds).',
    reasonableIfSuggested: ['Balancing if a vibration was noted'],
    fineToDecline: ['Alignment without a symptom (pulling, uneven wear)'],
    costLow: 20,
    costHigh: 50,
    diyLow: 0,
    diyHigh: 15,
  },
  'tire-replacement': {
    costLow: 700,
    costHigh: 1200,
    diyLow: 500,
    diyHigh: 900,
  },
  'wheel-alignment': {
    costLow: 90,
    costHigh: 140,
    diyLow: 0,
    diyHigh: 20,
  },
  'brake-inspection': {
    request:
      'Inspect pads and rotors on both axles. Please report pad thickness in millimeters and rotor condition before replacing anything.',
    reasonableIfSuggested: ['Brake fluid flush if it’s over 3 years old'],
    fineToDecline: ['Caliper replacement without evidence of sticking or uneven wear'],
    costLow: 300,
    costHigh: 700,
    diyLow: 120,
    diyHigh: 250,
  },
  'brake-fluid': {
    request: 'Flush and replace brake fluid to spec. Please confirm fluid type on the invoice.',
    reasonableIfSuggested: ['Brake inspection while the wheels are off'],
    fineToDecline: [],
    costLow: 80,
    costHigh: 180,
    diyLow: 10,
    diyHigh: 25,
  },
  coolant: {
    request: 'Drain and refill coolant to the factory spec. Please confirm the coolant type used.',
    reasonableIfSuggested: ['Pressure test if any loss or smell was noted'],
    fineToDecline: ['Additional “system flush” chemicals beyond the drain-and-fill'],
    costLow: 120,
    costHigh: 220,
    diyLow: 20,
    diyHigh: 60,
  },
  'cvt-fluid': {
    request:
      'CVT fluid drain and fill with the manufacturer-specified fluid only. Please confirm the exact fluid on the invoice.',
    reasonableIfSuggested: [],
    fineToDecline: ['A generic “transmission flush” — CVTs want a drain-and-fill with the exact spec fluid'],
    costLow: 180,
    costHigh: 350,
    diyLow: 50,
    diyHigh: 120,
  },
  'transmission-fluid': {
    request:
      'Transmission fluid service with the manufacturer-specified fluid. Please confirm the exact fluid on the invoice.',
    reasonableIfSuggested: [],
    fineToDecline: ['A pressure flush on an old, never-serviced transmission — ask for a drain-and-fill instead'],
    costLow: 150,
    costHigh: 300,
    diyLow: 40,
    diyHigh: 90,
  },
  'engine-air-filter': {
    request: 'Replace the engine air filter.',
    reasonableIfSuggested: [],
    fineToDecline: ['“While we’re in there” induction cleaning services'],
    costLow: 35,
    costHigh: 70,
    diyLow: 15,
    diyHigh: 35,
  },
  'cabin-air-filter': {
    request: 'Replace the cabin air filter.',
    reasonableIfSuggested: [],
    fineToDecline: [],
    costLow: 30,
    costHigh: 100,
    diyLow: 15,
    diyHigh: 50,
  },
  'spark-plugs': {
    request:
      'Replace spark plugs with the factory-specified plugs. Please note the plug part number on the invoice.',
    reasonableIfSuggested: ['Replacing boots/coils only if one shows a misfire or damage'],
    fineToDecline: ['A full coil set “preventively” with no misfire history'],
    costLow: 120,
    costHigh: 350,
    diyLow: 25,
    diyHigh: 120,
  },
  'timing-belt': {
    costLow: 700,
    costHigh: 1400,
    diyLow: 100,
    diyHigh: 350,
  },
  'serpentine-belt': {
    costLow: 90,
    costHigh: 180,
    diyLow: 20,
    diyHigh: 80,
  },
  'fuel-filter': {
    costLow: 60,
    costHigh: 180,
    diyLow: 15,
    diyHigh: 50,
  },
  'power-steering-fluid': {
    costLow: 80,
    costHigh: 160,
    diyLow: 15,
    diyHigh: 40,
  },
  'transfer-case-fluid': {
    costLow: 100,
    costHigh: 180,
    diyLow: 20,
    diyHigh: 50,
  },
  'differential-fluid': {
    costLow: 90,
    costHigh: 180,
    diyLow: 20,
    diyHigh: 60,
  },
  'battery-check': {
    request: 'Load-test the battery and check charging voltage. Please report the test numbers.',
    reasonableIfSuggested: ['Cleaning corroded terminals'],
    fineToDecline: ['Replacement if the load test passes'],
    costLow: 140,
    costHigh: 280,
    diyLow: 90,
    diyHigh: 180,
  },
  'wiper-blades': {
    costLow: 40,
    costHigh: 90,
    diyLow: 20,
    diyHigh: 50,
  },
}

const GENERIC_REQUEST =
  'Please confirm this service is actually needed at the current mileage, and share what you find before doing any additional work.'
const GENERIC_DECLINE = 'Anything not on this brief — happy to hear about it, but please quote it separately.'

const FOOTER_WITH_RANGE =
  'Quotes above this range deserve a written explanation of what else was found.'
const FOOTER_NO_RANGE = 'Please provide a written estimate before starting work.'

function range(low: number | null | undefined, high: number | null | undefined): string | null {
  if (low == null && high == null) return null
  if (low != null && high != null)
    return `${formatMoney(low).replace(/\.00$/, '')}–${formatMoney(high).replace(/\.00$/, '').slice(1)}`
  const only = low ?? high
  return `about ${formatMoney(only).replace(/\.00$/, '')}`
}

function vehicleLine(v: Vehicle): string {
  // The seeded vehicles carry the trim inside `model` ("F-150 STX") as well as
  // in `trim`, so only append trim when the model doesn't already end with it.
  const trim = v.trim && !v.model.toLowerCase().endsWith(v.trim.toLowerCase()) ? v.trim : null
  return [v.year, v.make, v.model, trim].filter(Boolean).join(' ')
}

function metaLine(currentMiles: number | null, preparedDate: string): string {
  return `${currentMiles != null ? formatMiles(currentMiles) : 'mileage not on file'} · prepared ${formatShortDate(preparedDate)}`
}

/** Generic composer — Stage 2's triage results map into BriefFacts directly. */
export function composeBrief(
  vehicle: Vehicle,
  currentMiles: number | null,
  facts: BriefFacts,
  history: BriefHistory = { known: false },
  preparedDate: string = localDateISO(new Date()),
): ShopBrief {
  const fair = range(facts.costLow, facts.costHigh)
  const diy = range(facts.diyLow, facts.diyHigh)

  const historyNotes: string[] = []
  if (!history.known) {
    historyNotes.push(
      'Service history for this item is unknown — please verify condition before replacing parts, and report what you find.',
    )
  } else if (history.lastDoneDate || history.lastDoneMiles != null) {
    historyNotes.push(
      `Last done ${history.lastDoneDate ? formatShortDate(history.lastDoneDate) : ''}${
        history.lastDoneDate && history.lastDoneMiles != null ? ' at ' : ''
      }${history.lastDoneMiles != null ? formatMiles(history.lastDoneMiles) : ''}.`.trim(),
    )
  }

  return {
    vehicleLine: vehicleLine(vehicle),
    metaLine: metaLine(currentMiles, preparedDate),
    title: facts.title,
    band: facts.band,
    symptom: facts.symptom?.trim() || 'No symptom — scheduled maintenance.',
    request: facts.request?.trim() || GENERIC_REQUEST,
    fairRange: fair ? `${fair} at an independent shop` : null,
    fairLow: facts.costLow ?? null,
    fairHigh: facts.costHigh ?? null,
    diyNote: diy ? `Doing it yourself: roughly ${diy} in parts.` : null,
    reasonableIfSuggested: facts.reasonableIfSuggested ?? [],
    fineToDecline: [...(facts.fineToDecline ?? []), GENERIC_DECLINE],
    historyNotes,
    escalationTriggers: facts.escalationTriggers ?? [],
    footerNote: fair ? FOOTER_WITH_RANGE : FOOTER_NO_RANGE,
  }
}

/** The brief as plain text — for navigator.share / clipboard. Same fields the
 * page renders, so the shared text never diverges from the screen. */
export function briefToText(b: ShopBrief): string {
  const lines: string[] = [
    `SHOP BRIEF — ${b.vehicleLine}`,
    b.metaLine,
    '',
    `Item: ${b.title}`,
    `Symptom: ${b.symptom}`,
    `Please: ${b.request}`,
  ]
  if (b.fairRange) lines.push(`Fair range: ${b.fairRange}`)
  if (b.diyNote) lines.push(b.diyNote)
  for (const n of b.historyNotes) lines.push(n)
  if (b.reasonableIfSuggested.length) lines.push('', 'Fair if suggested:', ...b.reasonableIfSuggested.map((s) => `- ${s}`))
  if (b.fineToDecline.length) lines.push('', 'Fine to decline today:', ...b.fineToDecline.map((s) => `- ${s}`))
  lines.push('', b.footerNote, '— Generated by Coast')
  return lines.join('\n')
}

/**
 * A brief straight from an engine reminder — the "book this due item" path
 * that needs no triage concern. The symptom line is the schedule itself.
 */
export function briefFromReminder(
  vehicle: Vehicle,
  currentMiles: number | null,
  r: ComputedReminder,
  preparedDate: string = localDateISO(new Date()),
): ShopBrief {
  const band = bandFromStatus(r.status) ?? 'coast'
  const curated = CATEGORY_BRIEFS[r.rule.category]

  const dueBits: string[] = []
  if (r.milesRemaining != null) {
    dueBits.push(
      r.milesRemaining <= 0
        ? `${formatMiles(Math.abs(r.milesRemaining))} past due`
        : `due in ${formatMiles(r.milesRemaining)}`,
    )
  }
  if (r.daysRemaining != null) {
    dueBits.push(r.daysRemaining <= 0 ? `${Math.abs(r.daysRemaining)} days past due` : `due in ${r.daysRemaining} days`)
  }

  const known = r.lastDone.date != null || r.lastDone.miles != null

  return composeBrief(
    vehicle,
    currentMiles,
    {
      title: r.rule.label,
      band,
      symptom: `Scheduled maintenance${dueBits.length ? ` — ${dueBits.join(', ')}` : ''}.`,
      request: curated?.request,
      reasonableIfSuggested: curated?.reasonableIfSuggested,
      fineToDecline: curated?.fineToDecline,
      costLow: curated?.costLow,
      costHigh: curated?.costHigh,
      diyLow: curated?.diyLow,
      diyHigh: curated?.diyHigh,
    },
    { known, lastDoneDate: r.lastDone.date, lastDoneMiles: r.lastDone.miles },
    preparedDate,
  )
}
