# HANDOVER

## 1) Project purpose and current problem
EmDash now positions commerce as a closed-kernel core with a separate extension space for optional modules.  

Current priority is to harden the admin and storefront paths while preserving money-path correctness (`checkout`, `webhook`, and `finalize` behavior). The immediate problem is proving product editing and catalog UX on top of recently added backend safeguards without reintroducing regression risk.

## 2) Completed work and outcomes
Key completed outcomes:

- Added and stabilized backend readiness tooling:
  - `scripts/commerce-backend-readiness.mjs`
  - `pnpm readiness:commerce-backend` and `pnpm readiness:commerce-backend:strict`
  - CI `commerce-readiness` step in `.github/workflows/ci.yml`
- Completed non-core module relocation to `../Dashing commerce PLANS/emdash-extensions` and aligned moved-module imports with explicit `link:` references.
- Implemented product-catalog safety work in `packages/plugins/commerce`:
  - canonical storefront lookup by slug with redirect/canonical hints
  - stored product slug history tracking
  - variable-product attribute-edit safeguards and SKU lifecycle state (`valid`, `requires_review`, `auto_paused`, `reconciled`)
  - pause/review/reconcile flow for SKU safety after attribute changes
- Removed greenfield-only legacy compatibility paths in finalize/webhook code that were no longer needed.
- Tightened Stripe webhook metadata typing/contracts to canonical keys only.
- Added `packages/plugins/commerce` quality scripts:
  - `check` (`typecheck && lint`)
  - `lint` (`oxlint --type-aware`)
- Added and expanded test coverage for catalog, checkout lock behavior, and webhook metadata contracts.
- Regenerated and shared current external review archive:
  - `commerce-plugin-external-review.zip`
  - `dashing-commerce-external-review-code-contracts.zip`

## 3) Failures, open issues, and lessons learned
Known open risks:

- Admin and storefront UI smoke passes are planned but not yet fully completed.
- No production-grade `dashcommerce.gdpr` plugin package exists yet under `packages/plugins`.
- Core typing debt in `packages/core` remains outside this phase.
- Duplicate-concurrent webhook handling remains a residual edge-risk; it is tracked in the review notes and remains intentional given storage-layer limitations.

Enforced lessons:

- Keep scope within contracts first: validate route and handler contracts before broad UI edits.
- Maintain kernel scope lock: no payment/finalization/topology changes without targeted contract and regression tests.
- Treat path/reference drift as a release blocker; keep moved-module references explicit and documented.

## 4) Files changed, key insights, and gotchas
Files to review first for continuation:

- `scripts/commerce-backend-readiness.mjs`
- `.github/workflows/ci.yml`
- `package.json`
- `HANDOVER.md` (this file)
- `ADMIN_CONSUMER_UI_SMOKE_READINESS.md`
- `packages/plugins/commerce/package.json`
- `packages/plugins/commerce/src/index.ts`
- `packages/plugins/commerce/src/handlers/catalog.ts`
- `packages/plugins/commerce/src/handlers/catalog-product.ts`
- `packages/plugins/commerce/src/handlers/catalog.test.ts`
- `packages/plugins/commerce/src/handlers/webhooks-stripe.ts`
- `packages/plugins/commerce/src/handlers/webhooks-stripe.test.ts`
- `packages/plugins/commerce/src/handlers/checkout.ts`
- `packages/plugins/commerce/src/handlers/checkout.test.ts`
- `packages/plugins/commerce/src/handlers/finalize-payment.ts`
- `packages/plugins/commerce/src/storage.ts`
- `packages/plugins/commerce/src/types.ts`
- `packages/plugins/commerce/src/schemas.ts`
- `packages/plugins/commerce/COMMERCE_DOCS_INDEX.md`
- `packages/plugins/commerce/COMMERCE_EXTENSION_SURFACE.md`
- `packages/plugins/commerce/FINALIZATION_REVIEW_AUDIT.md`

Key operational gotcha:

- Extension workspace path contains a space: `Dashing commerce PLANS`; always quote it in shell, scripts, and docs.

## 5) Key files and directories

- Core docs:
  - `HANDOVER.md`
  - `ADMIN_CONSUMER_UI_SMOKE_READINESS.md`
  - `COMMERCE_DOCS_INDEX.md`
  - `COMMERCE_EXTENSION_SURFACE.md`
  - `commerce-backend-readiness-punch-list.md`
  - `external_review.md`
- Core code:
  - `packages/plugins/commerce/src`
  - `packages/plugins/commerce/storage.ts`
  - `packages/plugins/commerce/COMMERCE_DOCS_INDEX.md`
- Integration and readiness:
  - `package.json`
  - `scripts/commerce-backend-readiness.mjs`
  - `.github/workflows/ci.yml`
  - `demos/*/package.json`
  - `templates/*/package.json`
- Extension workspace:
  - `../Dashing commerce PLANS/emdash-extensions/README.md`
  - `../Dashing commerce PLANS/emdash-extensions/gdpr-plugin-starter/`

## 6) Next-step acceptance before wider testing
Use this as the gate before broad UI work:

- `pnpm readiness:commerce-backend:strict`
- `pnpm --silent lint:quick`
- `pnpm --filter ./packages/plugins/commerce typecheck`
- `pnpm --filter ./packages/plugins/commerce test`
- `pnpm test` (repo-wide pass when time permits)
- Confirm `ADMIN_CONSUMER_UI_SMOKE_READINESS.md` checklist is complete
