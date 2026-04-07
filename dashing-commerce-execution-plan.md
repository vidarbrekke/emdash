# DashingCommerce — Hardening Execution Plan

## Purpose

This document turns the review findings into an implementation plan your developer can execute with minimal interpretation.

The goal is **not** to redesign the plugin. The goal is to close the main pre-review gaps with the smallest reasonable surface-area change.

---

## Working Rules

1. Preserve current route contracts unless a contract bug forces change
2. Prefer additive helpers over broad refactors
3. Keep money-path behavior stable
4. Add tests before or alongside each fix
5. Fail closed on concurrency / idempotency uncertainty
6. Use pagination helpers for all truth-bearing reads

---

## Priority Order

### P0 — Must finish first
- Checkout lock ownership-safe release
- Atomic capability policy for money paths
- Pagination-safe validation / cascade reads

### P1 — Next
- Safer variable-attribute replacement path
- Targeted regression tests

### P2 — Operational hardening
- Webhook lease timing / renewal
- Storage contract docs

---

## Task 1 — Fix checkout lock release ownership

**Primary file:** `src/handlers/checkout.ts`

### Problem
The current release path deletes the lock doc by ID only. A slower request can delete a lock already re-acquired by a newer request.

### Implementation target
Make lock release conditional on the current stored lock still matching `lockRequestId`.

### Recommended shape

Add helper:

```ts
async function releaseCheckoutCartLock(args: {
  locks: CheckoutLockCollection;
  lockId: string;
  requestId: string;
}): Promise<void>
```

### Expected behavior
- if lock row is missing: no-op
- if payload cannot be parsed: no-op
- if stored requestId differs: no-op
- if stored requestId matches: delete or CAS-delete

### Notes
- Keep this helper narrow
- Do not change claim semantics yet beyond what is needed for safe release

### Test cases
- owner can release own lock
- old owner cannot release replacement lock
- missing delete method remains safe no-op
- malformed stored payload does not crash release path

### Definition of done
No code path deletes a checkout cart lock unless ownership is verified.

---

## Task 2 — Enforce money-path storage capability policy

**Primary files:**
- `src/orchestration/finalize-payment.ts`
- `src/handlers/checkout.ts`
- optionally a small shared helper in `src/storage.ts` or `src/kernel/*`

### Problem
The code can degrade to weaker semantics when `putIfAbsent` / `compareAndSwap` are missing.

### Decision to make
Choose one policy and implement it clearly.

### Recommended policy
**Production mode requires atomic claim support for money paths.**

#### Minimum required
- `putIfAbsent` for receipt/lock claim
- `compareAndSwap` strongly recommended where ownership transfer matters

### Implementation options

#### Option A — hard fail in production
Best if the package already has a stable way to detect environment / capability mode.

#### Option B — explicit capability gate
Introduce a helper such as:

```ts
function assertMoneyPathAtomicSupport(args: {
  path: "checkout" | "finalize";
  hasPutIfAbsent: boolean;
  hasCompareAndSwap: boolean;
  allowDegradedMode?: boolean;
}): void
```

### Test cases
- finalize path rejects unsupported storage when degraded mode is off
- checkout path rejects unsupported storage when degraded mode is off
- degraded mode logs or signals clearly when enabled

### Definition of done
The package no longer silently presents weak concurrency behavior as if it were fully hardened production mode.

---

## Task 3 — Make validation and cascade-delete reads exhaustive

**Primary files:**
- `src/handlers/catalog-product.ts`
- `src/handlers/catalog-read-model.ts`

### Problem
Some validation and mutation logic uses single-page `query()` calls as if results are complete.

### Implementation target
Use `queryAllPages(...)` for every read that drives:
- uniqueness
- dedupe
- deletion
- count-based enforcement
- mutation planning

### Likely hotspots
- variable-product attribute replacement
- SKU uniqueness / option signature validation
- pause/reconcile SKU flows when full set matters
- any count-based SKU limit logic

### Execution pattern

Instead of:

```ts
const result = await productSkus.query({ where: { productId: product.id } });
```

Use:

```ts
const rows = await queryAllPages((cursor) =>
  productSkus.query({
    where: { productId: product.id },
    cursor,
    limit: 100,
  }),
);
```

### Important note
Do not blindly replace every query. Replace the ones where correctness depends on completeness.

### Test cases
- product with >1 page of SKUs still enforces uniqueness
- cascade delete removes all child rows across pages
- count-based SKU limit behaves correctly beyond first page

### Definition of done
No truth-bearing validation or mutation flow relies on a single-page query result unless the bounded size is asserted explicitly.

---

## Task 4 — Refactor variable-product attribute replacement to a safer flow

