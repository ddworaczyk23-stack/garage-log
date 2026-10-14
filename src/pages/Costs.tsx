import { useState } from 'preact/hooks'
import { useQuery } from '../db/useQuery'
import { getGarageCostSummary, type VehicleCostSummary } from '../db/summary'
import { formatMiles, formatMoney } from '../domain/format'
import { vehicleLabel } from '../domain/vehicle'
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
      <PageHeader eyebrow="The Garage" title="Costs">
        <p class="page-header-prose">Where your maintenance money goes, per vehicle.</p>
      </PageHeader>

      {hasAnySpend && (
        <p class="cost-summary">
          Total spent: <span class="cost-grand">{formatMoney(grandCounted)}</span> on maintenance and
          repairs across {summary.vehicles.length} {summary.vehicles.length === 1 ? 'car' : 'cars'}.
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
          hint="Add a cost when you log a service or repair and the breakdown will appear here."
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
    <section class="card">
      <div class="vehicle-card-head">
        <span class="vehicle-emoji" aria-hidden="true">
          <VehicleIcon />
        </span>
        <div>
          <h3 class="list-row-title">{vehicleLabel(vehicle)}</h3>
          <p class="muted small">
            {vehicle.year} {vehicle.make} · {vehicle.model}
          </p>
        </div>
      </div>

      <p class="cost-vehicle-summary">
        <span>{formatMoney(breakdown.total)}</span> spent {rangeLabel}:{' '}
        <span>{formatMoney(breakdown.maintenanceTotal)}</span> on maintenance and{' '}
        <span>{formatMoney(breakdown.repairTotal)}</span> on repairs.
      </p>

      {breakdown.byCategory.length === 0 ? (
        <p class="muted small cost-empty">No costs logged {rangeLabel}.</p>
      ) : (
        <ul class="cost-cat-list">
          {breakdown.byCategory.map((c) => (
            <CategoryRow key={c.category} cost={c} />
          ))}
        </ul>
      )}

      {summary.costPerMile != null && summary.milesTracked != null && (
        <p class="muted small cost-note">
          <span class="cost-per-mile">{formatMoney(summary.costPerMile)}/mi</span> lifetime, over{' '}
          <span class="cost-per-mile">{formatMiles(summary.milesTracked)}</span> tracked.
        </p>
      )}
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
