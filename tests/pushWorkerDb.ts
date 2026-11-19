// Test helper: the push Worker's D1 store backed by Node's built-in SQLite,
// with the real migration applied, so tests run the actual SQL.
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { d1Store, type D1Like, type SubStore } from '../worker/push/src/index'

const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite')
const MIGRATIONS = ['0001_init.sql', '0002_alerts.sql'].map((f) =>
  readFileSync(new URL(`../worker/push/migrations/${f}`, import.meta.url), 'utf8'),
)

export function pushStore(): SubStore {
  const db = new DatabaseSync(':memory:')
  for (const m of MIGRATIONS) db.exec(m)
  const d1: D1Like = {
    prepare(sql) {
      const stmt = (values: unknown[]) => ({
        bind: (...v: unknown[]) => stmt(v),
        first: async <T,>() => ((db.prepare(sql).get(...(values as never[])) as T | undefined) ?? null),
        all: async <T,>() => ({ results: db.prepare(sql).all(...(values as never[])) as T[] }),
        run: async () => db.prepare(sql).run(...(values as never[])),
      })
      return stmt([])
    },
  }
  return d1Store(d1)
}
