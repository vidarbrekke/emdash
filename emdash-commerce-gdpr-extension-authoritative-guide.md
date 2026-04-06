# EmDash Commerce GDPR Extension — Authoritative Build Guide

## Purpose

This document is the **authoritative implementation guide** for building a **separate, optional GDPR extension** for the EmDash commerce plugin ecosystem (`dashCommerce` / `DashingCommerce`).

It assumes the current commerce plugin is being built with the following priorities:

- modular backend
- DRY and YAGNI architecture
- additive extension surfaces
- no legal/compliance code polluting core commerce flows
- safe future admin and customer-facing UI work
- strong TypeScript discipline
- explicit services, routes, storage, and tests

This guide is written for the developer who will build the GDPR extension.

---

# 1. Executive Summary

The GDPR feature set **must not be built into core commerce behavior**.

Instead, it must be built as a **separate extension/plugin and separate repository** that:

- installs independently
- can be enabled or disabled without affecting normal commerce behavior
- depends only on **public extension APIs**
- owns only GDPR-specific data, routes, services, and UI
- enforces GDPR requirements **only when installed and enabled**
- remains explicit, auditable, and boring

## Non-negotiable design rule

> The extension must act as an **enforcement layer around data usage**, not as a rewrite of the commerce plugin.

That means:

- no invasive core edits
- no hidden coupling
- no private-internal reach-ins
- no “smart” compliance engine
- no legal-tech sprawl

---

# 2. Why This Must Be an Optional Extension

GDPR support is important, but it is **not core commerce domain logic**.

Core commerce domain logic includes:

- products
- pricing
- catalog
- variants
- bundles
- digital entitlements
- checkout
- order snapshots
- payment finalization
- tax/shipping behavior
- order state

GDPR support instead concerns:

- consent tracking
- data export
- data deletion/anonymization
- retention policy enforcement
- processor disclosure support
- audit logging
- tracking/marketing restrictions

These are adjacent to commerce, but they are not the same layer.

## Why optional is the correct posture

1. Many installs will not target EU customers initially.
2. Even when EU customers exist, compliance policy should be explicit and switchable.
3. Core checkout/order behavior should not carry unnecessary complexity cost.
4. Compliance logic evolves on a different timeline than catalog/checkout logic.
5. A separate module creates a clean maintenance and monetization boundary.

---

# 3. Architectural Positioning

## Recommended structure

- **Core repo:** EmDash commerce plugin
- **Extension repo:** GDPR module

The GDPR extension should be installed like any other additive module and should register itself through the platform/module loader.

## Required posture

The extension must rely on:

- public module registration
- public route registration
- public migration registration
- public admin UI hooks
- public customer account UI hooks
- public event hooks
- public service/container injection
- public config/feature-flag registration

It must not rely on:

- private helper imports
- direct mutation of internal service state
- hidden route patching
- monkey-patching handlers
- schema assumptions not guaranteed by the core plugin/platform

---

# 4. What the Core Commerce Plugin Must Provide First

Before building the extension, the core EmDash commerce system must expose a stable extension surface.

If these do not exist yet, they should be added in core **before** implementing the GDPR extension.

## 4.1 Module registration contract

The platform should allow something structurally equivalent to:

```ts
registerModule({
  name: 'gdpr',
  version: '0.1.0',
  register(context) {
    // register routes, migrations, hooks, services, UI
  },
})
```

## 4.2 Route registration hooks

The extension must be able to add:

- admin routes
- customer/self-service routes
- internal API routes

without editing the core router files directly.

## 4.3 Migration registration

The extension must be able to register its own migrations cleanly.

GDPR-owned tables must live under extension ownership, not be scattered into unrelated core migrations.

## 4.4 Service access

The extension must be able to access:

- database connection or repository abstraction
- authenticated subject/user context
- order/customer lookup services
- event bus / hook system
- configuration service

## 4.5 UI extension points

The platform should expose extension slots for:

- admin navigation / settings pages
- customer account pages
- privacy/download/delete actions
- consent management UI

## 4.6 Event hooks

The extension should be able to listen to events such as:

- customer created
- order placed
- order fulfilled
- marketing email requested
- analytics/tracking init requested
- customer deleted
- account export requested

---

# 5. Scope of the GDPR Extension

