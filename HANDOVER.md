# HANDOVER

## 1) Single-source execution brief
This is the only document needed to continue. Treat it as authoritative for scope, sequence, files, and acceptance criteria.

- Scope: marketplace hardening for extension lifecycle and runtime trust checks in the EmDash core.
- Rule: frontend is thin and passive; core + handler behavior is the source of truth for installation and activation decisions.
- Rule: only this repository’s marketplace trust path is in-scope; no new UI, no new capabilities, no marketplace feature expansion.

## 2) Current problem statement
The active lane is to close remaining security and correctness gaps in marketplace install/update hardening without changing business behavior.

- Ensure plugin/version compatibility is checked consistently before install/update state transitions.
- Ensure bundle extraction is bounded and deterministic.
- Make install/update state transitions rollback-safe.
- Make installation identity stable across process restarts.
- Reject unsupported downgrades and ambiguous plugin identity collisions.
- Expand coverage for failure modes and preserve old state on failures.

## 3) Completed work (already merged)
- Implemented `permissions → pricing → confirm` API flow in `packages/core`.
  - New routes:
    - `POST /_emdash/api/admin/plugins/marketplace/[id]/pricing`
    - `POST /_emdash/api/admin/plugins/marketplace/[id]/confirm`
  - Confirm flow stores install intent in `OptionsRepository` and enforces single-use install tokens.
- Added runtime-level identity enforcement.
  - Shared manifest identity helper (`id`/`version`) is used by install/update handlers and runtime load/sync.
  - Invalid marketplace plugin bundles are deactivated during runtime sync/load.
- Added activation validation hook support.
  - `PluginManager` accepts `validateOnActivate`, and plugin activation now passes through this gate.
- Added regression coverage:
  - `packages/core/tests/unit/api/marketplace-handlers.test.ts`
  - `packages/core/tests/unit/plugins/manager.test.ts`
  - `packages/core/tests/unit/emdash-runtime-marketplace.test.ts`

## 4) Open issues and lessons learned
- Known open work is the execution plan below; no known blockers beyond the listed hardening tasks.
- Prior fixes during implementation were integration and state-handling issues:
  - parser selection in confirm flow
  - duplicated manifest checks before centralization
  - import path normalization after helper move
  - marketplace fixture/mock ordering
- Key lesson to retain: keep error paths deterministic, especially around multi-step install/update persistence.

## 5) Exact file locator map

### Primary implementation files
- `packages/core/src/api/handlers/marketplace.ts`
- `packages/core/src/api/handlers/index.ts`
- `packages/core/src/astro/routes/api/admin/plugins/marketplace/[id]/pricing.ts`
- `packages/core/src/astro/routes/api/admin/plugins/marketplace/[id]/confirm.ts`
- `packages/core/src/emdash-runtime.ts`
- `packages/core/src/plugins/manager.ts`
- `packages/core/src/plugins/marketplace.ts`
- `packages/core/src/plugins/state.ts`

### Tests and state files
- `packages/core/tests/unit/api/marketplace-handlers.test.ts`
- `packages/core/tests/unit/plugins/marketplace-client.test.ts`
- `packages/core/tests/unit/plugins/marketplace-state.test.ts`
- `packages/core/tests/unit/plugins/manager.test.ts`
- `packages/core/tests/unit/emdash-runtime-marketplace.test.ts`
- `packages/core/tests/integration/plugins/capabilities.test.ts` (optional, only if integration scope is needed)

### Required migration and infrastructure files
- `packages/core/src/database/repositories/options.ts` (or current options persistence path used by core)
- `packages/core/src/database/migrations/` (add migration only if installation ID persistence requires schema change)
- `package.json` script block (`test:unit`, workspace filters)

### Documentation references kept for this transfer
- `dc_full_platform_handoff/*`
- `docs/compliance.md`
- `docs/compliance-source-of-truth.md`
- `docs/README.md`
- `packages/plugins/commerce/COMMERCE_DOCS_INDEX.md`

## 6) Strict execution plan (do not reorder)
Work in this order unless a dependency requires temporary deviation:

1. Enforce marketplace compatibility (`minEmDashVersion`).
2. Bound bundle extraction and file-surface allowlist.
3. Add rollback safety to install/update persistence.
4. Introduce stable installation identity.
5. Enforce explicit downgrade policy with deterministic code.
6. Centralize plugin identity collision checks.
7. Expand lifecycle test matrix for failure and state invariants.
8. Remove stale workspace script/package references.
9. Reconfirm doc hierarchy from this file as source-of-truth.

### Step details

