# guide-compliance-diff-patch-plan.md

## Purpose

This document converts the earlier guide-compliance review into a **diff-based patch plan** your developer can execute.

Assumption for this plan:
- `emdash_guide.md` is the authority.
- The commerce plugin must conform to that guide, even if current local runtime types appear to allow other shapes.

If the runtime has intentionally moved beyond the guide, then the correct move is to update the guide first and then re-baseline the tests. Until that happens, this patch plan treats the guide as the merge gate.

---

## Outcome target

After these patches, the plugin should:

- declare all required capabilities
- use guide-compliant network manifest shape
- avoid wildcard host permissions
- align import path and lifecycle shape with the guide
- centralize manifest facts to remove drift
- expose a clear CI guardrail that fails on regressions

---

## Patch order

Apply in this order:

1. `src/index.ts` — manifest + lifecycle alignment
2. `package.json` — add dedicated compliance script
3. `src/contracts/guide-compliance.test.ts` — enforce guide contract
4. `docs/guide-compliance-review.md` and `CI_REGRESSION_CHECKLIST.md` — document new merge gate

---

## Patch 1 — make `src/index.ts` guide-compliant

### Why

This is the main mismatch source today.

Current issues:
- imports `definePlugin` from `emdash` instead of `emdash/plugin`
- declares only `network:fetch`
- uses `allowedHosts` instead of `network.allowedHostnames`
- uses `*.stripe.com` wildcard
- duplicates manifest facts across descriptor and runtime definition
- uses `hooks` object instead of guide lifecycle methods

### File

`packages/plugins/commerce/src/index.ts`

### Patch intent

- switch to guide import path
- introduce a single manifest constant
- declare all observed capabilities
- replace wildcard Stripe allowlist with explicit hostnames
- move from `hooks` to lifecycle methods documented in the guide

### Diff-style patch

```diff
--- a/packages/plugins/commerce/src/index.ts
+++ b/packages/plugins/commerce/src/index.ts
@@
-import type {
-    PluginContext,
-    PluginDefinition,
-    PluginDescriptor,
-    PluginRoute,
-    ResolvedPlugin,
-    RouteContext,
-} from "emdash";
-import { definePlugin } from "emdash";
+import type {
+    PluginContext,
+    PluginDefinition,
+    PluginDescriptor,
+    PluginRoute,
+    ResolvedPlugin,
+    RouteContext,
+} from "emdash/plugin";
+import { definePlugin } from "emdash/plugin";
@@
-/** Outbound Stripe API (`api.stripe.com`, `connect.stripe.com`, etc.). */
-const STRIPE_ALLOWED_HOSTS = ["*.stripe.com"] as const;
+/**
+ * Explicit outbound Stripe host allowlist.
+ * Keep this least-privilege and add hosts only when a real call path requires them.
+ */
+const STRIPE_ALLOWED_HOSTNAMES = [
+    "api.stripe.com",
+    "connect.stripe.com",
+    "files.stripe.com",
+] as const;
+
+const COMMERCE_PLUGIN_ID = "dashing-commerce" as const;
+const COMMERCE_PLUGIN_VERSION = "0.1.0" as const;
+
+const COMMERCE_CAPABILITIES = [
+    "network:fetch",
+    "storage:kv",
+    "cron:schedule",
+    "admin:ui",
+] as const;
+
+const COMMERCE_MANIFEST = {
+    id: COMMERCE_PLUGIN_ID,
+    version: COMMERCE_PLUGIN_VERSION,
+    entrypoint: "@emdash-cms/plugin-dashing-commerce",
+    capabilities: [...COMMERCE_CAPABILITIES],
+    network: {
+        allowedHostnames: [...STRIPE_ALLOWED_HOSTNAMES],
+    },
+} as const;
@@
 export function commercePlugin(): PluginDescriptor {
     return {
-        id: "dashing-commerce",
-        version: "0.1.0",
-        entrypoint: "@emdash-cms/plugin-dashing-commerce",
-        capabilities: ["network:fetch"],
-        allowedHosts: [...STRIPE_ALLOWED_HOSTS],
+        ...COMMERCE_MANIFEST,
         storage: COMMERCE_STORAGE_CONFIG as unknown as PluginDescriptor["storage"],
     };
 }
@@
 export function createPlugin(options: CommercePluginOptions = {}): ResolvedPlugin<CommerceStorage> {
@@
     const pluginDefinition: PluginDefinition<CommerceStorage> = {
-        id: "dashing-commerce",
-        version: "0.1.0",
-        capabilities: ["network:fetch"],
-        allowedHosts: [...STRIPE_ALLOWED_HOSTS],
+        ...COMMERCE_MANIFEST,
 
         storage: COMMERCE_STORAGE_CONFIG,
@@
-        hooks: {
-            "plugin:activate": {
-                handler: async (_event: unknown, ctx: PluginContext) => {
-                    if (ctx.cron) {
-                        await ctx.cron.schedule("idempotency-cleanup", { schedule: "@weekly" });
-                    }
-                },
-            },
-            cron: {
-                handler: async (event: unknown, ctx: PluginContext) => {
-                    if ((event as { name?: string }).name === "idempotency-cleanup") {
-                        await handleIdempotencyCleanup(ctx);
-                    }
-                },
-            },
-        },
+        async onInstall(ctx: PluginContext) {
+            if (!ctx.kv) {
+                throw new Error("dashing-commerce requires storage:kv");
+            }
+        },
+
+        async onActivate(ctx: PluginContext) {
+            if (!ctx.cron) {
+                throw new Error("dashing-commerce requires cron:schedule");
+            }
+
+            await ctx.cron.schedule("idempotency-cleanup", { schedule: "@weekly" });
+        },
+
+        async onRequest(event: unknown, ctx: PluginContext) {
+            if ((event as { name?: string }).name === "idempotency-cleanup") {
+                await handleIdempotencyCleanup(ctx);
+            }
+        },
@@
-    return definePlugin(pluginDefinition);
+    return definePlugin(pluginDefinition);
 }
```

