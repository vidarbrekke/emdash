# project-review-next-steps-strict.md

## Purpose

This is the stricter execution handoff.  
It maps the next hardening work directly to repo files, expected edits, and acceptance criteria.

This is **not** a brainstorming memo. It is an implementation checklist.

---

## Scope Lock

Do **not** expand product scope while doing this work.

Allowed:
- marketplace install/update hardening
- bundle verification hardening
- lifecycle rollback safety
- plugin identity collision enforcement
- stale script cleanup
- docs consolidation for source-of-truth clarity
- targeted tests that prove the above

Not allowed:
- new UI surface area
- new plugin capabilities
- new marketplace business features
- broad refactors unrelated to hardening

---

## Execution Order

Work in this order:

1. compatibility enforcement
2. bounded bundle extraction
3. rollback-safe install/update flow
4. stable installation identity
5. explicit downgrade policy
6. stronger identity collision policy
7. test matrix expansion
8. stale script cleanup
9. doc consolidation

Do not reorder unless a dependency forces it.

---

## 1) Enforce Marketplace Compatibility

### Files to edit
- `packages/core/src/api/handlers/marketplace.ts`
- `packages/core/src/plugins/marketplace.ts`
- `packages/core/tests/unit/api/marketplace-handlers.test.ts`
- `packages/core/tests/unit/plugins/marketplace-client.test.ts`

### Why
`minEmDashVersion` is present in marketplace metadata, but the install/update flow is not clearly enforcing it before activation.

### Required implementation
- Add a single compatibility helper that evaluates current EmDash runtime version against marketplace `minEmDashVersion`.
- Fail closed when current runtime version is below required minimum.
- Use the same logic in both install and update paths.
- Support prerelease-safe comparison or explicitly reject unsupported prerelease comparison inputs.

### Repo mapping
#### `packages/core/src/api/handlers/marketplace.ts`
- Add compatibility validation immediately after version metadata is resolved and before bundle download/storage.
- Apply this in:
  - install flow
  - update flow

#### `packages/core/src/plugins/marketplace.ts`
- If no semver comparison utility exists yet in core, add a small, deterministic helper here or extract to a nearby focused utility file.
- Keep it minimal. No large dependency unless already standard in repo.

### Acceptance criteria
- Install rejects incompatible plugin versions.
- Update rejects incompatible target versions.
- Error payload is deterministic and developer-readable.
- Same compatibility logic is used for install and update.

### Tests required
#### `packages/core/tests/unit/api/marketplace-handlers.test.ts`
Add tests for:
- incompatible install rejected
- incompatible update rejected
- compatible install allowed
- compatible update allowed

#### `packages/core/tests/unit/plugins/marketplace-client.test.ts`
Add tests for:
- normal semver comparisons
- prerelease handling decision
- null `minEmDashVersion` treated as allowed

---

## 2) Bound Bundle Extraction and File Surface

### Files to edit
- `packages/core/src/plugins/marketplace.ts`
- `packages/core/tests/unit/plugins/marketplace-client.test.ts`

### Why
Bundle extraction currently decompresses fully into memory and accepts files by name lookup without strong file-surface enforcement.

### Required implementation
- Add max compressed size limit.
- Add max decompressed size limit.
- Allow only:
  - `manifest.json`
  - `backend.js`
  - optional `admin.js`
- Reject any unexpected file.
- Reject duplicate relevant files.
- Reject path traversal-like names.
- Keep extraction behavior deterministic.

### Repo mapping
#### `packages/core/src/plugins/marketplace.ts`
In `extractBundle(...)`:
- check compressed tarball byte length before decompression
- check decompressed byte length before tar parsing continues or immediately after decode if streaming limits are not feasible yet
- normalize entry names
- reject:
  - `../`
  - absolute paths
  - nested paths
  - extra files beyond allowlist
- keep manifest validation as-is or tighten slightly, but do not broaden bundle format

