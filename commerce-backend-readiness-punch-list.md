# Commerce Backend Readiness Punch List

This punch list supports the backend readiness posture for a repository split where non-core extensions move to `../Dashing commerce PLANS/emdash-extensions`.

Move path anchor used by this readiness pass: ../Dashing commerce PLANS/emdash-extensions/.

## 1) Evaluate 4 strategies

### Strategy A — Manual checklist + reviewer discipline
A manual readiness process keeps friction low and gives the highest flexibility: a reviewer reads the doc and checks each item by hand. This is quick to start and has near-zero implementation complexity, but it is brittle as scope grows because it depends on people remembering every step, and repeated execution becomes error-prone. It is not DRY (each reviewer re-derives checks), has poor scalability (the same checks are repeated manually across environments), and weak observability because failures are rarely machine-enforced.

### Strategy B — Shell-only preflight script in each environment
A minimal shell script that greps for known bad patterns (`workspace:*` in moved-module consumers, missing extension paths, stale CI publish list entries) is fast and concrete with very little code, and can be run locally in seconds. This is DRYer than manual checks and has lower maintenance cost than heavier tooling, but it is brittle against JSON formatting drift and does not provide structured output for extension to CI or dashboards. It may pass now but becomes hard to scale as more readiness conditions are added.

### Strategy C — Config-driven Node readiness checker (recommended)
A small Node script with a typed manifest of expected module ownership, dependency contracts, and extension-directory invariants gives deterministic checks with machine-readable pass/fail output. It is more initial complexity than a shell grep, but still compact enough to remain easy to audit and extend. It is stronger on DRY (single source list for expected modules and path mappings), respects YAGNI (only checks we need today), and scales better for future readiness rules (new dependencies, new check types, CI integration) without rewriting ad-hoc grep strings.

### Strategy D — Full CI gate + policy package
Introduce a dedicated policy package (`commerce-readiness`) with schema, parser, and status output, then enforce on PRs via dedicated workflow. This is the most scalable and auditable long term, with best automation ergonomics and versionable outputs, but it is the highest complexity and can feel overbuilt for today’s narrow need. It also adds release/maintenance overhead and delayed feedback if not paired with local scripts.

## 2) Compare and choose

| Strategy | Complexity | DRY | YAGNI fit | Scalability | Why choose or reject |
|---|---:|:---:|:---:|:---:|---|
| A — Manual | 1/10 | ❌ | ⚪ | ❌ | Too fragile, hard to enforce consistently |
| B — Shell only | 4/10 | ⚠ | ✅ | ⚠ | Good stopgap, but not future-safe and harder to evolve |
| **C — Node manifest checker** | 5/10 | ✅ | ✅ | ✅ | Best balance: deterministic checks + low code surface + easy extension |
| D — CI policy package | 8/10 | ✅ | ⚠ | ✅✅ | Great long-term vision, likely too much for current boundary shift |

**Pick: Strategy C** for this phase because it gives immediate guardrails against the current split-risk points (dependency drift and stale publish/paths), while staying small enough to ship now and easy to evolve later.

## 3) Implementation plan (runnable)

### Step A — Add checker script
Create:
- `scripts/commerce-backend-readiness.mjs`

### Step B — Add extension directory inventory/readiness doc
Create/update:
- `Dashing commerce PLANS/emdash-extensions/README.md` (already present)
- This root punch list doc (this file) for reviewer-facing intent

### Step C — Run verification locally before handoff
Run:
```bash
pnpm readiness:commerce-backend
```

For strict enforcement (when `../Dashing commerce PLANS/emdash-extensions` is expected to be present), run:
```bash
pnpm readiness:commerce-backend:strict
```

## 4) Expected output

```text
[PASS] core extension split directory exists
[PASS] extensions directory contains required modules
[PASS] demo/template fixture dependency links are explicit local links
[PASS] preview release workflow excludes moved extension packages
[PASS] docs reference externalized extension location

Commerce backend readiness: READY
```

If anything fails, the script exits non-zero and prints file-specific fixes.
