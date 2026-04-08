# EmDash Plugin Developer Guide

**Platform:** EmDash v0.1.0 (beta) — Cloudflare / Astro 6 CMS  
**Last Verified:** April 8, 2026  
**Audience:** Plugin developers building on EmDash for the first time  

---

## What EmDash Is

EmDash is a full-stack, TypeScript-native, serverless CMS built on Astro 6.0 and designed to run on Cloudflare's edge infrastructure. It launched in public beta on March 31, 2026, is MIT-licensed, and was built by Cloudflare after the company acquired the Astro Technology Company in January 2026.

The CMS is a ground-up redesign of what a content management system looks like when designed for serverless edge computing and AI-first workflows, rather than a LAMP-stack server. It is **not** a WordPress fork, drop-in replacement, or migration tool.

The three central architectural decisions that define EmDash for plugin developers:

1. **Capability-based sandboxing** — plugins run in isolated V8 Dynamic Workers; they can only do what their manifest explicitly declares.
2. **Typed collection schemas** — content lives in typed, per-type D1 collections, not a generic posts table.
3. **Structured content storage** — content is portable text (structured JSON), not raw HTML.

These three decisions affect every plugin you will write. Understand them before writing a line of code.

---

## Core Architecture at a Glance

### Project Structure

```
my-emdash-site/
├── astro.config.mjs         # Astro 6 configuration
├── emdash.config.ts         # EmDash CMS configuration & plugin registration
├── package.json
├── wrangler.toml            # Cloudflare bindings (D1, R2, KV)
├── plugins/                 # Your plugin directories
│   └── my-plugin/
│       ├── package.json
│       └── src/
│           └── index.ts     # Plugin entry point
├── public/
└── src/
    ├── content/             # Collection schemas & seed data
    │   └── config.ts
    ├── layouts/
    ├── pages/
    └── components/
```

### Configuration Entry Points

**`emdash.config.ts`** — registers plugins, configures auth, and sets up storage:
```typescript
import { defineConfig } from "emdash";

export default defineConfig({
  site: {
    name: "My EmDash Site",
    url: "http://localhost:4321",
  },
  plugins: [
    "./plugins/my-plugin",   // Register plugins by path
  ],
  auth: {
    provider: "passkey",     // Default: passkey-based auth (built in, no plugin needed)
  },
  storage: {
    // Local dev:  SQLite + disk (auto)
    // Production: D1 + R2   (auto-detected from wrangler.toml)
  },
});
```

**`wrangler.toml`** — declares Cloudflare bindings used by both local dev and production:
```toml
name = "my-emdash-site"
compatibility_date = "2026-04-01"

[[d1_databases]]
binding = "DB"
database_name = "emdash-db"
database_id = "local"        # Replace with real ID for production

[[r2_buckets]]
binding = "MEDIA"
bucket_name = "emdash-media"

[[kv_namespaces]]
binding = "PLUGIN_KV"
id = "local"                 # Replace with real ID for production
```

**`seed.json`** — defines collection schemas at install time:
```json
{
  "collections": [
    {
      "name": "products",
      "fields": [
        { "name": "title",       "type": "string",  "required": true },
        { "name": "price",       "type": "number",  "required": true },
        { "name": "sku",         "type": "string",  "required": true },
        { "name": "stock",       "type": "number",  "required": true },
        { "name": "description", "type": "richtext" },
        { "name": "images",      "type": "media",   "multiple": true }
      ]
    }
  ]
}
```

---

## The Capability Manifest System

This is the single most important concept in EmDash plugin development. Every plugin must declare what it needs before any code runs. If a capability is not declared, the corresponding API is `undefined` at runtime — there is no fallback, try/catch workaround, or escalation path.

### Full Capability List (v0.1.0)

```typescript
capabilities: [
  "content:read",       // Read posts, pages, custom collection items
  "content:write",      // Create, update, delete content items
  "email:send",         // Send transactional emails
  "network:fetch",      // Make outbound HTTP requests (requires allowedHostnames)
  "storage:kv",         // Read/write plugin-scoped KV storage
  "cron:schedule",      // Register scheduled/recurring tasks
  "admin:ui",           // Register admin panels, widgets, and dashboard blocks
  "media:read",         // Access uploaded media files (R2)
  "media:write",        // Upload and manage media (R2)
  "auth:read",          // Read current user/session information
]
```

For outbound HTTP, you must also declare every allowed hostname individually:

