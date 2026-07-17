import { useState } from 'preact/hooks'
import { useQuery } from '../db/useQuery'
import { getGarageCostSummary, type VehicleCostSummary } from '../db/summary'
import { formatMiles, formatMoney } from '../domain/format'
import { vehicleLabel } from '../domain/vehicle'
import { EmptyState, Loading } from '../components/ui'
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

  if (!summary) return <Loading />

  const hasAnySpend = summary.grandTotal > 0

  return (
    <section class="page">
      <h2 class="page-title">Costs</h2>
      <p class="muted">Where your maintenance money goes, per vehicle.</p>

      <section class="card">
        <h3 class="card-title">Total invested</h3>
        <p class="cost-grand">{formatMoney(grandCounted)}</p>
        <p class="muted small">
          All maintenance and repairs logged across {summary.vehicles.length} vehicles. A
          documented service history like this also helps at resale time.
        </p>
      </section>

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
          {vehicle.make === 'Ford' ? '🛻' : '🚙'}
        </span>
        <div>
          <h3 class="card-title">{vehicleLabel(vehicle)}</h3>
          <p class="muted small">
            {vehicle.year} {vehicle.make} · {vehicle.model}
          </p>
        </div>
      </div>

      <dl class="stat-row cost-stats">
        <div class="stat">
          <dt>Total ({rangeLabel})</dt>
          <dd>{formatMoney(breakdown.total)}</dd>
        </div>
        <div class="stat">
          <dt>Cost / mile</dt>
          <dd>{summary.costPerMile != null ? `$${summary.costPerMile.toFixed(2)}` : '—'}</dd>
        </div>
      </dl>

      <dl class="stat-row cost-stats">
        <div class="stat">
          <dt>Maintenance</dt>
          <dd>{formatMoney(breakdown.maintenanceTotal)}</dd>
        </div>
        <div class="stat">
          <dt>Repairs</dt>
          <dd>{formatMoney(breakdown.repairTotal)}</dd>
        </div>
      </dl>

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
          Lifetime cost / mile over {formatMiles(summary.milesTracked)} tracked.
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
