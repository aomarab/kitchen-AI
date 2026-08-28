# Legal documents

Draft **Privacy Policy** and **Terms of Service** for Kitchen AI.

- [`privacy-policy.md`](./privacy-policy.md)
- [`terms-of-service.md`](./terms-of-service.md)

## Status: DRAFT — requires legal review

These are **not** legal advice and are **not** ready to publish. They are
engineering's honest, code-grounded description of what the app does with data
and how credits/purchases work, written so that qualified counsel can turn them
into a published policy quickly and correctly.

Before publication:

1. Have a lawyer review both documents.
2. Fill every `[BRACKETED]` placeholder (legal entity, jurisdiction, contact
   email, hosting region, governing law, sub-processors, etc.).
3. Host them at stable public URLs and enter those URLs in App Store Connect and
   the Play Console (a privacy policy URL is required to submit).

## Grounding

Factual claims are grounded in the codebase and must stay consistent with it:

- Data collection and account deletion: `docs/store-listing/data-safety.md` and
  `apps/api/src/auth/account-deletion.ts`. **If these disagree with the legal
  drafts, the code and `data-safety.md` win** — update the drafts in the same
  change.
- Credits, packs, free grant, and refund model:
  `packages/contracts/src/credits.ts`.
- Age rating (4+/Everyone, no mature content): `docs/store-listing/age-rating.md`.

The feedback paragraph in the Privacy Policy is a commitment enforced in code
(`apps/mobile/src/lib/store-policy.spec.ts` fails the build if the app imports a
store-review API); keep its wording.
