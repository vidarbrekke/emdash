# HANDOVER

## 1) Project purpose and current problem
This repository is an EmDash monorepo with active work focused on `packages/plugins/commerce` and a first-party GDPR extension handoff. Additional extension/module projects are now maintained in `../Dashing commerce PLANS/emdash-extensions`.

Current branch priority is:

- keep existing commerce kernel behavior stable (checkout/webhooks/finalize),
- align external-review correction/handoff material,
- and ship a V1-complete reference package scaffold for `dashcommerce.gdpr` without changing core business logic.

The immediate risk is not feature drift; it is misalignment between:

- runtime implementation,
- public extension contract,
- and onboarding documentation.

The active branch is `main`.

## 2) Completed work and outcomes (current iteration)

### Commerce correctness baseline (already stabilized in this pass)
- storefront product-read correctness has been enforced at route boundaries (status/storefront filters + availability checks on storefront-eligible SKU rows),
- route contracts and schema/path usage were normalized where touched,
- finalization/checkout replay semantics were preserved while hardening checkout/idempotency lock handling,
- and targeted regression tests were added for checkout lock / fallback behavior.

### Runtime + handoff alignment (this iteration)
- new handoff spec created: `gdpr-plugin-implementation-spec.md`,
- new starter scaffold created at `../Dashing commerce PLANS/emdash-extensions/gdpr-plugin-starter/`,
- scaffold files added:
  - `../Dashing commerce PLANS/emdash-extensions/gdpr-plugin-starter/manifest.ts`
  - `../Dashing commerce PLANS/emdash-extensions/gdpr-plugin-starter/src/types.ts`
  - `../Dashing commerce PLANS/emdash-extensions/gdpr-plugin-starter/src/module.ts`
  - `../Dashing commerce PLANS/emdash-extensions/gdpr-plugin-starter/src/index.ts`
  - `../Dashing commerce PLANS/emdash-extensions/gdpr-plugin-starter/src/migrations/0001_create_gdpr_tables.ts`
  - `../Dashing commerce PLANS/emdash-extensions/gdpr-plugin-starter/README.md`
  - `../Dashing commerce PLANS/emdash-extensions/gdpr-plugin-starter/package.template.json`
- provider contribution types and registry hooks were added to `../Dashing commerce PLANS/emdash-extensions/gdpr-plugin-starter/src/types.ts` and `../Dashing commerce PLANS/emdash-extensions/gdpr-plugin-starter/src/module.ts`:
  - `GdprProviderManifest`, `GdprThirdPartyProviderBundle`, and validated registration checks
  - `/admin/api/gdpr/providers` route to inspect registered providers
- `HANDOVER.md` updated to include GDPR handoff state and integration checkpoints.
- `GOODNESS_AND_ACCESSIBILITY_CHARTER.md` added as the policy layer for optional promotional privilege workflows.
- `COMMERCIAL_VIABILITY_ADDENDUM.md` added to lock the commercial/optionality boundary and avoid non-commercial drift.

### Operational proof status
- `COMMERCE_DOCS_INDEX.md` and `CI_REGRESSION_CHECKLIST.md` remain the source of execution gates for commerce.
- `HANDOVER.md` is now explicitly aligned to extension handoff expectations.
- `pnpm --silent lint:quick`, `pnpm --filter ./packages/plugins/commerce typecheck`, `pnpm --filter ./packages/plugins/commerce test` were reported green in last captured state; this is unchanged since the prior pass and should be re-run on final merge if CI policy changes.
- `GOODNESS_AND_ACCESSIBILITY_CHARTER.md` defines fairness and moderation requirements for optional privilege systems and should be treated as a required companion doc.
- `COMMERCIAL_VIABILITY_ADDENDUM.md` defines what remains mandatory in core versus paid optional capabilities.