The GDPR extension should only own the following responsibilities.

## 5.1 In scope

- consent storage and retrieval
- marketing consent enforcement
- analytics/tracking consent enforcement
- customer data export
- deletion / anonymization workflows
- retention sweep jobs
- GDPR audit logs
- processor registry support
- privacy-related admin/customer endpoints
- privacy-related admin/customer UI components

## 5.2 Out of scope

- legal advice
- privacy policy generation
- checkout core rewrite
- order domain ownership
- generic CRM logic
- general-purpose notification system
- full country-by-country compliance matrix
- “AI compliance assistant”
- dynamic no-code policy builder

---

# 6. Required Repository Strategy

This should be a **separate GitHub repository**.

## Recommended repo name

Preferred:

- `emdash-gdpr-module`

Other acceptable names:

- `dashcommerce-gdpr`
- `dashingcommerce-gdpr`

## Why a separate repo is correct

- separate release cadence
- separate changelog
- separate compatibility policy
- clearer monetization boundary
- cleaner issue tracking
- safer maintenance posture

---

# 7. Recommended Repo Layout

```text
emdash-gdpr-module/
├─ README.md
├─ LICENSE
├─ CHANGELOG.md
├─ .gitignore
├─ .editorconfig
├─ .gitattributes
├─ package.json
├─ tsconfig.json
├─ tsconfig.build.json
├─ eslint.config.js
├─ vitest.config.ts
├─ .github/
│  └─ workflows/
│     └─ ci.yml
├─ docs/
│  ├─ architecture.md
│  ├─ compatibility.md
│  ├─ installation.md
│  ├─ configuration.md
│  └─ release-process.md
├─ src/
│  ├─ index.ts
│  ├─ manifest.ts
│  ├─ module.ts
│  ├─ config/
│  │  └─ gdpr-config.ts
│  ├─ migrations/
│  │  └─ 001_gdpr_tables.sql
│  ├─ services/
│  │  ├─ consent-service.ts
│  │  ├─ export-service.ts
│  │  ├─ erasure-service.ts
│  │  ├─ retention-service.ts
│  │  └─ audit-service.ts
│  ├─ repositories/
│  │  └─ gdpr-repository.ts
│  ├─ routes/
│  │  ├─ admin-routes.ts
│  │  └─ customer-routes.ts
│  ├─ hooks/
│  │  ├─ register-hooks.ts
│  │  ├─ email-hooks.ts
│  │  └─ tracking-hooks.ts
│  ├─ ui/
│  │  ├─ admin/
│  │  └─ customer/
│  ├─ types/
│  │  └─ gdpr-types.ts
│  └─ utils/
│     ├─ hashing.ts
│     └─ country.ts
└─ tests/
   ├─ unit/
   ├─ integration/
   └─ fixtures/
```

---

# 8. Core Enforcement Model

The entire module should be built around one simple rule:

> Separate **transactional processing** from **marketing and tracking**.

## 8.1 Allowed without consent

These flows are generally allowed because they are necessary to fulfill the contract:

- checkout
- payment
- shipping
- receipts
- order confirmation
- account access
- customer service related to an order
- fraud/security controls
- tax/accounting recordkeeping

## 8.2 Must require consent

These flows must be blocked unless the proper consent exists:

- marketing email campaigns
- promotional product recommendations not strictly transactional
- non-essential analytics
- ad tracking
- personalization based on non-essential profiling
- most tracking cookies/scripts beyond strictly necessary operation

---

# 9. Feature Flag Requirements

The extension must be explicitly feature-flagged.

## Required flags

```ts
GDPR_MODULE_ENABLED = true | false
GDPR_ENFORCE_MARKETING = true | false
GDPR_ENFORCE_ANALYTICS = true | false
GDPR_SELF_SERVICE_ENABLED = true | false
GDPR_RETENTION_JOBS_ENABLED = true | false
```

## Rules

- default posture should be conservative and explicit
- when the module is not installed or not enabled, core commerce behavior must continue normally
- no core route/service should fail because the GDPR extension is absent

---

# 10. Required Data Classification Model

Every GDPR-relevant processing action must declare:

```ts
type DataPurpose = 'transactional' | 'marketing' | 'analytics' | 'support' | 'privacy_request'
type LegalBasis = 'contract' | 'consent' | 'legitimate_interest' | 'legal_obligation'
```

