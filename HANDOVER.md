# HANDOVER

## 1) Project purpose and current problem
This repository is an EmDash monorepo with ongoing work on the commerce plugin in `packages/plugins/commerce`. The immediate objective is to move the plugin toward deployable storefront correctness and clean runtime boundaries without broad behavior changes.  
The current work scope is twofold: complete internal refactor cleanup (module boundaries, helper reuse, typing hardening) and close remaining public-surface correctness gaps in storefront product exposure (especially bundle compute and SKU visibility).

The current branch in scope is `main` and has been updated through commit `cc7c72d` (`chore: tighten EmDash core and adapter type safety`).

## 2) Completed work and outcomes
Commerce refactors already in place are materially structural, not cosmetic. Catalog route logic is split across focused handlers and helper modules (`catalog-product.ts`, `catalog-read-model.ts`, `catalog-conflict.ts`, `catalog-association.ts`, `catalog-asset.ts`, `catalog-bundle.ts`, `catalog-digital.ts`), and shared logic for pagination, conflict handling, and ordered child mutation is now centralized.  
The ordered-child normalization/mutation pathway has been consolidated and covered by tests in the existing commerce test suite (`ordered-rows.ts`, `ordered-rows.test.ts`).  
Type safety work was also completed across core runtime paths and Cloudflare adapters (`packages/core`, `packages/cloudflare`) including removal of several unsafe casts, safer SQL construction via `sql.ref`/parameterized expressions, and clearer plugin/route typing.

## 3) Failures, open issues, and lessons learned
Primary remaining issues from the earlier review have now been closed:
- `bundle/compute` public storefront endpoints reject non-POST methods and enforce storefront visibility before pricing.
- Storefront product detail exposes only storefront-eligible SKUs/variant rows.
- Storefront availability and storefront SKU listings use storefront-eligible SKUs and stock snapshots.
- Storefront read routes now enforce POST-method policy at the public handler boundary.

Latest verification pass status (plugin scope):
- `packages/plugins/commerce` typecheck: pass
- `packages/plugins/commerce` tests: pass

Known remaining work:
- Plugin docs and repo-hygiene pass (`HANDOVER`/`progress-review` cross-docs, obsolete review artifacts, and any stale operational notes).

Operational lessons to keep:
- Keep storefront visibility checks early in the flow (before deep admin-style hydration) to reduce incorrect read paths and complexity.
- Treat transform layers as business-boundary boundaries: internal loaders and DTO shaping should stay separable from request-method policy.
- Continue to avoid speculative refactors; fix only defects with a validated behavior path and test signal.
- Current remaining work is mostly documentation hygiene and ongoing verification for deployment-readiness.

## 4) Files changed, key insights, and gotchas
Focus for continuation (ordered by risk/impact):
- `packages/plugins/commerce/src/handlers/catalog.ts`
- `packages/plugins/commerce/src/handlers/catalog-product.ts`
- `packages/plugins/commerce/src/handlers/catalog-read-model.ts`
- `packages/plugins/commerce/src/handlers/catalog-asset.ts`
- `packages/plugins/commerce/src/handlers/catalog-association.ts`
- `packages/plugins/commerce/src/handlers/catalog-bundle.ts`
- `packages/plugins/commerce/src/handlers/catalog-digital.ts`
- `packages/plugins/commerce/src/handlers/catalog-conflict.ts`
- `packages/plugins/commerce/src/handlers/checkout.ts`, `checkout-state.ts`, `checkout-get-order.ts`
- `packages/plugins/commerce/src/lib/ordered-rows.ts`
- `packages/plugins/commerce/src/lib/merge-line-items.ts`
- `packages/plugins/commerce/src/lib/order-inventory-lines.ts`
- `packages/plugins/commerce/src/lib/catalog-order-snapshots.ts`
- `packages/plugins/commerce/src/orchestration/finalize-payment-inventory.ts`
- `packages/plugins/commerce/src/orchestration/finalize-payment.ts`
- `packages/core/src/database/repositories/content.ts`
- `packages/cloudflare/src/db/*`
- `packages/auth/src/adapters/kysely.ts`

Recent open-source-facing gotchas from review:
- Do not rely on internal/admin loaders for storefront routes unless visibility and method policy are enforced in the storefront wrapper.
- Do not return/store storefront-facing availability from non-eligible inventory aggregates.
- Keep `bundle/compute` in line with storefront policy to prevent hidden-draft access paths.

## 5) Key files and directories
Primary code paths for the next developer:
- `packages/plugins/commerce/src/handlers/`
- `packages/plugins/commerce/src/lib/`
- `packages/plugins/commerce/src/orchestration/`
- `packages/plugins/commerce/src/kernel/`
- `packages/plugins/commerce/src/storage.ts`
- `packages/core/src/` and `packages/cloudflare/src/` for the shared runtime hardening layer
- `packages/plugins/commerce/` documentation and policy files:
  - `COMMERCE_DOCS_INDEX.md`
  - `COMMERCE_EXTENSION_SURFACE.md`
  - `FINALIZATION_REVIEW_AUDIT.md`
- `progress-review.md` (latest external feedback)
- `external_review.md` (third-party review context)
- `HANDOVER.md` (this file)

