# EmDash / dashingCommerce Governance Stack (Repo-Specific True North)
Version: 1.0
Status: Repo-specific governance document
Applies to: EmDash monorepo, especially `packages/plugins/commerce`

---

## 1. Purpose

This document explains how the governance documents fit together for the current EmDash / dashingCommerce codebase, and adds the repo-specific rules needed to measure real code in this repository.

This is the document to use when reviewing or changing the current codebase.

---

## 2. Which documents are authoritative?

## Keep all three, but give them different authority levels

### A. `emdash_authoritative_spec.md`
**Role:** platform constitution  
**Authority level:** highest-level normative document  
**Purpose:** defines non-negotiable platform laws that apply across EmDash in general

Use it for:
- global invariants
- platform-wide architectural rules
- extension philosophy
- security posture
- determinism / idempotency / capability isolation

This document should remain stable and short.

---

### B. `emdash-compliance-layer.md`
**Role:** enforcement guide  
**Authority level:** implementation guidance for machine enforcement  
**Purpose:** explains how to turn the platform rules into lint rules, tests, and CI gates

Use it for:
- how rules are enforced
- what lint and compliance tests should exist
- what still needs repo-specific adaptation
- how CI should block regressions

This document is not the constitutional source of truth. It is the **enforcement playbook**.

---

### C. `emdash-dashingcommerce-repo-governance.md`  ← this document
**Role:** repo-specific operating law  
**Authority level:** highest practical authority for the current repo, subordinate only to the platform constitution  
**Purpose:** translates the general EmDash rules into concrete requirements for the actual dashingCommerce repository and current commerce plugin structure

Use it for:
- code review of the current repo
- developer handoff
- CI gate design
- deciding whether a specific implementation in `packages/plugins/commerce` is acceptable

---

## 3. Recommended authority order

When documents conflict, use this order:

1. **Platform constitution**  
   `emdash_authoritative_spec.md`

2. **Repo-specific governance**  
   `emdash-dashingcommerce-repo-governance.md`

3. **Enforcement playbook**  
   `emdash-compliance-layer.md`

4. **Local implementation docs / handoff docs / checklists**

### Practical meaning
- The authoritative spec says what is allowed in principle.
- The repo governance doc says how those principles apply in this monorepo today.
- The compliance layer says how to enforce those rules mechanically.

---

## 4. What you should keep

## Keep all three

Do **not** discard `emdash_authoritative_spec.md`.

Reason:
- the compliance layer is not a substitute for a governing spec
- the compliance layer explains enforcement, but does not fully define platform law
- the repo-specific governance doc should not replace the platform constitution, because you may later apply the same constitution to other plugins or modules

### Best setup
- keep `emdash_authoritative_spec.md` as the top-level constitutional document
- keep `emdash-compliance-layer.md` as the machine-enforcement guide
- add this repo-specific governance doc as the practical source of truth for the current monorepo

---

## 5. Repo scope

This governance applies to the current EmDash / dashingCommerce monorepo, with special focus on:

- `packages/plugins/commerce`
- commerce route registration and contract surfaces
- schema validation and storage boundaries
- checkout / payment finalization / webhook handling
- catalog, bundle, and entitlement-aware flows
- CI and compliance gates for core commerce behavior

This document assumes the current phase is:
- late hardening
- early external review readiness
- no broad UI-heavy expansion before backend confidence is locked

---

## 6. Repo-specific invariants

These are non-negotiable for the current dashingCommerce repo.

### 6.1 Capability locality
All platform or storage access must flow through the package-local contract surface or approved adapters.

**Forbidden:**
- direct bypass of package-local capability wrappers
- hidden access to D1, KV, queues, or platform runtime surfaces
- ad hoc external fetch calls outside declared and approved capability surfaces

### 6.2 Schema-before-write
No data may be persisted, mutated, finalized, or emitted to durable storage unless it has passed explicit schema validation.

**Required pattern:**
- parse / validate
- normalize
- persist