Every processing decision point should explicitly classify its operation.

## Required rule

Reject any GDPR-controlled processing call that lacks declared purpose and legal basis.

Example:

```ts
processCustomerData({
  subjectId,
  purpose: 'marketing',
  legalBasis: 'consent',
  action: 'send_campaign_email',
})
```

This classification should remain explicit. Do not hide it behind “magic” abstractions.

---

# 11. Required Database Ownership

The extension should own only GDPR-specific tables.

## Recommended minimum tables

### 11.1 `gdpr_consents`

Tracks current/updated consent state.

Suggested fields:

- id
- subject_type
- subject_id
- purpose
- status
- source
- created_at
- updated_at

### 11.2 `gdpr_audit_log`

Tracks all GDPR-sensitive actions.

Suggested fields:

- id
- action
- subject_type
- subject_id
- actor_type
- actor_id
- metadata_json
- created_at

### 11.3 `gdpr_erasure_requests`

Tracks delete/anonymize workflows.

Suggested fields:

- id
- subject_type
- subject_id
- status
- requested_by
- created_at
- updated_at

### 11.4 Optional `gdpr_data_registry`

If you want a queryable registry of where personal data lives.

Suggested fields:

- id
- entity_name
- table_name
- field_name
- category
- legal_basis
- retention_days
- erasure_strategy
- active

## Rule

Do not alter core commerce tables unnecessarily just to support GDPR. Prefer extension-owned data plus explicit anonymization/update routines against public data access paths.

---

# 12. Subject Model Requirements

Do not assume only one user model.

In eCommerce, you may have:

- registered account users
- guest checkouts
- subscribers
- leads
- support/chat-only contacts

The extension should therefore use a flexible identity model like:

```ts
type SubjectType = 'customer' | 'guest' | 'subscriber' | 'account_user'
type SubjectRef = {
  subjectType: SubjectType
  subjectId: string
}
```

This keeps the module usable across different customer identities.

---

# 13. Consent System Requirements

The consent system is mandatory for marketing and analytics enforcement.

## Required functions

```ts
hasConsent(subject, purpose)
grantConsent(subject, purpose, source)
revokeConsent(subject, purpose, source)
listConsents(subject)
```

## Consent purposes

At minimum:

- marketing
- analytics
- personalization

## Rules

- marketing consent must be separate and explicit
- consent checkboxes must not be pre-checked
- consent must not be bundled into checkout completion
- consent changes must be logged
- unsubscribe must update consent state immediately

---

# 14. Checkout Integration Rules

The GDPR extension must not take over checkout.

Instead, it should extend checkout behavior through public hooks.

## Required checkout behavior

### Allowed

- collect required billing/shipping/contact data for the order
- process payment
- send order confirmation
- store required records for accounting/tax/fraud/customer support

### Required optional UI

An optional, **unchecked** marketing opt-in control may be shown.

Example pattern:

- “Email me news, offers, and relevant product updates.”

### Forbidden

- pre-checked marketing box
- hidden consent inside terms acceptance
- making marketing consent required for checkout
- initializing non-essential tracking by default before consent

---

# 15. Email Enforcement Requirements

The extension must split email traffic into two types:

```ts
type EmailKind = 'transactional' | 'marketing'
```

## 15.1 Transactional email

Allowed without marketing consent:

- order confirmation
- receipt/invoice
- shipping updates
- password reset
- support responses tied to an order/account

## 15.2 Marketing email

Must be blocked unless consent or an explicitly supported lawful posture exists in your implementation policy.

For v1, the safest developer rule is:

> Require explicit marketing consent.

## 15.3 Mandatory marketing email checks

Every marketing send path must verify:

- subject exists
- marketing consent exists
- unsubscribe URL exists
- sender identity exists

If any required check fails, the send must be blocked.

## 15.4 Unsubscribe requirements

Unsubscribe must:

- be simple
- not require login
- take effect immediately or near-immediately
- update the central consent state
- be reflected across all relevant outbound systems

---

# 16. Analytics and Tracking Enforcement

This is a major risk area and must be handled explicitly.

## Default rule

Non-essential tracking must default to off.

## The extension should gate:

- analytics script initialization
- ad pixel initialization
- personalization tracking
- cross-session profiling hooks