```typescript
{
  capabilities: ["network:fetch"],
  network: {
    allowedHostnames: [
      "api.stripe.com",
      "api.stripe.com",    // Include sandbox endpoints separately
      "hooks.zapier.com",
      "api.shipstation.com"
    ]
  }
}
```

### What the Runtime Enforces

When EmDash boots a plugin, it reads the manifest, spins up a V8 isolate, and injects only the declared bindings. Undeclared capabilities do not exist in the execution context:

```
Declared: ["content:read", "storage:kv"]

Available:
  ✅ ctx.content.list()
  ✅ ctx.content.get(id)
  ✅ ctx.kv.get(key)
  ✅ ctx.kv.put(key, value)

Not available:
  ❌ ctx.content.create()     → undefined (content:write not declared)
  ❌ ctx.email.send()         → undefined (email:send not declared)
  ❌ fetch()                  → undefined (network:fetch not declared)
  ❌ ctx.cron.register()      → undefined (cron:schedule not declared)
```

---

## Plugin Anatomy

A minimal plugin:

```typescript
// plugins/my-plugin/src/index.ts
import { definePlugin } from "emdash/plugin";

export default definePlugin({
  name: "my-plugin",
  version: "1.0.0",
  description: "What this plugin does",

  capabilities: [
    "content:read",
    "storage:kv",
  ],

  // Runs once when the plugin is first installed
  async onInstall({ kv, log }) {
    await kv.put("initialized", "true");
    log.info("Plugin installed");
  },

  // Runs when the plugin is activated
  onActivate({ admin, log }) {
    admin.registerPanel({
      title: "My Panel",
      path: "/my-panel",
      icon: "chart-bar",
    });
    log.info("Plugin activated");
  },

  // Lifecycle event hooks
  hooks: {
    "content:afterSave": async (event, ctx) => {
      if (event.collection !== "posts") return;
      ctx.log.info(`Content saved: ${event.content.id}`);
    },
  },

  // Plugin-scoped HTTP request handler
  async onRequest({ request, kv, content }) {
    const url = new URL(request.url);
    if (url.pathname === "/api/my-endpoint") {
      return new Response(JSON.stringify({ ok: true }), {
        headers: { "Content-Type": "application/json" },
      });
    }
    return new Response("Not found", { status: 404 });
  },
});
```

### Available Lifecycle Hooks (v0.1.0)

| Hook | When it fires |
|------|---------------|
| `content:afterSave` | After any content item is created or updated |
| `content:afterDelete` | After a content item is deleted |
| `onInstall` | Once, when the plugin is first installed |
| `onActivate` | Each time the plugin is activated |
| `onDeactivate` | Each time the plugin is deactivated |
| `onRequest` | On every HTTP request the plugin handles |

> **Note:** There is currently no `content:beforeSave` or equivalent filter hook for intercepting and mutating data mid-pipeline. This is a known gap at v0.1.0. Do not design plugins that depend on intercepting data before it is committed.

---

## Admin UI Extensions

Admin panels and widgets are defined via a declarative JSON schema — comparable to Slack's Block Kit. You **cannot** inject arbitrary HTML or JavaScript into the admin interface.

```typescript
onActivate({ admin }) {
  // Register a full admin panel
  admin.registerPanel({
    title: "Analytics",
    path: "/analytics",
    icon: "chart-bar",
  });

  // Register a dashboard widget
  admin.registerWidget({
    title: "Recent Orders",
    size: "medium",          // "small" | "medium" | "large"
    dataEndpoint: "/api/recent-orders",
  });
}
```

The Block Kit schema controls layout, inputs, data tables, and navigation. Rich custom interfaces (e.g., inline drag-and-drop editors, custom canvas elements, iframe embeds) are not achievable within the schema constraints. Prototype your most complex admin screen **before** committing to it architecturally.

---

## Storage: D1, KV, and R2

EmDash provides three storage primitives via Cloudflare bindings. Each has a distinct purpose.

| Primitive | Purpose | Access in Plugin | Best For |
|-----------|---------|-----------------|----------|
| **D1** (SQLite) | Relational content and transactional records | Via `ctx.content` collection APIs | Products, orders, customers, structured data |
| **KV** | Global key-value store | Via `ctx.kv` (requires `storage:kv`) | Active cart state, cached values, counters, config |
| **R2** | Object/binary storage | Via `ctx.media` (requires `media:read`/`media:write`) | Images, file uploads, downloadable assets |

### Important Constraints

**No filesystem access.** Workers cannot read or write files. All persistence goes through D1, KV, or R2.

