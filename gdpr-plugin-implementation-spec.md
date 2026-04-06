# DashingCommerce GDPR Plugin Handoff Spec

This is a ready-to-send starting document for a new developer/agent. It is intentionally V1-focused and uses the same contract language as
`dashcommerce-extension-architecture-spec.md`.

## 1) Goal and constraints

Build a real first-party reference module: `dashcommerce.gdpr`.

Non-negotiables:

- keep core commerce untouched in behavior and startup flow
- module is optional and must work independently of core-specific logic changes
- no private host internals
- module install/boot uses public extension seam only
- namespaced storage and config (`dc_gdpr_*`, `modules.gdpr.*`, `/admin/api/gdpr/...`)
- deterministic behavior for submissions and destructive actions
- failure and provider errors are isolated and auditable

Out of scope for v1:

- marketplace installer and dynamic plugin registry UI
- advanced policy engine for every possible legal geography
- replacing checkout/order/payment internals
- custom framework for non-GDPR modules

## 2) Architecture alignment (required)

The module must satisfy these explicit constraints from the extension spec:

- `registerModule(...)`-style bootstrap only
- stable module manifest with semver and compatibility ranges
- lifecycle at minimum: `register -> init -> ready` (optional `shutdown`)
- hook registration, route registration, migration registration, admin extension points, jobs, and config via host APIs
- module owns its own data model (`dc_gdpr_*`), not core commerce tables
- no direct mutation of unrelated host collections
- host must continue to boot and function if module is disabled or absent

## 3) Suggested package and module identity

Recommended:

- package: `@your-org/dashcommerce-gdpr`
- module id: `dashcommerce.gdpr`
- display name: `DashingCommerce GDPR Module`
- capabilities include: `gdpr.data-export`, `gdpr.erase`, `gdpr.pseudonymize`, `gdpr.retention`, `gdpr.jobs`, `gdpr.admin-ui`

Compatibility fields are mandatory:

- `dashCommerce: ">=1.4 <2.0"`
- `emDash: ">=2.1 <3.0"` (if applicable)

## 4) V1 module scope and success condition

This module proves extension architecture by adding exactly these planes:

- API and admin operations for privacy requests
- provider registry and per-provider orchestration
- request/audit records
- scheduled background cleanup/retention checks
- deterministic idempotent processing and replay-safe behavior

It must not add:

- new checkout states
- new payment providers
- direct writes to commerce payment/inventory/order state (except read-only snapshots)

Success condition for handoff:

- can be installed/booted from a separate package in a clean host
- no commerce feature regressions when disabled
- request pipeline is reproducible and test-covered

## 5) Public contracts to implement first

Define these explicit files in module repo/package:

- `manifest.ts`
- `module.ts` (module factory / bootstrap)
- `types.ts` (contracts)
- `index.ts` (exports)

### 5.1 Module manifest

Use exact fields from architecture spec: `id`, `displayName`, `version`, `description`, `author`, `license`, `compatibility`, `capabilities`, `entrypoint`, optional `migrations`, optional `configSchema`.

### 5.2 Bootstrap contract

Use one boring convention only:

```ts
export function registerModule(host: CommerceHost): CommerceModuleDefinition
```

### 5.3 Required seam usage

Use host APIs for:

- `host.routes.registerAdminRoute(...)`
- `host.hooks.on(...)`
- `host.migrations.register(...)`
- `host.jobs.register(...)`
- `host.config.register(...)` or equivalent namespaced configuration
- `host.admin.registerOrderPanel(...)` (optional for request visibility)

No direct DB mutation outside module-owned tables.

## 6) Proposed module internal contracts

### 6.1 Subject identity

Canonical subject identity should come from existing commerce account/user primitive (decision required, placeholder: `subjectId`).

### 6.2 Provider contract

```ts
export type GdprDataSubject = {
  subjectId: string;
  subjectKind: "customer" | "user" | "contact";
  anchor?: {
    orderId?: string;
    cartId?: string;
    emailHash?: string;
  };
};

export type GdprPersonalData = {
  providerId: string;
  kind: string;
  records: Array<{ id: string; fields: Record<string, unknown> }>;
};

export type GdprProviderCapabilities = {
  canAccessExport: boolean;
  canErase: boolean;
  canAnonymize: boolean;
  canRectify: boolean;
  retentionOverrides?: Array<{
    reasonCode: string;
    details: string;
    expiresAt?: string;
  }>;
};

export type GdprOperationResult = {
  providerId: string;
  action: "export" | "erase" | "anonymize" | "rectify";
  status: "success" | "skipped" | "not_found" | "retryable" | "blocked" | "failed";
  processed: number;
  message?: string;
  artifacts?: {
    exportId?: string;
    checksum?: string;
    token?: string;
  };
  requestIdempotencyKey: string;
};

export interface GdprPersonalDataProvider {
  id: string;
  name: string;
  capabilities(): Promise<GdprProviderCapabilities>;
  discoverSubjects(input: { subjectId?: string; orderId?: string }): Promise<GdprDataSubject[]>;
  exportData(subject: GdprDataSubject, opts: { dryRun?: boolean }): Promise<GdprPersonalData>;
  anonymizeData(subject: GdprDataSubject, opts: { dryRun?: boolean; legalHoldOk?: boolean }): Promise<GdprOperationResult>;
  eraseData(subject: GdprDataSubject, opts: { dryRun?: boolean; legalHoldOk?: boolean }): Promise<GdprOperationResult>;
  rectifyData?(subject: GdprDataSubject, patch: Record<string, unknown>): Promise<GdprOperationResult>;
}
```

