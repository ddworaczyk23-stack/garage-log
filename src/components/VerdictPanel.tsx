import type { SignalBand, VehicleVerdict, VerdictBand } from '../domain/verdict'
import { BAND_LABELS, VERDICT_BAND_LABELS } from '../domain/verdict'

// Coast verdict instruments (Stage 1, design/COAST-PLAN.md): the road-sign
// VerdictPanel and the four-zone UrgencyRuler. Pure presentation over a
// VehicleVerdict — no queries, no state; every number was decided in
// domain/verdict.ts so this stays a dumb signage renderer.

const BAND_CLASS: Record<VerdictBand, string> = {
  'fix-now': 'cv-red',
  'book-soon': 'cv-amber',
  coast: 'cv-blue',
  'all-clear': 'cv-green',
  // The honest unknown state — slate, deliberately outside the signal scale.
  'not-set-up': 'cv-slate',
}

export function VerdictPanel({
  verdict,
  tag = 'Today',
  headingLevel: Heading = 'h3',
}: {
  verdict: VehicleVerdict
  tag?: string
  /** Defaults to h3 (a page-level h2 title precedes it on VehicleDetail/Check).
   * Dashboard's TodayCard passes 'h4' — its own per-vehicle name is already an
   * h3, so this headline is a subsection of THAT, not a sibling of it. */
  headingLevel?: 'h2' | 'h3' | 'h4'
}) {
  return (
    <div class={`cv-panel ${BAND_CLASS[verdict.band]}`}>
      <div class="cv-inner">
        <div class="cv-tag">
          {tag} · {VERDICT_BAND_LABELS[verdict.band]}
        </div>
        <Heading class="cv-headline">{verdict.headline}</Heading>
        <p class="cv-sentence">{verdict.sentence}</p>
      </div>
    </div>
  )
}

const ZONES: SignalBand[] = ['fix-now', 'book-soon', 'coast', 'all-clear']

export function UrgencyRuler({ verdict }: { verdict: VehicleVerdict }) {
  // An unknown vehicle has no position on the urgency scale — no ruler at all
  // beats a pin that implies a judgment (domain/verdict.ts, 'not-set-up').
  if (verdict.rulerPin == null) return null
  const note = verdict.safeWindow ?? verdict.confidenceNote
  return (
    <div
      class="cv-ruler"
      role="img"
      aria-label={`Urgency: ${VERDICT_BAND_LABELS[verdict.band]}.${note ? ` ${note}` : ''}`}
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
