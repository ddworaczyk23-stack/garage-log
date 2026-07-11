// Small shared formatting helpers (framework-free, easy to unit test).

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/**
 * Standard date display used everywhere history/activity is shown:
 *   "2026-03-01" -> "Mar 1, 2026"
 * Parses the Y-M-D directly (no `new Date`) so it never shifts a day across
 * time zones. null/undefined/blank -> "—"; anything unparseable falls back to
 * the raw input so nothing is silently lost.
 */
export function formatShortDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  if (!m) return iso
  const month = Number(m[2]) - 1
  if (month < 0 || month > 11) return iso
  return `${MONTHS[month]} ${Number(m[3])}, ${m[1]}`
}

/** Standard mileage display: 40000 -> "40,000 mi". null/NaN -> "—". */
export function formatMiles(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return '—'
  return `${Math.round(n).toLocaleString()} mi`
}

/** Standard currency display: 65 -> "$65.00". */
export function formatMoney(n: number | null | undefined): string {
  return `$${(n ?? 0).toFixed(2)}`
}

/**
 * A Date's calendar date as "YYYY-MM-DD" using LOCAL time components — not
 * `toISOString()`, which is UTC and can land on the wrong calendar day
 * whenever the local zone isn't UTC (e.g. an evening entry in any US zone
 * reads as "tomorrow" in UTC).
 */
export function localDateISO(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/**
 * Parses a numeric form field: blank -> null, non-numeric -> null (never
 * NaN), otherwise the number. Used everywhere a text/number input feeds an
 * optional numeric DB field, so a stray non-numeric value can't silently
 * persist as NaN (which then fails every downstream comparison).
 */
export function parseNumberInput(raw: string): number | null {
  const trimmed = raw.trim()
  if (!trimmed) return null
  const n = Number(trimmed)
  return Number.isNaN(n) ? null : n
}

/**
 * Turn an interval into text:
 *   (10000, 12) -> "Every 10,000 mi or 1 yr"
 *   (5000, null) -> "Every 5,000 mi"
 *   (null, 24)   -> "Every 2 yr"
 *   (null, null) -> "As needed"
 *   conditionBased=true -> "Inspect / condition-based" (no fixed interval, e.g. alignment)
 * Months are shown as whole years when evenly divisible.
 */
export function formatInterval(
  miles: number | null,
  months: number | null,
  conditionBased = false,
): string {
  if (conditionBased) return 'Inspect / condition-based'
  const parts: string[] = []
  if (miles != null) parts.push(`${miles.toLocaleString()} mi`)
  if (months != null) parts.push(months % 12 === 0 ? `${months / 12} yr` : `${months} mo`)
  return parts.length ? `Every ${parts.join(' or ')}` : 'As needed'
}
