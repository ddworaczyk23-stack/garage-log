import { useState } from 'preact/hooks'
import { db } from '../db/db'
import { useQuery } from '../db/useQuery'
import { getCurrentMileageEstimate } from '../db/events'
import { getVehicleReminders } from '../db/summary'
import { getPlaybook, outcomeToBriefFacts } from '../domain/playbooks'
import { composeBrief, briefFromReminder, briefToText, type ShopBrief as Brief } from '../domain/shopBrief'
import { BAND_LABELS } from '../domain/verdict'
import {
  checkQuote,
  diagnosisChecksFromRequest,
  type DiagnosisCheck,
  type QuoteRating,
} from '../domain/quoteCheck'
import { parseNumberInput } from '../domain/format'
import { Loading, EmptyState } from '../components/ui'
import type { Vehicle } from '../types'

// ---------------------------------------------------------------------------
// Coast shop brief page (Stage 3 — design/COAST-PLAN.md): the standalone
// "show this at the counter" screen.
//
//   #/brief/<concern-…>          -> brief from a saved triage concern
//   #/brief/<vehicleId:category> -> brief from a schedule reminder (rule id)
//
// All copy comes from domain/shopBrief.ts (one brief writer in the app); this
// page only loads the inputs and renders fields. Share = navigator.share with
// the plain-text form, else clipboard; Print uses the @media print rules that
// strip the app chrome so the brief prints like a work order.
// ---------------------------------------------------------------------------

interface LoadedBrief {
  vehicle: Vehicle
  brief: Brief
}

async function loadBrief(id: string): Promise<LoadedBrief | null> {
  if (id.startsWith('concern-')) {
    const concern = await db.concerns.get(id)
    if (!concern) return null
    const vehicle = await db.vehicles.get(concern.vehicleId)
    if (!vehicle) return null
    const pb = getPlaybook(concern.playbookId)
    const outcome =
      pb?.outcomes.find((o) => o.id === concern.outcomeId) ?? (pb?.fallback.id === concern.outcomeId ? pb.fallback : undefined)
    if (!outcome) return null
    const [mileage, eventCount] = await Promise.all([
      getCurrentMileageEstimate(vehicle.id),
      db.events.where('vehicleId').equals(vehicle.id).count(),
    ])
    return {
      vehicle,
      brief: composeBrief(vehicle, mileage?.miles ?? null, outcomeToBriefFacts(outcome), {
        known: eventCount > 0,
      }),
    }
  }

  // Rule id (`<vehicleId>:<category>`): brief from the computed reminder.
  const rule = await db.reminderRules.get(id)
  if (!rule) return null
  const vehicle = await db.vehicles.get(rule.vehicleId)
  if (!vehicle) return null
  const [reminders, mileage] = await Promise.all([
    getVehicleReminders(vehicle.id),
    getCurrentMileageEstimate(vehicle.id),
  ])
  const reminder = reminders.find((r) => r.rule.id === id)
  if (!reminder) return null
  return { vehicle, brief: briefFromReminder(vehicle, mileage?.miles ?? null, reminder) }
}

