# HANDOVER

## 1) Big-picture purpose and current problem
`@emdash-cms/plugin-dashing-commerce` is the commerce plugin for EmDash. It owns checkout, order creation, payment-attempt persistence, and webhook-based payment finalization.
Current scope is production-hardening for money-path correctness under concurrency: replay safety, ownership-safe lock and receipt transitions, and partial-write recovery without changing API contracts.

## 2) Completed work and outcomes
Checkout now requires atomic lock primitives for money-path execution. Stale and stolen locks are handled with ownership checks and compare-and-swap semantics. Release now writes a released marker first, then attempts best-effort deletion to reduce lock-table growth where collection deletion is supported.
Webhook finalization now enforces claim transitions through compare-and-swap and terminal-state guardrails. Receipt state can only move forward via CAS-guarded transitions, so stale workers cannot overwrite terminal results.
`allowDegradedMode` is not supported for money-path operations. Catalog variable-attribute replacement now uses paginated truth-bearing reads (`queryAllPages`) and rollback writes follow dependency order to avoid partial-write corruption.
Validation status for this branch is clean for `@emdash-cms/plugin-dashing-commerce`: `pnpm --filter @emdash-cms/plugin-dashing-commerce test`, `pnpm --filter @emdash-cms/plugin-dashing-commerce check`, and targeted regression tests all pass.

## 3) Failures, open issues, and lessons learned
Failures resolved in this phase were stale-lock cleanup behavior under release races, optional `compareAndSwap` typing in claim refresh, and test-double mismatches in in-memory storage adapters.
Open issues are operational: lock rows can remain as tombstones if deletion is not implemented by the underlying storage provider; this is an expected best-effort cleanup boundary.
Lessons are strict: keep concurrency control at write boundaries, keep ownership checks symmetric across lock claim and release, and treat claim-state transitions as versioned state machines.

## 4) Files changed, key insights, and gotchas
Primary changed files:
`packages/plugins/commerce/src/handlers/checkout.ts`
`packages/plugins/commerce/src/orchestration/finalize-payment.ts`
`packages/plugins/commerce/src/handlers/checkout.test.ts`
`packages/plugins/commerce/src/orchestration/finalize-payment.test.ts`
`packages/plugins/commerce/src/handlers/catalog-product.ts`
`packages/plugins/commerce/src/handlers/catalog.test.ts`

Use these constraints:
Do not replace ownership-checked lock release with blind delete logic.
Do not ignore compare-and-swap return values in finalize claim state transitions.
Do not reintroduce degraded fallback for checkout/finalization money-path writes.

## 5) Key files and directories
`HANDOVER.md`
`DAY_1_CHECKLIST.md`
`ADMIN_CONSUMER_UI_SMOKE_READINESS.md`
`packages/plugins/commerce/COMMERCE_DOCS_INDEX.md`
`packages/plugins/commerce/COMMERCE_EXTENSION_SURFACE.md`
`commerce-plugin-architecture.md`
`dashing-commerce-diff-style-patch-plan.md`
`dashing-commerce-execution-plan.md`
`packages/plugins/commerce/src`
`packages/plugins/commerce/src/handlers`
`packages/plugins/commerce/src/orchestration`
`packages/plugins/commerce/src/lib`
