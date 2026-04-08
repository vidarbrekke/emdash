# what-i-would-do-differently.md

## Scope
This document is a focused post-mortem for the last two hardening passes on
`@emdash-cms/plugin-dashing-commerce` and the subsequent corrective cycle.

## Adversarial review outcome
I reviewed the changed runtime/compliance boundary for failure modes, not style.
One real defect was identified and fixed: lifecycle enforcement was split between
manual checks in `index.ts` and wrapper checks in `commerce-plugin-factory.ts`.
That split allowed future lifecycle handlers to bypass fetch checks by accident.

## What I changed to reduce risk
- Added a centralized `requireCron(ctx)` helper in
  `commerce-plugin-factory.ts`.
- Extended `wrapLifecycle(...)` to support explicit requirements for:
  - `kv`
  - `fetch`
  - `cron`
- Updated factory default lifecycle wrapping for `@emdash-cms/plugin-dashing-commerce`:
  - `onInstall` requires `kv` and `fetch`
  - `onActivate` requires `kv`, `fetch`, and `cron`
  - `onDeactivate` requires `kv` and `fetch`
- Simplified `index.ts` lifecycle handlers to consume the centralized enforcement.
- Adjusted the compliance test expectation for the cron-missing failure message
  to match the enforced error payload from the centralized guard.

## Why this is better
- The contract enforcement is now in one place (`commerce-plugin-factory.ts`),
  not duplicated across plugin call sites.
- Future lifecycle handlers have fail-fast behavior by construction.
- Test intent now checks behavior (`Cron capability missing`) rather than a
  transport-specific string from a previous handler implementation.

## Remaining high-value improvements
1. Add a contract test that asserts `onActivate` fails fast when `requireFetch`
   is missing from the context, even if the handler implementation is updated in the future.
2. Add a negative test that confirms lifecycle wrappers reject undefined `cron` even when
   `ctx.kv` and `ctx.http.fetch` are present.
3. Add a short "runtime contract" table in `guide-compliance-ci-checklist.md` documenting
   which helpers are enforced at factory level versus plugin level.

## What I would not change next
- I would not weaken manifest/route behavior until the full-money path test matrix
  requires a justified behavior change.
- I would not reintroduce legacy lifecycle keys (`plugin:activate`, etc.) because they
  were intentionally removed and regression-tested.
# what-i-would-do-differently.md

## Purpose

This document is a final handoff note describing what I would do differently from the current implementation path in order to make the commerce plugin more solid, more self-contained, and more honestly enforced.

This is not a rejection of the current direction.

The current direction is broadly correct.

The purpose of this document is to identify the places where I would tighten execution, reduce risk, and improve long-term trust in the codebase.

---

## Executive Summary

The project has made real progress.

It now has:
- a stronger governance model
- a canonical manifest direction
- a factory-based construction path
- compliance-oriented tests
- better handoff material

Those are good decisions.

What I would do differently is mostly about **how strictly the system is packaged, enforced, and represented**, not about replacing the overall architecture.

### My bottom line

I would not change the direction.

I would change the **rigor of the implementation**.

In particular, I would focus on:

1. making the plugin fully self-contained
2. removing avoidable drift between declared truth and actual truth
3. making CI enforcement explicit
4. making runtime strictness more precise
5. keeping docs honest about what is done versus what is intended

---

## What I Think Was Right

These choices were good and should be preserved:

### 1. Moving toward a spec-driven governance model
Creating a spec, contracts, factory, and execution guidance was the right move.

### 2. Introducing a canonical manifest direction
This is important for clarity and long-term maintainability.

### 3. Adding compliance-oriented tests
A dedicated compliance test is much better than relying on developer memory.

### 4. Improving handoff and developer guidance
The current project is much easier for another developer to understand.

### 5. Tightening capability and network thinking
The shift toward explicit capabilities and explicit network hostnames is correct.

These are foundational improvements. I would keep all of them.

---

## What I Would Do Differently

## 1. I would make the plugin fully self-contained from the start

### Current issue

The plugin imports the factory from outside its own package boundary, using a repo-root path.

That is the biggest flaw in the current implementation.

### Why I would change this

A plugin should not depend on repository layout to function.

When runtime code lives outside the package:
- package isolation gets weaker
- publishing gets riskier
- maintenance becomes more brittle
- refactors outside the package can break the plugin unexpectedly

### What I would do instead

Move the factory into the commerce package itself.

### Recommended location

```text
packages/plugins/commerce/src/contracts/commerce-plugin-factory.ts
```

### Principle

Runtime dependencies belong with runtime code.  
Governance docs belong outside the runtime path.

### Result

The plugin becomes self-contained, easier to test, easier to publish, and easier to trust.

---

## 2. I would unify version identity immediately

### Current issue

The package version and manifest version can diverge.

That creates two competing truths.

### Why I would change this

If the project claims to have a canonical manifest and a strong governance model, version identity cannot remain ambiguous.

Even if this does not break runtime behavior, it weakens trust in the system.

### What I would do instead

Choose one source of truth and enforce alignment.

### Preferred approach

- package version is the formal package identity
- manifest version must match it exactly
- add a test to prevent drift

### Result

One plugin, one version, one truth.

---

## 3. I would make CI enforcement explicit, not implicit

### Current issue

The compliance checks may exist, but root-level CI does not clearly prove that the commerce governance checks are always being run as a hard merge gate.

### Why I would change this

A check that probably runs is not good enough.

A check that is assumed to run is worse.

The rule only becomes real once CI makes it unavoidable.

### What I would do instead

Add an explicit CI step that runs the commerce package `check` directly.

