# DashingCommerce / dashCommerce Extension Architecture — Authoritative Optional Module Specification

## Purpose

This document defines the **authoritative extension model** for `DashingCommerce` / `dashCommerce`.

Its purpose is to let your developer build an **optional, first-party or third-party installable module system** that augments the core commerce plugin **without contaminating core commerce logic**.

This document should be treated as the **baseline contract** for extension design.

---

# 1. Primary Goal

Build `dashCommerce` so that:

- the **core plugin remains lean**
- optional functionality can be added as **extensions/modules**
- first-party and third-party modules can be installed safely
- the extension boundary is **public, stable, explicit, and documented**
- core commerce behavior does not depend on optional modules
- modules can be enabled, disabled, upgraded, or removed with minimal risk

---

# 2. Strategic Principle

> Core commerce must expose a clean public extension surface.  
> Modules must extend core behavior through that surface only.

That means:

- no private-internal reach-in
- no monkey-patching
- no direct mutation of unrelated core state
- no hidden dependencies
- no “works only if installed in the right order” architecture

---

# 3. Non-Negotiable Design Rules

## 3.1 Core must remain authoritative
The core plugin owns:

- products
- catalog
- pricing
- carts
- checkout
- orders
- taxes
- shipping framework
- customer/account primitives
- public commerce APIs
- extension registration lifecycle

Extensions may augment these areas, but must not redefine the core data model unless explicitly supported.

---

## 3.2 Optional means truly optional
If an extension is not installed:

- core must still boot
- checkout must still function
- admin must still function
- no dead references to missing modules may exist

No optional feature may be implemented as a hidden hard dependency.

---

## 3.3 Public extension APIs only
All extension integrations must go through explicit public surfaces such as:

- registration APIs
- hooks
- event subscriptions
- route registration
- admin slot registration
- schema/migration registration
- capability declarations

If a module needs something that does not exist publicly, add a **new public extension point** to core instead of letting the module reach into internals.

---

## 3.4 Additive, not invasive
Extensions should be:

- additive
- composable
- reversible
- testable in isolation

They should not require widespread edits throughout core.

---

## 3.5 DRY and YAGNI
Do not build a giant plugin framework for hypothetical future needs.

Version 1 should support only what real modules need.

Prefer:

- explicit APIs
- small interfaces
- boring lifecycle rules
- narrow contracts

Avoid:

- magic discovery systems
- over-generic plugin meta-frameworks
- deep inheritance
- runtime reflection-heavy design

---

# 4. Required End State

Your developer should build an extension model where:

- `dashCommerce` is the **host/plugin platform**
- installable modules are **separate packages/repos**
- each module has a **manifest**
- each module registers through a **stable bootstrap contract**
- each module declares its:
  - name
  - version
  - compatibility
  - capabilities
  - migrations
  - routes
  - admin contributions
  - hooks/event subscriptions

---

# 5. What an Extension Is

An extension is a separately installable package that:

- targets `dashCommerce`
- uses a published extension API
- can be enabled/disabled independently
- augments behavior without replacing the core engine

Examples of valid extensions:

- GDPR compliance
- gift cards
- B2B pricing rules
- subscriptions
- advanced returns workflows
- ERP sync
- loyalty/rewards
- marketplaces/integration bridges
- analytics connectors
- product add-ons
- custom shipping integrations
- specialized tax integrations

---

# 6. What an Extension Is Not

An extension is **not**:

- a fork of core
- a patch set against private internals
- a direct edit of host source files
- a bundle of hacks loaded after boot
- a replacement for the checkout or order engine unless core explicitly supports such replacement

---

# 7. Recommended Architecture

Use a **host + module contract** model.

## 7.1 Host responsibilities
The core `dashCommerce` plugin must provide:

- extension registry
- module lifecycle
- public service container access rules
- event bus or hooks
- route mounting APIs
- admin UI extension slots
- migration registration
- config registration
- capability checks
- compatibility validation
- error isolation

---

## 7.2 Module responsibilities
Each module must provide:

- manifest
- bootstrap/register function
- capability declaration
- isolated services
- isolated data storage/migrations where needed
- tests against published extension API
- compatibility declaration

---

# 8. Required Public Extension Surface

The developer must define and stabilize these extension points.

## 8.1 Module registration
Core must expose something like:

```ts
registerCommerceModule(moduleDefinition)
```

Each module must register itself through this API only.

---

## 8.2 Module lifecycle hooks
At minimum, support these phases:

