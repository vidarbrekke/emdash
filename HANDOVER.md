# HANDOVER

## 1) Purpose and current state
`@emdash-cms/plugin-dashing-commerce` is the EmDash commerce backend plugin for catalog APIs, cart operations, checkout initiation, webhook-backed payment finalization, and scheduled tasks.

Backend hardening is mostly complete and the package currently passes:
- `pnpm --silent lint:json`
- `pnpm --filter @emdash-cms/plugin-dashing-commerce run check`

Latest pushed commits in this phase:
- `59c9af6` Centralized route-key enforcement typing
- `21cda2f` Typed capability wrappers by route key and handler shape
- `c485b5e` Fixed `lint:json` warnings in the compliance generator
- `83cb039` and previous passes include full route-contract/discovery hardening and generated compliance surface checks.

## 2) What is done (high-signal)
- Route registration is now explicit and policy-driven through `packages/plugins/commerce/src/index.ts`.
- Runtime capability enforcement is centralized via:
  - `createCommercePlugin`/`commerce-plugin-factory.ts`
  - `withRouteCapabilities(...)`
  - `withKV(...)` / `withFetch(...)` wrappers
- Manifest + runtime contract constraints are stricter:
  - route contracts include method, capabilities, replay strategy, and fixtures
  - generated route compliance snapshots/tests enforce contract vs surface parity
  - webhook finalization path has receipt-claim/replay logic and side-effect ordering guarded by contract-driven tests.
- Network-policy constraints and base manifest capability requirements are validated in plugin validation.

## 3) Current gaps from external review (highest priority first)

### A) External-review artifact is not self-contained (high)
`HANDOVER.md` and `docs/compliance-source-of-truth.md` reference files not currently present in the generated ZIP:
- `pre-frontend-backend-hardening.md`
- `GOVERNANCE_INDEX.md`
- `emdash-dashingcommerce-repo-governance.md`
- `emdash-compliance-layer.md`
- `emdash-contract-driven-compliance.md`
- `emdash_authoritative_spec.md`
- archived governance documents referenced as “still available for historical context”

Also missing in artifact validation traceability:
- `scripts/generate-commerce-route-compliance-snapshot.mjs` used by `verify:route-compliance-snapshot`
- any package-local reproducibility documentation of script/runtime assumptions

Impact: reviewers cannot reproduce full validation from the archive alone; source-of-truth chain appears broken.

### B) CAS/concurrency semantics are implicit (medium-high)
The checkout lock path currently relies on timestamp fields as version tokens in CAS-like flows.

Impact:
- Behavior is subtle and adapter-sensitive
- Hard to reason across storage implementations
- Durable correctness risk if timestamp semantics differ

Action needed:
- Add explicit monotonic lock/version metadata to documents participating in CAS (`lockVersion`, `lockEpoch`, etc.).
- Use that metadata as the atomic compare/replace discriminator.
- Mirror the same explicitness for webhook receipt claims (document comments + typed shape).

### C) Auth boundary still partly trust-based at package level (medium-high)
`adminRoute(...)` is now backed by a package-level middleware proof in the core suite: non-public plugin routes return `UNAUTHORIZED` before handler execution (`packages/core/tests/unit/plugins/plugin-route-auth.test.ts`).

Impact:
- Boundary posture is now proven at middleware layer via package-level non-public-route regression tests.

Action needed:
- Keep assertions focused on the same core middleware contract and expand only if route surface changes.

### D) Documentation truthfulness drift (medium)
Several handoff/docs claims still describe CI artifacts, historical governance, or compatibility states that are not present in the exported artifact.

Impact:
- Reduces trust in the handoff for external review.

Action needed:
- Update all handoff/docs claims to match exactly what is shipped in the review bundle.

### E) Monorepo dependency leakage into review package (low-medium)
ZIP currently behaves as a partial plugin snapshot and hides some repo-level dependencies, which can make checks appear valid only in monorepo context.

Action needed:
- Decide explicit scope: either bundle the minimum root tooling/doc dependencies needed for reproducibility, or clearly state limitations and required external validation steps.

## 4) Next developer execution plan
1. Make review artifact reproducible with monorepo-local validation context:
   - Include all source-of-truth references referenced from handoff/compliance docs in `scripts/build-commerce-external-review-zip.sh`, or rewrite those references to only include files inside the artifact.
   - Include `scripts/generate-commerce-route-compliance-snapshot.mjs` and the exact commands in the package check path.
   - Confirm zip self-validates with the same claims used in `HANDOVER.md`.
