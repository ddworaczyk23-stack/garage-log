import { useQuery } from '../db/useQuery'
import { getMilestoneContext } from '../db/milestones'
import { formatMiles, formatShortDate } from '../domain/format'
import { projectDueDate } from '../domain/mileage'
import { milestoneHref, milestoneOverview, type MilestoneState } from '../domain/milestones'
import { Collapsible } from './motion/Collapsible'
import { InfoTip, Loading } from './ui'

export const MILESTONE_STATE_LABELS: Record<MilestoneState, string> = {
  done: 'Done',
  skipped: 'Skipped',
  missed: 'Not recorded',
  due: 'Reached',
  upcoming: 'Upcoming',
}

/** "Due now" only once the milestone is reached; inside the lead-up window
 * it reads "Coming up" so it never contradicts "In 356 mi". */
export function milestoneStateLabel(state: MilestoneState, milesAway: number | null): string {
  if (state === 'due' && milesAway != null && milesAway > 0) return 'Coming up'
  return MILESTONE_STATE_LABELS[state]
}

/** Reuses the reminder status-pill colors so the two read the same way. */
export const MILESTONE_STATE_PILL: Record<MilestoneState, string> = {
  done: 'status-completed',
  skipped: 'status-not-applicable',
  missed: 'status-not-applicable',
  due: 'status-due-next',
  upcoming: 'status-watch-next',
}

// Vehicle Detail card for milestone checkups (domain/milestones.ts): the next
// one up front with its checklist progress, the full list folded below.
export function MilestoneCard({ vehicleId }: { vehicleId: string }) {
  const ctx = useQuery(() => getMilestoneContext(vehicleId), [vehicleId])
  if (ctx === undefined) return <section class="card"><Loading /></section>
  if (ctx === null) return null

  const current = ctx.mileage?.miles ?? null
  const { all, next } = milestoneOverview(current, ctx.profile, ctx.vehicle.milestones)
  const eta =
    next && next.state === 'upcoming' && next.milesAway != null && ctx.mileage
      ? projectDueDate(next.milesAway, ctx.mileage.annualMileage, new Date())
      : null

  return (
    <section class="card ms-card">
      <div class="card-title-row">
        <h3 class="card-title">
          Milestone checkups
          <InfoTip label="About milestone checkups">
            Whole-vehicle checklists at 30k, 60k, 90k, 100k, 120k and 150k miles, tailored to this
            car's engine and drivetrain. General guidance, so check your owner's manual. Separate from
            the service schedule: checking items here doesn't change it.
          </InfoTip>
        </h3>
      </div>

      {next ? (
        <a class="ms-next" href={milestoneHref(vehicleId, next.miles)}>
          <span class="ms-next-main">
            <span class="ms-next-name">{next.name}</span>
            <span class="muted small">
              {next.state === 'due'
                ? next.milesAway != null && next.milesAway < 0
                  ? `Passed ${formatMiles(-next.milesAway)} ago`
                  : `In ${formatMiles(next.milesAway)}`
                : next.milesAway != null
                  ? `In ~${formatMiles(next.milesAway)}${eta ? ` · est. ${formatShortDate(eta)}` : ''}`
                  : 'Log your mileage to see when'}
              {` · ${next.checkedCount}/${next.totalCount} checked`}
            </span>
          </span>
          <span class={`status-pill ${MILESTONE_STATE_PILL[next.state]}`}>
            {milestoneStateLabel(next.state, next.milesAway)}
          </span>
        </a>
      ) : (
        <p class="muted small">Every milestone so far is recorded.</p>
      )}

      <Collapsible title="All milestones" count={`${all.length}`}>
        <ul class="ms-list">
          {all.map((m) => (
            <li key={m.miles}>
              <a class="ms-row" href={milestoneHref(vehicleId, m.miles)}>
                <span>{m.name}</span>
                <span class="muted small ms-row-progress">
                  {m.checkedCount}/{m.totalCount}
                </span>
                <span class={`status-pill ${MILESTONE_STATE_PILL[m.state]}`}>
                  {milestoneStateLabel(m.state, m.milesAway)}
                </span>
              </a>
            </li>
          ))}
        </ul>
      </Collapsible>
    </section>
  )
}
