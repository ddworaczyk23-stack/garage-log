import { useQuery } from '../db/useQuery'
import { getGarageSummary, type AttentionItem, type VehicleSummary } from '../db/summary'
import { STATUS_LABELS } from '../types'
import { formatMiles, formatMoney, formatShortDate } from '../domain/format'
import { Loading } from '../components/ui'
import type { ComputedReminder } from '../domain/reminderEngine'

// Home dashboard: a cross-vehicle "what needs attention first" feed, the two
// vehicles ranked by maintenance urgency (not mileage or spend), a per-vehicle
// summary, and a side-by-side comparison. All derived from the reminders engine
// output via db/summary — no reminder math lives here.
export function Dashboard() {
  const summary = useQuery(getGarageSummary)

  if (!summary) return <Loading />

  const documentCount = summary.vehicles.reduce((n, s) => n + s.documentCount, 0)

  return (
    <section class="page">
      <h2 class="page-title">Garage</h2>
      <p class="muted">Ranked by what needs attention first.</p>

      <section class="card">
        <h3 class="card-title">Needs attention first</h3>
        {summary.attention.length === 0 ? (
          <p class="muted small">All caught up — nothing overdue or due soon. 🎉</p>
        ) : (
          <ul class="attention-list">
            {summary.attention.map((item) => (
              <AttentionRow key={item.ordinal} item={item} />
            ))}
          </ul>
        )}
      </section>

      {summary.vehicles.map((s, i) => (
        <VehicleSummaryCard key={s.vehicle.id} summary={s} rank={i + 1} />
      ))}

      <ComparisonCard vehicles={summary.vehicles} year={summary.year} />

      <a class="card export-cta" href="#/backup">
        <div class="export-cta-main">
          <h3 class="card-title">Back up your garage</h3>
          <p class="muted small">
            {summary.vehicles.length} vehicles · {documentCount} documents, stored only
            on this device. Export a copy before clearing browser data or switching phones.
          </p>
        </div>
        <span class="export-cta-cue" aria-hidden="true">
          💾
        </span>
      </a>
    </section>
  )
}

function AttentionRow({ item }: { item: AttentionItem }) {
  return (
    <li class="attention-item">
      <span class={`badge badge-${item.tone}`}>{item.vehicleName}</span>
      <span class="attention-main">
        <span class="attention-title">{item.title}</span>
        <span class="muted small">{item.detail}</span>
      </span>
    </li>
  )
}

function VehicleSummaryCard({ summary: s, rank }: { summary: VehicleSummary; rank: number }) {
  const v = s.vehicle
  return (
    <a class="card vehicle-summary" href={`#/vehicle/${v.id}`}>
      <div class="vehicle-card-head">
        <span class="rank-chip" aria-hidden="true">
          #{rank}
        </span>
        <span class="vehicle-emoji" aria-hidden="true">
          {v.make === 'Ford' ? '🛻' : '🚙'}
        </span>
        <div>
          <h3 class="card-title">{v.name}</h3>
          <p class="muted small">
            {v.year} {v.make} · {v.engine}
          </p>
        </div>
      </div>

      <div class="badge-row">
        {s.badges.map((b) => (
          <span key={b.label} class={`badge badge-${b.tone}`}>
            {b.label}
          </span>
        ))}
      </div>

      <div class="summary-priority">
        {s.topReminder ? (
          <ReminderLine reminder={s.topReminder} lead="Top priority" />
        ) : (
          <p class="muted small">No service due right now.</p>
        )}
      </div>

      {s.nextReminders.length > 0 && (
        <ul class="mini-list">
          {s.nextReminders.map((r) => (
            <li key={r.rule.id}>
              <ReminderLine reminder={r} />
            </li>
          ))}
        </ul>
      )}

      <dl class="summary-facts">
        <div>
          <dt>Mileage</dt>
          <dd class={s.mileage?.stale ? 'text-stale' : ''}>
            {s.mileage
              ? `${formatMiles(s.mileage.miles)}${s.mileage.stale ? ' · stale' : ''}`
              : 'Not logged'}
          </dd>
        </div>
        <div>
          <dt>Last activity</dt>
          <dd class="muted">{formatShortDate(s.lastActivityDate)}</dd>
        </div>
      </dl>

      {(s.recentServices.length > 0 || s.recentRepairs.length > 0) && (
        <div class="recent-block">
          {s.recentServices.length > 0 && (
            <p class="muted small">
              🔧 {s.recentServices.map((e) => `${e.title} (${formatShortDate(e.date)})`).join(', ')}
            </p>
          )}
          {s.recentRepairs.length > 0 && (
            <p class="muted small">
              🛠️ {s.recentRepairs.map((e) => `${e.title} (${formatShortDate(e.date)})`).join(', ')}
            </p>
          )}
        </div>
      )}
    </a>
  )
}

function ReminderLine({ reminder: r, lead }: { reminder: ComputedReminder; lead?: string }) {
  return (
    <div class="reminder-line">
      <span class="reminder-line-main">
        {lead && <span class="muted small">{lead}</span>}
        <span class="reminder-line-title">{r.rule.label}</span>
        <span class="muted small">{r.reason}</span>
      </span>
      <span class={`status-pill status-${r.status}`}>{STATUS_LABELS[r.status]}</span>
    </div>
  )
}

function ComparisonCard({ vehicles, year }: { vehicles: VehicleSummary[]; year: number }) {
  const rows: { label: string; value: (s: VehicleSummary) => string }[] = [
    {
      label: `Miles driven (${year})`,
      value: (s) => (s.milesThisYear != null ? formatMiles(s.milesThisYear) : '—'),
    },
    { label: `Spent this year`, value: (s) => (s.spendThisYear > 0 ? formatMoney(s.spendThisYear) : '—') },
    { label: 'Overdue items', value: (s) => String(s.counts.overdue) },
    { label: 'Completed items', value: (s) => String(s.counts.completed) },
    { label: 'Documents', value: (s) => String(s.documentCount) },
  ]

  return (
    <section class="card">
      <h3 class="card-title">Side-by-side</h3>
      <table class="compare-table">
        <thead>
          <tr>
            <th></th>
            {vehicles.map((s) => (
              <th key={s.vehicle.id}>{s.vehicle.name}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.label}>
              <td class="muted">{row.label}</td>
              {vehicles.map((s) => (
                <td key={s.vehicle.id}>{row.value(s)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  )
}