Note: keep provider contracts additive and boring. One contract now, evolve only when a real need appears.

### 6.3 Host-facing module API (v1)

If needed by host extensions, provide a typed entry point for providers:

- `host.gdpr?.registerProvider(provider)` (or equivalent namespaced property)

If host currently has no `gdpr` namespace, add the smallest host extension API needed in same style as existing extension seams.

## 7) Data model (module-owned tables)

All names are `dc_gdpr_*`.

### `dc_gdpr_requests`

- `id` text PK
- `requestId` text unique, human-readable ID for support
- `subjectId` text index
- `subjectKind` text
- `right` text enum (`access`, `erasure`, `rectification`, `restriction`, `objection`, `portability`)
- `status` text enum
- `scope` json/text
- `requestedBy` text
- `validationSummary` json/text
- `createdAt`, `updatedAt`, `startedAt`, `completedAt`
- `resultSummary` json/text
- `errorCode` text nullable
- `requestHash` text (for tamper/audit)

### `dc_gdpr_operations`

- `id` text PK
- `requestId` text FK-indexed
- `providerId` text index
- `action` text
- `status` text enum (`queued`,`running`,`partial`,`completed`,`blocked`,`failed`)
- `attempt` integer
- `startedAt`, `finishedAt`, `errorCode`, `errorDetails`
- `dedupeKey` text unique
- `result` json/text

### `dc_gdpr_exports`

- `id` text PK
- `requestId` text index
- `providerId` text index
- `subjectId` text index
- `payloadLocation` text
- `payloadVersion` text
- `sha256` text
- `sizeBytes` integer
- `expiresAt`, `createdAt`

### `dc_gdpr_audit`

Append-only event log table:

- `id`, `requestId`, `operationId`, `providerId`
- `actorId`, `eventType`, `eventSubType`
- `reasonCode`, `message`
- `requestContext` (ip, requestId, session/user)
- `createdAt`

### Optional retention/control table(s)

- `dc_gdpr_legal_holds` keyed by subject and reason
- `dc_gdpr_subject_index` for fast anchor lookups if your app does not already provide one

## 8) Request lifecycle

Suggested deterministic state machine:

1. `received`
2. `validating`
3. `queued`
4. `running`
5. `partially_completed`
6. `completed`
7. `failed`
8. `denied`

Rules:

- transitions must be monotonic and resumable
- `partially_completed` means no global failure if at least one provider made terminal progress
- no state is silently dropped on provider exception
- every transition writes `dc_gdpr_audit`

## 9) Processing semantics

### 9.1 Access / portability

- discover subjects from all registered providers
- collect export payloads in deterministic order
- persist artifact location and checksum
- do not inline export file on request response
- return artifact job/result handle

### 9.2 Erase / anonymize

Per provider:

- attempt `eraseData`
- if blocked by retention/legal hold, fall back to `anonymizeData`
- record per-provider terminal result and reason
- mark overall request partial/failed/completed based on provider outcomes

### 9.3 Restrict / objection

- set module-level and/or subject-level restrictions in module-owned storage
- ensure storefront/admin enforcement points are explicit and minimal
- never remove subject state required for legal retention without explicit host contract

### 9.4 Rectify

- apply controlled field-level patch using provider contract only
- record changed fields and prior values in audit details (not raw secrets)

## 10) Idempotency and concurrency

- route mutation operations require idempotency keys
- request processing jobs must use dedupe keys:
  - `${requestId}:${providerId}:${action}:${subjectId}`
- one in-flight request per `requestId` with optimistic lock or db atomic transition
- provider operations should be safe to retry and must be idempotent by key

## 11) API surface for v1

Use admin-only endpoints under one namespace:

- `POST /admin/api/gdpr/requests`
- `GET /admin/api/gdpr/requests`
- `GET /admin/api/gdpr/requests/:id`
- `POST /admin/api/gdpr/requests/:id/review`
- `POST /admin/api/gdpr/requests/:id/retry`
- `POST /admin/api/gdpr/requests/:id/cancel`
- `POST /admin/api/gdpr/requests/:id/download`
- `GET /admin/api/gdpr/audit/:id`
- `POST /admin/api/gdpr/providers/:id/test`
- `GET /admin/api/gdpr/health`

Route rules:

