import { describe, it, expect } from 'vitest'
import {
  checkQuote,
  diagnosisChecksFromRequest,
  type DiagnosisCheck,
  type QuoteInput,
} from '../src/domain/quoteCheck'

function input(over: Partial<QuoteInput> = {}): QuoteInput {
  return { fairLow: 300, fairHigh: 700, quotedTotal: 500, diagnosisChecks: [], ...over }
}

describe('checkQuote — rating thresholds', () => {
  it('within the fair range reads as reasonable', () => {
    expect(checkQuote(input({ quotedTotal: 500 })).rating).toBe('reasonable')
    expect(checkQuote(input({ quotedTotal: 700 })).rating).toBe('reasonable') // exactly the top
  })

  it('just above the top (≤1.3×) reads as a bit high', () => {
    expect(checkQuote(input({ quotedTotal: 800 })).rating).toBe('a-bit-high')
    expect(checkQuote(input({ quotedTotal: 910 })).rating).toBe('a-bit-high') // 1.3 × 700
  })

  it('well above the top (>1.3×) reads as worth a second look', () => {
    expect(checkQuote(input({ quotedTotal: 1400 })).rating).toBe('worth-a-second-look')
    expect(checkQuote(input({ quotedTotal: 911 })).rating).toBe('worth-a-second-look')
  })

  it('uses fairLow as the anchor top when fairHigh is missing', () => {
    const r = checkQuote(input({ fairLow: 300, fairHigh: null, quotedTotal: 250 }))
    expect(r.rating).toBe('reasonable')
  })
})

describe('checkQuote — a skipped diagnosis step overrides the number', () => {
  const checks: DiagnosisCheck[] = [
    { id: 'a', label: 'Pressure-test the cooling system', done: false },
    { id: 'b', label: 'Measure pad thickness', done: true },
  ]

  it('escalates an otherwise-reasonable quote to worth-a-second-look', () => {
    const r = checkQuote(input({ quotedTotal: 500, diagnosisChecks: checks }))
    expect(r.rating).toBe('worth-a-second-look')
    expect(r.reasons.join(' ')).toMatch(/pressure-test/i)
  })

  it('an unanswered check (done: null) does NOT escalate', () => {
    const r = checkQuote(
      input({ quotedTotal: 500, diagnosisChecks: [{ id: 'a', label: 'X', done: null }] }),
    )
    expect(r.rating).toBe('reasonable')
  })

  it('a check marked done (true) does NOT escalate', () => {
    const r = checkQuote(
      input({ quotedTotal: 500, diagnosisChecks: [{ id: 'a', label: 'X', done: true }] }),
    )
    expect(r.rating).toBe('reasonable')
  })
})

describe('checkQuote — no price anchor (advisory only)', () => {
  it('rates as no-anchor (neutral), not reasonable — the amount was never judged', () => {
    const r = checkQuote({ fairLow: null, fairHigh: null, quotedTotal: 1400, diagnosisChecks: [] })
    expect(r.rating).toBe('no-anchor')
    expect(r.rating).not.toBe('reasonable')
    expect(r.reasons.join(' ')).toMatch(/no fair-price range/i)
  })

  it('still flags a skipped check without an anchor, overriding the neutral rating', () => {
    const r = checkQuote({
      fairLow: null,
      fairHigh: null,
      quotedTotal: 1400,
      diagnosisChecks: [{ id: 'a', label: 'Pressure-test first', done: false }],
    })
    expect(r.rating).toBe('worth-a-second-look')
  })

  it('an anchor of only fairLow still counts as an anchor (not no-anchor)', () => {
    const r = checkQuote({ fairLow: 300, fairHigh: null, quotedTotal: 250, diagnosisChecks: [] })
    expect(r.rating).toBe('reasonable')
  })
})

describe('checkQuote — robustness + invariants', () => {
  it('always returns a non-empty second-opinion script', () => {
    for (const q of [0, 500, 5000, NaN, -100]) {
      const r = checkQuote(input({ quotedTotal: q }))
      expect(r.secondOpinionScript.length).toBeGreaterThan(0)
    }
  })

  it('always returns at least one reason', () => {
    expect(checkQuote(input()).reasons.length).toBeGreaterThan(0)
  })

  it('a non-positive/NaN quote is treated as "no number yet" (rated on checks only)', () => {
    expect(checkQuote(input({ quotedTotal: NaN })).rating).toBe('reasonable')
    expect(checkQuote(input({ quotedTotal: 0 })).rating).toBe('reasonable')
    // but a skipped check still flags even without a usable number
    const r = checkQuote(input({ quotedTotal: 0, diagnosisChecks: [{ id: 'a', label: 'X', done: false }] }))
    expect(r.rating).toBe('worth-a-second-look')
  })

  it('never throws on any combination', () => {
    expect(() => checkQuote({ fairLow: null, fairHigh: null, quotedTotal: NaN, diagnosisChecks: [] })).not.toThrow()
  })
})

describe('diagnosisChecksFromRequest', () => {
  it('splits a "Please …" request into discrete checks and drops the "before quoting" tail', () => {
    const checks = diagnosisChecksFromRequest(
      'Please measure pad thickness, inspect the rotors for scoring, and check for a seized caliper before quoting pads only.',
    )
    expect(checks.length).toBe(3)
    expect(checks[0].label).toBe('Measure pad thickness')
    expect(checks[2].label.toLowerCase()).toContain('seized caliper')
    // the "before quoting pads only" framing is trimmed off the last clause
    expect(checks[2].label.toLowerCase()).not.toContain('quoting')
    for (const c of checks) expect(c.done).toBeNull()
  })

  it('returns an empty list for null/blank input', () => {
    expect(diagnosisChecksFromRequest(null)).toEqual([])
    expect(diagnosisChecksFromRequest('')).toEqual([])
    expect(diagnosisChecksFromRequest('   ')).toEqual([])
  })

  it('assigns stable unique ids', () => {
    const checks = diagnosisChecksFromRequest('Please check A, and check B.')
    expect(new Set(checks.map((c) => c.id)).size).toBe(checks.length)
  })
})
