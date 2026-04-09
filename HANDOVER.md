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
`adminRoute(...)` currently enforces route registration + method, but does not itself assert package-local authorization semantics; it assumes platform runtime guarantees for non-public route protection.

Impact:
- Boundary posture is not fully proven inside this package alone.

Action needed:
- Add package-local checks/integration tests proving non-public routes are inaccessible without auth context, or
- Document and validate the exact EmDash guarantee with a dedicated suite in this package’s verification path.

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
1. Make review artifact reproducible:
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
  - `packages/plugins/commerce/src/orchestration/finalize-payment.ts`
  - `packages/plugins/commerce/src/orchestration/finalize-payment-inventory.ts`
  - `packages/plugins/commerce/src/orchestration/finalize-payment.test.ts`
- ZIP builder: `scripts/build-commerce-external-review-zip.sh`

