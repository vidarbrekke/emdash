# commerce-plugin-authoritative-guide.md

## Purpose

This is the **single source of truth** for how the commerce plugin must be built, maintained, and extended.

Scope:
- Plugin-only (independent of EmDash internal limitations)
- Production-grade expectations
- Developer execution clarity (no ambiguity)

---

## Core Principles

1. **Guide is law**
All plugin behavior must align with `emdash_guide.md`.

2. **Single source of truth**
No duplicated manifest or configuration definitions.

3. **Fail fast**
Missing capabilities or invalid runtime assumptions must throw explicit errors.

4. **No hidden magic**
All behavior must be explicit, predictable, and testable.

5. **Stability over cleverness**
This is infrastructure, not experimentation.

---

## Plugin Contract (Required)

### Manifest (authoritative)

Must include:

- id
- version
- capabilities
- network.allowedHostnames

Example:

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
};
```

This must be the **only place** these values exist.

---

## Plugin Structure

```
src/
  index.ts
  handlers/
  storage/
  contracts/
```

Rules:
- No cross-layer leakage
- Handlers do not define infrastructure
- Storage layer is isolated

---

## Capability Usage Rules

| Capability | Rule |
|----------|------|
| storage:kv | Always assumed required |
| cron:schedule | Must be guarded at runtime |
| network:fetch | Only allowed hosts |
| admin:ui | Only declarative |

Never:
- access undeclared capability
- assume optional capability exists

---

## Runtime Guards (Required)

```ts
if (!ctx.kv) throw new Error("KV required");
if (!ctx.http?.fetch) throw new Error("HTTP fetch capability required");
if (!ctx.cron) throw new Error("Cron capability required");
```

Cron scheduling:

```ts
await ctx.cron.schedule("idempotency-cleanup", { schedule: "0 * * * *" });
```

---

## Network Policy

- No wildcards
- Explicit hosts only
- Least privilege only

---

## Lifecycle

Must use guide-defined lifecycle:

- onInstall
- onActivate
- onDeactivate

No legacy hook naming allowed.

---

## Testing (Non-Negotiable)

Must include:

- guide compliance tests
- idempotency tests
- webhook replay tests

CI must block if:
- capability mismatch
- network policy invalid
- lifecycle mismatch

---

## Anti-Patterns (Forbidden)

- Duplicate manifest definitions
- Implicit capability usage
- Wildcard network hosts
- Legacy lifecycle hooks
- Drift between docs and code

---

## Definition of Done

A change is complete only if:

- Tests pass
- CI passes
- Manifest is unchanged or intentionally updated
- No guide violations

---

## Bottom Line

This plugin is:

- infrastructure
- reference implementation
- contract boundary

Treat it accordingly.