### Notes for developer

1. The exact type names for lifecycle methods may differ in current runtime typings. If so:
   - update the runtime type surface to match the guide, **or**
   - update `emdash_guide.md` first and then revise the compliance tests.

2. `files.stripe.com` and `connect.stripe.com` should stay only if actually used. If not used, remove them and keep the allowlist tighter.

3. `onRequest` is used here as the nearest guide-documented event surface for cron-like dispatch. If the platform has a separate documented cron lifecycle in a newer guide, use that newer documented API instead.

---

## Patch 2 — add explicit runtime guard helpers

### Why

The plugin currently relies on `ctx.kv` in several places and only partially guards optional runtime APIs. Even after capability declaration is fixed, a clean boot-time assertion makes failures obvious.

### File

`packages/plugins/commerce/src/index.ts`

### Diff-style patch

```diff
--- a/packages/plugins/commerce/src/index.ts
+++ b/packages/plugins/commerce/src/index.ts
@@
 type AnyHandler = (ctx: RouteContext<unknown>) => Promise<unknown>;
 
 function asRouteHandler(fn: AnyHandler): never {
     return fn as never;
 }
+
+function requireKv(ctx: PluginContext): asserts ctx is PluginContext & { kv: NonNullable<PluginContext["kv"]> } {
+    if (!ctx.kv) {
+        throw new Error("dashing-commerce requires storage:kv");
+    }
+}
+
+function requireCron(ctx: PluginContext): asserts ctx is PluginContext & { cron: NonNullable<PluginContext["cron"]> } {
+    if (!ctx.cron) {
+        throw new Error("dashing-commerce requires cron:schedule");
+    }
+}
@@
-        async onInstall(ctx: PluginContext) {
-            if (!ctx.kv) {
-                throw new Error("dashing-commerce requires storage:kv");
-            }
-        },
+        async onInstall(ctx: PluginContext) {
+            requireKv(ctx);
+        },
@@
-        async onActivate(ctx: PluginContext) {
-            if (!ctx.cron) {
-                throw new Error("dashing-commerce requires cron:schedule");
-            }
-
-            await ctx.cron.schedule("idempotency-cleanup", { schedule: "@weekly" });
-        },
+        async onActivate(ctx: PluginContext) {
+            requireCron(ctx);
+            await ctx.cron.schedule("idempotency-cleanup", { schedule: "@weekly" });
+        },
```