Suggested constants to add in this file:
- `MAX_BUNDLE_COMPRESSED_BYTES`
- `MAX_BUNDLE_DECOMPRESSED_BYTES`
- `ALLOWED_BUNDLE_FILES`

### Acceptance criteria
- oversize bundle is rejected
- oversize decompressed payload is rejected
- extra file causes rejection
- missing required files still fail
- only exact supported file set is installable

### Tests required
#### `packages/core/tests/unit/plugins/marketplace-client.test.ts`
Add tests for:
- valid bundle with `manifest.json` + `backend.js`
- valid bundle with optional `admin.js`
- missing manifest rejected
- missing backend rejected
- extra file rejected
- `./manifest.json` normalized and allowed only if it resolves to supported name
- `../manifest.json` rejected
- compressed size overflow rejected
- decompressed size overflow rejected

---

## 3) Make Install and Update Rollback-Safe

### Files to edit
- `packages/core/src/api/handlers/marketplace.ts`
- `packages/core/tests/unit/api/marketplace-handlers.test.ts`
- `packages/core/tests/unit/plugins/marketplace-state.test.ts`

### Why
The current flow stores bundle files and then writes plugin state. If the second half fails, storage can be left behind. Update has the same class of risk.

### Required implementation
- Add compensating cleanup for install failure after storage write.
- Add compensating cleanup for update failure after new bundle write.
- Do not delete old bundle until new state is committed successfully.
- Keep cleanup best-effort, but make initial failure path deterministic.

### Repo mapping
#### `packages/core/src/api/handlers/marketplace.ts`
For install flow:
- after `storeBundleInR2(...)`, wrap state persistence in try/catch
- if state persistence fails:
  - delete newly stored bundle prefix
  - return failure
- only report install telemetry after install is fully committed

For update flow:
- store new bundle
- persist updated state
- only after successful state commit:
  - best-effort delete old bundle
- if update state write fails:
  - best-effort delete newly stored bundle
  - keep old version intact

Also tighten any helper around:
- `storeBundleInR2(...)`
- `deleteBundleFromR2(...)`
- `loadBundleFromR2(...)`

### Acceptance criteria
- failed install does not leave new marketplace bundle files behind
- failed update does not leave partially switched state
- old version remains active if update commit fails
- telemetry is emitted only after successful install

### Tests required
#### `packages/core/tests/unit/api/marketplace-handlers.test.ts`
Add tests for:
- install failure after bundle storage triggers cleanup
- update failure after new bundle storage deletes new bundle and preserves old version
- update success deletes old bundle best-effort after commit
- telemetry not sent on failed install

#### `packages/core/tests/unit/plugins/marketplace-state.test.ts`
Add focused tests for:
- state remains old version on failed update path
- delete/cleanup expectations are explicit

---

## 4) Replace Timestamp-Based Site Hash with Stable Installation ID

### Files to edit
- `packages/core/src/plugins/marketplace.ts`
- `packages/core/src/database/migrations/022_marketplace_plugin_state.ts` or a new migration if needed
- `packages/core/src/database/repositories/options.js` or the actual options repository path already used in this repo
- `packages/core/tests/unit/plugins/marketplace-client.test.ts`
- `packages/core/tests/unit/api/marketplace-handlers.test.ts` if install flow expectations need update

### Why
`generateSiteHash()` currently uses `Date.now()`. That is not a stable installation identifier.

### Required implementation
- Replace timestamp-based generation with a persistent installation ID.
- Generate once.
- Store locally.
- Reuse forever.
- Keep it opaque and non-identifying.

### Repo mapping
#### `packages/core/src/plugins/marketplace.ts`
- remove current `generateSiteHash()` behavior
- replace with helper that loads existing installation ID from persisted settings/options, or creates one on first use

#### options repository / settings layer
- use existing options/settings persistence instead of inventing a new storage system
- add a dedicated option key, e.g.:
  - `marketplace.installationId`

