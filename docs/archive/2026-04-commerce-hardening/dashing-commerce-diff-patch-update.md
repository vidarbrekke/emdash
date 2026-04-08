# DashingCommerce — Diff Patch Plan Update
> historical reference for Strategy A hardening

## Patch 1 — Atomic Lock Release

Replace:

get → check → delete

With:

- CAS delete OR
- conditional delete helper

Pseudo:

if (current.version === expectedVersion) delete

---

## Patch 2 — Conditional Receipt Persist

Replace:

await receipts.put(...)

With:

await receipts.compareAndSwap({
  expectedVersion,
  newValue
})

---

## Patch 3 — Attribute Mutation Guard

Add phases:

1. PLAN
2. VALIDATE
3. APPLY
4. CLEANUP

Ensure:
- no destructive delete before safe state exists

---

## Patch 4 — Remove Dead Degraded Mode

Search:
- allowDegradedMode
- fallback branches

Either:
- remove OR
- enforce config

---

## Patch 5 — Tests

Add explicit race simulations for:
- checkout release
- finalize overwrite

---

## Final Note

You are now solving **edge correctness**, not architecture.

Keep changes surgical.