### Notes

This does not replace manifest compliance. It complements it.

---

## Patch 3 — tighten package scripts and external version posture

### Why

Guide compliance should be a named test target, not an implied convention.

Also, while `workspace:*` is acceptable inside the monorepo for active development, external packaging/docs should pin EmDash explicitly.

### File

`packages/plugins/commerce/package.json`

### Diff-style patch

```diff
--- a/packages/plugins/commerce/package.json
+++ b/packages/plugins/commerce/package.json
@@
   "scripts": {
+    "test:guide-compliance": "vitest run src/contracts/guide-compliance.test.ts",
     "test": "vitest run",
-    "check": "pnpm run lint && pnpm run typecheck && pnpm run test"
+    "check": "pnpm run lint && pnpm run typecheck && pnpm run test && pnpm run test:guide-compliance"
   },
@@
   "peerDependencies": {
-    "emdash": "workspace:*"
+    "emdash": "^1.0.0"
   }
```

### Notes for developer

If this package is not yet publishing externally, keep the monorepo `workspace:*` internally if needed, but add one of these:

- a comment in docs that external release must pin a real version, or
- a release-time packaging step that rewrites `peerDependencies`.

If you are not ready to change the package metadata yet, at least make the docs explicit and do not present `workspace:*` as a canonical public example.

---

## Patch 4 — replace the compliance test with guide-authority assertions

### Why

The test should fail on exactly the contract drift we identified:
- wrong import surface
- missing capabilities
- wrong network field shape
- wildcard hostnames
- undocumented lifecycle shape

### File

`packages/plugins/commerce/src/contracts/guide-compliance.test.ts`

### Diff-style patch

```diff
--- /dev/null
+++ b/packages/plugins/commerce/src/contracts/guide-compliance.test.ts
@@
+import { describe, expect, it } from "vitest";
+import { readFileSync } from "node:fs";
+import { resolve } from "node:path";
+
+const INDEX_TS = readFileSync(resolve(__dirname, "../index.ts"), "utf8");
+const PACKAGE_JSON = JSON.parse(
+  readFileSync(resolve(__dirname, "../../package.json"), "utf8")
+);
+
+describe("guide compliance", () => {
+  it("imports definePlugin from emdash/plugin", () => {
+    expect(INDEX_TS).toMatch(/from\s+["']emdash\/plugin["']/);
+  });
+
+  it("declares all required capabilities", () => {
+    expect(INDEX_TS).toMatch(/"network:fetch"/);
+    expect(INDEX_TS).toMatch(/"storage:kv"/);
+    expect(INDEX_TS).toMatch(/"cron:schedule"/);
+    expect(INDEX_TS).toMatch(/"admin:ui"/);
+  });
+
+  it("uses guide-compliant network.allowedHostnames manifest shape", () => {
+    expect(INDEX_TS).toMatch(/network\s*:\s*\{[\s\S]*allowedHostnames\s*:/);
+    expect(INDEX_TS).not.toMatch(/allowedHosts\s*:/);
+  });
+
+  it("does not use wildcard hostnames", () => {
+    expect(INDEX_TS).not.toMatch(/\*\.stripe\.com/);
+  });
+
+  it("uses documented lifecycle methods instead of hooks object", () => {
+    expect(INDEX_TS).toMatch(/onInstall\s*\(/);
+    expect(INDEX_TS).toMatch(/onActivate\s*\(/);
+    expect(INDEX_TS).not.toMatch(/hooks\s*:/);
+  });
+
+  it("pins external emdash peer dependency", () => {
+    expect(PACKAGE_JSON.peerDependencies?.emdash).not.toBe("workspace:*");
+    expect(PACKAGE_JSON.peerDependencies?.emdash).toMatch(/^\^?\d+/);
+  });
+});
```

