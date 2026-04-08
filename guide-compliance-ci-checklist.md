# DashingCommerce Guide Compliance CI Checklist

## Purpose

This checklist turns `emdash_guide.md` into an explicit CI gate for `packages/plugins/commerce`.

The goal is simple:
- fail fast when the plugin drifts from the documented EmDash contract
- keep the commerce plugin suitable as an external-facing reference implementation
- make guide compliance a regression-tested property, not a review-time opinion

---

## What CI Must Enforce

### 1. Manifest capability coverage
The plugin must declare every capability it actually uses.

Current minimum expected set, based on guide compliance and observed plugin behavior:
- `network:fetch`
- `storage:kv`
- `cron:schedule`
- `admin:ui`

Fail CI if any are missing.

---

### 2. Guide-shaped network policy
The plugin must use the guide’s documented network manifest shape:

```ts
network: {
  allowedHostnames: ["api.stripe.com"]
}
```

Fail CI if:
- `network.allowedHostnames` is absent
- legacy `allowedHosts` is used instead
- any hostname contains `*`

---

### 3. Official import surface
The plugin entrypoint must import `definePlugin` from the guide-documented path:

```ts
import { definePlugin } from "emdash/plugin";
```

Fail CI if the source imports `definePlugin` from `emdash` instead.

---

### 4. Guide-aligned lifecycle shape
The plugin must use the documented lifecycle surface.

Guide-approved lifecycle/API surface:
- `onInstall`
- `onActivate`
- `onDeactivate`
- `onRequest`
- documented event hooks like `content:afterSave`

Fail CI if source relies on undocumented lifecycle strings such as:
- `plugin:activate`
- `cron` hook bucket as a manifest lifecycle substitute

Note: if the runtime truly requires these forms, the guide must be updated first, then the tests should be updated to match the new source of truth.

---

### 5. External-facing version pinning
The plugin package must not use floating EmDash peer dependency versions.

Fail CI if `packages/plugins/commerce/package.json` contains:
- `"emdash": "workspace:*"`
- `"emdash": "latest"`
- `"emdash": "*"`

Expected direction:
- pin a concrete semver range for the externally published package

---

### 6. Single-source manifest discipline
The repo should have one canonical manifest definition.

This is harder to enforce mechanically at first, so treat it as a review checklist item unless you later codify it.

Soft gate for now:
- `commercePlugin()` and `createPlugin()` must expose the same id/version/capability/network values

Hard gate later:
- shared `COMMERCE_MANIFEST` constant used by both

---

## Required Test Files

Add these tests under `packages/plugins/commerce/src/contracts/`:

- `guide-manifest-compliance.test.ts`
- `guide-source-compliance.test.ts`
- optionally later: `guide-doc-drift.test.ts`

The first two are enough to block the current regressions.

---

## CI Commands

Add a dedicated script:

```json
{
  "scripts": {
    "test:guide-compliance": "vitest run src/contracts/guide-*.test.ts",
    "check": "pnpm run typecheck && pnpm run lint && pnpm run test:webhook-receipt-reason-guard && pnpm run test:guide-compliance"
  }
}
```

If you want stricter separation:

```json
{
  "scripts": {
    "check:guide": "vitest run src/contracts/guide-*.test.ts",
    "check": "pnpm run typecheck && pnpm run lint && pnpm run test && pnpm run check:guide"
  }
}
```

---

## Merge Gate Rules

A PR must not merge unless all of the following pass:
- typecheck
- lint
- existing commerce contract tests
- guide compliance tests

For code review, require the PR description to answer:
1. Did this change alter plugin manifest fields?
2. Did this change alter lifecycle or hook usage?
3. Did this change add any new runtime capability dependency?
4. Did this change alter external host access?
5. If yes to any above, was `emdash_guide.md` intentionally updated too?

---

## Initial Expected Result

When these tests are first added to the current iteration, they should fail.

That is correct.

They should fail because the current code appears to diverge from the guide in these areas:
- missing declared capabilities
- `allowedHosts` instead of `network.allowedHostnames`
- wildcard Stripe hosts
- `definePlugin` imported from `emdash`
- undocumented lifecycle shape
- `emdash` peer dependency pinned as `workspace:*`

---

## Recommended Rollout Order

1. Add the tests exactly as written.
2. Confirm they fail on the current code.
3. Fix the plugin until they pass.
4. Wire them into `check`.
5. Keep them mandatory for every PR touching `src/index.ts`, `package.json`, or platform docs.

---

## Bottom Line

This CI gate should enforce one rule:

> the commerce plugin may evolve, but it may not silently stop matching the published EmDash developer contract.
