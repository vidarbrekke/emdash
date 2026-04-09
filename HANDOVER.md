# HANDOVER

## 1) Big-picture purpose and current problem
`@emdash-cms/plugin-dashing-commerce` is the EmDash commerce backend plugin for catalog APIs, cart operations, checkout initiation, webhook-backed payment finalization, and scheduled operations.

The current problem is backend contract hardening before front-end work resumes. The codebase is now aligned to an explicit runtime-capability model so that route behavior, plugin manifest, and storage access are enforceable and prevent frontend-driven regressions.

## 2) Completed work and outcomes
`createCommercePlugin` is now implemented in the package source at `packages/plugins/commerce/src/commerce-plugin-factory.ts` and used by `packages/plugins/commerce/src/index.ts`; root `commerce-plugin-factory.ts` is a compatibility re-export to keep external import paths stable.

Route registration now uses explicit route capability metadata in `COMMERCE_ROUTE_CAPABILITIES`; `withKV(...)` is applied only for `cart/upsert`, `checkout`, and `webhooks/stripe`, while fetch capability remains opt-in via `withFetch(...)` for future route requirements.

Factory and runtime validations were tightened for manifest correctness (required capabilities and canonical plugin id), plus network policy constraints (no protocol, no path, no wildcard hostnames). Compliance coverage now includes stricter route-capsule checks and inventory edge-case coverage for stale ledger reconciliation.

CI hardening was added so `pnpm --filter @emdash-cms/plugin-dashing-commerce run check` runs in `test-smoke`; this ties lint/typechecks/tests to the repo-wide pipeline for future merges.

Commit state: `92aa5b3` on `main` (`feat(commerce): tighten route capability enforcement`) is pushed and includes this hardening pass.

## 3) Failures, open issues, and lessons learned
No functional regressions were introduced by this pass in the validated package check run. A key resolved issue was test fragility caused by wrapped route handler identity; tests now validate behavior contracts and route metadata (`public`) instead of raw function equality.

The hardening pass did not complete all back-end readiness conditions required before frontend scaling; the unresolved work is explicitly tracked in `pre-frontend-backend-hardening.md`: auth boundary verification, strict settings validation policy, response-shape freeze strategy, deeper idempotency/concurrency stress cases, and end-to-end error taxonomy consistency.

Lessons are strict and repeatable: capability requirements should be declared at the route edge, contract tests should verify invariants not implementation details, and route surface behavior should be protected by CI.

## 4) Files changed, key insights, and gotchas
Primary files changed in this phase: `/.github/workflows/ci.yml`, `/commerce-plugin-factory.md`, `/commerce-plugin-factory.ts`, `/packages/plugins/commerce/src/index.ts`, `/packages/plugins/commerce/src/commerce-guide-compliance.test.ts`, `/packages/plugins/commerce/src/commerce-plugin-factory.ts`, `/packages/plugins/commerce/src/orchestration/finalize-payment-inventory.ts`, `/packages/plugins/commerce/src/orchestration/finalize-payment-inventory.test.ts`.

Key insight for future work: do not add tests that assert function identity across wrapped routes; assert contract shape, metadata flags, and thrown capability errors.

Gotcha to avoid: adding storage-backed routes without updating `COMMERCE_ROUTE_CAPABILITIES` and capability handling will create runtime guard drift.

## 5) Key files and directories
Authoritative handoff files: `HANDOVER.md`, `pre-frontend-backend-hardening.md`, `commerce-plugin-spec.md`, `commerce-plugin-contracts.md`, `commerce-plugin-governance-index.md`, `commerce-plugin-factory.md`, `commerce-plugin-developer-execution.md`.

Primary code review files: `packages/plugins/commerce/src/index.ts`, `packages/plugins/commerce/src/commerce-plugin-factory.ts`, `packages/plugins/commerce/src/commerce-guide-compliance.test.ts`, `packages/plugins/commerce/src/orchestration/finalize-payment-inventory.ts`, `packages/plugins/commerce/src/orchestration/finalize-payment-inventory.test.ts`.

Primary directories: `packages/plugins/commerce/src`, `packages/plugins/commerce/src/handlers`, `packages/plugins/commerce/src/orchestration`, `packages/plugins/commerce/src/kernel`, `packages/plugins/commerce/src/lib`.

