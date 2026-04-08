# DashingCommerce — Execution Plan Update

## Priority

### P0 — Final Concurrency Closure

#### Task 1 — Atomic Lock Release
- Replace delete with conditional delete or CAS

#### Task 2 — Conditional Receipt Persistence
- Replace `put()` with CAS write
- Fail/no-op if ownership lost

---

### P1 — Mutation Integrity

#### Task 3 — Attribute Replacement Hardening
- Introduce mutation phase markers
- Ensure readers don’t see mixed state

---

### P2 — Codebase Clarity

#### Task 4 — Remove or Fully Implement Degraded Mode
- Eliminate dead branches OR fully wire config

---

### P3 — Tests

Add:
- lock race during release
- finalize race before receipt persist

---

## Definition of Done

- No remaining TOCTOU in checkout
- Finalize writes ownership-safe
- No dead-mode ambiguity