#### Step 1 — Compatibility enforcement
- Files: `packages/core/src/api/handlers/marketplace.ts`, `packages/core/src/plugins/marketplace.ts`, `packages/core/tests/unit/api/marketplace-handlers.test.ts`, `packages/core/tests/unit/plugins/marketplace-client.test.ts`.
- Do:
  - Add one helper for runtime version comparison.
  - Reject install/update when required minimum EmDash version is not met.
  - Use the same path for install and update.

#### Step 2 — Bundle extraction hardening
- Files: `packages/core/src/plugins/marketplace.ts`, `packages/core/tests/unit/plugins/marketplace-client.test.ts`.
- Do:
  - Add compressed size and decompressed size bounds.
  - Enforce exact allowed files: `manifest.json`, `backend.js`, optional `admin.js`.
  - Reject path traversal and duplicate or extra files.

#### Step 3 — Rollback-safe install/update
- Files: `packages/core/src/api/handlers/marketplace.ts`, `packages/core/tests/unit/api/marketplace-handlers.test.ts`, `packages/core/tests/unit/plugins/marketplace-state.test.ts`.
- Do:
  - On storage write failures after commit points, perform deterministic cleanup.
  - Never delete old bundle until new state is committed.
  - Ensure failed update preserves previous active version.

#### Step 4 — Stable installation identity
- Files: `packages/core/src/plugins/marketplace.ts`, `packages/core/tests/unit/plugins/marketplace-client.test.ts`, plus install expectations in `packages/core/tests/unit/api/marketplace-handlers.test.ts` as needed.
- Do:
  - Replace any transient timestamp-based identifier usage with a persistent installation identifier.
  - Persist once, reuse always.

#### Step 5 — Downgrade policy
- Files: `packages/core/src/api/handlers/marketplace.ts`, `packages/core/tests/unit/api/marketplace-handlers.test.ts`.
- Do:
  - Reject install/update to older versions explicitly.
  - Use a dedicated error code (for example `DOWNGRADE_NOT_ALLOWED`).

#### Step 6 — Identity collision policy
- Files: `packages/core/src/api/handlers/marketplace.ts`, `packages/core/src/plugins/state.ts`, `packages/core/tests/unit/api/marketplace-handlers.test.ts`, `packages/core/tests/unit/plugins/manager.test.ts`.
- Do:
  - Centralize collision rules across configured plugins and marketplace state.
  - Make conflict errors deterministic.

#### Step 7 — Test matrix expansion
- Files: `packages/core/tests/unit/api/marketplace-handlers.test.ts`, `packages/core/tests/unit/plugins/marketplace-client.test.ts`, `packages/core/tests/unit/plugins/marketplace-state.test.ts`, optional integration files.
- Do:
  - Add deterministic tests for install/update success and failure paths, including cleanup, identity mismatch, checksum path, and runtime state behavior.

#### Step 8 — Stale script cleanup
- Files: `package.json`.
- Do:
  - Replace or remove stale workspace package filters in `test:unit` and adjacent scripts.

#### Step 9 — Source-of-truth consolidation
- Files: `docs/compliance.md`, `docs/compliance-source-of-truth.md`, `docs/README.md`, `HANDOVER.md`.
- Do:
  - Keep this document current as the only required execution brief.

## 7) Required acceptance criteria (all must pass before handoff)
- incompatible marketplace versions are rejected on install/update
- bundle extraction enforces max sizes and strict file allowlist
- failed install/update cleanup leaves no invalid active state
- stable installation identity is reused across runs
- downgrade is explicitly rejected with stable error code
- plugin ID collisions are rejected consistently across configured and marketplace sources
- runtime activation never loads a plugin with invalid identity
- script filters only target real workspace packages
- tests prove both success and failure paths for each step above

## 8) Developer execution checklist
- `pnpm --silent lint:quick`
- `pnpm test -- --runInBand`
- `pnpm typecheck`
- Then run targeted files in order:
  - `pnpm test packages/core/tests/unit/plugins/marketplace-client.test.ts`
  - `pnpm test packages/core/tests/unit/api/marketplace-handlers.test.ts`
  - `pnpm test packages/core/tests/unit/emdash-runtime-marketplace.test.ts`
  - `pnpm test packages/core/tests/unit/plugins/manager.test.ts`

## 9) Notes and gotchas
- Do not re-add inline manifest `id`/`version` checks outside the shared helper.
- Confirm/token flow must remain single-use and idempotent on replay.
- Keep manifest/runtime validations deterministic and do not weaken them to satisfy tests.
- Any new bundle format acceptance must include explicit tests and no snapshot-only assertions.

## 10) Current status markers
- Branch: `UI-1`
- Last handoff commit includes docs alignment and this strict checklist.
- If work is paused, resume from step 1 without changing scope.
