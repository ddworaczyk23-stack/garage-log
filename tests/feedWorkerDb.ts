// Test helper: the Worker's D1 store backed by Node's built-in SQLite (D1 is
// SQLite), with the real migration applied, so tests run the actual SQL.
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { d1Store, type D1Like, type FeedStore } from '../worker/calendar-feed/src/index'

// Loaded via require: Vite 5's resolver doesn't know the node:sqlite builtin.
const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite')
const MIGRATION = readFileSync(new URL('../worker/calendar-feed/migrations/0001_init.sql', import.meta.url), 'utf8')

export function sqliteStore(): FeedStore {
  const db = new DatabaseSync(':memory:')
  db.exec(MIGRATION)
  const d1: D1Like = {
    prepare(sql) {
      const stmt = (values: unknown[]) => ({
        bind: (...v: unknown[]) => stmt(v),
        first: async <T,>() => ((db.prepare(sql).get(...(values as never[])) as T | undefined) ?? null),
        run: async () => db.prepare(sql).run(...(values as never[])),
      })
      return stmt([])
    },
  }
  return d1Store(d1)
}
