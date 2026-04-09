# HANDOVER

## 1) Purpose and current problem statement
This repository currently drives the EmDash commerce plugin and platform integration layer. The active work is on marketplace extension lifecycle hardening: implementing and stabilizing a secure installation path (`permissions → pricing → confirm`), validating manifest compatibility at runtime and activation boundaries, and preventing trust-boundary drift between install handlers and runtime loading.

The current contract is explicit: frontend is presentational only, backend handlers are authoritative, and no marketplace plugin may become active unless validation, licensing assumptions, and identity checks pass consistently across install, update, and runtime refresh paths.

## 2) Completed work and outcomes
The marketplace platform pass is now implemented through `packages/core` and backed by focused regression tests. `handleMarketplacePricing` and `handleMarketplaceInstallConfirm` are in place with temporary state stored in `OptionsRepository`, short-lived one-time `installToken` handling, and confirm-path enforcement. The API surface now includes `POST /_emdash/api/admin/plugins/marketplace/[id]/pricing` and `POST /_emdash/api/admin/plugins/marketplace/[id]/confirm`.

Activation hardening is now centralized: `PluginManager` supports a `validateOnActivate` callback, runtime startup/load and refresh paths validate bundle identity through shared logic, and `marketplace` plugin state is deactivated when bundle identity checks fail. A shared helper now handles manifest identity checks (`id`/`version`) to prevent divergent logic in handler and runtime code paths.

Targeted tests were added/updated to lock these outcomes: marketplace pricing + confirm flow (including token replay/invalidation), `validateOnActivate` behavior, and runtime validation for missing/malformed/mismatched marketplace bundles.

## 3) Failures, open issues, and lessons learned
Recent hard failures observed during implementation were mostly integration-test related and were resolved before merge: incorrect body parser choice in confirm flow, inline manifest validation duplication, wrong import path after moving shared validation, and mocked marketplace response ordering/fixture shape mismatches. The resulting fixes are now stable in the current branch.

Current open issues are known and scoped by `project-review-next-steps-strict.md`: version compatibility enforcement, bounded bundle extraction, rollback-safe install/update persistence, stable persisted installation identity, explicit downgrade policy, identity collision hardening, stronger authenticity checks, stale script cleanup, and source-of-truth docs consolidation.

Known residual risk for confidence: full repo-wide `pnpm typecheck` and lint history have reported unrelated or pre-existing issues outside this marketplace lane; rerun with current local baseline before claiming global green before broader merge activity.

## 4) Files changed, key insights, and gotchas
Core continuity files are:
`packages/core/src/api/handlers/marketplace.ts`, `packages/core/src/astro/routes/api/admin/plugins/marketplace/[id]/pricing.ts`, `packages/core/src/astro/routes/api/admin/plugins/marketplace/[id]/confirm.ts`, `packages/core/src/api/handlers/index.ts`, `packages/core/src/emdash-runtime.ts`, `packages/core/src/plugins/manager.ts`, and `packages/core/src/plugins/marketplace.ts`.

Test and spec closure currently relies on:
`packages/core/tests/unit/api/marketplace-handlers.test.ts`, `packages/core/tests/unit/plugins/manager.test.ts`, and `packages/core/tests/unit/emdash-runtime-marketplace.test.ts`.

Key gotchas:
- Do not reintroduce inline manifest `id`/`version` checks in handler or runtime files; route through the shared identity helper.
- Keep confirm flow idempotent by consuming install tokens once and clearing stored state immediately on success/failure.
- Keep install/update telemetry/reporting after successful state commitment only.
- Preserve `lockVersion` and version/phase contracts in commerce fixtures if touched during follow-up work.
- Any new bundle surface changes must be mirrored by deterministic tests, not snapshot-heavy assertions.

Documentation and governance files used during transfer are also in scope for continuity: `dc_full_platform_handoff/*`, `docs/compliance.md`, `docs/compliance-source-of-truth.md`.

## 5) Key files, directories, and next-step plan
New developer entry points: `HANDOVER.md`, `project-review-next-steps-strict.md`, and `dc_full_platform_handoff/00_START_HERE.md` for architectural context.

Execution scope is hardening-only and must follow this strict order without reordering unless dependency blocks force it:
1) compatibility enforcement, 2) bounded bundle extraction, 3) rollback-safe install/update, 4) stable installation identity, 5) explicit downgrade policy, 6) plugin identity collision policy, 7) expanded verification/tests, 8) stale script cleanup, 9) docs consolidation.

For each item above, implement tests before release and keep behavior deterministic. Prioritized acceptance targets are: incompatible marketplace versions rejected, bounded extraction enforced, old plugin state preserved on failed updates, old/new version policy made explicit (`DOWNGRADE_NOT_ALLOWED` default), collision errors deterministic, and stale workspace scripts removed.

Useful first commands before code:
- `git rev-parse --short HEAD`
- `git status --short`
- `pnpm --silent lint:quick`
- `pnpm typecheck`
- `pnpm test -- --runInBand`
- `bash scripts/build-commerce-external-review-zip.sh`
