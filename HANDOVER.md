# HANDOVER

## 1) Purpose and current state
`@emdash-cms/plugin-dashing-commerce` is the EmDash commerce plugin for catalog APIs, cart operations, checkout orchestration, and payment finalization. It provides the API and data integrity layer for storefront and admin experiences.

This branch is now positioned for the next phase: **admin and UI enhancements**. Backend functionality is the source of truth for pricing, inventory, checkout, and entitlement transitions; frontend work should consume backend contracts only and avoid duplicating or mutating business behavior.

## 2) Completed work and outcomes
Backend hardening and external-review readiness are substantially complete for the current phase. Route registration is explicit and policy-driven in `packages/plugins/commerce/src/index.ts`, with contract metadata and route wrappers enforcing capability surfaces.

A package-level middleware proof now shows non-public plugin routes are rejected without auth context: `packages/core/tests/unit/plugins/plugin-route-auth.test.ts`.

Checkout and webhook paths now use shared, explicit optimistic-lock token helpers in `packages/plugins/commerce/src/lib/optimistic-lock.ts`, with updates in `handlers/checkout.ts` and `orchestration/finalize-payment.ts` to use explicit version tokens rather than timestamp-only CAS assumptions.

The external review ZIP build process was updated (`scripts/build-commerce-external-review-zip.sh`) so root monorepo context files used for reproducibility are included. The most recent generated archive is `commerce-plugin-external-review-20260409-160045.zip`.

Recent commits on this branch:
- `40e6b2b` refactor: centralize optimistic-lock token helpers
- `ac7127d` fix: enforce POST for storefront, cart, recommendation, and webhook handler entrypoints
- `60f1bb4` fix: unblock create-emdash and commerce typechecks by normalizing prompt types and lock row shape

Validation status on this branch:
- `pnpm --filter ./packages/plugins/commerce test` ✅ (39 files, 595 tests)
- `pnpm --filter ./packages/plugins/commerce typecheck` ✅
- `pnpm --filter ./packages/create-emdash typecheck` ✅
- `pnpm check` ⚠️ fails in `packages/core` for existing, unrelated type errors

## 3) Failures, open issues, and lessons learned
`pnpm check` currently reports pre-existing `packages/core` type errors in multiple areas, including API manifest typing, OpenAPI path typing, and Kysely generic inference in migration helpers. These are not caused by the recent commerce/create-emdash changes and should be treated as outside-scope unless your phase explicitly includes core stabilization.

In commerce tests, helper data fixtures had to be updated to match lock token typing (`lockVersion` on idempotency lock rows). Test data that bypasses this shape will produce type failures before runtime.

Prompt responses from `@clack/prompts` are cancelable and should be narrowed before use. Using unsafely typed prompt returns in business paths caused earlier type regressions.

Rule learned from this phase: keep frontend delivery bounded to the contract boundary, and keep lock/version semantics centralized to reduce drift between storage paths.

## 4) Files changed, key insights, and gotchas
Key file changes relevant to continuity:
- `packages/plugins/commerce/src/handlers/cart.ts`
- `packages/plugins/commerce/src/handlers/catalog.ts`
- `packages/plugins/commerce/src/handlers/recommendations.ts`
- `packages/plugins/commerce/src/handlers/webhook-handler.ts`
- `packages/plugins/commerce/src/handlers/cart.test.ts`
- `packages/plugins/commerce/src/handlers/checkout.ts`
- `packages/plugins/commerce/src/lib/optimistic-lock.ts`
- `packages/plugins/commerce/src/lib/optimistic-lock.test.ts`
- `packages/plugins/commerce/src/orchestration/finalize-payment.ts`
- `packages/plugins/commerce/src/orchestration/finalize-payment.test.ts`
- `packages/core/src/astro/routes/api/plugins/route-handler.ts`
- `packages/core/tests/unit/plugins/plugin-route-auth.test.ts`
- `packages/plugins/commerce/src/types.ts`
- `packages/create-emdash/src/index.ts`
- `packages/create-emdash/tsconfig.json`
- `scripts/build-commerce-external-review-zip.sh`

Key insights:
- Keep lock CAS fields explicit (`lockVersion`) on short-lived lock records.
- Use route method guards (`POST` enforcement) as contract boundary control, not UI assumptions.
- Keep admin and storefront logic contracted through shared handlers and hooks.

Gotchas:
- `StoredIdempotencyKey` now supports `lockVersion` for lock rows; keep all lock-row test fixtures aligned.
- Frontend code should call APIs only and not reimplement pricing/inventory/checkout behavior.
- Archive file lists are only valid if they match the checked-in build script at build time.

## 5) Key files and directories
### Hand-off and policy documents
- `dashingcommerce_handoff/00_HANDOVER.md`
- `dashingcommerce_handoff/ARCHITECTURE.md`
- `dashingcommerce_handoff/FRONTEND_GUIDELINES.md`
- `dashingcommerce_handoff/ADMIN_UI_SPEC.md`
- `dashingcommerce_handoff/VALIDATION_CHECKLIST.md`
- `dashingcommerce_handoff/IMPLEMENTATION_PLAN.md`
- `dashingcommerce_handoff/EXTENSION_RUNTIME.md`
- `dashingcommerce_handoff/EXTENSION_SDK_SPEC.md`
- `dashingcommerce_handoff/MARKETPLACE_SPEC.md`
- `dashingcommerce_handoff/MONETIZATION_MODEL.md`

### Commerce implementation and tests
- `packages/plugins/commerce/src/index.ts`
- `packages/plugins/commerce/src/contracts/`
- `packages/plugins/commerce/src/handlers/`
- `packages/plugins/commerce/src/lib/`
- `packages/plugins/commerce/src/orchestration/`
- `packages/plugins/commerce/src/commerce-guide-compliance.test.ts`
- `packages/plugins/commerce/src/checkout-state.ts`

### Auth boundary and core integration
- `packages/core/src/astro/routes/api/plugins/route-handler.ts`
- `packages/core/tests/unit/plugins/plugin-route-auth.test.ts`

### Reproducibility assets
- `scripts/build-commerce-external-review-zip.sh`
- `docs/compliance.md`
- `docs/compliance-source-of-truth.md`
- `COMMERCE_DOCS_INDEX.md`
- `COMMERCE_EXTENSION_SURFACE.md`
- `package.json`
- `pnpm-workspace.yaml`
- `pnpm-lock.yaml`

Recommended first commands for continuation:
- `git rev-parse --short HEAD`
- `git status --short`
- `pnpm --filter ./packages/plugins/commerce test`
- `pnpm --filter ./packages/plugins/commerce typecheck`
- `pnpm --filter ./packages/create-emdash typecheck`
- `bash scripts/build-commerce-external-review-zip.sh`

Critical instruction to carry forward:

> Follow these documents strictly. Do not introduce business logic into the frontend. Do not bypass backend contracts. If anything conflicts, stop and ask.