2. Replace implicit CAS tokens:
   - Introduce explicit version fields in checkout lock documents.
   - Update checkout lock and webhook receipt claim flows to use explicit version tokens for CAS.
   - Add regression tests for version-token semantics under concurrent writes.
3. Close auth boundary proof gap:
   - Add minimal integration-level assertions around route-publicness and auth enforcement.
   - Or capture explicit EmDash-level guarantee in contract-level docs + test harness that proves it end-to-end.
4. Tighten handoff truthfulness:
   - Audit `HANDOVER.md`, `COMMERCE_DOCS_INDEX.md`, `COMMERCE_EXTENSION_SURFACE.md`, and `docs/compliance.md` for any claims not directly verifiable from artifact.
   - Keep these files aligned to exact shipped content and verification steps.
5. Regenerate `commerce-plugin-external-review-*.zip` after the above and attach updated checksum/filename to PR notes.

## 5) Key references for continuation
- Authoritative handoff: `HANDOVER.md`
- Scope notes for unresolved backend readiness: `pre-frontend-backend-hardening.md`
- Source-of-truth map: `docs/compliance.md` and `docs/compliance-source-of-truth.md`
- Core route/compliance surface:
  - `packages/plugins/commerce/src/index.ts`
  - `packages/plugins/commerce/src/commerce-plugin-factory.ts`
  - `packages/plugins/commerce/src/contracts/route-contracts.ts`
  - `packages/plugins/commerce/src/contracts/route-compliance.generated.json`
  - `packages/plugins/commerce/src/contracts/route-compliance-generated.test.ts`
  - `packages/plugins/commerce/src/contracts/route-contract-surface.generated.test.ts`
  - `packages/plugins/commerce/src/commerce-guide-compliance.test.ts`
  - `packages/core/tests/unit/plugins/plugin-route-auth.test.ts`
  - `packages/plugins/commerce/src/orchestration/finalize-payment.ts`
  - `packages/plugins/commerce/src/orchestration/finalize-payment-inventory.ts`
  - `packages/plugins/commerce/src/orchestration/finalize-payment.test.ts`
- ZIP builder: `scripts/build-commerce-external-review-zip.sh`

## 6) What the next developer should run first (self-serve handoff checks)

Before touching code, verify you can execute and trust this handoff file in the current branch:

1. Confirm the active branch/checkpoint:
   - `git rev-parse --short HEAD`
   - `git status --short` (must be clean before changing files)
2. Re-run the hard evidence checks from this snapshot:
   - `pnpm --silent lint:json`
   - `pnpm --filter @emdash-cms/plugin-dashing-commerce run check`
3. Rebuild a fresh review bundle:
   - `bash scripts/build-commerce-external-review-zip.sh`
   - `ls -l commerce-plugin-external-review-*.zip`
4. Validate the bundle contains the files the handover references:
   - `unzip -l <zip-path> | rg "HANDOVER.md|docs/compliance-source-of-truth.md|GOVERNANCE_INDEX.md|docs/archive/2026-04-commerce-hardening|scripts/generate-commerce-route-compliance-snapshot.mjs|pre-frontend-backend-hardening.md"`

Do not proceed to implementation work until gaps are narrowed and this output aligns with `HANDOVER.md`.

### Ready-to-implement work items (no ambiguity)
- **Artifact completeness**: either include every file listed in section 3(A) in the ZIP build OR remove/replace references to missing files so the bundle becomes internally complete.
- **CAS/token contract**: in checkout lock flow, replace timestamp-as-version CAS inputs with explicit lock-version metadata and a clearly typed protocol.
- **Auth boundary proof**: add/adjust tests that prove non-public routes are blocked without platform auth context or capture a tested, platform-level assertion in a durable suite.
- **Bundle truthfulness**: keep all docs in `docs/compliance.md`, `COMMERCE_DOCS_INDEX.md`, `COMMERCE_EXTENSION_SURFACE.md`, and `HANDOVER.md` aligned with what is actually shipped in the archive.