**No native modules.** You cannot use `node_modules` packages that include C++ bindings or native extensions.

**No global state between requests.** Each request runs in a fresh execution context. Variables defined at module scope do not persist across requests. Use KV or Durable Objects for state that must survive across requests.

**D1 write concurrency.** D1 is SQLite-based and has limitations under high concurrent write loads. For high-frequency write workloads (flash sales, simultaneous order commits, real-time inventory decrements), benchmark your usage and consider whether a Hyperdrive-connected external Postgres instance is more appropriate.

---

## Content: Portable Text

Content in EmDash is stored as **portable text** (structured JSON), not raw HTML. This means:

```typescript
// ❌ This will not work — content.body is not an HTML string
<div set:html={post.body} />

// ✅ Use the portable text renderer
import { PortableText } from "@emdash/components";
<PortableText value={post.body} />
```

Custom block types (product cards, pricing tables, callouts, spec sheets) must be defined as EmDash Block Kit components and registered via a plugin. They are not free-form HTML embeds.

---

## Theme/Plugin Boundary

The boundary between themes and plugins is enforced, not conventional.

**Themes can:**
- Render content from collections via `getEntry()` (read-only)
- Consume APIs exposed by plugins
- Define layouts and presentational components in Astro

**Themes cannot:**
- Write to any collection or storage binding
- Run privileged operations
- Contain application business logic

For e-commerce or any plugin-driven feature, this means: **all business logic belongs in plugins.** The theme calls into plugin-provided endpoints or consumes plugin data. Design this interface explicitly — it is not implicit.

---

## E-Commerce: What Exists and What You Must Build

At v0.1.0, there is no WooCommerce equivalent and no standard commerce foundation plugin. The developer building an e-commerce plugin is building foundational primitives that WordPress users take for granted.

### Not Built In (You Must Build These)

- Shopping cart (state management and persistence)
- Order management schema and state machine
- Inventory reservation and stock decrement
- Tax calculation integrations
- Shipping rate API integrations
- Fiat payment checkout (Stripe, PayPal, etc.)
- Customer account management
- Subscription and recurring billing
- Review and rating system
- Faceted product catalog search
- Coupon and discount logic

### What Is Built In

- **x402 payment protocol** — native support for crypto/stablecoin micropayments aimed at AI agent-to-agent transactions. Useful for gated APIs, pay-per-content, and agent-facing product data endpoints. Not a replacement for human checkout flows.
- **Passkey authentication** — built in at core, not a plugin. No separate auth system needed.
- **Media handling** via R2 with CDN delivery.
- **Full-text content search** within collections (no faceted filtering out of the box).

### Recommended Commerce Architecture

```
Theme          → render-only (product pages, cart views, checkout UI)
Plugin         → cart API, checkout API, order creation, inventory, admin tools
D1             → committed entities: products, orders, customers, inventory
KV             → active cart state (TTL-based), session-like ephemeral data
R2             → product images, downloadable goods
Stripe (etc.)  → fiat payment processing (declared via network:fetch + allowedHostnames)
x402           → optional second rail for digital/agent-facing products
```

### Cart and Session State Pattern

Workers have no persistent in-process memory between requests. Implement cart state explicitly:

```typescript
// Active cart: KV with TTL (fast, eventually consistent, acceptable for cart)
await ctx.kv.put(`cart:${sessionId}`, JSON.stringify(cartItems), { expirationTtl: 86400 });

// Cart retrieval
const raw = await ctx.kv.get(`cart:${sessionId}`);
const cart = raw ? JSON.parse(raw) : [];

// Order commit: D1 via content:write (transactional, durable)
await ctx.content.create("orders", {
  cartId: sessionId,
  items: cart,
  status: "pending",
  idempotencyKey: checkoutToken,   // Always use idempotency keys
});
```

**Note on sessions:** Cloudflare KV with the `SESSION` binding is the standard mechanism for session state in Cloudflare Workers/Astro environments. Declare this binding in `wrangler.toml` and ensure your plugin capability manifest includes `storage:kv`.

---

## Hooks vs. WordPress Filters — Key Difference

EmDash hooks are **lifecycle events** (fire after something happens), not WordPress-style **filters** (intercept and mutate data mid-pipeline).

| WordPress | EmDash Equivalent |
|-----------|------------------|
| `add_action('save_post', ...)` | `hooks['content:afterSave']` |
| `apply_filters('the_content', ...)` | **No equivalent at v0.1.0** |
| `add_filter('woocommerce_cart_item_price', ...)` | **No equivalent at v0.1.0** |
| `register_activation_hook(...)` | `onActivate()` |

