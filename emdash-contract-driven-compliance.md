# emdash-contract-driven-compliance.md
Version: 1.0
Purpose: Design a contract-driven compliance generation layer for EmDash / dashingCommerce

---

# 1. Goal

Eliminate as much human error as possible by generating compliance tests from declared contracts.

This layer should make it hard for a developer to:
- add a route without method enforcement tests
- add a schema without invalid-input coverage
- add a mutation path without replay/idempotency checks where required
- drift handler behavior away from the declared contract

In plain terms:

**If a behavior is declared, a baseline compliance test should be generated automatically.**

---

# 2. What this layer is

This is not a replacement for handwritten tests.

It is a **compliance floor generator**.

It should auto-produce:
- route contract tests
- schema rejection tests
- method enforcement tests
- capability declaration checks
- mutation-path safety tests
- replay/idempotency test scaffolds where routes are marked side-effectful

That gives every new surface a minimum guaranteed quality bar.

---

# 3. What this layer is not

It is not:
- a full property-testing system
- a replacement for domain-specific unit tests
- a magic correctness engine
- a substitute for human review

It should generate the **minimum non-negotiable checks** from declared metadata and contracts.

---

# 4. Core idea

Every production surface in `packages/plugins/commerce` should be describable through a small declarative contract.

From that contract, the repo should generate a compliance suite.

## Formula

**contract → generator → test cases → CI gate**

---

# 5. Recommended contract model

Use a small, explicit metadata layer near each route or operation.

## Example route contract

```ts
export const createCheckoutContract = defineRouteContract({
  routeId: "commerce.checkout.create",
  method: "POST",
  path: "/api/commerce/checkout",
  requestSchema: CreateCheckoutRequestSchema,
  responseSchema: CreateCheckoutResponseSchema,
  capabilities: ["d1"],
  sideEffectful: true,
  replaySafe: true,
  requiresIdempotencyKey: true,
  mutationCollections: ["carts", "orders"],
  handler: createCheckoutHandler,
});
```

## Example webhook contract

```ts
export const stripeWebhookContract = defineWebhookContract({
  eventSource: "stripe",
  routeId: "commerce.webhooks.stripe",
  method: "POST",
  path: "/api/commerce/webhooks/stripe",
  requestSchema: StripeWebhookEnvelopeSchema,
  capabilities: ["d1"],
  sideEffectful: true,
  replaySafe: true,
  requiresIdempotencyKey: true,
  mutationCollections: ["orders", "payments"],
  handler: stripeWebhookHandler,
});
```

---

# 6. Minimum metadata fields

Every contract should expose enough metadata for the generator to reason about enforcement.

## Required fields

- `routeId`
- `method`
- `path`
- `requestSchema`
- `responseSchema` where applicable
- `capabilities`
- `sideEffectful`
- `replaySafe`
- `requiresIdempotencyKey`
- `mutationCollections`
- `handler`

## Optional but highly useful

- `readCollections`
- `authRequired`
- `rolesAllowed`
- `returnsDeterministicOutput`
- `orderedChildSensitive`
- `entitlementSensitive`
- `moneyPath`
- `featureFlag`
- `notes`

---

# 7. What the generator should create automatically

For every declared contract, generate a baseline suite.

## 7.1 Method enforcement tests
Generated assertions:
- allowed method is accepted
- disallowed methods are rejected
- route does not accidentally accept GET/POST/etc.

## 7.2 Request schema rejection tests
Generated assertions:
- empty payload fails if invalid
- malformed payload fails
- extra unexpected structure is rejected or handled according to schema policy

## 7.3 Response shape tests
Generated assertions:
- valid handler result conforms to response schema
- invalid or partial responses fail the test

## 7.4 Capability declaration checks
Generated assertions:
- contract declares required capabilities
- plugin manifest includes those capabilities
- undeclared capability use fails compliance

## 7.5 Mutation safety tests
If `sideEffectful: true`, generate:
- invalid input does not mutate storage
- failure before validation produces no durable side effects

## 7.6 Replay/idempotency tests
If `replaySafe: true` or `requiresIdempotencyKey: true`, generate:
- duplicate invocation converges on same durable outcome
- duplicate invocation does not duplicate side effects
- repeated webhook payload is safe

## 7.7 Collection ownership checks
Generated assertions:
- all mutated collections are declared
- mutated collections have an owner
- owner is the current plugin or approved contract surface

