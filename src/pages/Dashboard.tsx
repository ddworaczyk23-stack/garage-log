import { useQuery } from '../db/useQuery'
import { getGarageSummary, type AttentionItem, type VehicleSummary } from '../db/summary'
import { formatMiles, formatMoney } from '../domain/format'
import { reminderProgress } from '../domain/progress'
import { vehicleLabel } from '../domain/vehicle'
import { Loading } from '../components/ui'
import { Reveal } from '../components/motion/Reveal'
import { Instrument } from '../components/motion/Instrument'
import { Gauge } from '../components/motion/Gauge'
import { useIntroGate, useReducedMotion } from '../motion/hooks'
import type { ComputedReminder } from '../domain/reminderEngine'

const TONE_DOT: Record<AttentionItem['tone'], string> = {
  overdue: 'var(--c-overdue)',
  due: 'var(--c-due)',
  watch: 'var(--c-watch)',
  stale: 'var(--c-stale)',
  cost: 'var(--c-cost)',
}

// One-line headline for a vehicle's top-ranked reminder, used on the compact
// garage-board tiles — a lighter version of VehicleDetail's focal readout
// (breadth, not depth: full detail lives one tap away on the vehicle itself).
function focalHeadline(r: ComputedReminder): { eye: string; text: string; tone: string } {
  const pct = reminderProgress(r).pct
  const pctText = pct != null ? ` · ${Math.round(pct)}%` : ''
  if (r.status === 'overdue') return { eye: 'Needs attention', tone: 'tone-overdue', text: `${r.rule.label}${pctText}` }
  if (r.status === 'due-next') return { eye: 'Due now', tone: 'tone-due', text: `${r.rule.label}${pctText}` }
  if (r.status === 'watch-next') return { eye: 'Coming up', tone: 'tone-watch', text: `${r.rule.label}${pctText}` }
  return { eye: 'On track', tone: 'tone-ok', text: 'Nothing due right now' }
}

// Home dashboard: the "Attention-first Garage Board" — a bento layout where
// size encodes urgency. The most-urgent vehicle (already ranked by
// compareVehicleUrgency in db/summary) gets the hero tile with its own
// odometer instrument + focal gauge; the rest get compact tiles; a
// cross-vehicle attention feed and utility tiles round it out. Same
// instrument vocabulary as VehicleDetail so Home <-> vehicle feels continuous.
export function Dashboard() {
  const reduced = useReducedMotion()
  const intro = useIntroGate('gl_intro_dashboard') && !reduced
  const summary = useQuery(getGarageSummary)

  if (!summary) return <Loading />

  const documentCount = summary.vehicles.reduce((n, s) => n + s.documentCount, 0)
  const spendAllTime = summary.vehicles.reduce((n, s) => n + s.spendAllTime, 0)
  const needsAttention = summary.vehicles.reduce((n, s) => n + s.counts.overdue + s.counts.dueNext, 0)

  const [hero, ...rest] = summary.vehicles

  return (
    <section class="page gb">
      <header class="gb-top">
        <span class="eyebrow">The Garage · Home</span>
        <div class="gb-top-row">
          <h2 class="gb-name">Your Garage</h2>
          <span class="gb-status">
            <span class={`vd-lamp ${needsAttention > 0 ? 'is-overdue' : 'is-ok'}`} />
            {needsAttention > 0 ? (
              <b>{needsAttention} need{needsAttention === 1 ? 's' : ''} attention</b>
            ) : (
              <b class="tone-ok">All caught up</b>
            )}{' '}
            · {summary.vehicles.length} vehicle{summary.vehicles.length === 1 ? '' : 's'}
          </span>
        </div>
        <hr class="rule-double" />
      </header>

      {summary.vehicles.length === 0 ? (
        <p class="muted small">No vehicles yet — add one to get started.</p>
      ) : (
        <>
          <div class={`gb-board${rest.length === 0 ? ' gb-board-solo' : ''}`}>
            <HeroTile summary={hero} intro={intro} reduced={reduced} />
            {rest.length > 0 && (
              <div class="gb-side">
                {rest.map((s) => (
                  <CompactTile key={s.vehicle.id} summary={s} intro={intro} reduced={reduced} />
                ))}
              </div>
            )}
          </div>

          {/* Full width, not squeezed into the side column — its row count is
              independent of vehicle count, so pairing it with the (usually
              much shorter) hero/compact column left a large dead gap. */}
          <Reveal>
            <FeedCard items={summary.attention} />
          </Reveal>
        </>
      )}

      <Reveal>
        <ComparisonCard vehicles={summary.vehicles} year={summary.year} />
      </Reveal>

      <div class="gb-util">
        <Reveal class="gb-u-wrap">
          <a class="card gb-u-tile" href="#/costs">
            <span class="kicker">Spent this year</span>
            <span class="gb-u-big">{formatMoney(spendAllTime)}</span>
            <span class="gb-u-cta">
              Cost summary
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M7 17L17 7M8 7h9v9" /></svg>
            </span>
          </a>
        </Reveal>
        <Reveal class="gb-u-wrap">
          <a class="card gb-u-tile" href="#/backup">
            <span class="kicker">Backup</span>
            <span class="gb-u-big">{summary.vehicles.length} · {documentCount}</span>
            <span class="gb-u-cta">
              Back up garage
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M7 17L17 7M8 7h9v9" /></svg>
            </span>
          </a>
        </Reveal>
        <Reveal class="gb-u-wrap">
          <a class="card gb-u-tile gb-u-add" href="#/add-vehicle">
            <span class="gb-u-plus" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 5v14M5 12h14" /></svg>
            </span>
            <span class="gb-u-cta" style="color:var(--text)">Add a vehicle</span>
          </a>
        </Reveal>
      </div>
    </section>
  )
}

