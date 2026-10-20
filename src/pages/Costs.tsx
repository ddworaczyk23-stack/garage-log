import { useState } from 'preact/hooks'
import { useQuery } from '../db/useQuery'
import { getGarageCostSummary, type VehicleCostSummary } from '../db/summary'
import { formatMoney } from '../domain/format'
import { vehicleBody, vehicleLabel } from '../domain/vehicle'
import { EmptyState, PageHeader, SkeletonPage } from '../components/ui'
import { VehicleIcon } from '../components/icons'
import { Reveal } from '../components/motion/Reveal'
import { useCountUp, useIntroGate, useReducedMotion } from '../motion/hooks'
import type { CategoryCost, CostBreakdown } from '../domain/cost'

type Range = 'all' | 'year'

// Costs page (route #/costs): where the money goes. Per-vehicle spend broken
// down by category, split maintenance vs repair, plus a lifetime cost-per-mile.
// Read-only analytics over logged events — no core logic touched. An All-time /
// This-year toggle switches which breakdown the tiles + bars show; cost-per-mile
// is always lifetime.
export function Costs() {
  const reduced = useReducedMotion()
  const intro = useIntroGate('gl_intro_costs') && !reduced
  const summary = useQuery(getGarageCostSummary)
  const [range, setRange] = useState<Range>('all')
  const grandCounted = useCountUp(summary?.grandTotal ?? 0, { active: intro, reduced })

  if (!summary) return <SkeletonPage rows={3} />

  const hasAnySpend = summary.grandTotal > 0

  return (
    <section class="page">
      <a class="back-link" href="#/">
        ‹ Home
      </a>
      <PageHeader title="Costs" />

      {hasAnySpend && (
        <p class="cost-summary">
          <span class="cost-grand">{formatMoney(grandCounted)}</span> total
        </p>
      )}

      {hasAnySpend && (
        <div class="seg" role="group" aria-label="Time range">
          <button
            type="button"
            class={`seg-btn${range === 'all' ? ' is-active' : ''}`}
            aria-pressed={range === 'all'}
            onClick={() => setRange('all')}
          >
            All time
          </button>
          <button
            type="button"
            class={`seg-btn${range === 'year' ? ' is-active' : ''}`}
            aria-pressed={range === 'year'}
            onClick={() => setRange('year')}
          >
            {summary.year}
          </button>
        </div>
      )}

      {!hasAnySpend ? (
        <EmptyState
          icon="$"
          title="No costs logged yet"
          hint="Costs you log show up here."
        />
      ) : (
        // Stacks on mobile; a 2-up board on desktop (see .cost-vehicle-grid, R2).
        <div class="cost-vehicle-grid">
          {summary.vehicles.map((v) => (
            <Reveal key={v.vehicle.id}>
              <VehicleCostCard summary={v} range={range} />
            </Reveal>
          ))}
        </div>
      )}
    </section>
  )
}

function VehicleCostCard({ summary, range }: { summary: VehicleCostSummary; range: Range }) {
  const { vehicle } = summary
  const breakdown: CostBreakdown = range === 'all' ? summary.allTime : summary.thisYear
  const rangeLabel = range === 'all' ? 'all time' : 'this year'

  return (
    <section class="card box">
      <div class="box-head">
        <span class="vehicle-emoji" aria-hidden="true">
          <VehicleIcon body={vehicleBody(vehicle)} />
        </span>
        <div>
          <h3>{vehicleLabel(vehicle)}</h3>
        </div>
        <span class="box-key">{formatMoney(breakdown.total)}</span>
      </div>
      <div class="box-body">
        {breakdown.byCategory.length === 0 ? (
        <p class="muted small cost-empty">No costs logged {rangeLabel}.</p>
      ) : (
        <>
          <p class="cost-vehicle-summary">
            <span>{formatMoney(breakdown.total)}</span>
            {breakdown.maintenanceTotal > 0 && breakdown.repairTotal > 0 && ` · ${formatMoney(breakdown.repairTotal)} repairs`}
          </p>
          <ul class="cost-cat-list">
            {breakdown.byCategory.map((c) => (
              <CategoryRow key={c.category} cost={c} />
            ))}
          </ul>
        </>
      )}

        {summary.costPerMile != null && summary.milesTracked != null && summary.costPerMile >= 0.1 && (
        <p class="muted small cost-note">
          <span class="cost-per-mile">{formatMoney(summary.costPerMile)}/mi</span>
        </p>
        )}
      </div>
    </section>
  )
}

function CategoryRow({ cost }: { cost: CategoryCost }) {
  return (
    <li class="cost-row">
      <div class="cost-row-head">
        <span class="cost-row-label">{cost.label}</span>
        <span class="cost-row-amount">{formatMoney(cost.total)}</span>
      </div>
      <div class="cost-bar" aria-hidden="true">
        <div class="cost-bar-fill" style={`width: ${Math.max(2, Math.round(cost.share * 100))}%`} />
      </div>
      <span class="cost-row-meta muted small">
        {Math.round(cost.share * 100)}% · {cost.count} {cost.count === 1 ? 'entry' : 'entries'}
      </span>
    </li>
  )
}
