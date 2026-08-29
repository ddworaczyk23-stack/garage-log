# Garage Log — Codex entry point

Full project context lives in [CLAUDE.md](CLAUDE.md) — read that first (what
this is, architecture, file map). This file adds Codex-specific guidance on
top of it.

## Before starting

Read `docs/handoffs/active.md` for the current task and what Claude (or a
previous Codex session) already did. Update it when you finish — what
changed, what's done, what's next.

## Role on this project

Default to bulk/mechanical work: scaffolding, tests, boilerplate, mechanical
refactors and renames. Architecture decisions — the Dexie schema, sync
design, anything cross-cutting — are Claude's job. Flag it in
`docs/handoffs/active.md` rather than improvising.

When a task calls for Claude's planning, architecture, or cross-file
orchestration role, proactively tell David that switching back to Claude is
recommended rather than continuing in Codex for convenience.

## Hard constraints — do not violate these (repeated from CLAUDE.md)

- **Offline-first is non-negotiable.** The app must work fully with no
  account and no network. Dexie Cloud sync is optional and additive, never a
  requirement for core function.
- **Never push directly to a deployed environment without confirmation.**
  Draft and explain changes; let David decide when to ship.
