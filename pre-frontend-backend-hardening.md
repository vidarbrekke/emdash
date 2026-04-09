# pre-frontend-backend-hardening.md

## Purpose

This document defines the **final backend hardening requirements** that must be completed before any front-end (admin or customer) development begins.

This is not optional polish.

This is about ensuring the backend is:
- stable
- predictable
- secure
- contract-driven

---

## Core Principle

> Do not build UI on unstable backend contracts.

Every issue listed here will:
- cause UI churn later
- create hidden bugs
- increase long-term maintenance cost

---

## 1. Auth & Exposure Boundaries (Critical)

### Goal
Ensure strict separation between:
- public (storefront) routes
- admin (privileged) routes

### Required Work

- Verify all admin routes require auth
- Verify public routes do not expose admin fields
- Add tests:
  - unauthorized access to admin routes fails
  - public routes never leak sensitive data
- Snapshot response shapes for both contexts

---

## 2. Capability Enforcement (Precision)

### Goal
Each route requires only what it actually uses.

### Required Work

- Audit all routes:
  - remove unnecessary `withFetch` or `withKV`
- Ensure:
  - fetch only used where needed (checkout/webhooks)
  - KV used only where required
- Add test coverage:
  - verify wrapping consistency per route

---

## 3. Settings Validation (High Priority)

### Goal
Settings must be validated at runtime and fail clearly.

### Required Work

- Validate:
  - Stripe keys (presence + format)
  - default currency (strict format)
- Add:
  - clear error messages
  - fallback behavior only if explicitly defined
- Add tests:
  - missing config
  - malformed config
  - partial config

---

## 4. API Contract Stability (UI-Blocking)

### Goal
Freeze backend response shapes for UI consumption.

### Required Work

- Define stable responses for:
  - product listing
  - product detail
  - cart
  - checkout
  - admin endpoints
- Add tests:
  - snapshot response shapes
  - consistent error structure
- Ensure:
  - no accidental fields
  - no leaking internal structures

---

## 5. Idempotency & Concurrency (Money Path)

### Goal
Ensure checkout and webhook flows are bulletproof.

### Required Work

- Add concurrency tests:
  - simultaneous checkout + webhook
  - repeated webhook delivery
- Validate:
  - no duplicate stock changes
  - no duplicate fulfillment
- Test:
  - partial failures
  - retry behavior
  - stale cart scenarios

---

## 6. Storage & Index Discipline

### Goal
Prevent silent schema drift.

### Required Work

- Document:
  - storage keys
  - index definitions
- Add tests:
  - index shape validation
  - read/write consistency
- Ensure:
  - no accidental schema changes

---

## 7. Error Taxonomy (Critical for UI)

### Goal
Standardize error handling across all routes.

### Required Work

Define categories:
- validation
- auth
- not_found
- conflict
- provider
- internal

Ensure:
- consistent response structure
- consistent status codes
- no ad-hoc errors

Add tests for:
- representative failures across all major flows

---

## 8. Extension & Provider Safety

### Goal
Ensure external integrations cannot break core logic.

### Required Work

- Test:
  - missing recommendation provider
  - provider failure scenarios
- Ensure:
  - no mutation from read-only providers
  - isolation from core state
- Validate:
  - webhook/provider cannot bypass invariants

---

## 9. Cron & Operational Behavior

### Goal
Ensure operational tasks are predictable.

### Required Work

- Test:
  - cron scheduling idempotency
  - cleanup boundaries
- Ensure:
  - no duplicate scheduling
  - safe cleanup execution

---

## 10. CI & Enforcement

### Goal
Guarantee backend correctness is enforced.

### Required Work

- Ensure CI runs:
  - compliance tests
  - invariant tests
- Fail CI on:
  - contract violations
  - schema drift
  - capability misuse

---

## Definition of Done

Backend is ready for frontend only when:

- auth boundaries are verified and tested
- routes require only necessary capabilities
- settings validation is strict and tested
- API response contracts are stable and tested
- checkout/webhook flows are concurrency-safe
- storage schema is protected
- error handling is consistent
- extension seams are safe
- cron behavior is deterministic
- CI enforces all of the above

---

## Final Instruction

Do not start front-end work until this checklist is complete.

This is the difference between:
- a system that “works”
- a system that is **safe to build on**
