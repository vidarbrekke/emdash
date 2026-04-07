# HANDOVER

## 1) Project purpose and current problem
EmDash is maintained as a closed-kernel commerce platform with a separate extension path for optional modules. The active focus is to keep the money path stable (`checkout`, `webhook`/`finalize`, inventory/claim invariants) while building a clean external handoff flow for non-core modules.

The specific problem at this stage is alignment: the repository split and extension movement to `../Dashing commerce PLANS/emdash-extensions` must stay synchronized with runtime contracts, dependency declarations, and onboarding docs so new work can be built and tested without hidden drift.

## 2) Completed work and outcomes
The following work is complete and in the current branch:

- Commerce kernel behavior remains the primary correctness boundary. Existing scope-lock rules from the extension surface are preserved: checkout/payment state creation and payment transitions remain controlled by the kernel path, and finalize logic is treated as closed-kernel for now.
- Non-core plugin modules were moved to `../Dashing commerce PLANS/emdash-extensions` and documented as separate projects.
- The extension dependency model was corrected to explicit `link:` paths in consumers that reference moved modules (demos, templates, fixture projects).
- `preview-releases.yml` was corrected so removed package paths are no longer part of preview publish.
- A runnable readiness gate was added:
  - `scripts/commerce-backend-readiness.mjs`
  - `pnpm readiness:commerce-backend`
  - `pnpm readiness:commerce-backend:strict`
  - CI job `commerce-readiness` added to `.github/workflows/ci.yml`.
- GDPR reference work is now scaffold-complete and split-aware:
  - `gdpr-plugin-implementation-spec.md` (authoritative handoff spec)
  - `../Dashing commerce PLANS/emdash-extensions/gdpr-plugin-starter/` scaffold with `manifest.ts`, `types.ts`, `module.ts`, migration (`0001_create_gdpr_tables.ts`), and package template.
  - Third-party provider extension contract types added (`GdprProviderManifest`, `GdprProviderSideEffect`, `GdprProviderRiskLevel`, `GdprThirdPartyProviderBundle`) and provider listing/admin route exposure in scaffold.
- Governance and strategy references are present in current documentation set (`GOODNESS_AND_ACCESSIBILITY_CHARTER.md`, `COMMERCIAL_VIABILITY_ADDENDUM.md`, `COMMERCE_DOCS_INDEX.md`, `CI_REGRESSION_CHECKLIST.md`, `COMMERCE_EXTENSION_SURFACE.md`, `FINALIZATION_REVIEW_AUDIT.md`).

## 3) Failures, open issues, and lessons learned
Known open risk items before broader external delivery:

- No production `dashcommerce.gdpr` package exists in `packages/plugins` yet; only scaffold/reference implementation exists.
- Host-side registration/seam integration for production `dashcommerce.gdpr` in this repo is scaffold-level and must be verified in the target host package.
- End-to-end proof for GDPR route lifecycle + provider registry + migration execution together is not yet complete.
- Legal/consent/retention defaults and marketing enforcement are still incomplete for final runtime.
- Core typing debt remains in `pnpm --filter ./packages/core typecheck` and is tracked as pre-existing debt.

Lessons enforced for this phase:

- Do not expand runtime topology before contract-hardening is proven (`checkout`, `webhook`, and finalization pathways).
- Keep extension changes additive, interface-first, and test-driven.
- Treat path/reference drift as a release blocker; validate with scripted readiness checks and CI.
- Prefer deterministic, objective governance metadata for provider extensions and optional privilege systems.

## 4) Files changed, key insights, and gotchas
Priority files for continuation:

- `scripts/commerce-backend-readiness.mjs`
- `package.json` (`readiness:commerce-backend` scripts)
- `.github/workflows/ci.yml` (`commerce-readiness` job)
- `demos/*/package.json`, `templates/*/package.json`
- `e2e/fixture/package.json`
- `packages/core/tests/integration/fixture/package.json`
- `gdpr-plugin-implementation-spec.md`
- `../Dashing commerce PLANS/emdash-extensions/README.md`
- `../Dashing commerce PLANS/emdash-extensions/gdpr-plugin-starter/*`
- `HANDOVER.md` (this file)

Key insight:

- The project now has a stable handoff contract boundary between core commerce and optional modules, but this boundary still needs one production validation pass from a final host integration package.

Gotchas to avoid:

- Extension path has a space: `Dashing commerce PLANS`. Always quote this path in shell and scripts.
- Do not run `workspace:*` for moved extension module dependencies; use explicit `link:` to the extension workspace.
- Do not widen `checkout`/`finalize` behavior without focused regression tests.
- Do not treat optional modules (GDPR, fairness/promotions, provider tooling) as required for core commerce success path.

## 5) Key files and directories

Root:

- `HANDOVER.md` (active execution handoff)
- `gdpr-plugin-implementation-spec.md`
- `commerce-backend-readiness-punch-list.md`
- `scripts/commerce-backend-readiness.mjs`
- `package.json`
- `GOODNESS_AND_ACCESSIBILITY_CHARTER.md`
- `COMMERCIAL_VIABILITY_ADDENDUM.md`
- `COMMERCE_DOCS_INDEX.md`
- `.github/workflows/ci.yml`

Core commerce:

- `packages/plugins/commerce/src/index.ts`
- `packages/plugins/commerce/src/handlers/*`
- `packages/plugins/commerce/src/orchestration/*`
- `packages/plugins/commerce/src/services/*`
- `packages/plugins/commerce/src/storage.ts`
- `packages/plugins/commerce/COMMERCE_DOCS_INDEX.md`
- `packages/plugins/commerce/COMMERCE_EXTENSION_SURFACE.md`
- `packages/plugins/commerce/FINALIZATION_REVIEW_AUDIT.md`
- `packages/plugins/commerce/CI_REGRESSION_CHECKLIST.md`

Extension workspace:

- `../Dashing commerce PLANS/emdash-extensions/README.md`
- `../Dashing commerce PLANS/emdash-extensions/gdpr-plugin-starter/`
- `../Dashing commerce PLANS/emdash-extensions/{ai-moderation,api-test,atproto,audit-log,color,embeds,forms,marketplace,marketplace-test,sandboxed-test,webhook-notifier,x402}`

## 6) Next-step acceptance before external handoff

- Keep kernel scope lock active:
  - no checkout/payment finalize topology changes before duplicate-flight/lease/possession checks are revalidated.
- Run readiness + core verification before new external developer starts:
  - `pnpm readiness:commerce-backend:strict`
  - `pnpm --silent lint:quick`
  - `pnpm --filter ./packages/plugins/commerce typecheck`
  - `pnpm --filter ./packages/plugins/commerce test`
- Produce a production host-integration proof package for GDPR (`dashcommerce.gdpr`) and wire it into install/boot flow with the same seam-only registration model.
- Run the preliminary UI gate before doing rudimentary admin and consumer manual testing:
  - `ADMIN_CONSUMER_UI_SMOKE_READINESS.md`
