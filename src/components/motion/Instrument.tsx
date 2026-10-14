import type { ComponentChildren } from 'preact'
import { useCountUp } from '../../motion/hooks'

// Odometer readout: a head row (label + action), the big number (counts up
// on first view from `countFrom`), then small labelled facts side by side.

export interface InstrumentFact {
  label: string
  value: ComponentChildren
}

export function Instrument({
  label,
  note,
  value,
  unit,
  countFrom,
  facts = [],
  action,
  animate = false,
  reduced = false,
}: {
  label: string
  /** Muted word after the label, e.g. "estimated". */
  note?: string
  /** Null = no reading yet (shows a dash). */
  value: number | null
  unit?: string
  countFrom?: number
  facts?: InstrumentFact[]
  action?: ComponentChildren
  animate?: boolean
  reduced?: boolean
}) {
  const target = value ?? 0
  const main = useCountUp(target, { from: countFrom ?? Math.max(0, target - 2000), active: animate && value != null, reduced })

  return (
    <div class="odo-card">
      <div class="odo-head">
        <span class="odo-label">
          {label}
          {note && <span class="odo-note"> · {note}</span>}
        </span>
        {action}
      </div>
      <div class="odo">
        <span class="num">{value == null ? '—' : Math.round(main).toLocaleString('en-US')}</span>
        {unit && <span class="unit">{unit}</span>}
      </div>
      {facts.length > 0 && (
        <dl class="odo-facts">
          {facts.map((f) => (
            <div key={f.label}>
              <dt>{f.label}</dt>
              <dd>{f.value}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  )
}