**Primary file:** `src/handlers/catalog-product.ts`

### Problem
Current flow deletes current graph before new graph is fully established.

### Objective
Reduce partial-state risk without redesigning the entire catalog system.

### Recommended approach
Use a **plan → validate → apply → cleanup** sequence.

### Suggested implementation steps

#### Step A — Gather exhaustive current state
Load:
- all existing product attributes
- all attribute values
- all product SKUs
- all SKU option rows

Use pagination-safe helpers.

#### Step B — Validate target state fully before deletes
Validate:
- duplicate attribute codes
- duplicate value codes
- variant-defining requirements
- any SKU-option compatibility assumptions

#### Step C — Write new attribute graph first
Create new attributes and values first and build an old→new mapping in memory.

#### Step D — Update dependent rows or mark affected SKUs for review
If SKUs must be paused, do that in a controlled step with logging.

#### Step E — Delete old graph last
Only after new graph exists and affected rows are handled.

### Minimum acceptable fallback
If full safe swap is too large for this pass:
- at least perform full prevalidation and exhaustive read planning first
- centralize delete sequence
- add defensive failure logging
- add tests for mid-sequence failure

### Test cases
- failure during rebuild does not leave all attributes deleted without replacements
- SKU pause/review behavior remains stable after attribute updates
- pagination across current state works correctly

### Definition of done
The replacement flow is no longer a simple destructive delete-first rebuild.

---

## Task 5 — Add targeted concurrency and integrity regression tests

**Primary files:**
- `src/handlers/checkout.test.ts`
- `src/orchestration/finalize-payment.test.ts`
- `src/handlers/catalog.test.ts` or `catalog-product`-adjacent tests

### Add these tests

#### Checkout
- stale lock reclaimed by request B
- request A cannot release request B’s lock
- degraded storage mode is surfaced according to policy

#### Catalog
- SKU validation remains correct across paginated result sets
- attribute replacement failure does not produce silent half-delete corruption

#### Finalize
- overlapping finalize attempts respect claim ownership / replay semantics
- claim timing / lease assumptions are covered in at least one explicit test

### Definition of done
Every bug class identified in the review has at least one direct regression test.

---

## Task 6 — Harden webhook claim lease behavior

**Primary file:** `src/orchestration/finalize-payment.ts`

### Problem
The receipt claim appears lease-based but non-renewing.

### Minimum acceptable change
Make lease duration configurable and document expected execution bounds.

### Better change
Add claim renewal at controlled points:
- after pending receipt write
- before expensive inventory / order mutation work
- before final receipt persistence if needed

### Test cases
- long-running execution remains claim-owner
- expired lease path behaves deterministically

### Definition of done
Lease behavior is explicit, configurable, and not treated as an invisible assumption.

---

## Task 7 — Document storage capability requirements

**Primary docs candidates:**
- `COMMERCE_EXTENSION_SURFACE.md`
- `FINALIZATION_REVIEW_AUDIT.md`
- or a short dedicated storage-capabilities section

### Add a concise section that defines

#### Required for hardened production mode
- atomic insert / claim support
- deterministic conditional ownership update where relevant

#### Optional / degraded
- what still works in dev/test
- what guarantees weaken
- whether degraded mode is acceptable for review

### Definition of done
A reviewer can understand the storage safety model without reverse-engineering it from the code.

---

## Suggested File-by-File Sequence

1. `src/handlers/checkout.ts`
2. `src/handlers/checkout.test.ts`
3. `src/handlers/catalog-product.ts`
4. `src/handlers/catalog*.test.ts`
5. `src/orchestration/finalize-payment.ts`
6. `src/orchestration/finalize-payment.test.ts`
7. docs update

This order keeps the highest-risk money-path fix first while avoiding a sprawling refactor.

---

## Non-Goals For This Pass

Do not mix these into the hardening cycle unless a fix directly requires them:

- new feature expansion
- UI/admin feature growth
- broad schema redesign
- major extension API changes
- generalized transaction framework across the whole plugin

Stay narrow. Close the hardening gaps first.

---

## Deliverables Checklist

- [ ] ownership-safe checkout lock release
- [ ] explicit money-path atomic capability policy
- [ ] exhaustive validation/cascade reads
- [ ] safer attribute replacement flow
- [ ] targeted regression tests
- [ ] webhook lease behavior clarified or improved
- [ ] storage capability docs added

---

## Final Guidance

The right move here is not “more architecture.”  
The right move is to make the current architecture **harder to break**.

That means:
- fewer silent assumptions
- fewer single-page truth reads
- fewer destructive mutation sequences
- clearer capability boundaries

If this pass is done well, the plugin will present as a serious commerce kernel that has already done the uncomfortable work reviewers usually ask for.
