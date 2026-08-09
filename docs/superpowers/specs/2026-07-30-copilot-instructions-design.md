# Copilot Instructions Refinement Design

**Date:** 2026-07-30
**Status:** Approved for implementation planning

## Goal

Refine the existing untracked `.github/copilot-instructions.md` in place so future Copilot sessions
can build, test, and modify Kitchen AI without rediscovering its cross-cutting architecture and
repository-specific constraints.

## Scope

Preserve the draft's current structure and verified guidance. Make only evidence-backed corrections
and additions:

- Correct the database command table: `db:studio` is available through
  `pnpm --filter @kitchen/api db:studio`, not as a root script.
- Record the pinned package manager and CI environment: pnpm 10.34.5, Node 22 in CI, and
  `pnpm install --frozen-lockfile`.
- State the CI verification order: build, typecheck, lint, then test.
- Clarify runtime defaults: API AI providers are mocked by default, web development explicitly
  enables MSW, and mobile mocks remain enabled unless explicitly disabled.
- Retain the verified single-test commands and API integration-test prerequisites.
- Retain the architecture and convention sections covering contracts, household ownership,
  inventory events, background jobs, presigned uploads, meal-plan validation, provider adapters,
  API validation/errors/serialization, bilingual catalogs, RTL-safe styles, design tokens, and
  typed client/state patterns.
- Retain the Playwright MCP guidance because the repository contains a web application whose RTL
  behavior requires browser-level verification.

No Claude, AGENTS, Cursor, Windsurf, Aider, or Cline configuration files are present to merge.

## Validation

Review the final instructions against the root and application package scripts, `turbo.json`, CI,
the README, authoritative design specifications, and representative implementation files. Confirm
the document contains no unsupported commands or claims and remains focused on repository-specific
knowledge rather than generic development advice.
