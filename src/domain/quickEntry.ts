// Pure free-text prefill parser for EventForm's "Quick fill" field. NOT the
// bulk paste importer (see importHistory.ts) — this handles a single typed
// line, e.g. "Oil change at Jiffy Lube, $45.99", and reuses that module's
// category matcher rather than duplicating it. No Dexie, no DOM.

import { mapServiceToCategories, primaryCategoryOf } from './importHistory'
import type { MaintenanceCategory } from '../types'

export interface QuickEntryResult {
  category: MaintenanceCategory | null
  additionalCategories: MaintenanceCategory[]
  cost: number | null
  vendor: string | null
  /** True only when a category was found — drives the form's "couldn't detect
   * a category" hint. A cost/vendor hit alone doesn't count as a match. */
  hadMatch: boolean
}

const COST_RE = /\$\s?(\d+(?:\.\d{1,2})?)/

// 1-4 consecutive capitalized words after at/from/by — e.g. "at Jiffy Lube".
// Stops at the first lowercase-initial word so "by hand"/"from memory" never
// misfire a vendor name. Best-effort: a genuine lowercase shop name is missed,
// which is an accepted tradeoff (the field stays editable either way).
const VENDOR_RE = /\b(?:at|from|by)\s+([A-Z][\w&'.-]*(?:\s+[A-Z][\w&'.-]*){0,3})/

export function parseQuickEntry(text: string): QuickEntryResult {
  const trimmed = text.trim()
  if (!trimmed) {
    return { category: null, additionalCategories: [], cost: null, vendor: null, hadMatch: false }
  }

  const categories = mapServiceToCategories(trimmed)
  const category = categories.length ? primaryCategoryOf(categories) : null
  const additionalCategories = category ? categories.filter((c) => c !== category) : []

  const costMatch = trimmed.match(COST_RE)
  const cost = costMatch ? Number(costMatch[1]) : null

  const vendorMatch = trimmed.match(VENDOR_RE)
  const vendor = vendorMatch ? vendorMatch[1].trim() : null

  return { category, additionalCategories, cost, vendor, hadMatch: category !== null }
}