### Suggested acceptance criteria for each item
- **Artifact is self-contained**: `rg` scan of archive returns all files referenced by handoff/compliance docs, and `package.json` check path points to scripts present inside the archive.
- **CAS protocol is explicit**: any CAS call in checkout lock/write paths uses a protocol field distinct from `createdAt/updatedAt` in data model and test coverage.
- **Auth assertion exists**: route middleware test suite includes a non-public route rejection assertion in `packages/core/tests/unit/plugins/plugin-route-auth.test.ts` (handler is not invoked when auth is absent).
- **No claim drift**: no handoff or compliance document points to non-archived/unbundled files.

## 7) Exact implementation map for next developer (copy/paste starting points)

### A) Make artifact self-contained

1. `scripts/build-commerce-external-review-zip.sh`
   - Add `HISTORY/SOURCE` docs and script paths used by package checks:
     - Root governance/spec files (see list in section 3(A)).
     - `scripts/generate-commerce-route-compliance-snapshot.mjs`
     - `packages/plugins/commerce/package.json` (for reproducible check path visibility).
   - Keep `docs/archive/2026-04-commerce-hardening/*.md` included while excluding stale archive duplicates.
   - After edits, run the zip verify command in section 6.

2. `packages/plugins/commerce/package.json`
   - Confirm these lines are preserved in shipped `package.json`:
     - `verify:route-compliance-snapshot`
     - `generate:route-compliance-snapshot`
   - If this ZIP drops the root `scripts/` tree, either:
     - bundle it (preferred), or
     - move these scripts into package-local scripts and update paths.

3. `docs/compliance.md` + `docs/compliance-source-of-truth.md`
   - Remove/replace references to files missing from zip if you choose not to include them.
   - Ensure every “authoritative” file chain points to a file guaranteed in artifact.

### B) Tighten CAS/version protocol (checkout lock + webhook)

1. `packages/plugins/commerce/src/handlers/checkout.ts`
   - Locate lock acquisition/release helpers (search: `compareAndSwap(`, `checkout-lock:`, `createdAt: now`, `updatedAt`).
   - Replace implicit versioning with explicit field (e.g. `lockVersion`/`lockEpoch`) on lock rows.
   - Ensure lock rows include:
     - lock id
     - lock version
     - lock expiry/owner metadata
     - fingerprint (as existing request-scoped lock key)

2. `packages/plugins/commerce/src/handlers/checkout.test.ts`
   - Add regression tests around concurrent lock claim/release using the explicit version field.
   - Confirm stale/forged lock rows are rejected by version mismatch.

3. `packages/plugins/commerce/src/orchestration/finalize-payment.ts` (already explicit in webhook flow)
   - Keep explicit claim fields (`claimVersion`, `claimExpiresAt`) and make parity with checkout lock design explicit in comments.

### C) Prove auth boundary (package-level)

1. `packages/plugins/commerce/src/index.ts`
   - Confirm route publicness intent via `publicRoute(...)` / `adminRoute(...)` remains the only registration surface.
   - Add comments clarifying trust boundary (if still relying on platform auth guard).

2. `packages/plugins/commerce/src/commerce-guide-compliance.test.ts`
   - Add/extend route boundary tests to assert:
     - public routes are exposed as expected
     - non-public/admin routes fail when auth context is intentionally absent
   - If hard in unit scope, add a dedicated package integration test that documents the platform guarantee.

### D) Remove documentation drift

1. `COMMERCE_DOCS_INDEX.md`
2. `COMMERCE_EXTENSION_SURFACE.md`
3. `docs/compliance.md`
4. `HANDOVER.md`
   - Normalize all “completed” status and checklist claims to exactly what shipped artifacts and checks currently prove.
   - Ensure “historical” references are explicitly labeled as “out of archive scope” unless included in the zip.

### E) Useful grep anchors before first code edit

Run once and keep output for handoff notes:
- `rg -n "withKV\\(|withFetch\\(|withRouteCapabilities\\(" packages/plugins/commerce/src`
- `rg -n "verify:route-compliance-snapshot|generate:route-compliance-snapshot" packages/plugins/commerce/package.json scripts/build-commerce-external-review-zip.sh`
- `rg -n "compareAndSwap\\(|createdAt: now|updatedAt: now|lockId|checkout-lock" packages/plugins/commerce/src/handlers/checkout.ts packages/plugins/commerce/src/handlers/checkout.test.ts`
- `rg -n "adminRoute\\(|publicRoute\\(|requirePost\\(" packages/plugins/commerce/src/index.ts`

