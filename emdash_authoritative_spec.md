# EmDash Authoritative Specification (True North)
Version: 1.0
Status: Enforceable Specification
Scope: All plugins, extensions, and core modules

---

## 1. Purpose

This document defines the non-negotiable rules, invariants, and contracts that all EmDash code must follow.

If any implementation conflicts with this document, this document is correct.

---

## 2. System Invariants

The following invariants MUST NOT be violated.

### 2.1 Determinism
All plugin logic must produce identical outputs for identical inputs, unless a contract explicitly declares a controlled nondeterministic dependency.

### 2.2 Idempotency
All side effects, including writes, webhooks, retries, and external provider interactions, must be safe to replay.

### 2.3 Capability Isolation
Plugins must not access resources outside their declared capabilities.

### 2.4 Schema Enforcement
All data mutations must pass strict schema validation at the mutation boundary.

### 2.5 Replay Safety
All asynchronous flows, especially webhooks, queue jobs, and finalization paths, must be replay-safe.

### 2.6 Explicit Data Ownership
Each durable collection must have a single owning module or plugin.

---

## 3. Plugin Contract

Every plugin must expose an explicit contract.

```ts
export interface EmDashPlugin {
  manifest: PluginManifest;
  routes?: RouteDefinition[];
  handlers?: {
    onRequest?: Handler;
    onWebhook?: Handler;
  };
}
```

### 3.1 Plugin Manifest

```ts
type PluginManifest = {
  name: string;
  version: string;
  capabilities: {
    d1?: boolean;
    kv?: boolean;
    fetch?: string[]; // allowlisted domains
  };
  collections?: Record<string, { owner: string }>;
};
```

---

## 4. Capability Model

### Rules
- Capabilities must be declared explicitly.
- Undeclared access must fail hard.
- Network access must be allowlisted.
- Capabilities must be narrow, not broad by default.

### Valid example

```ts
capabilities: {
  d1: true,
  fetch: ["https://api.stripe.com"]
}
```

### Invalid example

```ts
fetch("https://random-api.example") // forbidden if not declared
```

---

## 5. Data Model and Ownership

### Rules
- Each collection has exactly one owner.
- Other modules may read through approved contracts, but may not mutate directly.
- Schema changes must be versioned or explicitly migrated.
- Data shape must be validated before any persistence or durable mutation.

### Example schema

```ts
const ProductSchema = z.object({
  id: z.string(),
  name: z.string(),
  price: z.number()
});
```

---

## 6. Lifecycle Model

Every plugin operates within an explicit lifecycle:

1. manifest validation
2. initialization
3. request handling
4. async processing
5. safe retries / replay
6. controlled teardown, if applicable

No code may rely on hidden lifecycle assumptions.

---

## 7. Error and Failure Model

### Standard error shape

```ts
type EmDashError = {
  code: string;
  message: string;
  retryable: boolean;
};
```

### Rules
- All errors must be structured.
- Retryable operations must be marked explicitly.
- Silent failures are forbidden.
- Failure paths must not corrupt durable state.
- Partial side effects must be prevented or reconciled deterministically.

---

## 8. Testing Requirements

Every production plugin must include machine-checkable validation.

### Minimum required classes
1. contract tests
2. schema validation tests
3. idempotency tests
4. replay tests
5. capability enforcement tests

### Rule
If a production behavior matters, it must be testable and enforced.

---

## 9. Security Requirements

- All inputs must be validated.
- Secrets must never be hardcoded.
- External calls must be allowlisted.
- Authentication and authorization boundaries must be explicit.
- Sensitive data access must be minimized and auditable.

---

## 10. Performance Constraints

- Plugins must execute within the intended runtime limits.
- Long-running synchronous tasks are forbidden on request paths.
- Heavy work must be deferred, queued, or isolated.
- Storage and network access must be bounded and intentional.

---

## 11. Extension Philosophy

- Core must remain minimal and stable.
- Extensions must be optional and replaceable.
- No tight cross-plugin coupling.
- Shared behavior must flow through contracts, not hidden internals.
- A platform that cannot safely host extensions is not finished.

---

## 12. Forbidden Anti-Patterns

The following patterns are forbidden:

- hidden side effects
- cross-plugin direct source imports
- non-idempotent writes
- schema-less persistence
- unbounded external requests
- implicit capability use
- contract drift between handler and route behavior
- durable mutation before validation

---

## 13. Enforcement

Code that violates this specification must be:
- rejected in review
- blocked in CI where mechanically enforceable
- refactored before release

Human agreement is not a substitute for enforcement.

---

## 14. Interpretation Rule

If behavior is not explicitly defined, constrained, and testable, it is not ready to be treated as production-safe.

---

## 15. Final Principle

If a system cannot state:
- what it allows,
- what it forbids,
- what it guarantees, and
- how it proves those guarantees,

then it is not governed tightly enough to support production-critical commerce infrastructure.
