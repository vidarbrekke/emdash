# commerce-plugin-developer-execution.md

## Purpose

This document is the **single instruction prompt** for the developer (human or AI) responsible for implementing and maintaining the commerce plugin under the new contract-driven architecture.

It consolidates:
- rules
- execution steps
- enforcement expectations

---

## Required Inputs

You MUST use the following documents as authoritative sources:

- `commerce-plugin-spec.md` → rules (source of truth)
- `commerce-plugin-contracts.md` → enforcement layer
- `commerce-plugin-factory.ts` → required construction pattern
- `commerce-plugin-factory.md` → usage guidance

---

## Execution Order (Strict)

You MUST process documents in this order:

1. `commerce-plugin-spec.md`
2. `commerce-plugin-contracts.md`
3. `commerce-plugin-factory.md`

Do not start coding before understanding all three.

---

## Short-Term Tasks (Immediate Execution)

### 1. Refactor Plugin Construction

- Replace any manual plugin definition with:

```ts
createCommercePlugin(...)
```

- Remove ALL duplicated manifest definitions
- Ensure a single `COMMERCE_MANIFEST` is used everywhere

---

### 2. Enforce Runtime Safety

- All required capabilities MUST be validated:
  - `kv` → required
  - `fetch` → required
- Use provided helpers:
  - `requireKV`
  - `requireFetch`

Forbidden:
- direct unguarded `ctx.*` access
- silent fallback behavior

---

### 3. Validate Compliance

- Run all tests
- Fix ALL compliance violations
- Do NOT introduce workarounds

---

## Medium-Term Tasks (Stabilization)

### 1. Normalize Handlers

- No handler may assume implicit context
- All routes must function under enforced guards

---

### 2. Remove Legacy Patterns

- No inline manifests
- No legacy lifecycle hooks
- No duplicated configuration

---

### 3. Strengthen Tests

Add tests for:

- capability enforcement
- network policy validation
- webhook idempotency
- replay safety

---

## Long-Term Responsibilities (Ongoing)

### 1. Treat Spec as Law

Any change to:

- manifest
- capabilities
- lifecycle
- network policy

REQUIRES:

1. updating `commerce-plugin-spec.md`
2. updating tests
3. explicit commit explanation

---

### 2. Preserve Invariants

Never allow:

- wildcard network hosts
- undeclared capabilities
- silent failures
- drift between spec and code

---

### 3. Enforce Factory Usage

All plugin construction MUST go through:

```ts
createCommercePlugin(...)
```

No exceptions.

---

## Non-Negotiables

❌ Forbidden:

- duplicate manifest definitions
- unguarded capability access
- legacy lifecycle hooks
- implicit assumptions
- bypassing the factory

---

## Conflict Resolution

If any code conflicts with documentation:

- Assume `commerce-plugin-spec.md` is correct
- Update the code
- Do NOT bypass constraints

---

## Definition of Done

A change is complete ONLY if:

- all tests pass
- CI passes
- spec remains valid
- no invariants are violated

---

## Final Outcome

The plugin must become:

> deterministic, self-validating, and impossible to misuse

---

## Final Instruction (Prompt)

You are implementing a contract-driven commerce plugin.

Your job is to:

- strictly follow the spec
- enforce all invariants
- eliminate ambiguity
- prevent drift

Do not improvise.
Do not bypass constraints.
Do not introduce hidden behavior.

Build a system that is:

- explicit
- enforceable
- stable

If unsure:
- default to strictness
- default to safety
- default to the spec

This is infrastructure, not experimentation.
