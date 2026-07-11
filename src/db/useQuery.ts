import { useEffect, useState } from 'preact/hooks'
import { liveQuery } from 'dexie'

// Minimal reactive query helper for Milestone 1.
//
// Wraps Dexie's built-in `liveQuery`, so a screen re-renders automatically
// whenever the data it read changes (e.g. after a seed or a debug write). No
// manual refresh wiring, no extra dependency.
export function useQuery<T>(
  querier: () => T | Promise<T>,
  deps: unknown[] = [],
): T | undefined {
  const [value, setValue] = useState<T>()
  // A liveQuery failure is stored here and re-thrown below, DURING render —
  // not from inside the setter call itself. Unlike React, Preact's useState
  // setter evaluates a function-updater synchronously at call time rather
  // than deferring it to the render phase, so a "throwing updater" (the
  // usual React trick for surfacing async errors to an error boundary) would
  // throw from inside the Dexie observable callback instead, outside any
  // render/commit try/catch — it needs to be a plain value, thrown here.
  const [queryError, setQueryError] = useState<unknown>(null)
  if (queryError) throw queryError

  useEffect(() => {
    // Reset to "loading" on every dep change (e.g. switching vehicles) so the
    // UI doesn't briefly render the previous query's data while the new
    // liveQuery subscription is still resolving its first emission.
    setValue(undefined)
    const sub = liveQuery(querier).subscribe({
      next: (v) => setValue(v),
      error: (err) => {
        console.error('[useQuery]', err)
        setQueryError(err)
      },
    })
    return () => sub.unsubscribe()
    // Deliberately NOT `querier` — it's a fresh closure every render, so
    // depending on it would resubscribe every render. `deps` is the caller's
    // explicit contract for when to resubscribe (no exhaustive-deps linter
    // is configured in this project to flag the mismatch).
  }, deps)

  return value
}