export function ShopBriefPage({ id }: { id: string }) {
  const data = useQuery(() => loadBrief(id), [id])
  const [shared, setShared] = useState<string | null>(null)

  if (data === undefined) return <Loading />
  if (data === null) {
    return (
      <section class="page">
        <EmptyState
          title="Brief not found"
          hint="The item it was written for may have been removed."
          action={<a class="btn" href="#/">Back home</a>}
        />
      </section>
    )
  }
  const { vehicle, brief } = data

  async function share() {
    const text = briefToText(brief)
    try {
      if (navigator.share) {
        await navigator.share({ title: `Shop brief — ${brief.vehicleLine}`, text })
        return
      }
      await navigator.clipboard.writeText(text)
      setShared('Copied to the clipboard — paste it anywhere.')
    } catch {
      // Share sheet dismissed or clipboard blocked — nothing to clean up.
    }
  }

  return (
    <section class="page sb">
      <a class="back-link sb-chrome" href={`#/vehicle/${vehicle.id}`}>
        ‹ {vehicle.nickname ?? vehicle.name}
      </a>

      <h2 class="chk-title sb-chrome">Show this at the counter.</h2>
      <p class="chk-sub sb-chrome">Or read it out over the phone — it speaks mechanic.</p>

      <div class="chk-brief sb-brief">
        <div class="chk-brief-head">
          <div class="chk-brief-tag">Shop brief · {BAND_LABELS[brief.band]}</div>
          <h3>{brief.vehicleLine}</h3>
          <div class="chk-brief-meta">{brief.metaLine}</div>
        </div>
        <div class="chk-brief-sec">
          <div class="chk-brief-lbl">Item</div>
          <p>{brief.title}</p>
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
            {brief.diyNote && <p class="chk-brief-foot">{brief.diyNote}</p>}
            <p class="chk-brief-foot">{brief.footerNote}</p>
          </div>
        )}
        {(brief.reasonableIfSuggested.length > 0 || brief.fineToDecline.length > 0) && (
          <div class="sb-okdecline">
            {brief.reasonableIfSuggested.length > 0 && (
              <div class="sb-ok">
                <div class="sb-odl">Fair if suggested</div>
                <ul>
                  {brief.reasonableIfSuggested.map((s) => (
                    <li key={s}>{s}</li>
                  ))}
                </ul>
              </div>
            )}
            {brief.fineToDecline.length > 0 && (
              <div class="sb-no">
                <div class="sb-odl">Fine to decline today</div>
                <ul>
                  {brief.fineToDecline.map((s) => (
                    <li key={s}>{s}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
        {brief.escalationTriggers.length > 0 && (
          <div class="chk-brief-sec">
            <div class="chk-brief-lbl">Gets urgent if</div>
            <p>{brief.escalationTriggers.join(' · ')}</p>
          </div>
        )}
        {brief.historyNotes.length > 0 && (
          <div class="chk-brief-sec chk-brief-note">
            {brief.historyNotes.map((n) => (
              <p key={n}>{n}</p>
            ))}
          </div>
        )}
        {!brief.fairRange && (
          <div class="chk-brief-sec chk-brief-note">
            <p>{brief.footerNote}</p>
          </div>
        )}
      </div>

      <QuoteCheck brief={brief} />

      {shared && (
        <p class="notice notice-ok sb-chrome" role="status">
          {shared}
        </p>
      )}

      <div class="chk-actions sb-chrome">
        <button type="button" class="btn btn-primary" onClick={share}>
          Share this brief
        </button>
        <button type="button" class="btn btn-secondary" onClick={() => window.print()}>
          Print it
        </button>
      </div>
    </section>
  )
}

// Stage 5C: "Got a quote? Check it." Lives on the brief because that's where the
// fair range already is and where the driver is at the counter. Stateless — no
// persistence in v1 (see COAST-PLAN-STAGE5.md); nothing here is saved.
const RATING_TONE: Record<QuoteRating, { cls: string; label: string }> = {
  reasonable: { cls: 'qc-ok', label: 'Looks reasonable' },
  'a-bit-high': { cls: 'qc-high', label: 'A bit high' },
  'worth-a-second-look': { cls: 'qc-flag', label: 'Worth a second look' },
  'no-anchor': { cls: 'qc-neutral', label: 'Amount not checked' },
}

function QuoteCheck({ brief }: { brief: Brief }) {
  const [quoteRaw, setQuoteRaw] = useState('')
  const [checks, setChecks] = useState<DiagnosisCheck[]>(() => diagnosisChecksFromRequest(brief.request))

  const quoted = parseNumberInput(quoteRaw)
  const showResult = quoted != null && quoted > 0
  const result = showResult
    ? checkQuote({ fairLow: brief.fairLow, fairHigh: brief.fairHigh, quotedTotal: quoted, diagnosisChecks: checks })
    : null

  function setCheck(id: string, done: boolean | null) {
    setChecks((cs) => cs.map((c) => (c.id === id ? { ...c, done } : c)))
  }

  const tone = result ? RATING_TONE[result.rating] : null

  return (
    <section class="qc sb-chrome">
      <h3 class="qc-title">Got a quote? Check it.</h3>
      <p class="chk-sub">On your side of the counter — nothing here is saved or shared.</p>

      <label class="qc-field">
        <span class="qc-field-lbl">What did they quote?</span>
        <span class="qc-input-wrap">
          <span class="qc-dollar" aria-hidden="true">$</span>
          <input
            type="text"
            inputMode="decimal"
            class="qc-input"
            placeholder="e.g. 1400"
            value={quoteRaw}
            onInput={(e) => setQuoteRaw((e.target as HTMLInputElement).value)}
            aria-label="Quoted total in dollars"
          />
        </span>
      </label>

      {checks.length > 0 && (
        <div class="qc-checks">
          <div class="qc-checks-lbl">Did the shop do these before quoting?</div>
          {checks.map((c) => (
            <div key={c.id} class="qc-check">
              <span class="qc-check-label">{c.label}?</span>
              <span class="qc-check-btns" role="group" aria-label={c.label}>
                <button
                  type="button"
                  class={`qc-yn${c.done === true ? ' is-on' : ''}`}
                  aria-pressed={c.done === true}
                  onClick={() => setCheck(c.id, c.done === true ? null : true)}
                >
                  Yes
                </button>
                <button
                  type="button"
                  class={`qc-yn qc-yn-no${c.done === false ? ' is-on' : ''}`}
                  aria-pressed={c.done === false}
                  onClick={() => setCheck(c.id, c.done === false ? null : false)}
                >
                  No
                </button>
              </span>
            </div>
          ))}
        </div>
      )}

      {result && tone && (
        <div class={`qc-result ${tone.cls}`} role="status">
          <div class="qc-rating">
            <span class="qc-dot" aria-hidden="true" />
            {tone.label}
          </div>
          {result.reasons.map((r) => (
            <p key={r} class="qc-reason">
              {r}
            </p>
          ))}
          <div class="qc-script">
            <div class="qc-script-lbl">Worth asking</div>
            <ul>
              {result.secondOpinionScript.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </section>
  )
}