### Acceptance criteria
- repeated `reportInstall(...)` calls reuse same installation ID
- no timestamp-derived IDs remain
- no random fallback that changes on each process start unless persistence is unavailable and behavior is explicitly documented

### Tests required
#### `packages/core/tests/unit/plugins/marketplace-client.test.ts`
Add tests for:
- first call creates and stores installation ID
- second call reuses same ID
- report payload uses stored ID, not current time

---

## 5) Define and Enforce Downgrade Policy

### Files to edit
- `packages/core/src/api/handlers/marketplace.ts`
- `packages/core/tests/unit/api/marketplace-handlers.test.ts`

### Why
The update flow blocks only same-version updates. It does not clearly block downgrades.

### Default policy to implement
- Downgrades are **not allowed** by default.

If you choose to support downgrades later, make them a separate explicit flow. Do not blur update and downgrade behavior.

### Required implementation
- compare `newVersion` vs `oldVersion`
- reject when target version is lower than installed version
- use a dedicated error code, e.g. `DOWNGRADE_NOT_ALLOWED`

### Acceptance criteria
- update to older version is rejected
- same version still returns already-up-to-date
- upgrade path remains unchanged

### Tests required
#### `packages/core/tests/unit/api/marketplace-handlers.test.ts`
Add tests for:
- downgrade rejected
- same version rejected as already up to date
- higher version allowed

---

## 6) Tighten Plugin Identity Collision Rules

### Files to edit
- `packages/core/src/api/handlers/marketplace.ts`
- `packages/core/src/plugins/state.ts`
- `packages/core/tests/unit/api/marketplace-handlers.test.ts`
- `packages/core/tests/unit/plugins/manager.test.ts`

### Why
Current checks explicitly block collision with configured plugin IDs. That is good, but identity rules should be centralized and global.

### Required implementation
- enforce one plugin ID namespace across:
  - configured plugins
  - marketplace-installed plugins
  - any other plugin source represented in state/runtime
- centralize collision logic in one helper instead of ad hoc route-local checks

### Repo mapping
#### `packages/core/src/api/handlers/marketplace.ts`
- replace inline conflict logic with centralized helper

#### `packages/core/src/plugins/state.ts`
- if needed, add lookup helpers that make collision checks simple and unambiguous

### Acceptance criteria
- cannot install marketplace plugin that collides with configured plugin
- cannot activate ambiguous duplicate identity from any supported source
- collision errors are consistent

### Tests required
#### `packages/core/tests/unit/api/marketplace-handlers.test.ts`
Add tests for:
- configured plugin conflict
- marketplace state conflict
- duplicate identity conflict returns stable error code

#### `packages/core/tests/unit/plugins/manager.test.ts`
Add tests proving runtime behavior cannot load ambiguous duplicate IDs

---

## 7) Strengthen Integrity Verification Beyond Same-Source Checksum

### Files to edit
- `packages/core/src/plugins/marketplace.ts`
- `packages/core/src/api/handlers/marketplace.ts`
- `packages/core/tests/unit/plugins/marketplace-client.test.ts`
- `packages/core/tests/unit/api/marketplace-handlers.test.ts`

### Why
Current checksum validation protects against corruption, but not against compromise of the same trust source supplying both bundle and checksum.

### Immediate minimum
If full signing is too large for this pass, do this now:
- create a clear extension point for signature verification
- fail closed when signature verification is enabled and verification fails
- do not ship fake security language without enforcement

### Preferred implementation
- signed manifest or signed bundle metadata
- public key verification in core
- deterministic signature failure handling

### Acceptance criteria
- code path exists for authenticity verification
- no misleading comments imply stronger guarantees than currently implemented
- tests cover signature failure if implemented in this pass

### Note
If this is not completed in this round, leave a clearly named TODO gate and do **not** claim the trust model is complete.

---

## 8) Expand Marketplace Lifecycle Test Matrix

