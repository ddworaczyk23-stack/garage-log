import { db } from '../db/db'
import { seedIfEmpty } from '../db/seed'
import { useQuery } from '../db/useQuery'

// Developer view to confirm IndexedDB is wired up and reading/writing.
// Not part of the real product UI — kept behind the #/debug route.
export function Debug() {
  const counts = useQuery(async () => ({
    vehicles: await db.vehicles.count(),
    events: await db.events.count(),
    odometerReadings: await db.odometerReadings.count(),
    documents: await db.documents.count(),
    reminderRules: await db.reminderRules.count(),
    appMeta: await db.appMeta.count(),
  }))

  const lastPing = useQuery(() => db.appMeta.get('debug-ping'))

  async function writePing() {
    // Round-trip write proves persistence: value survives reloads.
    await db.appMeta.put({ key: 'debug-ping', value: new Date().toISOString() })
  }

  async function resetDatabase() {
    if (!confirm('Delete all local data and re-seed the two vehicles?')) return
    await db.delete()
    await db.open()
    await seedIfEmpty()
    location.reload()
  }

  return (
    <section class="page">
      <h2 class="page-title">Debug</h2>
      <p class="muted small">
        Confirms the browser database is storing and returning data.
      </p>

      <div class="card">
        <h3 class="card-title">Table row counts</h3>
        {!counts ? (
          <p class="muted">Reading…</p>
        ) : (
          <dl class="kv">
            {Object.entries(counts).map(([table, n]) => (
              <div key={table}>
                <dt>{table}</dt>
                <dd>{n}</dd>
              </div>
            ))}
          </dl>
        )}
      </div>

      <div class="card">
        <h3 class="card-title">Write test</h3>
        <p class="muted small">
          Last ping: <code>{(lastPing?.value as string) ?? 'never'}</code>
        </p>
        <button class="btn" onClick={writePing}>
          Write timestamp to IndexedDB
        </button>
        <p class="muted small">
          Tap it, then reload the app — the timestamp should persist.
        </p>
      </div>

      <div class="card">
        <h3 class="card-title">Template data</h3>
        <p class="muted small">Inspect seeded schedule templates and set overrides.</p>
        <a class="btn" href="#/template">
          View template data
        </a>
      </div>

      <div class="card">
        <h3 class="card-title">Reminders engine</h3>
        <p class="muted small">
          Inject test odometer readings / completed events and inspect the
          computed due-status per rule.
        </p>
        <a class="btn" href="#/reminders-debug">
          Open reminders debug
        </a>
      </div>

      <div class="card danger">
        <h3 class="card-title">Reset</h3>
        <button class="btn btn-danger" onClick={resetDatabase}>
          Delete database &amp; re-seed
        </button>
      </div>
    </section>
  )
}