## 7.8 Ordered-child determinism tests
If `orderedChildSensitive: true`, generate:
- repeated normalization yields identical output
- order-dependent structures serialize stably

## 7.9 Entitlement-sensitive tests
If `entitlementSensitive: true`, generate:
- restricted output does not leak
- unauthorized read shapes differ appropriately from authorized ones

---

# 8. Repo-specific target architecture

For the current EmDash / dashingCommerce structure, keep this narrow and practical.

## Proposed location

```text
packages/plugins/commerce/
  src/
    contracts/
      checkout.ts
      catalog.ts
      webhooks.ts
    compliance/
      generator/
      runtime/
      snapshots/
  tests/
    compliance.generated/
```

## Division of responsibility

### `src/contracts/*`
Declares route and operation contracts.

### `src/compliance/generator/*`
Reads contract metadata and emits generated Vitest suites.

### `src/compliance/runtime/*`
Provides reusable helpers:
- invoke route
- inject fake context
- trace storage writes
- capture mutations
- assert idempotency
- assert schema-bound persistence

### `tests/compliance.generated/*`
Generated files checked into repo, or generated in CI before test execution.

---

# 9. Strong recommendation: generate files, do not only generate in memory

For your repo, I recommend generating concrete `*.generated.test.ts` files.

Reason:
- easy to review in PRs
- easy to diff
- easy to understand what is being enforced
- easier CI debugging
- less magic

## Best practical model

- contracts are source
- generator emits test files
- generated files are committed
- CI verifies generated files are up to date

---

# 10. Generation flow

## Step 1
Developer defines or updates a contract.

## Step 2
Generator runs:
```bash
pnpm commerce:generate-compliance
```

## Step 3
Generated test files appear under:
```text
packages/plugins/commerce/tests/compliance.generated/
```

## Step 4
CI runs:
- generation drift check
- lint
- typecheck
- compliance tests
- full test suite

## Step 5
PR fails if:
- generated tests were not updated
- generated tests fail
- contract metadata is incomplete

---

# 11. What the generator needs from the runtime layer

The generator should not know real storage internals.

It should rely on a thin compliance runtime adapter.

## Required adapter abilities

- invoke a route/handler with fake request context
- override HTTP method
- provide valid and invalid payload fixtures
- capture durable writes
- reset state between tests
- replay the same call
- inspect mutation results
- inspect emitted response shape

## Example runtime adapter

```ts
export interface ComplianceRuntimeAdapter {
  invokeRoute(args: {
    contract: AnyContract;
    method: string;
    body?: unknown;
    headers?: Record<string, string>;
  }): Promise<{ status: number; body: unknown }>;

  getWriteLog(): Array<{
    collection: string;
    operation: "insert" | "update" | "delete";
    payload: unknown;
  }>;

  reset(): Promise<void>;
}
```

This keeps generator logic clean and repo-specific logic isolated.

---

# 12. Required fixture strategy

Generated tests need valid and invalid inputs.

Do not try to infer perfect valid fixtures from schemas alone in v1.

That becomes brittle fast.

## Recommended model

Each contract must provide:

```ts
fixtures: {
  valid: () => unknown;
  invalid: Array<() => unknown>;
  replayKey?: () => string;
}
```

## Example

```ts
fixtures: {
  valid: () => ({
    cartId: "cart_123",
    email: "buyer@example.com"
  }),
  invalid: [
    () => ({}),
    () => ({ cartId: 123 }),
    () => ({ email: "not-an-email" })
  ],
  replayKey: () => "idem_checkout_cart_123"
}
```

This keeps the generator simple and reliable.

---

# 13. Recommended contract helper shape

Use explicit helpers, not giant generic meta-programming.

## Example

```ts
type RouteContract = {
  kind: "route";
  routeId: string;
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  path: string;
  requestSchema: ZodTypeAny;
  responseSchema?: ZodTypeAny;
  capabilities: string[];
  sideEffectful: boolean;
  replaySafe: boolean;
  requiresIdempotencyKey: boolean;
  mutationCollections: string[];
  orderedChildSensitive?: boolean;
  entitlementSensitive?: boolean;
  moneyPath?: boolean;
  fixtures: {
    valid: () => unknown;
    invalid: Array<() => unknown>;
    replayKey?: () => string;
  };
  handler: unknown;
};
```

Keep it boring. Boring wins here.

---

# 14. Generated suite examples

## Example generated method test