If your plugin design depends on intercepting values mid-flow and returning modified output, that pattern is not available at v0.1.0. Design instead around explicit service boundaries: your plugin exposes a dedicated API endpoint, and consuming code calls that endpoint rather than relying on a global filter chain.

---

## Licensing

EmDash plugins can carry **any license**: MIT, commercial, proprietary. Unlike WordPress's GPL, which requires derivative works to inherit the license, EmDash's MIT license imposes no copyleft obligations. Compiled Worker bundles can be distributed without exposing source code. This is commercially significant for anyone building premium or closed-source plugins.

---

## Vendor Lock-In: What to Know

EmDash's most valuable features — sandboxed plugin isolation, D1, KV, R2 — are Cloudflare-specific. On non-Cloudflare hosting (Node.js), EmDash falls back to SQLite and local filesystem, and the V8 isolate sandboxing disappears entirely. The CMS code is MIT-licensed; the runtime that enables its defining features is not.

Practical implications:

- D1, KV, and R2 are not portable to AWS/Azure without rewriting your storage layer.
- The security model you build around — sandboxed plugins — only fully applies on Cloudflare infrastructure.
- Factor this into your deployment strategy and client conversations from day one.

---

## Checklist: Before Writing a Single Line of Code

### ✅ Architecture Review

- [ ] Have you identified every external API your plugin will ever call? List every hostname, including sandbox/staging variants.
- [ ] Have you mapped every plugin action to its required capability?
- [ ] Have you confirmed the admin UI Block Kit schema can express your required operator workflows? (Prototype the hardest screen first.)
- [ ] Have you separated what belongs in the theme (rendering) from what belongs in the plugin (logic)?

### ✅ Schema Planning

- [ ] Have you defined your collection schemas conservatively, with fewer and broader fields to minimize future migration surface?
- [ ] Have you established a versioned schema migration convention before deploying to production?
- [ ] Have you planned for schema evolution (adding fields, type changes) without a documented first-party migration tool?
- [ ] Have you tested schema changes against realistic D1 data volumes in a staging environment?

### ✅ State and Storage

- [ ] Have you explicitly chosen KV vs. D1 for each type of data your plugin manages?
- [ ] Have you eliminated any assumptions about global state persisting between requests?
- [ ] Have you designed idempotency keys for all mutation operations (order creation, payment intents, inventory updates)?
- [ ] Have you stress-tested your D1 write paths under concurrent load if the use case involves high-frequency writes?

### ✅ Manifest

- [ ] Is your `capabilities` array complete and minimal? (Only declare what you actually use.)
- [ ] Are all `allowedHostnames` listed including sandbox and production endpoints?
- [ ] Have you written explicit error handling for cases where a capability binding returns `undefined`? (Defense in depth — treat the sandbox as real.)

### ✅ Commerce-Specific (if applicable)

- [ ] Is cart state persisted to KV with appropriate TTL?
- [ ] Is order commit using a D1 write with an idempotency key?
- [ ] Does the Stripe (or equivalent) webhook handler verify the signature header before processing?
- [ ] Is the `network:fetch` capability declared with every payment processor hostname?
- [ ] Does the checkout flow handle concurrent requests to the same cart gracefully?
- [ ] Is there a cart abandonment recovery path (TTL on KV, not a memory leak)?

---

## Do This

- **Declare capabilities before writing handlers.** The manifest is your application contract. Finalize it early.
- **Design explicit plugin-to-theme interfaces.** Treat the plugin as a service with an API. The theme is a consumer.
- **Version your collection schemas from day one.** Even a simple `migrations/` directory with timestamped SQL files is better than nothing.
- **Use idempotency keys on all writes.** Workers can retry. Your order table should not double-insert.
- **Prototype admin UI components early.** Discover Block Kit schema limitations before you are committed to a UI design.
- **Pin EmDash to a specific version** in `package.json`. Use `"emdash": "0.1.0"`, not `"latest"`. Breaking changes at v0.1.x are expected.
- **Scope capabilities minimally.** Only declare what the plugin genuinely requires. Excess permissions are a future liability.
- **Test capability-denied paths explicitly.** Ensure your plugin fails gracefully and produces actionable log output when a binding is absent.
- **Build the thinnest possible integration layer** between EmDash APIs and your plugin logic. When the platform APIs change, the surface to update should be small.
- **Use `ctx.log.info()` / `ctx.log.error()` liberally** during development. Debugging sandboxed Workers code without logs is painful.