**Forbidden:**
- inferred writes from raw request payloads
- mutation paths that trust prior callers without validating again at the boundary

### 6.3 Route contract authority
Route definitions in the commerce plugin must remain contract-first.

**Required:**
- route registration must match declared contracts
- method enforcement must be explicit
- handler input/output shapes must align with schema definitions

**Forbidden:**
- implicit route behavior
- handler-only contract drift
- methods accepted by accident

### 6.4 Finalization idempotency
All payment finalization and order-completing flows must be durably idempotent.

**Required:**
- durable idempotency key or replay guard
- replay-safe writes
- repeated webhook or retry execution must converge on one valid terminal outcome

**Forbidden:**
- “probably once” semantics
- side effects before replay guard
- order completion based only on transient in-memory state

### 6.5 Webhook replay safety
Webhook handling must be replay-safe, order-tolerant where possible, and explicitly reject unsupported states.

**Required:**
- duplicate-event safety
- explicit event-state handling
- structured failure behavior

### 6.6 Ordered child determinism
Any ordered-child structures used by catalog, assets, bundles, or related models must normalize deterministically.

**Required:**
- canonical ordering rules
- stable normalization
- deterministic serialization / snapshots where relevant

### 6.7 Package-local extensibility
Core commerce must remain extensible without allowing extension code to punch through core boundaries.

**Required:**
- extension points go through contracts
- no tight cross-package source imports
- optional modules remain optional

### 6.8 Test-gated correctness
Core commerce behavior is not considered correct unless it is proven by automated tests.

**Must be tested:**
- idempotency
- replay safety
- route method enforcement
- schema-bound persistence
- ordered-child normalization
- entitlement-sensitive logic where applicable

---

## 7. Repo-specific forbidden patterns

The following should fail review and, where possible, fail CI.

### 7.1 Direct cross-plugin source imports
No importing internal source files from one plugin directly into another plugin.

Allowed:
- public contracts
- shared package exports
- explicit adapters

Forbidden:
- `../other-plugin/src/...`
- `packages/plugins/<other>/src/...`

### 7.2 Raw persistence from request payloads
No persistence call may consume raw request objects or partially validated payloads.

### 7.3 Side effects before replay guard
No finalization, order creation, or webhook mutation path may perform durable side effects before idempotency/replay protection is established.

### 7.4 Route definitions without explicit method guard
Every route must explicitly constrain allowed methods.

### 7.5 Storage mutation without schema parse
Every write path must prove validation occurred at the write boundary.

### 7.6 Capability adapter bypass
No direct runtime capability access where the repo expects an adapter boundary.

### 7.7 Hidden money-path behavior
No payment-sensitive behavior may be implicit, untested, or dependent on undocumented call order.

---

## 8. Required machine-checkable rules for this repo

These are the next rules that should exist in the real repo-specific compliance layer.

### 8.1 `no-storage-write-without-schema-parse`
Detect calls into storage mutation helpers unless the payload is derived from an approved schema parse or normalization result.

### 8.2 `no-route-without-method-guard`
Detect route definitions or handlers that do not explicitly constrain HTTP methods.

### 8.3 `no-finalize-without-idempotency-key`
Detect payment finalization or order-completion flows lacking durable replay/idempotency protection.

### 8.4 `no-capability-adapter-bypass`
Detect direct platform/runtime access outside approved adapters or package-local contract surfaces.

### 8.5 `no-cross-plugin-src-import`
Block direct imports from another plugin’s internal source tree.

### 8.6 `require-manifest-capabilities`
Require every production plugin to declare explicit capabilities.

### 8.7 `no-undeclared-fetch`
Block external network access unless explicitly declared and allowlisted.

### 8.8 `no-hardcoded-secrets`
Block obvious credentials in source.

---

## 9. Required compliance test harness suites for commerce

For `packages/plugins/commerce`, CI should eventually require at minimum the following test groups.