### Files to edit
- `packages/core/tests/unit/api/marketplace-handlers.test.ts`
- `packages/core/tests/unit/plugins/marketplace-client.test.ts`
- `packages/core/tests/unit/plugins/marketplace-state.test.ts`
- `packages/core/tests/integration/plugins/capabilities.test.ts` if integration coverage is appropriate
- `packages/core/tests/unit/plugins/routes.test.ts` if public route visibility escalation belongs there

### Required coverage
Add or verify deterministic tests for:

#### install
- compatible install succeeds
- incompatible install rejected
- audit fail rejected
- checksum mismatch rejected
- bundle identity mismatch rejected
- extra file rejected
- cleanup on persistence failure

#### update
- normal upgrade succeeds
- same version rejected
- downgrade rejected
- capability escalation requires explicit confirmation
- new public routes require explicit confirmation
- update cleanup on post-storage failure

#### runtime/state
- installed marketplace plugin state is correct
- failed update preserves old active version
- duplicate plugin ID cannot be loaded ambiguously

### Acceptance criteria
- this hardening work lands with proof, not only code
- tests are focused and deterministic
- no snapshot-heavy or fragile assertions

---

## 9) Fix Stale Workspace Script References

### Files to edit
- `package.json`

### Why
Root scripts reference `@emdash-cms/marketplace`, which does not appear to exist in the current workspace.

### Required implementation
- remove or replace stale filter target in `test:unit`
- audit other script filters for missing workspace packages

### Repo mapping
#### `package.json`
Current suspect script:
- `test:unit`

### Acceptance criteria
- every script filter targets a real workspace package
- root scripts reflect actual repo structure
- no stale package names remain from earlier repo layouts

### Optional validation
If you already have a scripts folder for repo checks, add a small script later that validates workspace filter names.

---

## 10) Consolidate Source-of-Truth Docs

### Files to edit
- `docs/README.md`
- `docs/compliance-source-of-truth.md`
- `docs/archive/...` as needed
- root governance docs only if you decide to demote or archive them

### Why
Doc sprawl is becoming operational debt. There are many good docs, but they need a hierarchy.

### Required implementation
Declare exactly:
- platform source of truth
- commerce source of truth
- archived historical material

### Repo mapping
#### `docs/compliance-source-of-truth.md`
- convert from generic statement into explicit hierarchy:
  - primary
  - secondary
  - archival
  - non-authoritative handoff docs

#### `docs/README.md`
- add “read this first” order for new developers

### Acceptance criteria
- a new developer can tell in under 2 minutes which docs govern decisions
- archived docs are visibly non-authoritative
- no parallel authoritative claims remain

---

## 11) Suggested Small Helper Additions

Create only if needed. Keep small.

Potential files:
- `packages/core/src/plugins/version-compat.ts`
- `packages/core/src/plugins/plugin-identity.ts`

Only create these if they reduce duplication materially.  
Do not create a mini-framework.

---

## Definition of Done

This work is done when all of the following are true:

- [ ] incompatible marketplace versions are blocked on install and update
- [ ] bundle extraction is size-bounded and file-allowlisted
- [ ] install/update cleanup is rollback-safe
- [ ] installation telemetry uses a stable persisted installation ID
- [ ] downgrade is explicitly rejected
- [ ] plugin ID collision policy is centralized and enforced
- [ ] lifecycle tests cover success and failure cases
- [ ] stale workspace script references are removed
- [ ] docs clearly mark source-of-truth vs archive

---

## Validation Commands

Run at minimum:

```bash
pnpm test -- --runInBand
pnpm --silent lint:quick
pnpm typecheck
```

If repo-specific commands already exist and are stable, also run:

```bash
pnpm test:unit
pnpm test --filter packages/core
```

Use the repo’s real commands if they differ.  
Do not claim completion without reporting exact commands actually run.

---

## Final instruction to the developer

Treat this as **hardening work, not feature work**.

The correct outcome is:
- fewer edge-case failures
- tighter trust boundaries
- deterministic behavior under failure
- better proof through tests

Do not add cleverness. Add safety.
