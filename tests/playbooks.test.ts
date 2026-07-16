import { describe, it, expect } from 'vitest'
import {
  PLAYBOOKS,
  getPlaybook,
  resolveStep,
  applicableQuestions,
  outcomeToBriefFacts,
  fairRangeText,
  type Answers,
  type Playbook,
} from '../src/domain/playbooks'
import type { SignalBand } from '../src/domain/verdict'

const BANDS: SignalBand[] = ['fix-now', 'book-soon', 'coast', 'all-clear']

/** Walk a playbook by feeding a fixed answer map until it resolves. */
function run(pb: Playbook, answers: Answers) {
  // guard against an infinite loop if a predicate is malformed
  for (let i = 0; i < 12; i++) {
    const step = resolveStep(pb, answers)
    if (step.kind === 'outcome') return step.outcome
  }
  throw new Error('did not resolve within 12 steps')
}

describe('playbook data integrity', () => {
  it('has the four expected playbooks', () => {
    expect(PLAYBOOKS.map((p) => p.id).sort()).toEqual(
      ['brake-noise', 'leak-smell', 'other-noise', 'warning-light'].sort(),
    )
  })

  it('every outcome (and fallback) uses a valid signal band', () => {
    for (const pb of PLAYBOOKS) {
      for (const o of [...pb.outcomes, pb.fallback]) {
        expect(BANDS, `${pb.id}/${o.id}`).toContain(o.band)
      }
    }
  })

  it('every outcome has a shop-brief symptom + request + a positive cost range', () => {
    for (const pb of PLAYBOOKS) {
      for (const o of [...pb.outcomes, pb.fallback]) {
        expect(o.symptomLine.length, `${pb.id}/${o.id}`).toBeGreaterThan(0)
        expect(o.askShopTo.length).toBeGreaterThan(0)
        expect(o.cost.shopHigh).toBeGreaterThanOrEqual(o.cost.shopLow)
      }
    }
  })

  it('no outcome uses an out-of-vocabulary band like "fix-soon"/"can-coast"', () => {
    // Guards against the two research defects noted in the playbook files.
    const all = PLAYBOOKS.flatMap((p) => [...p.outcomes, p.fallback].map((o) => o.band as string))
    expect(all).not.toContain('fix-soon')
    expect(all).not.toContain('can-coast')
  })
})

describe('resolver — brake noise', () => {
  const pb = getPlaybook('brake-noise')!

  it('starts by asking the sound question', () => {
    const step = resolveStep(pb, {})
    expect(step.kind).toBe('question')
    if (step.kind === 'question') expect(step.question.id).toBe('sound')
  })

  it('grind short-circuits to fix-now after one answer', () => {
    const step = resolveStep(pb, { sound: 'grind' })
    expect(step.kind).toBe('outcome')
    if (step.kind === 'outcome') {
      expect(step.outcome.band).toBe('fix-now')
      expect(step.outcome.id).toBe('grind')
    }
  })

  it('squeal needs a follow-up before resolving', () => {
    const step = resolveStep(pb, { sound: 'squeal' })
    expect(step.kind).toBe('question')
    if (step.kind === 'question') expect(step.question.id).toBe('feel')
  })

  it('squeal on most stops → book-soon (pads low)', () => {
    const o = run(pb, { sound: 'squeal', feel: 'none', often: 'most' })
    expect(o.id).toBe('squeal-most')
    expect(o.band).toBe('book-soon')
  })

  it('squeal only on first stops → coast', () => {
    const o = run(pb, { sound: 'squeal', feel: 'none', often: 'first' })
    expect(o.id).toBe('squeal-first')
    expect(o.band).toBe('coast')
  })

  it('a pull under braking escalates squeal to fix-now', () => {
    const o = run(pb, { sound: 'squeal', feel: 'pull' })
    expect(o.band).toBe('fix-now')
    expect(o.id).toBe('pull-or-long')
  })
})

describe('resolver — warning lights', () => {
  const pb = getPlaybook('warning-light')!

  it('flashing check-engine is always fix-now', () => {
    const o = run(pb, { light: 'cel', flashing: 'flashing' })
    expect(o.band).toBe('fix-now')
    expect(o.id).toBe('cel-flashing')
  })

  it('solid check-engine with no symptoms is book-soon', () => {
    const o = run(pb, { light: 'cel', flashing: 'solid', symptom: 'none' })
    expect(o.band).toBe('book-soon')
    expect(o.id).toBe('cel-solid')
  })

  it('oil-pressure light is fix-now regardless of anything else', () => {
    const o = run(pb, { light: 'oil' })
    expect(o.band).toBe('fix-now')
  })

  it('TPMS is book-soon', () => {
    const o = run(pb, { light: 'tpms' })
    expect(o.band).toBe('book-soon')
    expect(o.id).toBe('tpms')
  })

  it('does not ask the flashing question for a non-CEL light', () => {
    const qs = applicableQuestions(pb, { light: 'tpms' }).map((q) => q.id)
    expect(qs).not.toContain('flashing')
  })
})

describe('resolver — leak / smell / smoke', () => {
  const pb = getPlaybook('leak-smell')!

  it('clear fluid resolves to all-clear', () => {
    const o = run(pb, { what: 'fluid', color: 'clear' })
    expect(o.band).toBe('all-clear')
    expect(o.id).toBe('condensation')
  })

  it('a fuel smell is fix-now', () => {
    const o = run(pb, { what: 'smell', smell: 'gas' })
    expect(o.band).toBe('fix-now')
    expect(o.id).toBe('fuel')
  })

  it('white sweet smoke is fix-now (overheating)', () => {
    const o = run(pb, { what: 'smoke', smoke: 'white' })
    expect(o.band).toBe('fix-now')
    expect(o.id).toBe('coolant-smoke')
  })

  it('green coolant fluid is book-soon', () => {
    const o = run(pb, { what: 'fluid', color: 'green' })
    expect(o.band).toBe('book-soon')
    expect(o.id).toBe('coolant-fluid')
  })
})

describe('resolver — fallback', () => {
  it('falls back to the safe generic outcome when nothing matches', () => {
    // other-noise: an answer combo with no specific outcome
    const pb = getPlaybook('other-noise')!
    const o = run(pb, { when: 'accel', sound: 'hum' })
    expect(o.id).toBe('noise-generic')
    expect(o.band).toBe('book-soon')
  })
})

describe('cost + shop-brief bridge', () => {
  const pb = getPlaybook('brake-noise')!
  const outcome = pb.outcomes.find((o) => o.id === 'grind')!

  it('anchors the fair range to the independent-shop cost', () => {
    expect(fairRangeText(outcome.cost)).toBe('$300–$700')
  })

  it('adapts a triage outcome into the shop-brief module’s BriefFacts', () => {
    const facts = outcomeToBriefFacts(outcome)
    expect(facts.title).toBe(outcome.title)
    expect(facts.band).toBe(outcome.band)
    expect(facts.symptom).toBe(outcome.symptomLine)
    expect(facts.request?.startsWith('Please ')).toBe(true)
    expect(facts.costLow).toBe(outcome.cost.shopLow)
    expect(facts.costHigh).toBe(outcome.cost.shopHigh)
    expect(facts.likelyCause).toBe(outcome.likelyCauses[0])
    expect(facts.escalationTriggers).toEqual(outcome.escalation)
  })
})
