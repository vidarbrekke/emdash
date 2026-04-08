# commerce-plugin-auto-enforcement.md

## Purpose

This document converts the commerce plugin spec into a **machine-readable checklist + auto-fix guidance**.

It is designed for:
- AI developers
- CI systems
- automated code review tools

---

## Enforcement Model

Each rule includes:

- **ID**
- **Check**
- **Fail Condition**
- **Auto-Fix Strategy**

---

## RULES

### RULE-001: Single Manifest Source

**Check**
- Only one `COMMERCE_MANIFEST` exists

**Fail if**
- Multiple manifest definitions found
- Inline manifest objects detected

**Auto-fix**
- Extract manifest to `/manifest.ts`
- Replace all inline definitions with import

---

### RULE-002: Capability Alignment

**Check**
- All used `ctx.*` capabilities are declared

**Fail if**
- `ctx.kv` used but not declared
- unused capabilities declared

**Auto-fix**
- Add missing capability OR remove usage
- prune unused capabilities

---

### RULE-003: No Wildcard Hosts

**Check**
- `allowedHostnames` contains no `*`

**Fail if**
- any hostname includes `*`

**Auto-fix**
- replace with explicit domains
- infer domains from usage if possible

---

### RULE-004: Factory Usage

**Check**
- plugin is created via `createCommercePlugin`

**Fail if**
- default export is object literal

**Auto-fix**
- wrap object in `createCommercePlugin(...)`

---

### RULE-005: Runtime Guards

**Check**
- required capabilities validated

**Fail if**
- `ctx.kv` accessed without `requireKV`
- `fetch` used without guard

**Auto-fix**
- wrap access with helper:
  - `requireKV(ctx)`
  - `requireFetch(ctx)`

---

### RULE-006: Lifecycle Compliance

**Check**
- only allowed lifecycle hooks used

**Fail if**
- `"plugin:activate"` or legacy hooks found

**Auto-fix**
- convert to:
  - `onInstall`
  - `onActivate`
  - `onDeactivate`

---

### RULE-007: No Manifest Drift

**Check**
- exported plugin manifest === COMMERCE_MANIFEST

**Fail if**
- mismatch detected

**Auto-fix**
- replace plugin manifest with shared constant

---

### RULE-008: No Silent Fallbacks

**Check**
- no optional chaining for required capabilities

**Fail if**
- `ctx.kv?.` used
- fallback logic for required resources

**Auto-fix**
- replace with assertion

---

### RULE-009: Test Coverage

**Check**
- compliance tests exist and pass

**Fail if**
- missing or failing tests

**Auto-fix**
- generate baseline tests:
  - manifest validation
  - network validation
  - capability checks

---

## CI INTEGRATION

CI MUST:

1. Run all rule checks
2. Fail on any violation
3. Output:
   - rule ID
   - file
   - fix suggestion

---

## AI EXECUTION LOOP

When used by an AI agent:

1. Scan codebase
2. Evaluate all rules
3. For each failure:
   - apply auto-fix
4. Re-run checks
5. Repeat until clean

---

## FINAL STATE REQUIREMENT

Codebase is valid only when:

- zero rule violations
- tests pass
- manifest is consistent
- factory is used everywhere

---

## FINAL PRINCIPLE

> If it cannot be enforced automatically, it is not a rule.

All rules in this document are enforceable.