- `register`
- `init`
- `ready`
- `shutdown` (optional if relevant)

### Meaning
- `register`: declare services, routes, hooks, metadata
- `init`: wire runtime behavior
- `ready`: host is fully booted; module can safely interact
- `shutdown`: cleanup, if your platform needs it

Keep lifecycle small. Do not overbuild.

---

## 8.3 Hook/event system
Core must expose well-defined events/hooks around real commerce actions.

Examples:

- product created/updated
- order created
- order paid
- order fulfilled
- refund issued
- customer created
- cart calculated
- checkout completed

Extensions may subscribe to these.

They must not intercept hidden internal methods directly.

---

## 8.4 Admin UI slots
Core should expose explicit admin extension slots, such as:

- settings tabs
- order detail panels
- product detail panels
- customer detail panels
- dashboard widgets

Do not let modules inject arbitrary UI everywhere.

---

## 8.5 Route registration
Modules should be able to register:

- admin routes
- customer-facing routes
- webhook endpoints
- internal API routes

Through a public API like:

```ts
host.routes.registerAdminRoute(...)
host.routes.registerApiRoute(...)
```

---

## 8.6 Migration registration
Modules must be able to register their own migrations.

Rule:

> A module owns its own tables and data structures whenever possible.

Do not let modules casually alter core schema unless core explicitly exposes a supported mechanism for it.

---

## 8.7 Config registration
Each module should be able to register:

- config schema
- defaults
- admin-editable settings
- feature flags

Config must be namespaced by module.

Example:

```ts
dashcommerce.modules.gdpr.enabled
dashcommerce.modules.giftcards.enabled
```

---

## 8.8 Capability declaration
Each module should declare what it does.

Examples:

- adds admin pages
- adds checkout validators
- listens to orders
- sends outbound webhooks
- stores personal data
- requires scheduled jobs

This helps with governance, debugging, and marketplace review.

---

# 9. Required Module Manifest

Every module must ship with a manifest.

Suggested fields:

```ts
type CommerceModuleManifest = {
  id: string;
  displayName: string;
  version: string;
  description: string;
  author: string;
  license: string;
  repository?: string;
  homepage?: string;
  compatibility: {
    dashCommerce: string;
    emDash?: string;
  };
  capabilities: string[];
  entrypoint: string;
  migrations?: string[];
  configSchema?: string;
};
```

### Rules
- `id` must be unique and stable
- version must use semver
- compatibility range is required
- capabilities must be explicit, not implied

---

# 10. Required Bootstrap Contract

Each module must expose a single, boring bootstrap entrypoint.

Example:

```ts
export function registerModule(host: CommerceHost): CommerceModuleDefinition
```

or

```ts
export default function createModule(): CommerceModuleDefinition
```

Pick one convention and standardize it.

Do not allow multiple competing conventions.

---

# 11. Commerce Host Contract

The host object should expose only what modules are allowed to use.

Example shape:

```ts
type CommerceHost = {
  logger: Logger;
  config: ConfigService;
  db: DatabaseFacade;
  routes: RouteRegistry;
  hooks: HookBus;
  admin: AdminExtensionRegistry;
  jobs: JobRegistry;
  migrations: MigrationRegistry;
  storage: StorageFacade;
  features: FeatureFlagService;
  version: {
    dashCommerce: string;
    emDash?: string;
  };
};
```

## Rule
Do not expose the full internal application container unless you want permanent support burden.

Expose a **curated host API**.

---

# 12. Isolation Rules

## 12.1 Namespacing
Every module must namespace:

- config keys
- database tables
- event handlers
- admin route paths
- log prefixes
- background jobs

Example:

- `dc_gdpr_*`
- `dc_giftcards_*`

---

## 12.2 Failure isolation
A broken optional module must not bring down core commerce unless the operator explicitly configured it as critical.

Preferred behavior:

- fail module boot
- log clearly
- mark extension unhealthy
- keep core running if safe

---

## 12.3 Permission isolation
Modules should receive only the access they need.

A simple capability review model is enough in v1.

Do not grant unlimited host access by default.

---

# 13. Installation Model

The developer should assume modules will usually live as:

- separate package
- separate repo
- separate versioning lifecycle

Examples:

- `@your-org/dashcommerce-gdpr`
- `@your-org/dashcommerce-giftcards`
- `@third-party/dashcommerce-b2b-pricing`

The host should support installing these cleanly.

---

# 14. Marketplace / Distribution Readiness

