import { describe, it, expect } from 'vitest'
import {
  PLAYBOOKS,
  getPlaybook,
  resolveStep,
  applicableQuestions,
  outcomeToBriefFacts,
  fairRangeText,
  contextualizeOutcome,
  type Answers,
  type Playbook,
  type DriveVerdict,
  type TriageContext,
} from '../src/domain/playbooks'
import type { SignalBand } from '../src/domain/verdict'
import type { MaintenanceCategory } from '../src/types'

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
  it('has the six expected playbooks', () => {
    expect(PLAYBOOKS.map((p) => p.id).sort()).toEqual(
      ['brake-noise', 'car-wont-start', 'leak-smell', 'other-noise', 'steering-vibration', 'warning-light'].sort(),
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

  it('coolant-temperature light is fix-now with a tow verdict', () => {
    const o = run(pb, { light: 'temp' })
    expect(o.id).toBe('coolant-temp')
    expect(o.band).toBe('fix-now')
    expect(o.driveOrTow?.verdict).toBe('tow')
  })

  it('red brake light with parking brake confirmed released is fix-now', () => {
    const o = run(pb, { light: 'brake', parkingBrake: 'released' })
    expect(o.id).toBe('brake-light-released')
    expect(o.band).toBe('fix-now')
    expect(o.driveOrTow?.verdict).toBe('tow')
  })

  it('red brake light with the parking brake possibly still on is all-clear', () => {
    const o = run(pb, { light: 'brake', parkingBrake: 'engaged' })
    expect(o.id).toBe('brake-light-parking')
    expect(o.band).toBe('all-clear')
  })

  it('asks the parking-brake question only for the red brake light', () => {
    const qs = applicableQuestions(pb, { light: 'abs' }).map((q) => q.id)
    expect(qs).not.toContain('parkingBrake')
  })
})

describe('resolver — car won’t start', () => {
  const pb = getPlaybook('car-wont-start')!

  it('starts by asking the symptom question', () => {
    const step = resolveStep(pb, {})
    expect(step.kind).toBe('question')
    if (step.kind === 'question') expect(step.question.id).toBe('symptom')
  })

  it('nothing at all resolves to dead battery without a follow-up', () => {
    const o = run(pb, { symptom: 'nothing' })
    expect(o.id).toBe('dead-battery')
    expect(o.band).toBe('fix-now')
  })

  it('rapid clicking also resolves to dead battery', () => {
    const o = run(pb, { symptom: 'clicks', clickType: 'rapid' })
    expect(o.id).toBe('dead-battery')
  })

  it('a single click resolves to the starter', () => {
    const o = run(pb, { symptom: 'clicks', clickType: 'single' })
    expect(o.id).toBe('starter')
  })

  it('clicking needs the click-type follow-up before resolving', () => {
    const step = resolveStep(pb, { symptom: 'clicks' })
    expect(step.kind).toBe('question')
    if (step.kind === 'question') expect(step.question.id).toBe('clickType')
  })

  it('cranking but not catching resolves without a follow-up', () => {
    const o = run(pb, { symptom: 'cranks' })
    expect(o.id).toBe('cranks-no-start')
    expect(o.band).toBe('fix-now')
  })

  it('starting then dying is fix-now with a short-trip-only verdict', () => {
    const o = run(pb, { symptom: 'dies' })
    expect(o.id).toBe('starts-then-dies')
    expect(o.driveOrTow?.verdict).toBe('short-trip-only')
  })

  it('every outcome in this playbook is fix-now (a no-start is never coast/all-clear)', () => {
    for (const o of pb.outcomes) expect(o.band).toBe('fix-now')
  })
})

describe('resolver — steering / vibration', () => {
  const pb = getPlaybook('steering-vibration')!

  it('starts by asking when it happens', () => {
    const step = resolveStep(pb, {})
    expect(step.kind).toBe('question')
    if (step.kind === 'question') expect(step.question.id).toBe('when')
  })

  it('loose steering is fix-now regardless of when', () => {
    const o = run(pb, { when: 'always', feel: 'loose' })
    expect(o.id).toBe('loose-steering')
    expect(o.band).toBe('fix-now')
    expect(o.driveOrTow?.verdict).toBe('short-trip-only')
  })

  it('heavy/stiff steering is fix-now', () => {
    const o = run(pb, { when: 'highway', feel: 'stiff' })
    expect(o.id).toBe('power-steering-stiff')
    expect(o.band).toBe('fix-now')
  })

  it('a highway vibration is book-soon (tire/wheel balance)', () => {
    const o = run(pb, { when: 'highway', feel: 'vibrate' })
    expect(o.id).toBe('vibrate-highway')
    expect(o.band).toBe('book-soon')
  })

  it('a vibration only when turning points at a tie rod / CV joint', () => {
    const o = run(pb, { when: 'turning', feel: 'vibrate' })
    expect(o.id).toBe('vibrate-turning')
  })

  it('a constant low-speed vibration points at tires or a bearing', () => {
    const o = run(pb, { when: 'always', feel: 'vibrate' })
    expect(o.id).toBe('vibrate-always')
  })

  it('pulling/wandering is book-soon (alignment)', () => {
    const o = run(pb, { when: 'always', feel: 'pull' })
    expect(o.id).toBe('pull-wander')
    expect(o.band).toBe('book-soon')
  })

  it('a clunk when turning matches regardless of the "when" answer', () => {
    const o = run(pb, { when: 'turning', feel: 'noise' })
    expect(o.id).toBe('clunk-turning')
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

// --- Stage 5A: the action layer (design/COAST-PLAN-STAGE5.md) ---------------

const DRIVE_VERDICTS: DriveVerdict[] = ['drive-ok', 'short-trip-only', 'tow']

/** Every outcome across every playbook, tagged with its playbook id. */
function allOutcomes() {
  return PLAYBOOKS.flatMap((pb) =>
    [...pb.outcomes, pb.fallback].map((o) => ({ pb: pb.id, o })),
  )
}

describe('action layer — data integrity', () => {
  it('every fix-now outcome carries a drive-or-tow call (it is the safety call)', () => {
    for (const { pb, o } of allOutcomes()) {
      if (o.band !== 'fix-now') continue
      expect(o.driveOrTow, `${pb}/${o.id} is fix-now but has no driveOrTow`).toBeDefined()
    }
  })

  it('the plan’s named high-traffic outcomes are curated', () => {
    // brake grind, flashing CEL, coolant, oil pressure — COAST-PLAN-STAGE5.md 5A.
    const curated = ['grind', 'cel-flashing', 'coolant-smoke', 'oil']
    for (const id of curated) {
      const found = allOutcomes().find((x) => x.o.id === id)
      expect(found, `outcome ${id} not found`).toBeDefined()
      const o = found!.o
      expect(o.driveOrTow, `${id}.driveOrTow`).toBeDefined()
      expect(o.selfCheck?.length, `${id}.selfCheck`).toBeGreaterThan(0)
      expect(o.whatToBring?.length, `${id}.whatToBring`).toBeGreaterThan(0)
      expect(o.shopChoice?.length, `${id}.shopChoice`).toBeGreaterThan(0)
    }
  })

  it('every drive-or-tow uses a valid verdict and a non-empty note', () => {
    for (const { pb, o } of allOutcomes()) {
      if (!o.driveOrTow) continue
      expect(DRIVE_VERDICTS, `${pb}/${o.id}`).toContain(o.driveOrTow.verdict)
      expect(o.driveOrTow.note.length, `${pb}/${o.id} note`).toBeGreaterThan(0)
    }
  })

  it('no fix-now outcome tells the driver it is safe to keep driving', () => {
    // A fail-safe: the action layer must never contradict the band's urgency.
    for (const { pb, o } of allOutcomes()) {
      if (o.band === 'fix-now' && o.driveOrTow) {
        expect(o.driveOrTow.verdict, `${pb}/${o.id}`).not.toBe('drive-ok')
      }
    }
  })

  it('action fields are never empty arrays or blank strings when present', () => {
    for (const { pb, o } of allOutcomes()) {
      const where = `${pb}/${o.id}`
      if (o.selfCheck) {
        expect(o.selfCheck.length, `${where}.selfCheck`).toBeGreaterThan(0)
        for (const s of o.selfCheck) expect(s.trim().length, where).toBeGreaterThan(0)
      }
      if (o.whatToBring) {
        expect(o.whatToBring.length, `${where}.whatToBring`).toBeGreaterThan(0)
        for (const s of o.whatToBring) expect(s.trim().length, where).toBeGreaterThan(0)
      }
      if (o.shopChoice) expect(o.shopChoice.trim().length, where).toBeGreaterThan(0)
    }
  })
})

describe('action layer — additive fields do not perturb resolution', () => {
  it('resolveStep still returns the curated outcome unchanged, fields intact', () => {
    const pb = getPlaybook('brake-noise')!
    const step = resolveStep(pb, { sound: 'grind' })
    expect(step.kind).toBe('outcome')
    if (step.kind !== 'outcome') return
    // identity, not a copy — the resolver hands back the playbook's own object
    expect(step.outcome).toBe(pb.outcomes.find((o) => o.id === 'grind'))
    expect(step.outcome.driveOrTow?.verdict).toBe('short-trip-only')
    expect(step.outcome.selfCheck?.length).toBeGreaterThan(0)
  })

  it('an uncurated outcome still resolves fine (renders fewer cards, never blocks)', () => {
    const pb = getPlaybook('other-noise')!
    const o = run(pb, { when: 'accel', sound: 'hum' })
    expect(o.id).toBe('noise-generic')
    // no action curation yet — that is allowed, and must not throw
    expect(o.driveOrTow).toBeUndefined()
  })
})

describe('action layer — whatToBring stays out of the shop brief', () => {
  it('is for the driver, so it never reaches BriefFacts', () => {
    const pb = getPlaybook('brake-noise')!
    const outcome = pb.outcomes.find((o) => o.id === 'grind')!
    expect(outcome.whatToBring?.length).toBeGreaterThan(0)
    const facts = outcomeToBriefFacts(outcome) as Record<string, unknown>
    expect(facts.whatToBring).toBeUndefined()
    expect(JSON.stringify(facts)).not.toContain('receipt')
  })
})

// --- Stage 5B: context-aware verdicts (design/COAST-PLAN-STAGE5.md) --------

function ctx(overdue: MaintenanceCategory[] = [], dueSoon: MaintenanceCategory[] = []): TriageContext {
  return { overdueCategories: new Set(overdue), dueSoonCategories: new Set(dueSoon) }
}

describe('contextualizeOutcome', () => {
  const pb = getPlaybook('brake-noise')!
  const outcome = pb.outcomes.find((o) => o.id === 'grind')! // category: 'brake-inspection'

  it('is a no-op (identity-equal) when the category is neither overdue nor due soon', () => {
    const result = contextualizeOutcome(outcome, ctx(['oil-change'], ['tire-inspection']))
    expect(result).toBe(outcome)
  })

  it('is a no-op when the outcome has no category at all', () => {
    const synthetic = { ...outcome, category: undefined }
    const result = contextualizeOutcome(synthetic, ctx(['brake-inspection']))
    expect(result).toBe(synthetic)
  })

  it('prepends a context note when the category is overdue', () => {
    const result = contextualizeOutcome(outcome, ctx(['brake-inspection']))
    expect(result).not.toBe(outcome)
    expect(result.explanation.toLowerCase()).toContain('overdue')
    expect(result.explanation.endsWith(outcome.explanation)).toBe(true)
  })

  it('prepends a due-soon note (distinct from the overdue note) when only due soon', () => {
    const result = contextualizeOutcome(outcome, ctx([], ['brake-inspection']))
    expect(result.explanation.toLowerCase()).toContain('due soon')
    expect(result.explanation.toLowerCase()).not.toContain('overdue')
  })

  it('overdue takes precedence when a category is in both sets', () => {
    const result = contextualizeOutcome(outcome, ctx(['brake-inspection'], ['brake-inspection']))
    expect(result.explanation.toLowerCase()).toContain('overdue')
  })

  it('never changes the band', () => {
    const result = contextualizeOutcome(outcome, ctx(['brake-inspection']))
    expect(result.band).toBe(outcome.band)
  })

  it('never changes or drops escalation triggers', () => {
    const result = contextualizeOutcome(outcome, ctx(['brake-inspection']))
    expect(result.escalation).toEqual(outcome.escalation)
  })

  it('does not mutate the original outcome object', () => {
    const before = outcome.explanation
    contextualizeOutcome(outcome, ctx(['brake-inspection']))
    expect(outcome.explanation).toBe(before)
  })
})
