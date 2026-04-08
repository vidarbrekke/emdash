# DashingCommerce — Diff-Style Patch Plan
> historical reference for Strategy A hardening

## Purpose

This document gives your developer a near-mechanical implementation path.

It is **not** a literal patch file. It is a file-by-file patch plan with concrete helper shapes, replacement targets, and suggested test additions.

The intent is to reduce ambiguity and keep the hardening pass tight.

---

## Patch 1 — Ownership-safe checkout lock release

**File:** `src/handlers/checkout.ts`

## Current issue

Current release logic:

```ts
const releaseLock = async () => {
  const deleteResponse = (lockCollection as CheckoutLockCollection & {
    delete?: (id: string) => Promise<boolean>;
  }).delete;
  if (deleteResponse) {
    await deleteResponse.call(lockCollection, lockDocId);
  }
};
```

This deletes by ID without verifying the stored lock still belongs to the releasing request.

## Patch approach

### Add helper near existing lock helpers

```ts
async function releaseCheckoutCartLock(args: {
  locks: CheckoutLockCollection;
  lockId: string;
  requestId: string;
}): Promise<void> {
  const existing = await args.locks.get(args.lockId);
  if (!existing) return;

  const parsed = parseCheckoutCartLock(existing.responseBody);
  if (!parsed) return;
  if (parsed.requestId !== args.requestId) return;

  const deleter = (args.locks as CheckoutLockCollection & {
    delete?: (id: string) => Promise<boolean>;
  }).delete;

  if (!deleter) return;
  await deleter.call(args.locks, args.lockId);
}
```

### Replace inline release function

Replace:

```ts
const releaseLock = async () => {
  ...
};
```

With:

```ts
const releaseLock = async () =>
  releaseCheckoutCartLock({
    locks: lockCollection,
    lockId: lockDocId,
    requestId: lockRequestId,
  });
```

## Optional stronger version

If you want stronger semantics and storage supports it, use a CAS-backed “mark released” or conditional delete pattern. But for this pass, ownership verification before delete is the essential fix.

## Tests to add

**File:** `src/handlers/checkout.test.ts`

Add tests that prove:

1. request A acquires lock
2. lock expires / is replaced by request B
3. request A release is called
4. request B lock still exists

Also add:
- release is no-op if payload malformed
- release is no-op if lock missing

---

## Patch 2 — Add explicit atomic capability guard for money paths

**Files:**
- `src/orchestration/finalize-payment.ts`
- `src/handlers/checkout.ts`
- optionally `src/storage.ts` or new helper in `src/kernel/*`

## Patch approach

### Add a small helper

Suggested file: `src/kernel/storage-capabilities.ts`

```ts
export function assertAtomicMoneyPathSupport(args: {
  path: "checkout" | "finalize";
  hasPutIfAbsent: boolean;
  hasCompareAndSwap: boolean;
  allowDegradedMode?: boolean;
}): void {
  if (args.allowDegradedMode) return;
  if (!args.hasPutIfAbsent) {
    throw new Error(`[commerce:${args.path}] atomic claim support is required`);
  }
}
```

You can make the thrown error type more kernel-consistent later.

### Call it early in checkout

In `checkout.ts`, after collection setup:

```ts
assertAtomicMoneyPathSupport({
  path: "checkout",
  hasPutIfAbsent: Boolean(lockCollection.putIfAbsent),
  hasCompareAndSwap: Boolean(lockCollection.compareAndSwap),
  allowDegradedMode: false, // or config-driven
});
```

### Call it early in finalize

In `finalize-payment.ts`, before claim flow:

```ts
assertAtomicMoneyPathSupport({
  path: "finalize",
  hasPutIfAbsent: Boolean(ports.webhookReceipts.putIfAbsent),
  hasCompareAndSwap: Boolean(ports.webhookReceipts.compareAndSwap),
  allowDegradedMode: false, // or config-driven
});
```

## Notes

- If the package already has a settings/config mechanism, wire `allowDegradedMode` through that
- If not, start with a fixed conservative default and document it

## Tests to add

- finalize fails when atomic claim support missing and degraded mode disabled
- checkout fails when atomic claim support missing and degraded mode disabled

---

## Patch 3 — Reuse `queryAllPages()` for authoritative catalog reads

**Files:**
- `src/handlers/catalog-product.ts`
- reuse helper from `src/handlers/catalog-read-model.ts`

## Patch approach

### Import helper

At top of `catalog-product.ts`:

```ts
import { queryAllPages } from "./catalog-read-model.js";
```

### Replace single-page reads where completeness matters

#### Replace attribute load

From:

```ts
const existingAttributes = (
  await productAttributes.query({ where: { productId: product.id } })
).items.map((row) => row.data);
```

To:

```ts
const existingAttributeRows = await queryAllPages((cursor) =>
  productAttributes.query({
    where: { productId: product.id },
    cursor,
    limit: 100,
  }),
);
const existingAttributes = existingAttributeRows.map((row) => row.data);
```

#### Replace product SKU load

From:

```ts
const productSkusResult = await productSkus.query({ where: { productId: product.id } });
const productSkuIds = productSkusResult.items.map((row) => row.data.id);
```

To:

