# commerce-plugin-governance-index.md

## Purpose

This document defines the **complete governance pack** for evaluating the current commerce plugin and guiding all future development.

Use this file as the **entrypoint**.

It tells any developer, reviewer, or AI agent:

- which documents are authoritative
- which documents are supporting
- what order to read them in
- which files enforce rules
- which files are historical or deprecated

---

## Authority Order (Highest to Lowest)

### 1. `commerce-plugin-spec.md` — **Ultimate arbiter**
This is the single highest-authority document for the plugin.

It defines:
- mandatory invariants
- manifest rules
- capability rules
- lifecycle rules
- network policy
- definition of done

If any other document conflicts with this one, **this document wins**.

---

### 2. `commerce-plugin-contracts.md` — **Enforcement contract**
This translates the spec into:
- TypeScript contracts
- runtime assertions
- manifest validation rules

Use this to turn policy into enforceable code.

---

### 3. `commerce-plugin-factory.ts` — **Canonical implementation pattern**
This is the required construction path.

It should be used to:
- inject the canonical manifest
- validate at boot time
- wrap runtime handlers consistently

No hand-built plugin registration should bypass this.

---

### 4. `commerce-plugin-factory.md` — **Factory usage guide**
Explains how to use the factory properly and why it exists.

---

### 5. `commerce-plugin-developer-execution.md` — **Developer operating prompt**
This is the handoff prompt for a human developer or AI developer.

Use it to tell an implementer:
- what to read
- what to do now
- what to preserve later
- what is forbidden

---

### 6. `commerce-plugin-auto-enforcement.md` — **Machine-readable rule set**
This is the checklist for:
- AI agents
- CI rule engines
- automated review tools

Use it to automate detection and suggested fixes.

---

## Evaluation / Review Documents

These are important, but they are not the top authority.

### 7. `guide-compliance-review_full.md` — **Comprehensive assessment**
Use this to understand:
- what was wrong
- why it mattered
- what needed to change

This is diagnostic, not normative.

---

### 8. `guide-compliance-diff-patch-plan.md` — **Remediation plan**
Use this for:
- file-by-file patch guidance
- implementation sequencing
- PR planning

This is execution guidance, not the top authority.

---

### 9. `guide-compliance-ci-checklist.md` — **CI review checklist**
Use this to:
- gate PRs
- ensure compliance remains enforced

---

### 10. `commerce-guide-compliance.test.ts` — **Compliance regression test**
Use this in CI to make sure the plugin does not drift from required rules.

---

### 11. `critical-progress-review.md` — **Progress audit**
Use this to understand:
- how far the plugin got
- where process and system risks remained
- what still needed tightening

This is a review artifact.

---

## Platform Context Document

### 12. `emdash-platform-gap-analysis.md` — **Third-party platform context**
This is separate from plugin governance.

Use this only for:
- context about EmDash limitations
- understanding platform friction
- long-term architectural awareness

Do NOT weaken plugin standards because of this file.

The plugin documents remain authoritative for the plugin.

---

## Deprecated / Superseded

### 13. `commerce-plugin-authoritative-guide.md` — **Deprecated**
This document has been superseded by:

- `commerce-plugin-spec.md`

Keep only for historical reference if needed.

---

## Required Reading Order

Any developer or AI working on the plugin MUST read in this order:

1. `commerce-plugin-spec.md`
2. `commerce-plugin-contracts.md`
3. `commerce-plugin-factory.md`
4. `commerce-plugin-developer-execution.md`
5. `commerce-plugin-auto-enforcement.md`

Only then should they begin implementation.

For historical context or prior reasoning, read afterward:

6. `guide-compliance-review_full.md`
7. `guide-compliance-diff-patch-plan.md`
8. `critical-progress-review.md`

---

## Required Files To Hand To A Developer

Minimum required pack:

- `commerce-plugin-spec.md`
- `commerce-plugin-contracts.md`
- `commerce-plugin-factory.ts`
- `commerce-plugin-factory.md`
- `commerce-plugin-developer-execution.md`
- `commerce-plugin-auto-enforcement.md`

Recommended full pack:

- all of the above, plus
- `guide-compliance-review_full.md`
- `guide-compliance-diff-patch-plan.md`
- `guide-compliance-ci-checklist.md`
- `commerce-guide-compliance.test.ts`
- `critical-progress-review.md`

---

## Practical Use

### To evaluate the current code
Use:
- `commerce-plugin-spec.md`
- `commerce-plugin-auto-enforcement.md`
- `guide-compliance-ci-checklist.md`
- `commerce-guide-compliance.test.ts`
- `critical-progress-review.md`

### To guide future development
Use:
- `commerce-plugin-spec.md`
- `commerce-plugin-contracts.md`
- `commerce-plugin-factory.ts`
- `commerce-plugin-factory.md`
- `commerce-plugin-developer-execution.md`
- `commerce-plugin-auto-enforcement.md`

---

## Definition of Governance Completion

You have the full governance system only when:

- the spec exists
- enforcement contracts exist
- the factory exists
- developer execution guidance exists
- machine-readable auto-enforcement exists
- CI compliance checks exist

This pack provides all of that.

---

## Final Rule

If there is any conflict:

1. `commerce-plugin-spec.md` wins
2. then `commerce-plugin-contracts.md`
3. then `commerce-plugin-factory.ts`
4. then the remaining supporting docs

This rule is absolute.
