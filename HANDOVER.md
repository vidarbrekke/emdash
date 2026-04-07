# HANDOVER

## 1) Project purpose and current problem

`@emdash-cms/plugin-dashing-commerce` is the closed-kernel commerce implementation in this monorepo; optional behavior is expected to remain in extension modules.  
Current work is a hardening handoff aimed at production-safety edge-cases, specifically money-path correctness (`checkout`/`webhook`/`finalize`) and catalog mutation consistency, before broadening UI and feature delivery.

The immediate problem is to reduce regressions under concurrency and scale while preserving existing route contracts and outward API behavior.

## 2) Completed work and outcomes

Backend readiness, contract, and safety instrumentation is in place: route-method enforcement, checkout lock/idempotency testing, finalize/webhook test expansion, and catalog safety updates for slug history and SKU lifecycle handling. The package now has explicit review packaging (`commerce-plugin-external-review.zip` and `commerce-plugin-external-review-expanded.zip`) and an updated documentation set focused on active implementation artifacts.

External reviewer findings were codified into concrete patch execution notes so the next pass can focus on closing a narrow set of risks instead of broad refactors.

## 3) Failures, open issues, and lessons learned

Highest-priority open issues are from the latest review and map directly to concurrency or truth-bearing operations:

- ownership-safe checkout lock release is incomplete under contention and can permit lock ownership races;
- money-path processing can fall back to weak storage semantics when atomic primitives are missing;
- some catalog validation/mutation reads rely on single-page results where completeness is required;
- variable-product attribute replacement is still a destructive replace pattern without safer sequencing; 
- webhook claim lease renewal has not yet been hardened as a follow-up concurrency edge case.

Additional known work still open: broader admin/storefront smoke completion and full operational evidence collection for the narrowed hardening scope.

Lessons to retain: keep scope to explicit correctness fixes, keep route contracts stable unless a contract issue forces change, and fail fast/visible when required storage capabilities are not present.

## 4) Files changed, if that matters for future development, key insights, and gotchas

Files to change first for the next phase are:
`packages/plugins/commerce/src/handlers/checkout.ts`, `packages/plugins/commerce/src/orchestration/finalize-payment.ts`, `packages/plugins/commerce/src/handlers/catalog-product.ts`, `packages/plugins/commerce/src/handlers/catalog-read-model.ts`, `packages/plugins/commerce/src/handlers/checkout.test.ts`, `packages/plugins/commerce/src/orchestration/finalize-payment.test.ts`, `packages/plugins/commerce/src/handlers/catalog.test.ts`.

The `dashing-commerce-hardening-review.md`, `dashing-commerce-diff-style-patch-plan.md`, and `dashing-commerce-execution-plan.md` files should be treated as the action plan source-of-truth for this handoff.

Gotchas:
- do not introduce non-ownership lock deletion on checkout flow;
- do not use single-page queries for uniqueness/deletion/counting logic unless bounded and explicitly validated;
- keep the extension workspace path literal (`../Dashing commerce PLANS/...`) consistent and quoted due the embedded space.

## 5) Key files and directories

Core docs:
- `HANDOVER.md`
- `ADMIN_CONSUMER_UI_SMOKE_READINESS.md`
- `packages/plugins/commerce/COMMERCE_DOCS_INDEX.md`
- `packages/plugins/commerce/COMMERCE_EXTENSION_SURFACE.md`
- `packages/plugins/commerce/FINALIZATION_REVIEW_AUDIT.md`
- `dashing-commerce-hardening-review.md`
- `dashing-commerce-diff-style-patch-plan.md`
- `dashing-commerce-execution-plan.md`
- `commerce-plugin-architecture.md`
- `dashcommerce-extension-architecture-spec.md`
- `gdpr-plugin-implementation-spec.md`

Core code:
- `packages/plugins/commerce/src`
- `packages/plugins/commerce/src/kernel`
- `packages/plugins/commerce/src/handlers`
- `packages/plugins/commerce/src/orchestration`

Operational and readiness:
- `package.json`
- `scripts/commerce-backend-readiness.mjs`
- `.github/workflows/ci.yml`
- `scripts/build-commerce-external-review-zip.sh`
- `commerce-plugin-external-review-expanded.zip`