## GDPR reference module handoff (new in this pass)
- New spec for external developer handoff: `gdpr-plugin-implementation-spec.md`
- New scaffold package path: `../Dashing commerce PLANS/emdash-extensions/gdpr-plugin-starter/`
- Added starter artifacts:
  - `../Dashing commerce PLANS/emdash-extensions/gdpr-plugin-starter/manifest.ts`
  - `../Dashing commerce PLANS/emdash-extensions/gdpr-plugin-starter/src/types.ts`
  - `../Dashing commerce PLANS/emdash-extensions/gdpr-plugin-starter/src/module.ts`
  - `../Dashing commerce PLANS/emdash-extensions/gdpr-plugin-starter/src/index.ts`
  - `../Dashing commerce PLANS/emdash-extensions/gdpr-plugin-starter/src/migrations/0001_create_gdpr_tables.ts`
  - `../Dashing commerce PLANS/emdash-extensions/gdpr-plugin-starter/README.md`
  - `../Dashing commerce PLANS/emdash-extensions/gdpr-plugin-starter/package.template.json`
- New scaffold is explicitly aligned to `dashcommerce-extension-architecture-spec.md` (public seam-first extension model, namespaced module assets, optional installability).
- `gdpr-plugin-implementation-spec.md` now references the starter and includes a concrete bootstrap checklist.

## 3) Failures, open issues, and lessons learned
Known open items to validate in next pass:

- confirm P0 lock/checkout invariants remain intact after any additional patching (single-open-checkout behavior must stay enforced),
- confirm host-side GDPR extension registration hooks exist in the final production module package (not just scaffold),
- confirm legal retention/defaults/hard-hold behavior with real provider implementations,
- confirm route/migration lifecycle behavior with concrete end-to-end scripts.
- confirm V1 consent/analytics/marketing enforcement contract from the authoritative guide (subject model, consent service, tracking blockers).

P1 gaps:
- duplicated rule logic for bundle discount validation (schema + handler logic),
- repeated `asCollection`/storage-typing helper usage across checkout/cart/extension seam files.

Structural risk remains concentrated in:
- `src/handlers/catalog-product.ts`
- `src/handlers/catalog-read-model.ts`
- `src/orchestration/finalize-payment.ts`
- `src/index.ts` route registration

P2 items should remain deferred until P0/P1 are closed.

Validation status remains: `pnpm --silent lint:quick` pass, `pnpm --filter ./packages/plugins/commerce typecheck` pass, `pnpm --filter ./packages/plugins/commerce test` pass. `pnpm --filter ./packages/core typecheck` still fails on baseline core typing debt outside this scoped pass; it is not newly introduced by this plugin handoff.

Key lessons to keep:
- enforce policy early in the request path,
- keep DTO shaping separate from command/method policy,
- apply targeted fixes with direct tests,
- avoid architecture expansion (provider routing/MCP command surface) before correctness and invariants are closed.

Alignment rule for this stage:
- any developer handoff artifact (spec, scaffold, package docs, migration notes) must be checked against:
  - `dashcommerce-extension-architecture-spec.md`
  - `HANDOVER.md`
  - `gdpr-plugin-implementation-spec.md`
  - `COMMERCE_EXTENSION_SURFACE.md`
- `GOODNESS_AND_ACCESSIBILITY_CHARTER.md`
- `COMMERCIAL_VIABILITY_ADDENDUM.md`

## 4) Files changed, key insights, and gotchas
The docs and plugin surface currently in scope for continuation are:
- `packages/plugins/commerce/src/handlers/checkout.ts` (cart checkout invariant work and tests)
- `packages/plugins/commerce/src/handlers/catalog-product.ts` (split command/query and move mappers out)
- `packages/plugins/commerce/src/handlers/catalog-read-model.ts` (query/read-model responsibilities)
- `packages/plugins/commerce/src/handlers/catalog.ts` (route wrapper semantics)
- `packages/plugins/commerce/src/orchestration/finalize-payment.ts` / `finalize-payment-inventory.ts` (phase split only after checkout invariant is stabilized)
- `packages/plugins/commerce/src/schemas.ts` (shared validation source)
- `packages/plugins/commerce/src/storage.ts`, `src/types.ts`
- `gdpr-plugin-implementation-spec.md` (handoff spec)
- `../Dashing commerce PLANS/emdash-extensions/gdpr-plugin-starter/*` (new starter module scaffold)

