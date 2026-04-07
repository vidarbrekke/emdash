# Admin + Consumer UI Smoke Readiness (v1)

## Goal
Keep the first UI smoke pass deterministic and low-risk by proving backend contracts and route coverage before UI interaction tests begin.

## Execution sequence

1. Pre-check validation (must pass before any manual UI test)
   - `pnpm readiness:commerce-backend:strict`
   - `pnpm --silent lint:quick`
   - `pnpm --filter ./packages/plugins/commerce typecheck`
   - `pnpm --filter ./packages/plugins/commerce test`

2. Admin API contract readiness
   1. Confirm admin route surface includes read + write handlers for products and SKUs:
      - admin product get route
      - admin product list route
      - admin sku list route
      - variant and hidden-state access used by admin workflow
   2. Confirm handlers return internal-facing fields without exposing storefront-only assumptions.
   3. Add/update tests for route binding and route-level auth behavior before touching UI.

3. Consumer checkout contract readiness
   1. Confirm checkout returns a frontend-compatible provider action contract in normal flow.
   2. Ensure idempotency lock semantics are preserved (same-cart repeat attempts, lock expiry recovery, conflicting owner cases).
   3. Add/confirm tests for:
      - checkout request shape
      - idempotent replay behavior
      - lock fallback behavior when first write branch is unavailable

4. Catalog detail lookup readiness
   1. Confirm customer-facing product detail lookup supports required identifier pattern for storefront flow.
   2. Add/confirm tests for lookup by both ID and slug if available.

5. Attribute/variant lifecycle readiness
   1. Confirm create/update symmetry for attribute-driven product lifecycle where admin UI can mutate options/variants after creation.
   2. Add/confirm tests for:
      - add/remove attribute
      - add/remove value
      - safe rename/reorder
      - no destructive mutation of finished transactions

6. Run a constrained UI smoke script manually after each successful phase
   - Login
   - Admin product list, product view, SKU view, one minimal edit
   - Public catalog list, public product detail, cart add, checkout start
   - Verify server returns required fields and does not change order/payment state outside expected flow

## Acceptance criteria (before team-wide UI testing)
- Admin list/detail routes resolve for non-public states.
- Consumer checkout returns action contract usable by frontend without extra translation layer.
- Checkout lock/idempotency invariants remain unchanged from current baseline.
- Product detail lookup and variant lifecycle operations are deterministic in route-level tests.
- No open route contract gaps in docs/implementation mismatch for admin-facing catalog operations.

## Do not proceed with broad UI testing until this file is fully checked off
Use this checklist as the hard prerequisite gate in `HANDOVER.md` and `COMMERCE_DOCS_INDEX.md`.