function HeroTile({ summary: s, intro, reduced }: { summary: VehicleSummary; intro: boolean; reduced: boolean }) {
  const v = s.vehicle
  const focal = s.reminders[0] ?? null
  const prog = focal ? reminderProgress(focal) : { pct: null }
  const head = focal ? focalHeadline(focal) : null

  return (
    <a class="card gb-tile gb-hero" href={`#/vehicle/${v.id}`}>
      <div class="gb-tile-head">
        <div>
          <div class={`gb-tile-eye ${head?.tone ?? 'tone-ok'}`}>
            <span class="dot" />
            {head?.eye ?? 'On track'}
          </div>
          <h3 class="gb-tile-name">{vehicleLabel(v)}</h3>
          <p class="gb-tile-sub">{v.year} · {v.engine}</p>
        </div>
        {v.trim && <span class="vd-plate">{v.trim}</span>}
      </div>

      {s.mileage ? (
        <Instrument
          label="Odometer"
          value={s.mileage.miles}
          unit="MI"
          animate={intro}
          reduced={reduced}
          countFrom={s.milesThisYear != null ? s.mileage.miles - s.milesThisYear : undefined}
          ytd={s.milesThisYear != null ? { delta: s.milesThisYear, deltaCaption: `in ${new Date().getFullYear()}`, bars: [] } : undefined}
        />
      ) : (
        <div class="instrument">
          <span class="kicker">Odometer</span>
          <div class="odo"><span class="num">—</span></div>
        </div>
      )}

      {focal && (
        <div class="gb-focus">
          <Gauge pct={prog.pct} animate={intro} reduced={reduced} ariaLabel={head!.text} />
          <div class="gb-focus-read">
            <div class="vd-focus-svc">{focal.rule.label}</div>
            <div class={`gb-focus-big ${head!.tone}`}>{head!.text}</div>
          </div>
        </div>
      )}

      <div class="vd-tally">
        <span class="tally"><span class="vd-lamp is-overdue" />{s.counts.overdue} overdue</span>
        <span class="tally"><span class="vd-lamp is-due" />{s.counts.dueNext} due now</span>
        <span class="tally"><span class="vd-lamp is-ok" />{s.counts.completed} on track</span>
      </div>

      <span class="open-link">
        Open Service Record
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M7 17L17 7M8 7h9v9" /></svg>
      </span>
    </a>
  )
}

function CompactTile({ summary: s, intro, reduced }: { summary: VehicleSummary; intro: boolean; reduced: boolean }) {
  const v = s.vehicle
  const focal = s.reminders[0] ?? null
  const prog = focal ? reminderProgress(focal) : { pct: null }
  const head = focal ? focalHeadline(focal) : null

  return (
    <Reveal>
      <a class="card gb-tile gb-compact" href={`#/vehicle/${v.id}`}>
        <div class="gb-tile-head">
          <div>
            <div class={`gb-tile-eye ${head?.tone ?? 'tone-ok'}`}>
              <span class="dot" />
              {head?.eye ?? 'On track'}
            </div>
            <h3 class="gb-tile-name gb-tile-name-sm">{vehicleLabel(v)}</h3>
            <p class="gb-tile-sub">{v.year} · {v.engine}</p>
          </div>
          {v.trim && <span class="vd-plate">{v.trim}</span>}
        </div>

        <div class="gb-focus gb-focus-sm">
          <Gauge pct={prog.pct} animate={intro} reduced={reduced} ariaLabel={head?.text ?? 'no schedule data'} />
          <div class="gb-focus-read">
            <div class="gb-tile-mileage num">{s.mileage ? formatMiles(s.mileage.miles) : '— mi'}</div>
            <div class={`gb-focus-big ${head?.tone ?? 'tone-ok'}`}>{head?.text ?? 'Nothing due right now'}</div>
          </div>
        </div>
      </a>
    </Reveal>
  )
}

function FeedCard({ items }: { items: AttentionItem[] }) {
  return (
    <section class="card gb-feed">
      <h3 class="card-title">Across the garage</h3>
      {items.length === 0 ? (
        <p class="muted small">All caught up — nothing overdue or due soon. 🎉</p>
      ) : (
        <ul class="gb-feed-list">
          {items.map((item) => (
            <li key={item.ordinal} class="gb-feed-row">
              <span class="gb-feed-dot" style={`background:${TONE_DOT[item.tone]}`} />
              <span class="gb-feed-main">
                <span class="gb-feed-title">{item.title}</span>
                <span class="gb-feed-veh">{item.vehicleName}</span>
              </span>
              <span class="gb-feed-when muted small">{item.detail}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
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
              <th key={s.vehicle.id}>{vehicleLabel(s.vehicle)}</th>
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
