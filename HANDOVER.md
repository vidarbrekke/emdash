# HANDOVER

## 1) Project purpose and current problem
This repository is an EmDash monorepo with active work focused on `packages/plugins/commerce`. The app’s current task is to make storefront-facing commerce operations trustworthy under load by reducing boundary leaks, tightening backend invariants, and preserving runtime behavior contracts for checkout/finalize and catalog reads.

The immediate problem is not new feature growth: it is completing the remaining correctness pass so frontend and admin work can proceed without hidden backend churn. The active branch is `main` (`commit 9796a59` is the latest handoff commit and has been pushed to `origin/main`).

## 2) Completed work and outcomes
Storefront product-read correctness is now enforced in the current plugin state: storefront routes have explicit POST-only semantics where intended, bundle compute applies storefront visibility and status checks, storefront SKUs/variant rows are limited to storefront-eligible rows, and stock-derived availability is computed from storefront-eligible SKU data.

Type and integration hardening is in place for the catalog surface and route boundary wiring in the commerce plugin, with unit coverage for changed storefront behavior and existing finalize/checkout replay semantics preserved.

Operational release-gate state is documented in `COMMERCE_DOCS_INDEX.md` and `CI_REGRESSION_CHECKLIST.md`: plugin lint/typecheck/tests are green, and `HANDOVER.md` and strategy docs are aligned for handoff.

## 3) Failures, open issues, and lessons learned
P0 gap from external review: a single-cart single-open-checkout invariant is still missing, so one cart can currently enter multiple concurrent `payment_pending` orders across retry paths or different idempotency keys. This is the highest-priority fix before shifting to frontend-first work.

P1 gaps: duplicated rule logic exists for bundle discount validation (schema + handler logic), and `asCollection`/storage-typing helpers are still repeated across checkout/cart/extension seam files; these increase drift risk and reduce DRY compliance. Structural risk is also concentrated in large files with mixed responsibility (`src/handlers/catalog-product.ts`, `src/handlers/catalog-read-model.ts`, `src/orchestration/finalize-payment.ts`, `src/index.ts` route registration). P2 items exist, but should follow after P0/P1 are closed.

Validation status remains: `pnpm --silent lint:quick` pass, `pnpm --filter ./packages/plugins/commerce typecheck` pass, `pnpm --filter ./packages/plugins/commerce test` pass. `pnpm --filter ./packages/core typecheck` still fails on baseline core typing debt outside this scoped pass; it is not newly introduced by this plugin handoff.

Key lessons to keep: enforce policy early in the request path, keep DTO shaping separate from command/method policy, apply targeted fixes with direct tests, and avoid architecture expansion (provider routing/MCP command surface) while correctness and invariants are still open.

## 4) Files changed, key insights, and gotchas
The docs and plugin surface currently in scope for continuation are:
- `packages/plugins/commerce/src/handlers/checkout.ts` (cart checkout invariant work and tests)
- `packages/plugins/commerce/src/handlers/catalog-product.ts` (split command/query and move mappers out)
- `packages/plugins/commerce/src/handlers/catalog-read-model.ts` (query/read-model responsibilities)
- `packages/plugins/commerce/src/handlers/catalog.ts` (route wrapper semantics)
- `packages/plugins/commerce/src/orchestration/finalize-payment.ts` / `finalize-payment-inventory.ts` (phase split only after checkout invariant is stabilized)
- `packages/plugins/commerce/src/schemas.ts` (shared validation source)
- `packages/plugins/commerce/src/storage.ts`, `src/types.ts`

Gotchas:
- Do not widen behavior in payment/finalize/idempotency/claim logic without regression tests.
- Do not expose storefront availability from non-storefront-eligible aggregate paths.
- Do not merge core typing debt in this plugin scope.

## 5) Key files and directories
`packages/plugins/commerce/src/handlers/`
`packages/plugins/commerce/src/lib/`
`packages/plugins/commerce/src/orchestration/`
`packages/plugins/commerce/src/kernel/`
`packages/plugins/commerce/src/storage.ts`
`packages/plugins/commerce/COMMERCE_DOCS_INDEX.md`
`packages/plugins/commerce/CI_REGRESSION_CHECKLIST.md`
`packages/plugins/commerce/COMMERCE_EXTENSION_SURFACE.md`
`packages/plugins/commerce/FINALIZATION_REVIEW_AUDIT.md`
`packages/plugins/commerce/AI-EXTENSIBILITY.md`
`packages/plugins/commerce/COMMERCE_AI_ROADMAP.md`
`progress-review.md` and `external_review.md` (third-party context)
`HANDOVER.md` (this file)

Additional root-level references for the next phase:
- `dashcommerce-extension-architecture-spec.md`
- `gdpr-plugin-implementation-spec.md`
- `emdash-commerce-gdpr-extension-authoritative-guide.md`
- `eu-selling-marketing-gdpr-guide.md`
- `announcement_public_beta.md`
- `announcement_ga.md`
