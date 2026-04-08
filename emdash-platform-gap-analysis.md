# emdash-platform-gap-analysis.md

## Purpose

This document outlines where EmDash (3rd party platform) falls short relative to its own guide and what improvements would strengthen it.

Scope:
- Platform limitations only
- No changes required for plugin compliance

---

## Key Gaps

### 1. Dual API surface

Observed:
- Guide uses `emdash/plugin`
- Runtime supports `emdash`

Problem:
- Confusing for developers
- No clear authority

Fix:
- Single canonical import path

---

### 2. Manifest inconsistency

Observed:
- Guide: `network.allowedHostnames`
- Runtime: `allowedHosts`

Problem:
- Two competing schemas

Fix:
- Deprecate legacy field
- enforce one schema

---

### 3. Lifecycle abstraction leak

Observed:
- Guide lifecycle vs internal hook mapping

Problem:
- mental model mismatch

Fix:
- clearly separate public vs internal lifecycle

---

### 4. Capability enforcement unclear

Observed:
- capabilities not always enforced strictly

Problem:
- silent runtime failures possible

Fix:
- strict validation at load time

---

### 5. Documentation drift

Observed:
- guide != runtime

Problem:
- breaks developer trust

Fix:
- enforce doc-driven development

---

## Recommendations

1. Enforce strict manifest schema
2. Remove legacy compatibility paths
3. Provide official plugin test harness
4. Align CLI scaffolding with guide
5. Introduce versioned contract guarantees

---

## Bottom Line

EmDash is powerful but currently:

- partially inconsistent
- too permissive
- not fully self-enforcing

Improving contract strictness would significantly increase reliability and ecosystem trust.