## Required flow

```ts
if (!hasConsent(subject, 'analytics')) {
  blockTrackingInit()
}
```

## Important rule

Do not let the extension “advise” here. It must **enforce**.

If analytics/tracking consent is absent, initialization should not happen.

---

# 17. Data Export Requirements

The extension must provide a clear export capability.

## Required endpoint/service

Example shape:

```ts
exportCustomerData(subject)
```

Possible HTTP shape:

```http
GET /privacy/export/:subjectType/:subjectId
```

## Export payload should include, where applicable

- profile/account data
- order-linked data
- consent records
- support/chat records if stored
- GDPR request history if useful
- processor-related metadata only if appropriate

## Export format

At minimum:

- JSON

Optional:

- CSV bundle or downloadable archive

## Rule

Export logic should aggregate from public service/repository boundaries, not from random direct table scans scattered through the codebase.

---

# 18. Deletion / Erasure Requirements

The extension must implement deletion/anonymization as a workflow, not as a blunt destructive shortcut.

## Core rule

If records must remain for tax/accounting/fraud/operational reasons, **anonymize personal data** instead of deleting the entire business record.

## Required result categories

- deleted
- anonymized
- retained

## Typical policy

- account profile: delete or anonymize
- order records: retain business records, anonymize personal fields where appropriate
- analytics events: delete
- support/chat history: delete or anonymize depending on retention policy
- logs: delete or detach where appropriate

## Required service

```ts
eraseSubjectData(subject)
```

## Required audit trail

Both start and completion of erasure workflow must be logged.

---

# 19. Retention Engine Requirements

The extension must support scheduled data lifecycle management.

## Required service

```ts
runRetentionSweep()
```

## Rules

- no indefinite storage of non-essential personal data
- retention must be explicit and table/entity specific
- retention actions must be logged
- retention logic must be explicit, not hyper-generic

## Good posture

Prefer boring, table-by-table rules over a “universal dynamic policy engine.”

---

# 20. Audit Logging Requirements

The extension must log at least:

- consent granted
- consent revoked
- export requested
- export completed
- erasure requested
- erasure completed
- retention sweep run
- tracking blocked due to missing consent
- marketing send blocked due to missing consent

Audit logs must be append-only in practice.

---

# 21. Required Routes and UI Surface

The extension should expose a minimal, clear privacy surface.

## 21.1 Admin surface

- GDPR settings page
- consent/audit inspection
- retention settings
- processor registry management
- export/delete request handling if admin-mediated

## 21.2 Customer/self-service surface

- download my data
- manage consent
- request deletion/anonymization

## Rule

Do not overbuild the UI. Version 1 should stay narrow and functional.

---

# 22. Third-Party Processor Registry

The extension should include support for documenting processors.

Example entries:

- payment processor
- email service provider
- analytics vendor
- hosting provider
- support/chat provider

This does not need to become a huge framework. A simple structured registry is enough.

Suggested shape:

```ts
type ProcessorRecord = {
  name: string
  purpose: string
  dataCategories: string[]
  region?: string
  notes?: string
}
```

---

# 23. Compatibility Policy

The GDPR extension must publish a compatibility matrix.

Example:

- `emdash-gdpr-module 0.1.x` supports `dashCommerce >=1.4 <2.0`

Put compatibility in:

- README
- docs/compatibility.md
- release notes

## Rule

Do not silently assume compatibility with changing core internals.

---

# 24. Recommended Development Sequence

## Phase 1 — repo bootstrap

Create:

- repository
- package metadata
- TypeScript config
- lint/test/build
- README/docs skeleton
- CI workflow

## Phase 2 — extension contract validation

Before writing GDPR logic, confirm:

- module registration API
- route registration API
- migration registration API
- event/hook APIs
- service access APIs
- UI extension APIs

If these are not stable, stop and improve core extension surfaces first.

## Phase 3 — persistence layer

Add:

- consent table
- audit log table
- erasure request table
- repository layer

## Phase 4 — service layer

Add:

- consent service
- export service
- erasure service
- retention service
- audit service

## Phase 5 — enforcement hooks

Add:

- checkout opt-in handling
- marketing send gating
- analytics/tracking gating
- unsubscribe handling

## Phase 6 — routes and UI

Add:

- admin routes/pages
- customer routes/pages
- privacy self-service actions

## Phase 7 — tests and hardening

Add:

- unit tests
- integration tests
- migration tests
- compatibility tests
- acceptance flow tests

---

# 25. Test Requirements

This module should ship with a must-pass test posture.

## Minimum test areas

### Consent tests

- grants consent
- revokes consent
- blocks marketing without consent
- allows marketing with consent

### Analytics tests

- blocks tracking initialization without consent
- allows tracking after consent

### Export tests

- exports all relevant subject data
- output shape is stable

### Erasure tests

- deletes where policy says delete
- anonymizes where policy says anonymize
- retains required business record shells
- logs workflow start and completion

### Retention tests

- sweep removes expired data
- sweep preserves non-expired data
- sweep logs execution

### Disabled-module tests

- module absent or disabled does not break commerce flows
- routes are absent or return disabled-state behavior as designed

---

# 26. What the Developer Must Avoid

Do not build:

- a giant legal compliance framework
- a no-code policy engine
- an AI policy interpreter
- a hidden dependency inside checkout internals
- a private-internal import web
- an ORM-heavy abstraction maze
- cross-country mega-compliance logic in v1

Keep it narrow.

Keep it explicit.

Keep it auditable.

---

# 27. Coding Style and Architectural Rules

This project should follow the same quality posture as the core plugin work:

- small modules
- single-responsibility services
- explicit repository boundaries
- additive hooks
- minimal abstractions
- TypeScript strictness
- clean migrations
- stable public APIs
- tests before broad integration
- no speculative architecture

## Preferred implementation style

- explicit service methods
- explicit route handlers
- explicit table-level retention/anonymization logic
- plain structured types
- boring code that a junior developer can follow

---

# 28. Release and Branch Discipline

## GitHub posture

- protect `main`
- require pull requests
- require CI checks
- prefer squash merges
- no force pushes

## CI minimum

- install
- typecheck
- test
- build

## Suggested semantic versioning posture

- `0.x` while extension contract is still moving
- `1.0.0` only after:
  - module contract stable
  - migrations stable
  - core services complete
  - end-to-end acceptance tests pass
  - compatibility matrix published

---

# 29. Acceptance Criteria

The extension is ready only when all of the following are true.

## Installation / architecture

- installs independently of core commerce repo
- can be enabled or disabled without breaking the platform
- relies only on public extension APIs

## Enforcement

- marketing sends are blocked without required consent
- analytics/tracking initialization is blocked without required consent
- consent changes are centrally stored and auditable
- unsubscribe updates consent immediately

## Data rights

- export works for supported subject types
- erasure/anonymization workflow works and is logged
- retention sweep exists and runs correctly

## Quality

- module has its own repo, docs, tests, changelog, and CI
- compatibility policy is documented
- code remains DRY, YAGNI, and explicit

---

# 30. Final Recommendation

Build the GDPR capability as:

> **a separate, optional, enforcement-focused extension that integrates through public EmDash commerce hooks and owns its own data, routes, services, and tests**

That is the correct architecture.

Not because it is fashionable.

Because it is the least fragile, least coupled, most maintainable, most monetizable, and most auditable way to do it.

---

# 31. Copy/Paste Developer Brief

Use this exact brief for the developer:

```md
Build GDPR support as a separate repo and separate optional extension for the EmDash commerce plugin ecosystem.

Requirements:
- Do not add GDPR logic into core commerce flows except through public extension APIs.
- The extension must be installable, removable, and feature-flagged.
- It must own consent tracking, export, erasure/anonymization, retention jobs, audit logs, and privacy-related routes/UI.
- It must enforce blocking of marketing and analytics/tracking when consent is missing.
- It must not break normal commerce behavior when disabled or absent.
- It must use explicit services, repositories, routes, migrations, and tests.
- It must stay DRY, YAGNI, boring, and auditable.
- It must publish a compatibility matrix for supported EmDash commerce versions.
- Do not build a giant compliance platform. Build a narrow enforcement extension.
```

---

# 32. Recommended Next Artifact

The next useful artifact after this document is:

- a **developer handoff.md** with exact repo bootstrap files and starter contents, or
- a **must-pass test plan** for the GDPR extension, or
- a **public extension contract checklist** for the core EmDash commerce plugin