### 9.1 Manifest compliance
Proves:
- plugin manifest exists
- capabilities are declared
- collection ownership is declared where applicable

### 9.2 Route contract compliance
Proves:
- route contracts and handlers agree
- disallowed methods are rejected
- invalid payloads fail before business logic mutates state

### 9.3 Storage compliance
Proves:
- writes only happen after schema validation
- invalid payloads do not persist partial state
- read and mutation surfaces preserve normalized shapes

### 9.4 Checkout/finalization compliance
Proves:
- idempotent checkout completion
- repeated finalize calls converge
- duplicate provider callbacks do not create duplicate orders or side effects

### 9.5 Webhook replay compliance
Proves:
- repeated webhook delivery is safe
- out-of-order or unsupported events are handled explicitly
- terminal states remain terminal

### 9.6 Ordered-child normalization compliance
Proves:
- normalization is deterministic
- sorting behavior is stable
- repeated normalization yields identical output

### 9.7 Catalog mutation/read safety compliance
Proves:
- catalog mutations validate input
- reads return stable, contract-conforming shapes
- ordered child and asset relationships remain normalized

### 9.8 Entitlement-aware behavior compliance
Where applicable, proves:
- entitlement-sensitive reads are stable
- restricted data does not leak
- snapshots or derived state remain consistent

---

## 10. CI gating policy for current repo

Minimum merge gates for core commerce work should be:

1. lint
2. typecheck
3. unit tests
4. repo-specific compliance tests
5. invariant / regression suites for money-path and route safety

### Strong recommendation
No PR touching any of the following should merge without compliance coverage updates:
- checkout
- finalization
- webhooks
- schema or storage layers
- route registration
- catalog mutation flows
- ordered-child helpers
- entitlement-aware logic

---

## 11. Review checklist for developers and reviewers

When reviewing any change in `packages/plugins/commerce`, ask:

1. Does this change bypass a declared capability boundary?
2. Does every write still prove schema validation at the write boundary?
3. Could a retry or duplicate webhook produce duplicate side effects?
4. Are route methods explicitly enforced?
5. Does this introduce cross-plugin source coupling?
6. Does ordered-child or snapshot logic remain deterministic?
7. Does this require new compliance rules or compliance tests?
8. If this behavior matters in production, is it machine-checked?

If the answer to question 8 is “no,” the work is not finished.

---

## 12. Mapping to your current repo priorities

This document is tailored to the repo state you described:

### Current priorities it supports
- tightening package locality
- precise capability enforcement
- invariant tests
- explicit CI gating
- stable contract surfaces
- external review readiness
- keeping backend hardening ahead of UI expansion

### What it intentionally discourages right now
- broad feature expansion before invariants are locked
- admin/customer UI work that outruns backend guarantees
- extension growth without contract discipline
- clever abstractions that weaken testability or replay safety

---

## 13. Recommended file placement

Suggested top-level governance stack:

- `/emdash_authoritative_spec.md`
- `/emdash-compliance-layer.md`
- `/emdash-dashingcommerce-repo-governance.md`

Optional related files:
- `/HANDOVER.md`
- `/packages/plugins/commerce/CI_REGRESSION_CHECKLIST.md`
- `/packages/plugins/commerce/COMMERCE_EXTENSION_SURFACE.md`

---

## 14. Final recommendation

For your current codebase, the practical answer is:

- **Keep `emdash_authoritative_spec.md`**
- **Keep `emdash-compliance-layer.md`**
- **Add this repo-specific governance document**
- Treat **this repo-specific governance doc** as the main day-to-day review reference for the current EmDash / dashingCommerce monorepo

### One-line summary
- `emdash_authoritative_spec.md` = law
- `emdash-compliance-layer.md` = enforcement manual
- `emdash-dashingcommerce-repo-governance.md` = repo operating constitution

---

## 15. Final rule

If a change cannot be justified by:
1. the platform constitution,
2. this repo-specific governance doc, and
3. machine-checkable enforcement,

then it is not ready to merge.
