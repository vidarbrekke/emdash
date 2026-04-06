# Commercial Viability Addendum for DashingCommerce

## Purpose

This addendum defines how the project keeps a clear commercial north-star while preserving the optional fairness and accessibility governance introduced in `GOODNESS_AND_ACCESSIBILITY_CHARTER.md`.

The default promise is: **core commerce must stay fast, simple, and neutral; optional governance modules must be explicit and monetizable.**

## 1) Commercial positioning

- Core platform remains focused on commerce execution: catalog, cart, checkout, payment, order, fulfillment, and observability.
- Fairness/promotional privilege features are treated as **optional extension products**, not a core requirement.
- Compliance capabilities (GDPR module and related provider workflows) are also optional by design and installable independently from commerce core.
- Every optional extension must support:
  - deterministic enable/disable,
  - clear rollback path,
  - and operational kill-switch behavior.

## 2) Monetization-friendly architecture principle

- Keep value in installable modules, not in fragile platform assumptions.
- Preserve closed-kernel guarantees for money path components in `packages/plugins/commerce`.
- Restrict policy-heavy logic to separate modules with their own tables, routes, and jobs.
- Document public contracts so external partners can build paid capabilities safely.

## 3) Recommended commercial paths

### A) Trust & compliance bundle (base add-on)
- GDPR module and optional provider marketplace connectors.
- Directly valuable for B2B, SaaS-integrated stores, and EU-facing brands.
- Measurable value: reduced compliance risk and lower legal drag.

### B) Creator/visibility bundle (optional)
- Promotions, ranking boosts, campaign controls, creator visibility controls.
- Governed by `GOODNESS_AND_ACCESSIBILITY_CHARTER.md`.
- Must provide:
  - objective scoring inputs,
  - policy rule IDs,
  - audit evidence records,
  - appeal flows and expiration logic.

### C) Managed operations service (services layer)
- Optional for hosts needing runbooks, monitoring, and provider operations support.
- Includes incident playbooks for third-party provider outages and regulatory workflow support.

## 4) Non-negotiable commercial guardrails (before any public release)

1. Do not gate commerce outcomes (conversion, payment, fulfillment) behind optional moderation features.
2. Ensure optional modules can be off by default and still operate core flawlessly.
3. Require explicit pricing and support boundaries for optional modules in docs.
4. Keep moderation decisions explainable, reversible, and auditable.
5. Preserve a stable API surface for partners; avoid lock-in via private internals.

## 5) Launch checks (must pass for GA or external handoff)

- Core commerce green on regression tests and no scope creep into money path behavior.
- GDPR module can be booted independently in a clean host.
- Optional promotional/fairness module, if enabled, is tied to:
  - `GOODNESS_AND_ACCESSIBILITY_CHARTER.md`,
  - documented role/review workflow,
  - and evidence-backed appeal process.
- Provider outage playbook exists for critical external dependencies.
- Revenue-ready documentation exists: support scope, SLA assumptions, and upgrade policy.

## 6) Messaging guidance

Avoid framing this stack as moral positioning alone.
Position it as:
- trust by design,
- lower compliance burden,
- predictable extension ecosystem,
- and clear path from free/required core to paid optional capabilities.

## 7) Next-step action

- keep this file as a mandatory reference in all external handoff material.
