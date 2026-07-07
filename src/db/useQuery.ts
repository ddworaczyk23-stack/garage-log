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

  useEffect(() => {
    // Reset to "loading" on every dep change (e.g. switching vehicles) so the
    // UI doesn't briefly render the previous query's data while the new
    // liveQuery subscription is still resolving its first emission.
    setValue(undefined)
    const sub = liveQuery(querier).subscribe({
      next: (v) => setValue(v),
      error: (err) => console.error('[useQuery]', err),
    })
    return () => sub.unsubscribe()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)

  return value
}
