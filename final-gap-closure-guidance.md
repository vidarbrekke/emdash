# final-gap-closure-guidance.md

## Purpose

This document provides **final, focused guidance** to bring the commerce plugin from “near-ready” to **solid, reviewer-ready, and production-trustworthy**.

You are not building new architecture.

You are **closing the last 10–15% gap**.

---

## Current State (Reality)

The plugin is now:

- structurally sound
- mostly self-contained
- understandable by a new developer
- aligned with governance direction

However:

> It is not yet fully *tight, precise, and enforceable*.

Your job is to **tighten**, not expand.

---

## Core Principle

> Do not add complexity.  
> Do not add new systems.  
> Do not broaden scope.

Instead:

- make enforcement precise
- remove ambiguity
- ensure CI guarantees correctness
- align code, tests, and claims

---

# Final Gap Areas (Must Fix)

## 1. Capability Enforcement Precision (Highest Priority)

### Problem
Routes are likely enforcing capabilities globally (e.g., always requiring `fetch`).

### Goal
Each route must require **only what it actually uses**.

### Fix
Use:
- `withKV(...)`
- `withFetch(...)`
- or in-handler assertions (`requireKV`, `requireFetch`)

---

## 2. Make Factory Enforcement Credible

### Goal
Factory must:
- validate manifest
- reject wildcard hosts
- enforce required capabilities
- standardize plugin construction

---

## 3. Lock Critical Invariants with Tests

Add tests for:

- manifest version = package version
- plugin uses canonical manifest
- no wildcard hosts
- required capabilities present
- no legacy lifecycle usage
- factory usage enforced

---

## 4. Make CI Enforcement Unmistakable

Add an explicit CI step:

- run commerce package `check`
- ensure failure blocks merge

---

## 5. Align Code and Documentation

Docs must reflect reality.

Avoid overstatements like “fully enforced” unless true.

---

## 6. Maintain Strict Package Boundaries

- no runtime imports from repo root
- everything required at runtime must live inside the package

---

# What NOT to Do

Do NOT:

- redesign architecture
- add new abstraction layers
- expand governance system
- rely on assumptions instead of tests

---

# Final Execution Plan

1. Fix capability precision
2. Add invariant tests
3. Strengthen factory enforcement
4. Lock CI gating
5. Align docs

---

# Definition of Done

Done means:

- routes require only what they use
- factory enforces real invariants
- CI blocks non-compliance
- tests cover critical rules
- docs are accurate
- plugin is self-contained

---

# Final Instruction

Focus on **tightening, not building**.

If unsure:
- choose precision
- choose enforcement
- choose simplicity
