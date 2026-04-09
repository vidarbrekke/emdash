# commerce-plugin-spec.md

## Status: AUTHORITATIVE (Supersedes all prior guides)

This document is the **single source of truth** for the commerce plugin.

It replaces:
- commerce-plugin-authoritative-guide.md
- any prior compliance or guide documents

---

## Purpose

Define **enforceable, non-negotiable rules** for how the commerce plugin is built, validated, and maintained.

This is not guidance.

This is a **contract**.

---

## Core Philosophy

- No ambiguity
- No duplication
- No silent failure
- No drift

Every rule in this document must be:
- testable
- enforceable
- verifiable in CI

---

## 1. Manifest (Single Source of Truth)

### Rule

The plugin manifest MUST exist in exactly one location.

```ts
export const COMMERCE_MANIFEST = {
  id: "commerce",
  version: "1.0.0",
  capabilities: [
    "network:fetch",
    "storage:kv",
    "cron:schedule",
    "admin:ui"
  ],
  network: {
    allowedHostnames: [
      "api.stripe.com"
    ]
  }
} as const;
```

### Requirements

- No duplication of:
  - id
  - version
  - capabilities
  - network config
- All plugin entrypoints MUST reference this constant

---

## 2. Capabilities (Strict Contract)

### Rule

Declared capabilities MUST exactly match runtime usage.

### Required

| Capability | Status |
|----------|--------|
| network:fetch | REQUIRED |
| storage:kv | REQUIRED |
| cron:schedule | REQUIRED |
| admin:ui | REQUIRED |

### Forbidden

- Using any `ctx.*` capability not declared
- Declaring unused capabilities

---

## 3. Runtime Invariants (Fail Fast)

### Rule

Missing required capabilities MUST throw immediately.

```ts
if (!ctx.kv) throw new Error("KV capability missing");
```

### Cron (optional)

```ts
if (ctx.cron) {
  await ctx.cron.schedule(...)
}
```

### Forbidden

- Silent fallback behavior
- Implicit assumptions

---

## 4. Network Policy (Zero Tolerance)

### Rules

- No wildcards (`*`) allowed
- Only explicit hostnames
- Only required endpoints

### Valid Example

```ts
network: {
  allowedHostnames: ["api.stripe.com"]
}
```

---

## 5. Lifecycle Contract

### Required

- onInstall
- onActivate
- onDeactivate

### Forbidden

- legacy hook names (e.g. "plugin:activate")
- undocumented lifecycle usage

---

## 6. Structure

```
src/
  index.ts
  handlers/
  storage/
  contracts/
```

### Rules

- Handlers = business logic only
- Storage = persistence only
- No cross-layer leakage
- No implicit dependencies

---

## 7. Testing (Mandatory)

### Required Test Coverage

- guide compliance
- webhook idempotency
- replay safety
- capability alignment
- network policy validation

### CI Rule

CI MUST fail if:
- any test fails
- any compliance rule is violated

---

## 8. Anti-Patterns (Hard Fail)

❌ Forbidden:

- Duplicate manifest definitions
- Wildcard network hosts
- Undeclared capability usage
- Legacy lifecycle hooks
- Drift between code and spec

---

## 9. Change Protocol (Critical)

Any change to:

- manifest
- capabilities
- network policy
- lifecycle behavior

REQUIRES:

1. Update this spec
2. Update tests
3. Explicit commit note explaining change

No exceptions.

---

## 10. Definition of Done

A change is complete ONLY if:

- All tests pass
- CI passes
- Spec remains valid
- No contract violations exist

---

## Final Statement

This plugin is:

- infrastructure
- a contract boundary
- a reference implementation

It must remain:

> deterministic, explicit, and enforceable

Deviation is not allowed.