If you intend third-party modules to be installable, the system must be designed for reviewability.

That means each module should be easy to inspect for:

- compatibility
- schema impact
- route impact
- data handling
- background job usage
- outbound network behavior
- UI contributions

This is another reason to require a manifest and explicit capability declarations.

---

# 15. Version Compatibility Policy

This is mandatory.

Core must define what compatibility means.

## Required rule
A module must declare compatible host versions.

Example:

```json
{
  "compatibility": {
    "dashCommerce": ">=1.4 <2.0",
    "emDash": ">=2.1 <3.0"
  }
}
```

The host must validate this during install or boot.

If incompatible:

- refuse activation
- show clear error
- never “best effort” silently

---

# 16. Developer Workflow for Building the Extension System

Use this order.

## Phase 1 — Stabilize the host boundary
Before building any real module:

- define host API
- define module manifest
- define bootstrap contract
- define lifecycle phases
- define migration registration
- define admin slot model
- define hook/event model

This is the most important step.

---

## Phase 2 — Build one first-party reference module
Use a real module to prove the contract.

Best candidate:
- GDPR module

Why:
- clearly optional
- operationally real
- touches routes, config, migrations, admin, and jobs
- good test of architecture without infecting core checkout

The first real module should validate the platform.

---

## Phase 3 — Tighten based on reality
After building the reference module:

- remove unnecessary APIs
- simplify lifecycle
- document missing extension points
- fix rough edges
- avoid expanding surface area prematurely

---

## Phase 4 — Publish extension author docs
Once proven:

- publish module template
- publish authoring guide
- publish compatibility rules
- publish review checklist

Only then invite third parties in.

---

# 17. Reference Module Template

Your developer should create a reference layout like this:

```text
dashcommerce-module-example/
├─ README.md
├─ package.json
├─ src/
│  ├─ index.ts
│  ├─ manifest.ts
│  ├─ module.ts
│  ├─ routes/
│  ├─ services/
│  ├─ migrations/
│  └─ admin/
└─ tests/
```

Each module should be boring and consistent.

---

# 18. Required Core APIs

The host should provide only a small set of public APIs.

## 18.1 Register module
```ts
registerCommerceModule(module)
```

## 18.2 Register routes
```ts
host.routes.registerAdminRoute(...)
host.routes.registerApiRoute(...)
host.routes.registerWebhookRoute(...)
```

## 18.3 Register hooks
```ts
host.hooks.on('order.created', handler)
host.hooks.on('order.paid', handler)
```

## 18.4 Register admin panels
```ts
host.admin.registerSettingsTab(...)
host.admin.registerOrderPanel(...)
```

## 18.5 Register migrations
```ts
host.migrations.register(moduleId, migrations)
```

## 18.6 Register jobs
```ts
host.jobs.register(...)
```

## 18.7 Access namespaced config
```ts
host.config.get('modules.gdpr.enabled')
```

That is enough for v1.

---

# 19. What Core Must Not Do

Core must not:

- depend on extension presence for normal operation
- expose raw internals casually
- let modules modify unrelated host state directly
- let modules override core behavior without explicit supported contracts
- let modules run schema mutations against core tables without review
- let modules register duplicate IDs
- let modules bypass compatibility checks

---

# 20. What Module Authors Must Not Do

Module authors must not:

- reach into undocumented host internals
- patch prototypes
- monkey-patch services
- write directly into unrelated core tables
- assume load order beyond documented lifecycle
- bypass namespacing
- inject front-end/admin UI outside approved slots
- create implicit cross-module dependencies without declaration

---

# 21. First-Party vs Third-Party Rules

You should hold first-party and third-party modules to the same contract.

Why:
- it keeps the platform honest
- it forces your public API to be real
- it prevents privileged internal shortcuts that later block marketplace growth

If first-party modules need private hacks, your extension platform is not ready yet.

---

# 22. Security and Trust Posture

For installable third-party modules, the developer should design for review.

At minimum:

- unique module ID
- signed/verified package source if possible later
- explicit capability declaration
- compatibility checks
- boot-time validation
- safe failure behavior
- module-specific logs

If you later create your own marketplace, these become enforceable review criteria.

---

# 23. Operational Observability

Each module should expose:

- module version
- health status
- enabled/disabled status
- migration status
- config validation status

Core admin should be able to show:

- installed modules
- compatibility state
- failures
- pending migrations
- declared capabilities

This is important for support and debugging.

---

# 24. Testing Requirements

