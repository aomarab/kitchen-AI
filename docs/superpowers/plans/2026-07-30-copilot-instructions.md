# Copilot Instructions Refinement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refine `.github/copilot-instructions.md` so future Copilot sessions receive accurate, repository-specific build, test, architecture, convention, runtime-default, and MCP guidance.

**Architecture:** Update the existing instructions document in place rather than replacing its verified structure. Correct unsupported command syntax and add only facts confirmed by package scripts, CI, configuration, and representative implementation files.

**Tech Stack:** Markdown, pnpm 10.34.5, Turborepo, GitHub Actions, NestJS, Next.js, Expo, Vitest.

## Global Constraints

- Preserve the existing draft's verified architecture and convention coverage.
- Use `pnpm --filter @kitchen/api db:studio`; no root `db:studio` script exists.
- Record CI's Node 22 runtime, frozen-lockfile install, and build → typecheck → lint → test order.
- State API, web, and mobile mock defaults exactly as implemented.
- Keep guidance repository-specific and avoid generic development advice or exhaustive directory listings.
- Retain Playwright MCP guidance for browser-level web and RTL verification.

---

### Task 1: Refine Repository Instructions

**Files:**
- Modify: `.github/copilot-instructions.md`

**Interfaces:**
- Consumes: Root and application `package.json` scripts, `turbo.json`, `.github/workflows/ci.yml`, `README.md`, the approved design specs, and representative configuration/implementation files.
- Produces: A repository-wide Copilot instruction document loaded automatically by future GitHub Copilot sessions.

- [ ] **Step 1: Correct and extend the command section**

Update the command guidance so it states:

```markdown
Run everything from the repo root. The repository pins pnpm 10.34.5 and requires Node >= 20;
CI uses Node 22 and installs with `pnpm install --frozen-lockfile`.
```

Keep root database scripts limited to `db:generate`, `db:migrate`, and `db:seed`, and add:

```markdown
Drizzle Studio is API-only: `pnpm --filter @kitchen/api db:studio`.
```

State the exact CI order:

```markdown
CI runs `pnpm build`, `pnpm typecheck`, `pnpm lint`, then `pnpm test`.
```

- [ ] **Step 2: Clarify runtime mock defaults**

Replace the broad mock statement with facts that distinguish each application:

```markdown
- API provider adapters use mocks by default because `AI_MOCK` defaults to `true`.
- Web development forces `NEXT_PUBLIC_API_MOCK=true`; production fails closed and does not enable
  mocks from that flag.
- Mobile uses MSW unless `EXPO_PUBLIC_USE_MOCKS=false`.
```

Preserve the existing notes about offline/free AI development and typed mock handlers.

- [ ] **Step 3: Preserve verified architecture and conventions**

Keep the existing concise guidance for:

```text
contracts route registry and typed client
household-scoped ownership and guards
append-only inventory events and transactional quantity updates
BullMQ jobs and idempotency keys
presigned object-storage uploads
three-stage meal-plan generation and deterministic validation
AI provider ports/adapters and YouTube API sourcing
NestJS Zod validation, AppError envelopes, serialization helpers, and generated migrations
typed bilingual catalogs, logical RTL properties, design-token guard tests, and locale-aware prompts
TanStack Query, Zustand, and per-platform API client construction
Playwright verification at http://localhost:3100
```

Do not add generic advice or a directory inventory.

- [ ] **Step 4: Review the final document**

Run:

```bash
git --no-pager diff --check -- .github/copilot-instructions.md
git --no-pager diff -- .github/copilot-instructions.md
```

Confirm that every command exists in the referenced package scripts, the CI sequence matches
`.github/workflows/ci.yml`, and no unsupported assistant configuration is claimed.

- [ ] **Step 5: Commit the refinement**

```bash
git add .github/copilot-instructions.md
git commit -m "docs: refine Copilot repository instructions" \
  -m "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>" \
  -m "Copilot-Session: 32b6df22-f7d6-4b0f-aba1-e9cb7615acf8"
```
