# GOVERNANCE_INDEX.md
Version: 1.0  
Purpose: Single entry point for all governance, rules, and enforcement in EmDash / dashingCommerce

---

# 1. Why this exists

This file ensures every developer:
- reads the **right documents**
- in the **right order**
- with the **right expectations**

If you skip this order, you will misunderstand the system.

---

# 2. Required reading order (DO NOT SKIP)

## Step 1 — Repo Operating Rules
👉 `emdash-dashingcommerce-repo-governance.md`

This is your **primary working document**.

It defines:
- what is allowed in this repo
- what is forbidden
- what must pass before merge

If your code violates this file, it is wrong.

---

## Step 2 — Enforcement Layer
👉 `emdash-compliance-layer.md`

This tells you how rules are **machine-enforced**.

It defines:
- lint rules
- compliance tests
- CI gates

If your code is not enforced by this layer, it is not complete.

---

## Step 3 — Platform Constitution (Reference only)
👉 `emdash_authoritative_spec.md`

This is the **highest-level law**.

Use it for:
- architectural decisions
- resolving disagreements
- understanding “why”

Do NOT start here.

For implementation and review work, start from `GOVERNANCE_INDEX.md` and `emdash-dashingcommerce-repo-governance.md`, then verify against `docs/compliance-source-of-truth.md`.

---

# 3. Mental model (keep this in your head)

- Repo governance = **what you must do**
- Compliance layer = **how you prove it**
- Authoritative spec = **why it exists**

---

# 4. Before writing any code

You must be able to answer:

1. What invariant am I touching?
2. What compliance test will prove this works?
3. What rule would break if I did this wrong?
4. Where is idempotency handled (if applicable)?
5. Where is schema validation enforced?

If you cannot answer all five, stop.

---

# 5. Before opening a PR

Your change MUST:

- pass lint
- pass typecheck
- pass unit tests
- pass compliance tests
- preserve all invariants

Additionally, verify:

- no capability boundary violations
- no schema-less writes
- no non-idempotent money-path logic
- no cross-plugin source imports
- no implicit route behavior

---

# 6. High-risk areas (require extra care)

Any change touching these MUST include compliance tests:

- checkout
- payment finalization
- webhook handling
- schema / storage layer
- route registration
- catalog mutation
- ordered-child logic
- entitlement-aware logic

---

# 7. What “done” actually means

Your work is NOT done when:
- it works locally
- tests pass
- types compile

Your work IS done when:
- invariants are preserved
- behavior is machine-checked
- CI would catch regressions
- another developer cannot misuse your code

---

# 8. Common failure modes (avoid these)

- Writing code before identifying invariants
- Adding logic without adding compliance tests
- Trusting upstream validation without enforcing it locally
- Introducing hidden side effects
- Skipping idempotency in async flows
- Bypassing capability boundaries “just this once”

---

# 9. If something feels unclear

Do NOT guess.

Check:
1. repo governance doc
2. compliance layer
3. authoritative spec

If still unclear:
→ ask before implementing

---

# 10. Final rule

If your change cannot be:
- explained by governance
- enforced by compliance
- validated by tests

it should not be merged.