### Principle

The more important the rule, the more visible the enforcement should be.

### Result

No ambiguity.  
No false confidence.  
No accidental regression path.

---

## 4. I would make runtime strictness more precise

### Current issue

The current route wrapping appears to require `fetch` for all routes, even where a route may not actually need it.

### Why I would change this

Global strictness is not the same as accurate strictness.

If a route does not use `fetch`, then requiring `fetch` anyway creates:
- unnecessary coupling
- broader assumptions than necessary
- harder-to-reason-about handler contracts
- less truthful enforcement

### What I would do instead

Make capability requirements match actual usage.

### Better patterns

Use one of these approaches:

#### Option A — Small capability wrappers
- `withKV(...)`
- `withFetch(...)`
- `withKVAndFetch(...)`

#### Option B — In-handler assertions
Use `requireKV(ctx)` and `requireFetch(ctx)` only where needed.

#### Option C — Route metadata-driven wrapping
Allow the route declaration to specify required capabilities.

### Result

Routes become stricter in the right way:
- clear
- precise
- honest
- easier to test

---

## 5. I would align the factory’s claims with its actual enforcement level

### Current issue

The docs imply that the factory is the central enforcement mechanism, but the implementation is still lighter than that promise.

### Why I would change this

Mismatch between code and claims is dangerous.

If the docs imply guarantees the code does not really provide, future developers stop questioning assumptions.

That is how false confidence enters a system.

### What I would do instead

Choose one of two paths and commit to it:

#### Path A — Strengthen the factory
Make it truly enforce more of the invariants claimed by the docs.

#### Path B — Narrow the docs
Describe the factory as a helpful standardization layer, not a full enforcement boundary.

### My preference

Path A, but only if done pragmatically and without over-engineering.

### Result

The factory becomes either:
- truly authoritative, or
- honestly scoped

Both are better than the current middle ground.

---

## 6. I would separate runtime code from governance artifacts more sharply

### Current issue

The project now has both runtime-enforcing code and repo-root governance documents, which is good, but the boundary is still not sharp enough.

### Why I would change this

Developers should not have to wonder:
- what is executable code
- what is policy
- what is historical review context

That uncertainty creates maintenance drag.

### What I would do instead

Make the separation unmistakable:

### A. Runtime/plugin code
Lives in the package and is required to execute the plugin.

### B. Governance and review docs
Live in repo root or docs and are used for guidance, review, and oversight.

### Result

Cleaner mental model.  
Less accidental misuse.  
Better maintainability.

---

## 7. I would keep the handoff language more conservative

### Current issue

Some handoff material still sounds slightly more complete than the actual implementation state.

### Why I would change this

Overstating completion is dangerous because it reduces scrutiny too early.

### What I would do instead

Describe the current status more conservatively.

Better phrases:
- “governance model established”
- “enforcement partially implemented”
- “hardening in progress”
- “final packaging and CI tightening still required”

### Result

The docs become more trustworthy and more useful to the next developer.

---

## 8. I would focus the remaining work on enforcement, not more architecture

### Current issue

Once a project starts adding governance layers, there is a temptation to keep adding more structure.

### Why I would change this

The current project does not need more conceptual architecture.

It needs:
- package-boundary discipline
- CI certainty
- precision in runtime enforcement
- reduction of drift

### What I would do instead

Stop adding new abstractions unless they solve a real remaining weakness.

### Result

A tighter system, not a more elaborate one.

---

## What I Would Prioritize Next

If I were taking over now, I would do the following in this exact order:

### Phase 1 — Fix the biggest structural weakness
1. Move `commerce-plugin-factory.ts` into the commerce package
2. Update imports to be package-local
3. Verify the plugin stands alone cleanly

### Phase 2 — Remove source-of-truth ambiguity
4. Unify manifest version and package version
5. Add a test for version consistency
6. Add a test that confirms plugin export uses the canonical manifest

### Phase 3 — Make enforcement real
7. Add an explicit CI step for the commerce package `check`
8. Confirm that CI failure blocks merge

### Phase 4 — Improve precision of strictness
9. Refine route-level capability enforcement
10. Remove global capability assumptions where unnecessary

### Phase 5 — Close trust gaps
11. Expand compliance tests for the highest-risk invariants
12. Adjust docs that overstate completion
13. Keep governance docs and runtime code clearly separated

---

## What I Would Not Do

To be equally clear, I would **not** do the following:

- I would not rewrite the architecture
- I would not broaden scope into EmDash core unless unavoidable
- I would not add large abstractions just because the governance model exists
- I would not keep brittle repo-root runtime dependencies
- I would not treat “tests exist” as the same thing as “tests are enforced”
- I would not call the system fully hardened before package locality and CI are resolved

---

## Desired End State

What I want from this codebase is simple.

I want it to be:

### Self-contained
The plugin can stand on its own without repo-root runtime imports.

### Canonical
There is one true manifest and one true version identity.

### Explicit
Required runtime capabilities are asserted where actually needed.

### Enforced
CI clearly blocks regressions.

### Honest
The docs describe the actual state of the system, not the aspirational state.

### Durable
Another developer can take over without inheriting hidden traps.

---

## Final Assessment

The current progress is real and meaningful.

The project is on the right track.

What I would do differently is not a new strategy.  
It is a tighter execution of the same strategy.

### Final message to the next developer

Do not add more architecture.

Do not get distracted by EmDash internals.

Do not over-complicate the governance model.

Instead:
- make the plugin self-contained
- remove drift
- make CI explicit
- make enforcement precise
- keep the docs honest

That is how this becomes solid.