```ts
it("rejects disallowed methods for commerce.checkout.create", async () => {
  const res = await runtime.invokeRoute({
    contract,
    method: "GET",
    body: undefined,
  });
  expect(res.status).toBe(405);
});
```

## Example generated invalid payload test

```ts
it("does not mutate storage for invalid payload #1", async () => {
  await runtime.reset();
  const res = await runtime.invokeRoute({
    contract,
    method: contract.method,
    body: contract.fixtures.invalid[0](),
  });
  expect(res.status).toBeGreaterThanOrEqual(400);
  expect(runtime.getWriteLog()).toStrictEqual([]);
});
```

## Example generated replay test

```ts
it("is replay-safe for commerce.webhooks.stripe", async () => {
  await runtime.reset();

  const payload = contract.fixtures.valid();
  const first = await runtime.invokeRoute({
    contract,
    method: contract.method,
    body: payload,
    headers: { "idempotency-key": contract.fixtures.replayKey?.() ?? "replay-test-key" },
  });

  const writesAfterFirst = runtime.getWriteLog();

  const second = await runtime.invokeRoute({
    contract,
    method: contract.method,
    body: payload,
    headers: { "idempotency-key": contract.fixtures.replayKey?.() ?? "replay-test-key" },
  });

  const writesAfterSecond = runtime.getWriteLog();

  expect(second.status).toBe(first.status);
  expect(writesAfterSecond).toStrictEqual(writesAfterFirst);
});
```

---

# 15. Repo-specific rollout plan

Do this in phases.

## Phase 1 — Contracts for highest-risk surfaces
Start with:
- checkout create/update/finalize
- payment finalization
- webhook entry points
- catalog mutation routes

Goal:
- prove the model on the money-path and mutation-path surfaces first

## Phase 2 — Generated compliance for route safety
Generate:
- method enforcement tests
- invalid payload / no-write tests
- response shape tests

## Phase 3 — Replay and idempotency generation
Add:
- replay-safe tests for webhook and finalization contracts
- duplicate call convergence tests

## Phase 4 — Catalog and structure-sensitive rules
Add:
- ordered-child determinism generation
- asset/bundle normalization checks
- entitlement-sensitive read checks

## Phase 5 — Drift protection in CI
Add:
- generation drift check
- “no contract, no route” policy for production routes

---

# 16. The one rule that matters most

For production commerce routes:

**No contract → no generated compliance → no merge**

That one policy will change the quality of the codebase fast.

---

# 17. Recommended CI commands

Add scripts like:

```json
{
  "scripts": {
    "commerce:generate-compliance": "tsx packages/plugins/commerce/src/compliance/generator/generate.ts",
    "commerce:check-compliance-drift": "pnpm commerce:generate-compliance && git diff --exit-code packages/plugins/commerce/tests/compliance.generated",
    "commerce:test-compliance": "vitest run packages/plugins/commerce/tests/compliance.generated"
  }
}
```

CI order:

1. generate compliance
2. fail if generated files drift
3. lint
4. typecheck
5. run generated compliance tests
6. run full test suite

---

# 18. What should remain handwritten

Do not auto-generate these in v1:
- nuanced business rule tests
- pricing edge cases
- tax calculations
- payment-provider-specific logic
- long workflow orchestration
- performance tests
- concurrency torture tests

Those still need explicit human-written tests.

---

# 19. Practical guardrails

To keep this from turning into framework theater:

- do not attempt full schema fixture synthesis in v1
- do not over-generalize across every plugin immediately
- do not hide generator output
- do not build a giant DSL
- do not allow contracts to become detached from real handlers

The generator should be narrow, obvious, and harsh.

---

# 20. Final recommended implementation decision

For your current repo, I would do this:

## Adopt this exact policy
- every production commerce route gets a contract object
- every contract includes fixtures
- compliance tests are generated into committed files
- CI fails on drift
- money-path and webhook-path contracts are mandatory first

## Why this is the right next step
Because it directly supports your current priorities:
- package locality
- capability enforcement
- invariant testing
- explicit CI gating
- external review readiness
- backend hardening before UI expansion

---

# 21. Final summary

Use the document stack like this:

- `emdash_authoritative_spec.md` = constitutional law
- `emdash-dashingcommerce-repo-governance.md` = repo operating law
- `emdash-compliance-layer.md` = enforcement model
- `emdash-contract-driven-compliance.md` = next-level automation design

## Plain English
This new layer is how you move from:
“developers should remember the rules”

to:
“the repo generates the tests that prove the rules”
