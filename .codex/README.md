# Garage Log — Codex configuration

This folder is Garage Log's repository-local Codex configuration surface.

- Read [`../CLAUDE.md`](../CLAUDE.md) before working in this repository; it is the
  project source of truth for architecture, constraints, and verification.
- Keep reusable project-specific Codex skills under `skills/<skill-name>/SKILL.md`.
- Keep account credentials, installed plugins, and personal session state in
  `~/.codex/`, never in this repository.

The OS-level `.codex/` folder holds shared configuration; this one is only for
settings and skills specific to Garage Log.
