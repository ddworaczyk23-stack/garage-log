import { useState } from 'preact/hooks'
import { alertPrefs, disablePush, currentPushSupport, enablePush, getPushState, sendTestPush, setAlertPref } from '../db/push'
import type { AlertPrefs } from '../domain/push'
import { useQuery } from '../db/useQuery'
import { ConfirmButton } from './ui'

const ALERT_SWITCHES: [keyof AlertPrefs, string][] = [
  ['due', 'Service due dates'],
  ['safety', 'Safety items only (brakes, tires, timing belt)'],
  ['mileage', 'Confirm your mileage'],
  ['backup', 'Back up reminder (monthly)'],
  ['summary', 'Monthly summary (the 1st)'],
]

/** Settings card: turn on notifications for this phone and send a test.
 * Rendered only when the build has the push Worker configured. */
export function NotificationsCard() {
  const state = useQuery(async () => (await getPushState()) ?? null)
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState('')
  const support = currentPushSupport()
  if (state === undefined) return null // still reading local state

  const run = async (work: () => Promise<string>) => {
    setBusy(true)
    setStatus('')
    try {
      setStatus(await work())
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'Something went wrong. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div class="card box settings-notifications">
      <div class="box-head"><h3>Notifications</h3></div>
      <div class="box-body">
        {support === 'unsupported' && (
          <p class="muted small">This browser can't receive notifications.</p>
        )}
        {support === 'needs-install' && (
          <p class="muted small">
            On iPhone, notifications work once Coast is on your Home Screen. Tap Share, then Add to Home Screen,
            and open Coast from there.
          </p>
        )}
        {support === 'ready' && !state && (
          <>
            <p class="muted small">Get a nudge on this phone when something needs attention.</p>
            <button
              type="button"
              class="btn"
              disabled={busy}
              onClick={() => run(async () => { await enablePush(); return 'Notifications are on. Send a test to check.' })}
            >
              {busy ? 'Turning on…' : 'Turn on notifications'}
            </button>
          </>
        )}
        {support === 'ready' && state && (
          <>
            <p class="muted small">On for this phone. Sent at 9am Eastern.</p>
            {ALERT_SWITCHES.map(([kind, label]) => (
              <label key={kind} class="check-row">
                <input
                  type="checkbox"
                  checked={alertPrefs(state)[kind]}
                  disabled={busy}
                  onChange={(e) => run(async () => { await setAlertPref(kind, e.currentTarget.checked); return '' })}
                />
                <span>{label}</span>
              </label>
            ))}
            <button
              type="button"
              class="btn btn-secondary"
              disabled={busy}
              onClick={() => run(async () => { await sendTestPush(); return 'Sent. It should arrive in a few seconds.' })}
            >
              {busy ? 'Sending…' : 'Send a test notification'}
            </button>
            <p class="muted small">
              <ConfirmButton
                label="Turn off"
                confirmLabel="Turn off"
                busyLabel="Turning off…"
                onConfirm={async () => {
                  await disablePush()
                  setStatus('')
                }}
              />
            </p>
          </>
        )}
        {status && (
          <p class="muted small" role="status">
            {status}
          </p>
        )}
      </div>
    </div>
  )
}
