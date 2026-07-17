import { useState } from 'preact/hooks'
import { db } from '../db/db'
import { useQuery } from '../db/useQuery'
import { getCurrentMileageEstimate } from '../db/events'
import { getOpenConcerns, openConcern, resolveConcern, deleteConcern } from '../db/concerns'
import {
  PLAYBOOKS,
  getPlaybook,
  resolveStep,
  outcomeToBriefFacts,
  fairRangeText,
  type Answers,
  type Playbook,
  type PlaybookOutcome,
  type DriveVerdict,
} from '../domain/playbooks'
import { composeBrief } from '../domain/shopBrief'
import type { SignalBand } from '../domain/verdict'
import { vehicleLabel } from '../domain/vehicle'
import { formatShortDate } from '../domain/format'
import { Loading, EmptyState, ConfirmButton } from '../components/ui'
import type { Vehicle, Concern } from '../types'

// ---------------------------------------------------------------------------
// Coast "Start a check" triage flow (Stage 2 — see design/COAST-PLAN.md).
//
// #/check            -> pick a vehicle (auto-skips when there's only one)
// #/check/<id>       -> run the triage flow for that vehicle
//
// The flow reuses Stage 1's road-sign verdict styling (.cv-panel / ruler) and
// the four-signal band vocabulary. Reaching a verdict, the driver can add it to
// the vehicle's list (a synced Concern) or see the shop brief inline. Open
// concerns for the vehicle show at the top so the loop closes here: raise ->
// persists -> shows -> resolve/dismiss clears it.
// ---------------------------------------------------------------------------

const BAND_TONE: Record<SignalBand, { cls: string; tag: string; pin: number; label: string }> = {
  'fix-now': { cls: 'cv-red', tag: 'Verdict · Fix now', pin: 12, label: 'Fix now' },
  'book-soon': { cls: 'cv-amber', tag: 'Verdict · Book soon', pin: 36, label: 'Book soon' },
  coast: { cls: 'cv-blue', tag: 'Verdict · You can coast', pin: 62, label: 'Can coast' },
  'all-clear': { cls: 'cv-green', tag: 'Verdict · All clear', pin: 88, label: 'All clear' },
}

// The drive-vs-tow call (Stage 5A). 'tow' is the safety call, so it carries the
// strongest treatment — the red tint the escalation block already uses.
const DRIVE_TONE: Record<DriveVerdict, { cls: string; label: string }> = {
  'drive-ok': { cls: 'is-ok', label: 'Safe to keep driving' },
  'short-trip-only': { cls: 'is-short', label: 'Short trip only — nearest shop' },
  tow: { cls: 'is-tow', label: 'Don’t drive it' },
}

export function Check({ vehicleId }: { vehicleId?: string }) {
  if (vehicleId) return <CheckVehicle vehicleId={vehicleId} />
  return <CheckPicker />
}

// --- vehicle picker --------------------------------------------------------

function CheckPicker() {
  const vehicles = useQuery(() => db.vehicles.orderBy('name').toArray(), [])
  if (!vehicles) return <Loading />

  // With a single vehicle there's nothing to choose — go straight in.
  if (vehicles.length === 1) {
    window.location.hash = `#/check/${vehicles[0].id}`
    return <Loading label="Opening…" />
  }

  if (vehicles.length === 0) {
    return (
      <section class="page">
        <EmptyState
          title="No vehicles yet"
          hint="Add a vehicle first, then you can run a check on it."
          action={<a class="btn btn-primary" href="#/add-vehicle">Add a vehicle</a>}
        />
      </section>
    )
  }

  return (
    <section class="page chk">
      <span class="eyebrow">Start a check</span>
      <h2 class="chk-title">Which vehicle?</h2>
      <div class="chk-choices">
        {vehicles.map((v) => (
          <a key={v.id} class="chk-choice" href={`#/check/${v.id}`}>
            <span>
              <b>{vehicleLabel(v)}</b>
              <small>{v.year} {v.make} {v.model}</small>
            </span>
            <Chevron />
          </a>
        ))}
      </div>
    </section>
  )
}

// --- the flow --------------------------------------------------------------

interface FlowData {
  vehicle: Vehicle | null
  mileage: number | null
  historyKnown: boolean
  concerns: Concern[]
}

