// ---------------------------------------------------------------------------
// Coast quote verification (Stage 5C — design/COAST-PLAN-STAGE5.md).
//
// The advocate feature: the driver types the shop's quoted total, and this
// checks it against the fair range the brief already computed, plus whether the
// diagnostic step that justifies the expensive version was actually done. PURE
// — no DOM, no Dexie, no I/O, no shop network, no referral (that would break
// the owner's-side thesis).
//
// Framing is deliberately soft and never absolute: the worst label is "worth a
// second look," not "fraud." Every rating carries a plain-language reason, and
// a usable second-opinion script is ALWAYS returned so the driver leaves with
// something to say regardless of the number.
// ---------------------------------------------------------------------------

/** One thing the brief asked the shop to check/measure before quoting. `done`
 *  is the driver's answer: true = they did it, false = they skipped it,
 *  null = not answered yet (does NOT count against the shop). */
export interface DiagnosisCheck {
  id: string
  label: string
  done: boolean | null
}

export interface QuoteInput {
  /** Fair-range bounds from the brief; both null when there's no price anchor. */
  fairLow: number | null
  fairHigh: number | null
  quotedTotal: number
  diagnosisChecks: DiagnosisCheck[]
}

export type QuoteRating = 'reasonable' | 'a-bit-high' | 'worth-a-second-look'

export interface QuoteResult {
  rating: QuoteRating
  reasons: string[]
  secondOpinionScript: string[]
}

// Above the fair top by up to this multiple reads as "a bit high" rather than
// "worth a second look" — shops legitimately land above a rough range.
const A_BIT_HIGH_CEILING = 1.3

const SCRIPT: string[] = [
  'Can you show me the worn part you’re replacing?',
  'Which test or measurement pointed to this?',
  'Is there a lower-cost parts option — aftermarket or remanufactured?',
  'Can I get the diagnosis in writing before I decide?',
]

function money(n: number): string {
  return `$${Math.round(n).toLocaleString('en-US')}`
}

function fairRangeText(low: number | null, high: number | null): string | null {
  if (low != null && high != null) return `${money(low)}–${money(high)}`
  const only = low ?? high
  return only != null ? `about ${money(only)}` : null
}

/**
 * Rate a quote against the fair range and the diagnosis steps. Rules:
 *  - quoted ≤ fair top ...................... reasonable
 *  - fair top < quoted ≤ 1.3× fair top ...... a bit high
 *  - beyond 1.3× fair top ................... worth a second look
 *  - ANY diagnosis check marked skipped ..... worth a second look (overrides
 *    the number — a big-ticket quote without the test that justifies it is the
 *    canonical flag, e.g. a head-gasket quote with no pressure test)
 *  - no fair anchor (both bounds null) ...... advisory only: can't judge the
 *    number, so the rating rests entirely on the diagnosis steps, and the
 *    reasons say so plainly.
 * Never throws; a non-positive/non-finite quote is treated as "no number yet"
 * and rated on the checks alone.
 */
export function checkQuote(input: QuoteInput): QuoteResult {
  const { fairLow, fairHigh, quotedTotal, diagnosisChecks } = input
  const hasAnchor = fairLow != null || fairHigh != null
  const hasQuote = Number.isFinite(quotedTotal) && quotedTotal > 0
  const skipped = diagnosisChecks.filter((c) => c.done === false)
  const rangeText = fairRangeText(fairLow, fairHigh)

  const reasons: string[] = []

  // The number, when we have both a quote and an anchor to compare it to.
  let numberRating: QuoteRating | null = null
  if (hasQuote && hasAnchor) {
    const top = fairHigh ?? fairLow! // anchor guaranteed by hasAnchor
    if (quotedTotal <= top) {
      numberRating = 'reasonable'
      reasons.push(`The quote is within the fair range for this job (${rangeText}).`)
    } else if (quotedTotal <= top * A_BIT_HIGH_CEILING) {
      numberRating = 'a-bit-high'
      reasons.push(
        `The quote is above the fair range (${rangeText}), but not wildly — worth asking what else they found.`,
      )
    } else {
      numberRating = 'worth-a-second-look'
      reasons.push(`The quote is well above the fair range (${rangeText}) — more than 30% over the top end.`)
    }
  } else if (!hasAnchor) {
    reasons.push(
      'There’s no fair-price range on file for this specific item, so this only checks the diagnosis steps, not the dollar amount.',
    )
  }

  // A skipped diagnostic step is the strongest signal — it overrides the number.
  if (skipped.length > 0) {
    const first = skipped[0].label
    reasons.push(
      skipped.length === 1
        ? `They quoted this without one key step first: ${lowerFirst(first)}. That’s the check that should come before the expensive version.`
        : `They quoted this without ${skipped.length} of the checks that should come first — starting with ${lowerFirst(first)}.`,
    )
  }

  const rating: QuoteRating =
    skipped.length > 0 ? 'worth-a-second-look' : (numberRating ?? 'reasonable')

  // Make sure there's always at least one reason, even in the all-clear case.
  if (reasons.length === 0) {
    reasons.push('Nothing here stands out — the number and the diagnosis both look reasonable.')
  }

  return { rating, reasons, secondOpinionScript: SCRIPT }
}

function lowerFirst(s: string): string {
  return s ? s.charAt(0).toLowerCase() + s.slice(1) : s
}

/**
 * Turn a brief's "Please …" request line into discrete yes/no diagnosis checks.
 * Heuristic and forgiving — the driver reads and answers each one, so imperfect
 * splitting is fine; worst case it's a single check carrying the whole line.
 * Splits on commas and "and", drops a leading "Please", and trims a trailing
 * "before quoting …" clause (that's framing, not a step). Every check starts
 * `done: null` (unanswered).
 */
export function diagnosisChecksFromRequest(request: string | null | undefined): DiagnosisCheck[] {
  if (!request) return []
  const body = request.replace(/^please\s+/i, '').trim()
  const clauses = body
    // Split on ", and ", a bare comma, or a bare " and " — the ", and " case
    // must consume the "and" so a clause never starts with a dangling "and".
    .split(/\s*,\s*(?:and\s+)?|\s+and\s+/i)
    .map((c) => c.replace(/\bbefore\s+(quoting|replacing|authoriz\w+)\b.*$/i, '').trim())
    .map((c) => c.replace(/[.\s]+$/, '').trim())
    .filter((c) => c.length > 2)
  return clauses.map((label, i) => ({ id: `chk-${i}`, label: capFirst(label), done: null }))
}

function capFirst(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s
}
