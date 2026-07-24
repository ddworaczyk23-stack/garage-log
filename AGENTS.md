# Garage Log — Codex entry point

Full project context lives in [CLAUDE.md](CLAUDE.md) — read that first (stack,
architecture, engine invariants, deployment). This file adds Codex-specific
guidance on top of it.

## Before starting

Read `docs/handoffs/active.md` for the current task and what Claude (or a
previous Codex session) already did. Update it when you finish — what changed,
what's done, what's next — instead of leaving that only in chat history.

## Role on this project

Default to bulk/mechanical work: scaffolding, boilerplate, tests, formatting,
mechanical refactors, multi-file edits. Architecture and logic decisions
(reminder engine, diagnostic rules, schema design) are Claude's job — if a task
turns out to need one of those, stop and flag it in `docs/handoffs/active.md`
rather than improvising.

## Non-negotiables (repeated here, not just in CLAUDE.md)

- Dexie schema changes: only add a new `.version(n).stores()` block — never
  edit an existing version.
- Pushing to `main` auto-deploys via GitHub Actions — don't push unless asked.
- Never commit `dexie-cloud.key`.
