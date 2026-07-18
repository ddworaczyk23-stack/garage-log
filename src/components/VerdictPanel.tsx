import type { SignalBand, VehicleVerdict } from '../domain/verdict'
import { BAND_LABELS } from '../domain/verdict'
import type { VehicleHealth } from '../domain/health'

// Coast verdict instruments (Stage 1, design/COAST-PLAN.md): the road-sign
// VerdictPanel and the four-zone UrgencyRuler. Pure presentation over a
// VehicleVerdict — no queries, no state; every number was decided in
// domain/verdict.ts so this stays a dumb signage renderer.

const BAND_CLASS: Record<SignalBand, string> = {
  'fix-now': 'cv-red',
  'book-soon': 'cv-amber',
  coast: 'cv-blue',
  'all-clear': 'cv-green',
}

export function VerdictPanel({ verdict, tag = 'Today' }: { verdict: VehicleVerdict; tag?: string }) {
  return (
    <div class={`cv-panel ${BAND_CLASS[verdict.band]}`}>
      <div class="cv-inner">
        <div class="cv-tag">
          {tag} · {BAND_LABELS[verdict.band]}
        </div>
        <h3 class="cv-headline">{verdict.headline}</h3>
        <p class="cv-sentence">{verdict.sentence}</p>
      </div>
    </div>
  )
}

const ZONES: SignalBand[] = ['fix-now', 'book-soon', 'coast', 'all-clear']

export function UrgencyRuler({ verdict }: { verdict: VehicleVerdict }) {
  const note = verdict.safeWindow ?? verdict.confidenceNote
  return (
    <div
      class="cv-ruler"
      role="img"
      aria-label={`Urgency: ${BAND_LABELS[verdict.band]}.${note ? ` ${note}` : ''}`}
    >
      <div class="cv-ruler-wrap">
        <div class="cv-ruler-track">
          {ZONES.map((z) => (
            <i key={z} class={BAND_CLASS[z]} />
          ))}
        </div>
        <div class="cv-ruler-pin" style={`left:${verdict.rulerPin}%`} />
      </div>
      <div class="cv-ruler-labels">
        {ZONES.map((z) => (
          <span key={z} class={z === verdict.band ? 'on' : ''}>
            {BAND_LABELS[z]}
          </span>
        ))}
      </div>
      {note && <p class="cv-ruler-note">{note}</p>}
    </div>
  )
}

// Stage 5B: a single honest read on a vehicle — a compact meter colored by
// band (worst-wins across reminders + open concerns, domain/health.ts). Never
// a ranking input, purely a summary readout.
export function HealthMeter({ health }: { health: VehicleHealth }) {
  return (
    <div class={`vh-meter ${BAND_CLASS[health.band]}`}>
      <div class="vh-track">
        <div class="vh-fill" style={`width:${health.score}%`} />
      </div>
      <span class="vh-label">{health.reasons.join(' · ')}</span>
    </div>
  )
}