```ts
const productSkuRows = await queryAllPages((cursor) =>
  productSkus.query({
    where: { productId: product.id },
    cursor,
    limit: 100,
  }),
);
const productSkuIds = productSkuRows.map((row) => row.data.id);
```

#### Replace option-row fetch

From:

```ts
const existingOptionRows = await productSkuOptionValues.query({
  where: { skuId: { in: productSkuIds } },
});
```

To:

```ts
const existingOptionRows = productSkuIds.length === 0
  ? []
  : await queryAllPages((cursor) =>
      productSkuOptionValues.query({
        where: { skuId: { in: productSkuIds } },
        cursor,
        limit: 100,
      }),
    );
```

#### Replace attribute-value fetch loop
Either paginate per attribute or batch by attribute IDs if supported safely.

## Additional hotspots to patch

Search for these patterns in `catalog-product.ts`:

- `.query({ where: { productId: product.id } })`
- `.query({ where: { attributeId } })`
- `.query({ where: { skuId: { in: ... } } })`

Patch every instance where correctness depends on a complete result set.

## Tests to add

Create fixtures large enough to require multiple pages and prove:

- SKU uniqueness still works
- full child set is deleted / processed
- count-based checks remain correct

---

## Patch 4 — Safer variable-attribute replacement flow

**File:** `src/handlers/catalog-product.ts`

## Current issue

The function `replaceVariableProductAttributes()` destroys existing graph state before the replacement graph is fully written.

## Patch approach

### Keep the function, but change its shape

Instead of:

1. delete option rows
2. delete values
3. delete attributes
4. recreate

Use:

1. exhaustively load current graph
2. validate replacement graph
3. create new attribute rows
4. create new value rows
5. pause/review affected SKUs
6. remove obsolete option rows / old attribute graph last

### Suggested internal structure

```ts
type PlannedAttributeGraph = {
  newAttributes: StoredProductAttribute[];
  newValues: StoredProductAttributeValue[];
};
```

Add helper:

```ts
async function buildPlannedAttributeGraph(...)
```

Then:

```ts
async function replaceVariableProductAttributes(...) {
  // 1. load current graph exhaustively
  // 2. build+validate new graph
  // 3. write new graph
  // 4. handle dependent SKU state
  // 5. delete old graph last
}
```

## Minimum-scope version for this pass

If full swap logic is too large, at least do this:

- exhaustive reads first
- build new rows in memory first
- write new rows first
- only then start deleting old rows

That alone is materially safer than the current flow.

## Tests to add

Simulate a write failure during replacement and assert:

- old graph is still present, or
- system state remains recoverable and explicit

Avoid tests that merely assert “throws”; assert post-failure storage state.

---

## Patch 5 — Clarify / harden webhook lease behavior

**File:** `src/orchestration/finalize-payment.ts`

## Patch approach

### Minimal version
Extract the lease duration into a clearly named constant or config path and document its purpose.

```ts
const WEBHOOK_RECEIPT_CLAIM_LEASE_MS = 30_000;
```

If already present, make sure tests and docs reference it explicitly.

### Better version
Introduce renewal helper:

```ts
async function renewWebhookReceiptClaim(...) { ... }
```

Call it at one or two safe checkpoints in long-running finalize flow.

## Important constraint
Do not overcomplicate this pass. If renewal is too invasive, make the lease explicit and add timing tests.

## Tests to add

- claim remains valid across a simulated long-running finalize segment
- expired claim path is deterministic

---

## Patch 6 — Documentation update

**Files to consider:**
- `FINALIZATION_REVIEW_AUDIT.md`
- `COMMERCE_EXTENSION_SURFACE.md`

## Add a short section like this

```md
## Storage Safety Requirements

Hardened production mode assumes:
- atomic claim/insert support (`putIfAbsent` or equivalent)
- conditional ownership-safe update where concurrency matters

Without these capabilities, checkout/finalize may run only in explicitly degraded dev/test mode.
```

Keep it short and explicit.

---

## Search Checklist For Developer

Run these searches and patch each result intentionally:

### In `catalog-product.ts`
- `query({ where: { productId`
- `query({ where: { attributeId`
- `query({ where: { skuId: { in:`
- `items.length`
- `.items.map(` on mutation / validation reads

### In `checkout.ts`
- `delete(` on lock collection
- any fallback branch that uses `put()` after atomic-claim failure

### In `finalize-payment.ts`
- `persisted: false`
- `putIfAbsent`
- `compareAndSwap`
- lease duration constants / claim timing paths

---

## Suggested Commit Breakdown

### Commit 1
`commerce: make checkout cart lock release ownership-safe`

### Commit 2
`commerce: enforce atomic storage policy for money paths`

### Commit 3
`commerce: paginate truth-bearing catalog reads`

### Commit 4
`commerce: make variable attribute replacement safer`

### Commit 5
`commerce: add hardening regression coverage`

### Commit 6
`docs: document commerce storage safety requirements`

This breakdown will make review easier and regression diagnosis cleaner.

---

## Final Note To Developer

Do not chase elegance here.

The value of this pass is:
- fewer race windows
- fewer hidden assumptions
- fewer partial-state mutations
- clearer safety guarantees

That is what will make the core feel mature under external review.
