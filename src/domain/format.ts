// Small shared formatting helpers (framework-free, easy to unit test).

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