---

## Do Not Do This

- **Do not start by porting WordPress plugin patterns.** Shared-process assumptions, global `$wpdb` access, `functions.php` logic, and PHP session variables do not exist here.
- **Do not assume capabilities exist unless declared.** There is no `try { ctx.email.send() } catch` that gracefully falls through. Undeclared APIs are `undefined`.
- **Do not put business logic in themes.** A theme that writes to a collection is an architecture error that will break in the next platform update.
- **Do not inject arbitrary HTML or JavaScript into the admin panel.** Admin UI is Block Kit schema-based. Attempting to work around this will break in production and is against the security model.
- **Do not rely on global mutable state at module scope.** Workers are stateless between requests. Module-scope variables reset each time unless you are using Durable Objects.
- **Do not use `set:html` with portable text content.** Portable text is structured JSON, not an HTML string. Render it through the EmDash portable text renderer.
- **Do not hardcode hostnames in fetch calls.** Every outbound request hostname must be in `network.allowedHostnames` in the manifest. Undeclared network calls are blocked.
- **Do not assume D1 handles high write concurrency.** D1 is SQLite. Benchmark before committing to it for write-heavy commerce operations.
- **Do not assume EmDash is portable off Cloudflare.** The security model and storage primitives depend on Cloudflare's runtime. Factor this into your deployment strategy.
- **Do not ship a plugin that depends on a mid-pipeline filter hook.** `apply_filters`-style mutation does not exist. Redesign around explicit service endpoints.
- **Do not install with `@latest` in production.** At v0.1.0, the platform is in active development. Pin your version explicitly.

---

## Known Gaps at v0.1.0

| Gap | Impact | Mitigation |
|-----|--------|-----------|
| No `content:beforeSave` filter hook | Cannot intercept/mutate data pre-commit | Design explicit service endpoints instead of relying on filter chains |
| No versioned schema migration tooling | Schema changes in production are undocumented risk | Build your own migration convention from day one |
| No standard commerce plugin | All e-commerce primitives must be built from scratch | Treat this as an opportunity; the ecosystem is open |
| No faceted catalog search | Product filtering requires custom implementation | Evaluate Cloudflare Workers AI or an external search service via `network:fetch` |
| D1 write concurrency limits | High-traffic write paths may contend | Benchmark early; consider Hyperdrive + external Postgres for heavy writes |
| Block Kit admin schema is limited | Sophisticated operator UIs may not be expressible | Prototype admin workflows against the schema before committing |
| No plugin-to-plugin communication API | Plugins cannot easily share data or compose | Design shared storage contracts via KV or D1 collections |

---

## Platform Stability Expectations

EmDash is v0.1.0 beta. The following are subject to breaking changes in upcoming versions:

- Capability manifest schema and field names
- Hook event names and payloads
- `definePlugin()` API surface
- `emdash.config.ts` configuration shape
- Admin UI Block Kit component set
- CLI commands and JSON output format

Monitor the EmDash GitHub repository and changelog. Subscribe to release announcements before upgrading. The platform was developed over two months with AI-assisted tooling and has had zero production battle-testing at launch. Treat every undocumented behavior as potentially temporary.

---

## Quick Reference: Capability to API Mapping

| Declared Capability | Available on `ctx` |
|--------------------|--------------------|
| `content:read` | `ctx.content.list(collection)`, `ctx.content.get(collection, id)` |
| `content:write` | `ctx.content.create(collection, data)`, `ctx.content.update(...)`, `ctx.content.delete(...)` |
| `storage:kv` | `ctx.kv.get(key)`, `ctx.kv.put(key, value, options)`, `ctx.kv.delete(key)` |
| `email:send` | `ctx.email.send({ to, subject, text, html })` |
| `network:fetch` | `fetch(url)` (only to declared hostnames) |
| `cron:schedule` | `ctx.cron.register(schedule, handler)` |
| `admin:ui` | `admin.registerPanel(...)`, `admin.registerWidget(...)` |
| `media:read` | `ctx.media.get(key)`, `ctx.media.list()` |
| `media:write` | `ctx.media.upload(file)`, `ctx.media.delete(key)` |
| `auth:read` | `ctx.auth.getUser()`, `ctx.auth.getSession()` |

---

*Generated April 8, 2026. Based on EmDash v0.1.0 public documentation, Cloudflare blog, community developer analysis, and practitioner feedback. Verify all API details against the official EmDash documentation and GitHub repository before implementation, as the platform is in active beta development.*
