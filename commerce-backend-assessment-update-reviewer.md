# Commerce Backend Assessment Update for Reviewer

I dug into the code again. Bluntly:

**This is closer, but still not ready for “forget the backend and move on.”**

The good news first: one of the earlier major concerns is materially improved.

- The **same-cart double-checkout problem** looks addressed now. I can see cart lock/open-checkout protections in `src/handlers/checkout.ts`, and matching tests in `src/handlers/checkout.test.ts` for:
  - same cart + different idempotency key
  - fresh lock exists
  - expired lock replacement
  - CAS/non-atomic fallback paths

That is real progress.

## What is still missing before admin + customer frontend work is safe

### 1. Checkout is still not a real payment start
This is still the biggest hole.

`src/handlers/checkout.ts` still says:

> `Stripe session in a later slice`

So checkout still looks like:
- create pending order
- create pending payment attempt
- return bookkeeping state

But not:
- create PaymentIntent / Checkout Session
- return `client_secret`
- return hosted checkout URL
- return provider action contract for the frontend

That means the **most important customer journey is still incomplete**.

My blunt take: until this exists, customer frontend testing is only **mocked checkout**, not real checkout.

---

### 2. Admin read/query surface is still missing
`src/index.ts` still mounts:

Public:
- `catalog/product/get`
- `catalog/products`
- `catalog/sku/list`

Admin mutations:
- product create/update/state
- sku create/update/state
- assets
- bundles
- entitlements
- categories/tags

But I still do **not** see mounted admin reads like:
- admin product get
- admin product list
- admin sku list

The internal handlers are there in `src/handlers/catalog-product.ts`:
- `handleGetProduct`
- `handleListProducts`
- `handleListProductSkus`

But they are not exposed as admin routes in `src/index.ts`.

That means the admin frontend still lacks a proper backend API for:
- drafts
- hidden products
- inactive SKUs
- internal-only product detail
- full variant/admin state

This is not minor. The admin UI should not have to piggyback on storefront-safe endpoints.

---

### 3. Variable product lifecycle is still incomplete after creation
`src/schemas.ts` shows:

- `productCreateInputSchema` supports `attributes`
- `productUpdateInputSchema` does **not**

So you can create a variable product with attributes/options, but I still do not see a complete backend lifecycle for:
- add/remove attribute
- add/remove attribute value
- reorder attributes
- rename attribute/code safely
- change variant-defining structure after creation

That means variable products are still only **partly manageable**.

Bluntly: if you start serious admin UI work before fixing this, you are setting up backend churn mid-stream.

---

### 4. Storefront detail lookup is still awkward
`productGetInputSchema` still only accepts `productId`.

For real storefront routes, you almost certainly want:
- lookup by `slug`
- or `slug | productId`

Right now, a normal product page would have to resolve slug some other way first, which is clumsy backend ergonomics.

Not catastrophic, but still unfinished.

---

## What else I noticed

### 5. The code is modular in files, but not yet modular in responsibility
The big files are still big:

- `src/orchestration/finalize-payment.ts` — **928 lines**
- `src/handlers/catalog-product.ts` — **924 lines**
- `src/handlers/checkout.ts` — **505 lines**
- `src/handlers/catalog-read-model.ts` — **501 lines**
- `src/handlers/catalog.ts` — **459 lines**
- `src/index.ts` — **370 lines**

That does not automatically mean “bad,” but it does mean this backend is still carrying too much multi-purpose gravity in a few places.

In practice:
- `catalog-product.ts` is still doing too much
- `finalize-payment.ts` is still too central
- `catalog.ts` is still a broad aggregator surface

I would not block initial frontend work on this alone, but I also would not call it “done.”

---

### 6. Low-level storage helper duplication is still spreading
There are repeated `asCollection`-style helpers in multiple files, including:

- `src/handlers/cart.ts`
- `src/handlers/checkout.ts`
- `src/handlers/checkout-get-order.ts`
- `src/handlers/webhook-handler.ts`
- `src/services/commerce-extension-seams.ts`

This is not a blocker, but it is exactly the kind of DRY leak that keeps growing.

---

### 7. Route-surface confidence still looks weaker than handler confidence
The handlers and unit tests are fairly extensive. Good.

But the problem is still **mounted surface completeness**.  
The codebase already has examples where logic exists, but the route table does not expose it.

So before frontend work ramps up, I would want a very small route-level smoke suite proving:
- expected routes are mounted
- admin routes are private
- storefront routes remain storefront-safe
- checkout returns the contract the frontend actually needs

---

## My blunt verdict

### Better than before?
**Yes.**
The checkout/cart concurrency posture looks meaningfully better now.

### Ready to stop worrying about the backend?
**No.**

You are not at:
> “backend is settled; proceed with frontend”

You are at:
> “backend core is getting stronger, but frontend-facing contracts are still missing”

## The short punch list I would finish first

1. **Implement real payment bootstrap in checkout**
2. **Expose admin read/query routes**
3. **Finish variable-product editing after creation**
4. **Add slug-based storefront product lookup**
5. **Add route-level smoke coverage for mounted API surface**

One honest limitation: I could inspect the source directly, but I could not run the package test suite in this environment because `pnpm` was not available offline. So this is a **deep static review**, not a claims-of-green-test review.