Gotchas:
- Do not widen behavior in payment/finalize/idempotency/claim logic without regression tests.
- Do not expose storefront availability from non-storefront-eligible aggregate paths.
- Do not merge core typing debt in this plugin scope.

## 5) Key files and directories
`packages/plugins/commerce/src/handlers/`
`packages/plugins/commerce/src/lib/`
`packages/plugins/commerce/src/orchestration/`
`packages/plugins/commerce/src/kernel/`
`packages/plugins/commerce/src/storage.ts`
`packages/plugins/commerce/COMMERCE_DOCS_INDEX.md`
`packages/plugins/commerce/CI_REGRESSION_CHECKLIST.md`
`packages/plugins/commerce/COMMERCE_EXTENSION_SURFACE.md`
`packages/plugins/commerce/FINALIZATION_REVIEW_AUDIT.md`
`packages/plugins/commerce/AI-EXTENSIBILITY.md`
`packages/plugins/commerce/COMMERCE_AI_ROADMAP.md`
`progress-review.md` and `external_review.md` (third-party context)
`HANDOVER.md` (this file)

Additional root-level references for the next phase:
- `dashcommerce-extension-architecture-spec.md`
- `gdpr-plugin-implementation-spec.md`
- `emdash-commerce-gdpr-extension-authoritative-guide.md`
- `GOODNESS_AND_ACCESSIBILITY_CHARTER.md`
- `eu-selling-marketing-gdpr-guide.md`
- `announcement_public_beta.md`
- `announcement_ga.md`

## 6) Alignment delta (must be clean before external handoff)

### Green (aligned now)
- public extension strategy defined in architecture spec and referenced in GDPR spec,
- `../Dashing commerce PLANS/emdash-extensions/gdpr-plugin-starter` scaffold is present and namespaced (`dc_gdpr_*`, `modules.gdpr.*` guidance reflected),
- `HANDOVER.md` now includes the GDPR handoff scope and known risks,
- `gdpr-plugin-implementation-spec.md` now includes a baseline consent + enforcement checklist derived from the authoritative guide.
- `../Dashing commerce PLANS/emdash-extensions/gdpr-plugin-starter` now includes an explicit third-party contribution contract in both types and module bootstrap (`GdprProviderManifest`, provider registry, providers endpoint).
- `GOODNESS_AND_ACCESSIBILITY_CHARTER.md` now frames optional privilege fairness, anti-bias constraints, moderation evidence, and reviewability.
- `COMMERCIAL_VIABILITY_ADDENDUM.md` now formalizes core-vs-optional strategy, launch guardrails, and monetization posture for external handoff.

### Yellow (in-progress / verified as scaffold)
- host API contract for module registration and hooks is still expected to be validated against final runtime (`CommerceHost` shape in scaffold is placeholder for actual host API),
- module lifecycle/jobb/migration registration is present as scaffold and must be reified into a production package,
- P0/P1 regression assertions are not yet re-verified in this final repository state.

### Red (hard blockers before external delivery)
- final production `dashcommerce.gdpr` package is not yet created in `packages/plugins` and not yet wired into install path,
- no end-to-end proof exists for GDPR route lifecycle + provider registry + storage migrations together,
- legal/retention policy defaults and hard-hold semantics are not yet finalized in executable logic,
- explicit consent gating for marketing and analytics is not yet implemented or tested in-module.

### Handoff acceptance (minimum)
- no core behavior expansion outside stated scope,
- all migration/schema ownership remains inside module scope,
- route + hook + migration registration is exercised with concrete tests before external agent start.

If any `Red` item persists, do not hand off to external implementation.
