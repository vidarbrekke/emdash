# HANDOVER

## 1) Big-picture purpose and current problem
`@emdash-cms/plugin-dashing-commerce` is the EmDash commerce plugin that powers checkout, catalog reads/writes, cart operations, and webhook-backed order finalization.

The current objective is governance hardening, not feature expansion. The plugin needed to be moved to a strict contract-first pattern (`createCommercePlugin`) so manifest definition, lifecycle behavior, capability usage, and route exposure are enforceable and hard to regress.

## 2) Completed work and outcomes
`createCommercePlugin` is now used from `index.ts`, with `COMMERCE_MANIFEST` as the canonical manifest source and no alternate manifest duplication.
`commerce-plugin-factory.ts` now normalizes lifecycle and route behavior:

- `onInstall`, `onActivate`, and `onDeactivate` require `kv`.
- `onActivate` requires `http.fetch`.
- `onActivate` enforces `cron` capability explicitly and schedules `idempotency-cleanup`.
- `wrapRouteEntry` preserves route metadata (`public`, `input`) while wrapping handlers.
- Route and manifest tests were updated so they validate behavior and contract invariants instead of relying on function identity.

Compliance tests and route tests were adjusted to the new wrapper behavior and all modified suites pass.
Observed local validation:
- `pnpm -C packages/plugins/commerce test src/index.test.ts` passed (`11/11`)
- `pnpm -C packages/plugins/commerce test commerce-guide-compliance.test.ts` passed (`12/12`)
- `pnpm -C packages/plugins/commerce test` passed (`33/33`, `358/358`)
Git status:
- Commit `7afe7ed` was created on top of `main` and pushed.

## 3) Failures, open issues, and lessons learned
No new functional regressions were found after this hardening phase.
One resolved failure pattern was brittle tests asserting raw route handler equality after wrapping, fixed by asserting handler functionality and route metadata (`public`) instead.
One unresolved process gap is one doc file that is not yet part of the pushed commit (`commerce-plugin-authoritative-guide.md`) and should be intentionally handled before release or archiving.
Lessons are explicit:
- Treat compliance contract, tests, and docs as one unit of change.
- Keep wrapped handler assertions metadata/behavior-centric.
- Never bypass declared capability checks in lifecycle logic.

## 4) Files changed, key insights, and gotchas
Primary changed files in this phase:
- `commerce-plugin-factory.ts`
- `packages/plugins/commerce/src/index.ts`
- `packages/plugins/commerce/src/index.test.ts`
- `packages/plugins/commerce/src/commerce-guide-compliance.test.ts`
- `guide-compliance-ci-checklist.md`
- `guide-compliance-diff-patch-plan.md`
- `commerce-plugin-auto-enforcement.md`
- `commerce-plugin-contracts.md`
- `commerce-plugin-developer-execution.md`
- `commerce-plugin-factory.md`
- `commerce-plugin-governance-index.md`
- `commerce-plugin-spec.md`
- `emdash-platform-gap-analysis.md`
- `README.md`

Key insights:
- The factory wrapper changes runtime handler identities; direct equality checks on route handlers are no longer stable.
- Compliance tests should check contract shape and outcomes, not implementation references.
- Do not introduce broad API behavior changes in the same commit as contract migration unless tests are updated in the same PR.

## 5) Key files and directories
Authoritative files for next developer onboarding:
- `HANDOVER.md`
- `commerce-plugin-spec.md`
- `commerce-plugin-contracts.md`
- `commerce-plugin-factory.ts`
- `guide-compliance-ci-checklist.md`
- `guide-compliance-diff-patch-plan.md`
- `packages/plugins/commerce/src/index.ts`
- `packages/plugins/commerce/src/index.test.ts`
- `packages/plugins/commerce/src/commerce-guide-compliance.test.ts`
- `packages/plugins/commerce/package.json`

Main directories:
- `packages/plugins/commerce/src`
- `packages/plugins/commerce/src/handlers`
- `packages/plugins/commerce/src/orchestration`
- `packages/plugins/commerce/src/kernel`
- `packages/plugins/commerce/src/lib`

