# Legal documents

**Privacy Policy** and **Terms of Service** for Kitchen AI.

- [`privacy-policy.md`](./privacy-policy.md)
- [`terms-of-service.md`](./terms-of-service.md)

## Status: finalized + published — legal review still recommended

Every `[BRACKETED]` placeholder has been resolved (2026-08-30) and both
documents are published at stable public HTTPS URLs (see below). They are
engineering's honest, code-grounded description of what the app does with data
and how credits/purchases work. They have **not** been reviewed by a lawyer —
have qualified counsel review them and adjust the jurisdiction-specific clauses
(EU/UK representative, dispute resolution, consumer carve-outs, liability caps)
before or shortly after launch.

## Published URLs

Rendered from these Markdown sources onto the repo's GitHub Pages site (the
`gh-pages` branch, built by `docs/legal/build-site.mjs`):

- Privacy Policy: <https://aomarab.github.io/kitchen-AI/privacy-policy.html>
- Terms of Service: <https://aomarab.github.io/kitchen-AI/terms-of-service.html>

Enter the Privacy Policy URL in App Store Connect → App Information (required to
submit) and, for Android, the Play Console. To republish after editing the
Markdown, re-run the site build and push `gh-pages`.

## Grounding

Factual claims are grounded in the codebase and must stay consistent with it:

- Data collection and account deletion: `docs/store-listing/data-safety.md` and
  `apps/api/src/auth/account-deletion.ts`. **If these disagree with the legal
  documents, the code and `data-safety.md` win** — update the docs in the same
  change.
- Credits, packs, free grant, and refund model:
  `packages/contracts/src/credits.ts`.
- Age rating (4+/Everyone, no mature content): `docs/store-listing/age-rating.md`.

The feedback paragraph in the Privacy Policy is a commitment enforced in code
(`apps/mobile/src/lib/store-policy.spec.ts` fails the build if the app imports a
store-review API); keep its wording.