The extension system is not complete until it is testable.

## Core must have tests for:
- module registration
- duplicate module rejection
- compatibility validation
- lifecycle order
- route registration
- hook dispatch
- migration registration
- module boot failure isolation

## Each module must have tests for:
- bootstrap success
- config validation
- route mounting
- migration application
- hook behavior
- clean disable/remove behavior

---

# 25. Documentation Requirements

Before third-party release, publish:

## 25.1 Host documentation
- extension architecture overview
- module lifecycle
- public host API
- migration rules
- admin slot model
- compatibility/versioning rules

## 25.2 Module author documentation
- how to create a module
- manifest schema
- bootstrap example
- testing expectations
- naming conventions
- release expectations

## 25.3 Marketplace/review documentation
- allowed/disallowed behavior
- data/privacy expectations
- upgrade expectations
- support boundaries

---

# 26. Recommended Naming Convention

Use one consistent naming pattern.

For packages:
- `@your-org/dashcommerce-gdpr`
- `@your-org/dashcommerce-giftcards`

For internal IDs:
- `dashcommerce.gdpr`
- `dashcommerce.giftcards`

For DB tables:
- `dc_gdpr_*`
- `dc_giftcards_*`

For config:
- `modules.gdpr.*`
- `modules.giftcards.*`

Consistency matters more than the exact pattern.

---

# 27. Recommended Initial Deliverables

Tell your developer to produce these artifacts.

## In core host/plugin
1. `extension-architecture.md`
2. module manifest schema
3. module bootstrap contract
4. host API contract
5. route registration API
6. hook/event API
7. migration registration API
8. admin slot API
9. compatibility validator
10. reference module loader
11. automated tests for the extension system

## In first reference module
1. separate repo/package
2. README
3. manifest
4. module bootstrap
5. migrations
6. services
7. routes
8. tests
9. compatibility declaration

---

# 28. Recommended Reference Implementation Order

Use this sequence exactly.

## Step 1
Design and freeze the public extension contract.

## Step 2
Implement the host-side module loader and registry.

## Step 3
Implement compatibility validation and module health tracking.

## Step 4
Implement route, hook, migration, and admin slot registration APIs.

## Step 5
Build one real reference module in a separate repo.

## Step 6
Test install, upgrade, disable, remove, and failure behavior.

## Step 7
Only after that, write third-party author docs.

---

# 29. YAGNI Guardrails

Do not build yet:

- dynamic hot-reload marketplace installer inside admin
- fully sandboxed VM execution
- cross-module dependency solver
- hyper-generic GUI schema designer
- automatic code generation for modules
- dozens of lifecycle phases
- unrestricted service container access
- module-to-module private API mesh

Version 1 should be:

- explicit
- packaged
- boot-time validated
- operationally safe
- easy to support

---

# 30. Acceptance Criteria

The extension system is ready when all of the following are true:

- core boots with zero modules
- core behaves correctly with zero modules
- a module can be installed from a separate repo/package
- module compatibility is validated before activation
- module routes, hooks, config, admin contributions, and migrations register through public APIs only
- a broken optional module does not silently corrupt core
- module uninstall/disable does not break core
- first-party modules use the same contract as third-party modules
- one real reference module proves the design end to end

---

# 31. Bottom Line

Your developer should build this as:

> **A narrow, explicit host extension contract for optional commerce modules**

Not as:

- a giant speculative framework
- a hidden internal plugin maze
- a privileged first-party shortcut system

The right design is:

- core stays lean
- extensions stay separate
- public APIs stay authoritative
- modules stay optional
- compatibility stays explicit
- behavior stays boring and supportable

That is the correct foundation for allowing third-party modules to augment `DashingCommerce` / `dashCommerce`.

---

# 32. Copy/Paste Directive for the Developer

Use this as the concise instruction block:

```md
Build dashCommerce as a host plugin with a stable public extension contract.

Requirements:
- core must remain lean and function with zero modules
- modules must be optional, installable, separate packages/repos
- all extensions must use public APIs only
- define a module manifest, bootstrap contract, lifecycle, compatibility policy, and curated host API
- support route registration, hook/event subscriptions, admin slots, migration registration, jobs, namespaced config, and health tracking
- require compatibility validation before activation
- isolate module failures so optional module errors do not break core
- use one first-party reference module in a separate repo to validate the architecture end to end
- hold first-party and third-party modules to the same contract
- keep v1 explicit, boring, DRY, and YAGNI
```

