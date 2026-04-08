# commerce-plugin-factory.md

## Purpose

This document defines the factory layer that turns the commerce plugin spec into a repeatable, enforced construction pattern.

It exists to remove the last major source of drift:

> hand-built plugin registration.

With this factory in place, developers should not construct the commerce plugin directly. They should build through one factory only.

---

## What this adds

This factory introduces four guarantees:

1. **Single manifest injection**
   - the canonical manifest is imported once
   - plugin entrypoints do not redefine manifest metadata

2. **Boot-time validation**
   - invalid manifest shape fails immediately
   - wildcard hosts fail immediately
   - missing required capabilities fail immediately

3. **Runtime guards**
   - required resources like `kv` and `fetch` are asserted before handlers run

4. **Consistent plugin shape**
   - all lifecycle and route handlers are wrapped the same way

---

## Required rule

All commerce plugin entrypoints must use:

```ts
createCommercePlugin(...)
```

and must not export hand-assembled plugin objects.

---

## Recommended file layout

```text
src/
  manifest.ts
  contracts/
    commerce-plugin-factory.ts
  index.ts
  handlers/
  storage/
```

---

## Reference implementation included

Companion file:
- `commerce-plugin-factory.ts`

This file provides:

- `COMMERCE_MANIFEST`
- `validateManifest()`
- `validateNetworkPolicy()`
- `requireKV()`
- `requireFetch()`
- `optionalCron()`
- `createCommercePlugin()`
- `validateCommerceRuntime()`

---

## How developers should use it

### Example

```ts
import { createCommercePlugin } from "./contracts/commerce-plugin-factory";

export default createCommercePlugin({
  onActivate: async (ctx) => {
    // activation logic
  },
  routes: {
    "POST /checkout": async (ctx) => {
      // handler logic
    }
  },
  admin: {
    settingsSchema: {}
  }
});
```

### What developers should not do

```ts
export default {
  manifest: {
    id: "commerce",
    version: "1.0.0",
    capabilities: [...]
  },
  routes: { ... }
};
```

That is forbidden because it bypasses the shared contract layer.

---

## Enforcement model

| Layer | Enforcement |
|---|---|
| TypeScript | manifest shape and capability names |
| Factory | manifest validation and route wrapping |
| Runtime | capability assertions |
| CI | regression and drift prevention |

---

## Migration plan

1. Move manifest metadata to one shared constant.
2. Add the factory file under `src/contracts/`.
3. Replace direct plugin construction with `createCommercePlugin(...)`.
4. Update compliance tests so plugin exports are validated against the factory manifest.
5. Mark any old registration style as deprecated.

---

## Hard requirements

The factory must reject:

- wildcard network hosts
- wrong plugin id
- missing required capabilities
- empty hostname arrays

Handlers must fail fast on missing required runtime resources.

---

## What this solves

Without a factory:
- developers can rebuild the manifest inline
- wrappers can become inconsistent
- validation can be skipped
- runtime assumptions drift silently

With a factory:
- construction is standardized
- validation is automatic
- the plugin becomes much harder to misuse

---

## Bottom line

`commerce-plugin-spec.md` defines what must be true.

`commerce-plugin-contracts.md` defines how to enforce it.

`commerce-plugin-factory.ts` makes the correct path the default path.

That is the point:
> the safe path should also be the easiest path.