### Notes

This test is deliberately strict and text-based. That is appropriate here because the contract drift is about **source-level API usage**, not business logic.

If your runtime has already adopted a different official contract, do not weaken the test casually. Update the guide first, then adjust the test to the new authority.

---

## Patch 5 — add docs that make the merge gate explicit

### Why

The new compliance test should not be a hidden rule.

### Files

- `packages/plugins/commerce/CI_REGRESSION_CHECKLIST.md`
- `packages/plugins/commerce/COMMERCE_DOCS_INDEX.md`

### Diff-style patch

```diff
--- a/packages/plugins/commerce/CI_REGRESSION_CHECKLIST.md
+++ b/packages/plugins/commerce/CI_REGRESSION_CHECKLIST.md
@@
+## Guide compliance gate
+
+- [ ] `pnpm run test:guide-compliance` passes
+- [ ] plugin import surface matches `emdash_guide.md`
+- [ ] manifest uses `network.allowedHostnames`
+- [ ] no wildcard payment hostnames are present
+- [ ] all runtime-required capabilities are declared
+- [ ] lifecycle shape matches the guide authority
```

```diff
--- a/packages/plugins/commerce/COMMERCE_DOCS_INDEX.md
+++ b/packages/plugins/commerce/COMMERCE_DOCS_INDEX.md
@@
+### Guide compliance
+
+- `docs/guide-compliance-review.md` — full assessment and remediation rationale
+- `docs/guide-compliance-diff-patch-plan.md` — implementation patch plan
+- `src/contracts/guide-compliance.test.ts` — CI enforcement for guide authority
```

---

## Patch 6 — optional cleanup if runtime truly differs from the guide

### Why

There is a real possibility the plugin is correct for the current runtime, and the guide is stale.

If that is true, do **not** leave the system in split-brain mode.

### Required decision

Choose exactly one authority:

#### Option A — Guide is authority
- apply all patches above
- keep strict compliance tests
- reject non-guide runtime surface

#### Option B — Runtime is authority
- update `emdash_guide.md`
- document the new import path, lifecycle shape, and network manifest API
- rewrite compliance tests to enforce the updated guide

### Do not do this

- do not weaken the tests while leaving the guide stale
- do not keep both `allowedHosts` and `network.allowedHostnames`
- do not leave lifecycle split between guide docs and runtime code

---

## Suggested commit plan

Keep this small and reviewable.

### Commit 1
`refactor(commerce): centralize plugin manifest and declare full capabilities`

Includes:
- manifest constant
- capability fixes
- explicit Stripe hostnames
- `network.allowedHostnames`

### Commit 2
`refactor(commerce): align plugin lifecycle with emdash guide`

Includes:
- import path fix
- lifecycle migration away from `hooks`
- runtime capability assertions

### Commit 3
`test(commerce): add guide compliance CI gate`

Includes:
- `src/contracts/guide-compliance.test.ts`
- package scripts
- docs/checklist updates

---

## Merge checklist

Do not merge until all are true:

- [ ] `pnpm run lint`
- [ ] `pnpm run typecheck`
- [ ] `pnpm run test`
- [ ] `pnpm run test:guide-compliance`
- [ ] `commercePlugin()` and `createPlugin()` derive from the same manifest constant
- [ ] no wildcard Stripe hostname remains
- [ ] no `allowedHosts` field remains in plugin manifest code
- [ ] no undeclared capability is still used by runtime code
- [ ] guide and implementation now describe the same plugin contract

---

## Final recommendation

This should be implemented as a **small hardening PR**, not mixed into unrelated commerce work.

Reason:
- it is high leverage
- it cuts future reviewer confusion
- it prevents regressions with very little code
- it turns a subjective architecture concern into an objective CI gate

