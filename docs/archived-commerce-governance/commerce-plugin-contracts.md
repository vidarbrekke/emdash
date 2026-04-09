# commerce-plugin-contracts.md

## Purpose

This document defines the **TypeScript contracts and runtime assertion utilities** that enforce `commerce-plugin-spec.md`.

Goal:
- move enforcement from “documentation + CI” → **compile-time + runtime guarantees**

---

## 1. Type-Level Manifest Contract

### Definition

```ts
export type CommerceCapability =
  | "network:fetch"
  | "storage:kv"
  | "cron:schedule"
  | "admin:ui";

export type CommerceManifest = {
  id: "commerce";
  version: string;
  capabilities: readonly CommerceCapability[];
  network: {
    allowedHostnames: readonly string[];
  };
};
```

---

## 2. Strongly Typed Manifest Constant

```ts
export const COMMERCE_MANIFEST: CommerceManifest = {
  id: "commerce",
  version: "1.0.0",
  capabilities: [
    "network:fetch",
    "storage:kv",
    "cron:schedule",
    "admin:ui"
  ],
  network: {
    allowedHostnames: ["api.stripe.com"]
  }
};
```

### Guarantees

- Compile-time validation of structure
- Prevents invalid capability strings
- Prevents missing required fields

---

## 3. Runtime Assertion Utilities

### assert()

```ts
export function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(`[CommercePlugin] ${message}`);
  }
}
```

---

### Capability Guards

```ts
export function requireKV(ctx: any) {
  assert(ctx.kv, "KV capability missing");
  return ctx.kv;
}

export function optionalCron(ctx: any) {
  return ctx.cron ?? null;
}
```

---

## 4. Network Policy Validator

```ts
export function validateNetworkPolicy(hosts: readonly string[]) {
  for (const host of hosts) {
    if (host.includes("*")) {
      throw new Error("Wildcard hosts are forbidden");
    }
  }
}
```

Call at startup:

```ts
validateNetworkPolicy(COMMERCE_MANIFEST.network.allowedHostnames);
```

---

## 5. Manifest Integrity Check

```ts
export function validateManifest(manifest: CommerceManifest) {
  assert(manifest.id === "commerce", "Invalid plugin id");

  assert(
    manifest.capabilities.includes("storage:kv"),
    "Missing required capability: storage:kv"
  );

  validateNetworkPolicy(manifest.network.allowedHostnames);
}
```

---

## 6. Single Source Enforcement

### Rule

All plugin entrypoints MUST import:

```ts
import { COMMERCE_MANIFEST } from "./manifest";
```

### Forbidden

- redefining manifest inline
- partial manifest copies
- shadow config objects

---

## 7. CI + Runtime Alignment

| Layer | Enforces |
|------|---------|
| TypeScript | shape + capability correctness |
| Runtime assertions | presence + safety |
| CI tests | regression + drift |

---

## 8. Optional (Advanced Hardening)

### Freeze manifest

```ts
Object.freeze(COMMERCE_MANIFEST);
```

---

### Deep equality test

Ensure runtime plugin uses exact manifest:

```ts
expect(plugin.manifest).toEqual(COMMERCE_MANIFEST);
```

---

## 9. Definition of Done

A feature is complete ONLY if:

- TypeScript passes
- runtime assertions pass
- CI tests pass
- manifest integrity holds

---

## Final Statement

This document converts the spec into:

> **enforced reality**

Not optional. Not advisory. Not bypassable.
