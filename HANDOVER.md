# HANDOVER

## 1) Big-picture purpose and current problem
`@emdash-cms/plugin-dashing-commerce` remains the EmDash commerce plugin: checkout, order creation, payment-attempt persistence, and webhook-backed finalize are in-scope, with catalog routes and extension seams kept stable.

The active problem is two-sided: production-hardening for money-path concurrency is complete in priority areas, but plugin manifest/runtime compliance against `emdash_guide.md` is still out of alignment.

The immediate next work is to finish the EmDash guide gap remediation without changing checkout/webhook business behavior.

## 2) Completed work and outcomes
Money-path hardening work is complete for this phase: claim ownership checks and state transitions in finalization are CAS-guarded, stale claim handling is enforced in finalize checkpoints, and lock-release logic is ownership-aware.

Checkout and webhook paths now have explicit failure behavior when required atomic primitives are missing, and finalization replay safety is covered by dedicated tests.

Documentation was also hardened for handoff: source and archive docs were consolidated and an external-review packaging script plus process notes were added.

Validation completed in this branch includes `pnpm --filter @emdash-cms/plugin-dashing-commerce test`, `pnpm --filter @emdash-cms/plugin-dashing-commerce check`, and all targeted money-path regression suites executed during the hardening cycle.

## 3) Failures, open issues, and lessons learned
Known non-compliance gaps against the guide remain: `packages/plugins/commerce/src/index.ts` still uses `definePlugin` from `"emdash"`, still uses `allowedHosts` with wildcard Stripe patterns, and still uses undocumented manifest/lifecycle patterns (`"plugin:activate"` + `hooks.cron`) instead of guide-shape lifecycle handlers.

`packages/plugins/commerce/package.json` still uses `"workspace:*"` for `emdash` peer and dev dependencies in this repo branch, while the compliance plan expects pinned external-facing semver.

`commerce-guide-compliance.test.ts` exists and encodes the guardrails, but it is not yet part of `check` in this branch’s plugin scripts.

Lessons are concrete: do not merge manifest or lifecycle changes without updating tests and checklist together, and keep guide compliance decisions one-directional (guide first, then implementation changes).

## 4) Files changed, key insights, and gotchas
Key files from the prior hardening pass:
`packages/plugins/commerce/src/handlers/checkout.ts`
`packages/plugins/commerce/src/orchestration/finalize-payment.ts`
`packages/plugins/commerce/src/orchestration/finalize-payment.test.ts`
`packages/plugins/commerce/src/orchestration/finalize-receipt-reason-literals.test.ts`
`packages/plugins/commerce/package.json`
`packages/plugins/commerce/COMMERCE_DOCS_INDEX.md`
`scripts/build-commerce-external-review-zip.sh`

Key gotchas:
- Do not replace ownership-checked lock release/deletion with blind delete-by-id release logic.
- Do not weaken `claim`/`receipt` transition checks in `finalizePaymentFromWebhook`.
- Do not change money-path state-machine behavior while reconciling guide compliance, unless tests are updated at the same commit.
- `guide-compliance` assets currently point to an expected stricter manifest shape; keep the next patch strictly scoped and test-led.

## 5) Key files and directories

This document is the authoritative handoff reference for this branch.
Treat other compliance markdown files as historical notes; operational decisions and
next steps for a new developer must follow this file.

- `HANDOVER.md`
- `docs/compliance.md`
- `emdash_guide.md`
- `guide-compliance-diff-patch-plan.md`
- `guide-compliance-ci-checklist.md`
- `commerce-guide-compliance.test.ts`
- `DAY_1_CHECKLIST.md`
- `ADMIN_CONSUMER_UI_SMOKE_READINESS.md`
- `packages/plugins/commerce/COMMERCE_DOCS_INDEX.md`
- `packages/plugins/commerce/COMMERCE_EXTENSION_SURFACE.md`
- `commerce-plugin-architecture.md`
- `docs/archive/2026-04-commerce-hardening/dashing-commerce-diff-style-patch-plan.md`
- `docs/archive/2026-04-commerce-hardening/dashing-commerce-execution-plan.md`
- `docs/archive/2026-04-commerce-hardening/dashing-commerce-execution-plan-update.md`
- `docs/archive/2026-04-commerce-hardening/dashing-commerce-diff-patch-update.md`
- `packages/plugins/commerce/src`
- `packages/plugins/commerce/src/handlers`
- `packages/plugins/commerce/src/orchestration`
- `packages/plugins/commerce/src/lib`

## 6) Single-plan execution for next developer

1. Fix `packages/plugins/commerce/src/index.ts` to align with `emdash_guide.md`.
   - import path must remain guide-authoritative
   - capabilities: at least `network:fetch`, `storage:kv`, `cron:schedule`, `admin:ui`
   - remove `allowedHosts`, add `network.allowedHostnames`
   - use guide lifecycle shape instead of undocumented hook bucket patterns
2. Update `packages/plugins/commerce/package.json` with guide-compliance test script(s),
   align `check`, and decide whether pinned `emdash` dependency ranges are required for
   external publication in this branch.
3. Ensure `commerce-guide-compliance.test.ts` is executable in the package context
   and wired to plugin-local paths.
4. Run and pass:
   - `pnpm --filter @emdash-cms/plugin-dashing-commerce test`
   - `pnpm --filter @emdash-cms/plugin-dashing-commerce check`
   - `pnpm --filter @emdash-cms/plugin-dashing-commerce test src/orchestration/finalize-payment.test.ts`
5. If the guide itself is outdated for runtime shape, update `emdash_guide.md` first and
   then update compliance tests/checklists in lockstep.