- all mutating endpoints use POST
- strict auth + role guard
- consistent API error shape (reuse host error conventions)
- large exports returned as job handles, not large immediate downloads

## 12) Hooks and observability

Subscribe to minimal set:

- `order.created`
- `order.payment_pending`
- `order.paid`
- `cart.upserted`

Use hooks for:

- implicit request impact scoring
- legal hold auto flags
- retention lifecycle metadata updates

Emit immutable audit logs for:

- request submissions, state transitions, provider outcomes, policy denials, retries, and completion

## 13) Security and privacy posture

- store only minimal PII needed for resolution
- normalize hashes for identifiers in logs
- redact sensitive fields from exports and logs
- no credentials/secrets in payloads
- apply RBAC matching role system already used by host
- apply module-level config gating for critical actions (e.g., who can `approve`, who can `re-run`)
- rate limits on export/delete/restrict actions
- CSRF/session protections as host expects

## 14) Storage and migration notes

- create module migrations in module package and register via host migration API
- use explicit index strategy for performance on lookups by request and subject
- migrations must be reversible for v1 if practical
- migrations should not alter core tables

## 15) Testing requirements (minimum)

Unit:

- manifest + compatibility validator
- provider contract behavior (including failure shapes)
- state machine transition matrix
- idempotency key normalization and dedupe map
- legal-hold/retention decision helper

Integration:

- module registration through host APIs
- route mounting (admin and health)
- hook dispatch wiring
- migration registration and table creation
- provider registration and invocation ordering
- duplicate submit/retry semantics

E2E:

- submit access request -> queued -> running -> completed export metadata
- erase request with one blocked provider and one deleted provider -> partial outcome and explicit reasons
- retry path after transient error
- disable module and confirm core checkout flow still works
- module re-enable and backward compatibility gate check

## 16) Milestones and sequence (recommended)

1. Confirm host extension seams are available and names are stable
2. Create module skeleton and manifest
3. Implement contracts/types and in-memory registry tests
4. Add migration tables + persistence layer
5. Add request lifecycle and orchestration
6. Add provider interfaces and a built-in commerce provider adapter
7. Add admin routes and background jobs
8. Add audit and retention behavior
9. Add integration tests + E2E
10. Add handoff docs and release notes

Each milestone must be test-verified before moving on. No speculative abstractions.

## 17) Starter files for the next developer

Create:

- `packages/plugins/gdpr/manifest.ts`
- `packages/plugins/gdpr/types.ts`
- `packages/plugins/gdpr/module.ts`
- `packages/plugins/gdpr/index.ts`
- `packages/plugins/gdpr/src/routes/gdpr-requests.ts`
- `packages/plugins/gdpr/src/jobs/process-request.ts`
- `packages/plugins/gdpr/src/services/gdpr-orchestrator.ts`
- `packages/plugins/gdpr/src/services/provider-registry.ts`
- `packages/plugins/gdpr/src/services/audit.ts`
- `packages/plugins/gdpr/src/migrations/`
- `packages/plugins/gdpr/tests/`

## 18) Team handoff package contents (what to pass on)

Bundle these with the handoff:

- this spec (v1)
- `dashcommerce-extension-architecture-spec.md`
- `COMMERCE_EXTENSION_SURFACE.md`
- any host extension API docs/manifest schema docs in the repo
- route and hook matrix from `COMMERCE_DOCS_INDEX.md`
- current plugin compatibility and baseline gates
- any relevant open questions + decisions

## 19) Open decisions before implementation

- canonical subject anchor: user id, customer id, or account id
- what legal grounds are currently represented in host data model
- retention period defaults and hard holds in current deployments
- allowed admin roles for request review and execution
- artifact storage choice (local storage vs object storage)

## 20) Team operating rules (keep this simple)

- follow DRY/YAGNI: one interface per real need
- avoid new framework layers until v2
- do not touch core behaviors unless compatibility demands it
- prefer explicit, boring code over clever abstractions
- every behavior change requires a test and a regression assertion

## 21) Handoff-ready acceptance checklist
- module registers with host and passes compatibility validation
- all API routes and hooks are wired through public host APIs
- request lifecycle runs end-to-end with deterministic outcomes
- one access and one erase operation complete successfully in fresh test data
- one partial/failing provider results in explicit partial/fail state
- no hidden coupling to private commerce internals
- core `cart/checkout/webhook` behaviors remain unchanged when module is disabled

## 22) Starter module scaffold for immediate handoff

Use this as a concrete starter copy:

- `gdpr-plugin-starter/manifest.ts`
- `gdpr-plugin-starter/src/types.ts`
- `gdpr-plugin-starter/src/module.ts`
- `gdpr-plugin-starter/src/index.ts`
- `gdpr-plugin-starter/src/migrations/0001_create_gdpr_tables.ts`
- `gdpr-plugin-starter/README.md`

The scaffold includes a minimal public-API-only `registerModule(host)` bootstrap, manifest
contracts, and extension registration skeletons for routes, hooks, jobs, and migrations.