function CheckVehicle({ vehicleId }: { vehicleId: string }) {
  const data = useQuery<FlowData>(
    async () => {
      const [vehicle, mileage, eventCount, concerns] = await Promise.all([
        db.vehicles.get(vehicleId),
        getCurrentMileageEstimate(vehicleId),
        db.events.where('vehicleId').equals(vehicleId).count(),
        getOpenConcerns(vehicleId),
      ])
      return {
        vehicle: vehicle ?? null,
        mileage: mileage?.miles ?? null,
        historyKnown: eventCount > 0,
        concerns,
      }
    },
    [vehicleId],
  )

  // Flow state. `answers` drives the resolver; `trail` is the ordered list of
  // answered question ids so Back can pop one at a time.
  const [playbookId, setPlaybookId] = useState<string | null>(null)
  const [answers, setAnswers] = useState<Answers>({})
  const [trail, setTrail] = useState<string[]>([])
  const [showBrief, setShowBrief] = useState(false)
  // Null until "Add to my list" succeeds, then the new concern's id (which
  // also unlocks the link to the standalone shareable brief page).
  const [addedId, setAddedId] = useState<string | null>(null)

  if (!data) return <Loading />
  if (!data.vehicle) {
    return (
      <section class="page">
        <EmptyState
          title="Vehicle not found"
          hint="It may have been removed."
          action={<a class="btn" href="#/check">Back to check</a>}
        />
      </section>
    )
  }
  const vehicle = data.vehicle
  const playbook = playbookId ? getPlaybook(playbookId) : undefined

  function reset() {
    setPlaybookId(null)
    setAnswers({})
    setTrail([])
    setShowBrief(false)
    setAddedId(null)
  }

  function choosePlaybook(pb: Playbook) {
    setPlaybookId(pb.id)
    setAnswers({})
    setTrail([])
    setShowBrief(false)
    setAddedId(null)
  }

  function answer(qid: string, value: string) {
    setAnswers((a) => ({ ...a, [qid]: value }))
    setTrail((t) => [...t, qid])
  }

  function back() {
    if (trail.length > 0) {
      const last = trail[trail.length - 1]
      setTrail((t) => t.slice(0, -1))
      setAnswers((a) => {
        const next = { ...a }
        delete next[last]
        return next
      })
      setShowBrief(false)
      return
    }
    if (playbook) {
      reset()
      return
    }
    window.location.hash = '#/'
  }

  // ---- phase: choose a playbook ----
  if (!playbook) {
    return (
      <section class="page chk">
        <FlowTop onBack={back} />
        {data.concerns.length > 0 && (
          <ConcernList vehicle={vehicle} concerns={data.concerns} />
        )}
        <span class="eyebrow">Checking {vehicleLabel(vehicle)}</span>
        <h2 class="chk-title">What’s going on?</h2>
        <p class="chk-sub">Describe it like you’d tell a friend — no car words needed.</p>
        <div class="chk-choices">
          {PLAYBOOKS.map((pb) => (
            <button key={pb.id} type="button" class="chk-choice" onClick={() => choosePlaybook(pb)}>
              <span>
                <b>{pb.label}</b>
                <small>{pb.blurb}</small>
              </span>
              <Chevron />
            </button>
          ))}
        </div>
      </section>
    )
  }

  const step = resolveStep(playbook, answers)

  // ---- phase: a question ----
  if (step.kind === 'question') {
    const q = step.question
    return (
      <section class="page chk">
        <FlowTop onBack={back} steps={stepDots(playbook, answers)} />
        <span class="eyebrow">{q.eyebrow}</span>
        <h2 class="chk-title">{q.text}</h2>
        {q.sub && <p class="chk-sub">{q.sub}</p>}
        <div class="chk-choices">
          {q.options.map((opt) => (
            <button key={opt.value} type="button" class="chk-choice" onClick={() => answer(q.id, opt.value)}>
              <span>
                <b>{opt.label}</b>
                {opt.hint && <small>{opt.hint}</small>}
              </span>
              <Chevron />
            </button>
          ))}
        </div>
      </section>
    )
  }

  // ---- phase: verdict ----
  const outcome = step.outcome
  const tone = BAND_TONE[outcome.band]

  async function addToList() {
    const id = await openConcern(vehicle.id, playbook!, outcome, answers)
    setAddedId(id)
  }

  return (
    <section class="page chk">
      <FlowTop onBack={back} />

      <div class={`cv-panel ${tone.cls}`}>
        <div class="cv-inner">
          <div class="cv-tag">{tone.tag}</div>
          <h2 class="cv-headline">{outcome.title}</h2>
          <p class="cv-sentence">{outcome.explanation}</p>
        </div>
      </div>

      <div class="cv-ruler" role="img" aria-label={`Urgency: ${tone.label}`}>
        <div class="cv-ruler-wrap">
          <div class="cv-ruler-track">
            <i class="cv-red" /><i class="cv-amber" /><i class="cv-blue" /><i class="cv-green" />
          </div>
          <div class="cv-ruler-pin" style={`left:${tone.pin}%`} />
        </div>
        <div class="cv-ruler-labels">
          <span class={outcome.band === 'fix-now' ? 'on' : ''}>Fix now</span>
          <span class={outcome.band === 'book-soon' ? 'on' : ''}>Book soon</span>
          <span class={outcome.band === 'coast' ? 'on' : ''}>Can coast</span>
          <span class={outcome.band === 'all-clear' ? 'on' : ''}>All clear</span>
        </div>
      </div>

      <h3 class="chk-sect">Most likely</h3>
      <ul class="chk-causes">
        {outcome.likelyCauses.map((c) => (
          <li key={c}>{c}</li>
        ))}
      </ul>

      {(outcome.cost.shopLow > 0 || outcome.cost.shopHigh > 0) && (
        <>
          <h3 class="chk-sect">What it’ll likely cost</h3>
          <div class="card chk-cost">
            <CostRow what="At an independent shop" amt={fairRangeText(outcome.cost)} strong />
            {outcome.cost.dealerLow != null && (
              <CostRow what="At a dealer" amt={`$${outcome.cost.dealerLow.toLocaleString()}–$${outcome.cost.dealerHigh!.toLocaleString()}`} />
            )}
            {outcome.cost.diyLow != null && (
              <CostRow what="Doing it yourself — parts" amt={`$${outcome.cost.diyLow.toLocaleString()}–$${outcome.cost.diyHigh!.toLocaleString()}`} />
            )}
          </div>
        </>
      )}

      {outcome.escalation.length > 0 && (
        <>
          <h3 class="chk-sect">When it becomes urgent</h3>
          <div class="chk-escalate">
            <b>Treat it as “fix now” if:</b>
            <ul>
              {outcome.escalation.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          </div>
        </>
      )}

      <ActionCards outcome={outcome} />

      {showBrief && (
        <ShopBriefCard
          vehicle={vehicle}
          mileage={data.mileage}
          historyKnown={data.historyKnown}
          outcome={outcome}
        />
      )}

      <div class="chk-actions">
        {addedId ? (
          <div class="notice notice-ok" role="status">
            Added to {vehicleLabel(vehicle)}’s list. <a href={`#/brief/${addedId}`}>Open the shareable brief →</a>
          </div>
        ) : (
          <button type="button" class="btn btn-primary" onClick={addToList}>
            Add to my list
          </button>
        )}
        <button type="button" class="btn" onClick={() => setShowBrief((s) => !s)}>
          {showBrief ? 'Hide the shop brief' : 'Make my shop brief'}
        </button>
        <button type="button" class="btn-link" onClick={reset}>
          Check something else
        </button>
      </div>
    </section>
  )
}

// --- pieces ----------------------------------------------------------------

/**
 * The action layer (Stage 5A): turns a verdict's what/urgency/cost into the
 * simplest next move. Every field is optional — an uncurated outcome renders
 * fewer cards (or none) rather than blocking, the same discipline the shop
 * brief uses for CATEGORY_BRIEFS. `whatToBring` is deliberately Check-only:
 * it's for the driver, not the shop, so it never reaches the printed brief.
 */
function ActionCards({ outcome }: { outcome: PlaybookOutcome }) {
  const { selfCheck, driveOrTow, whatToBring, shopChoice } = outcome
  const hasAny =
    driveOrTow != null || !!selfCheck?.length || !!whatToBring?.length || !!shopChoice
  if (!hasAny) return null

  const drive = driveOrTow ? DRIVE_TONE[driveOrTow.verdict] : null

  return (
    <>
      <h3 class="chk-sect">Your next move</h3>

      {driveOrTow && drive && (
        <div class={`chk-drive ${drive.cls}`} role={driveOrTow.verdict === 'tow' ? 'alert' : undefined}>
          <div class="chk-drive-head">
            <span class="chk-drive-dot" aria-hidden="true" />
            <b>{drive.label}</b>
          </div>
          <p class="chk-drive-note">{driveOrTow.note}</p>
        </div>
      )}

      {!!selfCheck?.length && (
        <div class="card chk-action">
          <h4 class="chk-action-title">Try this first</h4>
          <ul class="chk-action-list">
            {selfCheck.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ul>
        </div>
      )}

      {!!whatToBring?.length && (
        <div class="card chk-action">
          <h4 class="chk-action-title">What to bring</h4>
          <ul class="chk-action-list">
            {whatToBring.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ul>
        </div>
      )}

      {shopChoice && (
        <div class="card chk-action">
          <h4 class="chk-action-title">Where to take it</h4>
          <p class="chk-action-body">{shopChoice}</p>
        </div>
      )}
    </>
  )
}

function ConcernList({ vehicle, concerns }: { vehicle: Vehicle; concerns: Concern[] }) {
  return (
    <div class="card chk-onlist">
      <h3 class="chk-onlist-title">On {vehicleLabel(vehicle)}’s list</h3>
      {concerns.map((c) => {
        const tone = BAND_TONE[c.band as SignalBand] ?? BAND_TONE['book-soon']
        return (
          <div key={c.id} class="chk-onlist-row">
            <span class={`chk-dot ${tone.cls}`} aria-hidden="true" />
            <span class="chk-onlist-main">
              <b>{c.title}</b>
              <small>
                {tone.label} · raised {formatShortDate(c.createdDate)} · <a href={`#/brief/${c.id}`}>Shop brief</a>
              </small>
            </span>
            <span class="chk-onlist-actions">
              <ConfirmButton
                label="Handled"
                confirmLabel="Mark handled"
                class="btn-link"
                onConfirm={() => resolveConcern(c.id)}
              />
              <ConfirmButton
                label="Dismiss"
                confirmLabel="Remove"
                onConfirm={() => deleteConcern(c.id)}
              />
            </span>
          </div>
        )
      })}
    </div>
  )
}

function ShopBriefCard({
  vehicle,
  mileage,
  historyKnown,
  outcome,
}: {
  vehicle: Vehicle
  mileage: number | null
  historyKnown: boolean
  outcome: PlaybookOutcome
}) {
  // Uses the shared Stage 3 composer (domain/shopBrief.ts) so there's one shop
  // brief in the app; the triage outcome adapts in via outcomeToBriefFacts.
  const brief = composeBrief(vehicle, mileage, outcomeToBriefFacts(outcome), {
    known: historyKnown,
  })
  return (
    <div class="chk-brief">
      <div class="chk-brief-head">
        <div class="chk-brief-tag">Shop brief</div>
        <h3>{brief.vehicleLine}</h3>
        <div class="chk-brief-meta">{brief.metaLine}</div>
      </div>
      <div class="chk-brief-sec">
        <div class="chk-brief-lbl">Symptom, as the shop needs it</div>
        <p>{brief.symptom}</p>
      </div>
      <div class="chk-brief-sec">
        <div class="chk-brief-lbl">Please</div>
        <p>{brief.request}</p>
      </div>
      {brief.fairRange && (
        <div class="chk-brief-sec chk-brief-fair">
          <div class="chk-brief-lbl">Fair range for this job</div>
          <p class="chk-brief-amt">{brief.fairRange}</p>
          <p class="chk-brief-foot">{brief.footerNote}</p>
        </div>
      )}
      {brief.historyNotes.length > 0 && (
        <div class="chk-brief-sec chk-brief-note">
          {brief.historyNotes.map((n) => (
            <p key={n}>{n}</p>
          ))}
        </div>
      )}
    </div>
  )
}

function CostRow({ what, amt, strong }: { what: string; amt: string; strong?: boolean }) {
  return (
    <div class="chk-cost-row">
      <span class="chk-cost-what">{what}</span>
      <span class={`chk-cost-amt${strong ? ' is-strong' : ''}`}>{amt}</span>
    </div>
  )
}

function FlowTop({ onBack, steps }: { onBack: () => void; steps?: boolean[] }) {
  return (
    <div class="chk-flowtop">
      <button type="button" class="chk-back" onClick={onBack} aria-label="Back">
        <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M12.5 4 6.5 10l6 6" />
        </svg>
      </button>
      {steps && (
        <div class="chk-steps" aria-hidden="true">
          {steps.map((done, i) => (
            <i key={i} class={done ? 'done' : ''} />
          ))}
        </div>
      )}
    </div>
  )
}

/** Progress dots: one per applicable question, filled up to the current one. */
function stepDots(pb: Playbook, answers: Answers): boolean[] {
  const applicable = pb.questions.filter((q) => !q.when || q.when(answers))
  return applicable.map((q) => answers[q.id] != null && answers[q.id] !== '')
}

function Chevron() {
  return (
    <svg class="chk-chevron" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M7.5 4 13.5 10l-6 6" />
    </svg>
  )
}
