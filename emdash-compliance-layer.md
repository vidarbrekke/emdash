# EmDash Compliance Layer: How To Apply This In The Real Repo

## Intent

This package is not meant to be the final implementation detail for EmDash. It is the first hard gate that turns your authoritative spec into code-enforced policy.

## What to wire into the real monorepo

### 1. Lint gates
Add the plugin rules at the monorepo root and fail CI on:
- undeclared fetch use
- cross-plugin source imports
- hardcoded secrets
- missing manifest capabilities

### 2. Runtime compliance suites
For every production plugin, add a `*.compliance.test.ts` file that proves:
- deterministic output
- replay-safe webhook handling
- declared ownership of each collection it mutates
- stable manifest shape

### 3. Repo conventions to adopt
Use these conventions to make the rules effective:
- every plugin exports `plugin`
- every plugin has a `manifest`
- every plugin declares `manifest.capabilities`
- every plugin declares `manifest.collections`
- every side-effectful route or webhook has a replay-safe path that can be called by the harness

## What still needs custom repo work

Some rules are framework-specific and should be added next:
- forbid D1, KV, or queue access outside declared adapters
- validate route method enforcement
- assert schema validation before persistence
- assert checkout/finalization idempotency with real storage
- assert capability narrowing by package boundary

## Recommended next four rules for your actual codebase

1. **no-storage-write-without-schema-parse**
   - Detect writes not preceded by schema validation.

2. **no-route-without-method-guard**
   - Detect route handlers that do not explicitly enforce HTTP method.

3. **no-finalize-without-idempotency-key**
   - Detect payment finalization flows missing a durable idempotency guard.

4. **no-adapter-bypass**
   - Detect direct use of platform APIs when the repo requires capability adapters.

## CI policy

Block merge unless all pass:
- lint
- typecheck
- unit tests
- compliance tests

## Governance rule

If a new plugin cannot be expressed in this compliance model, either:
- the plugin design is wrong, or
- the platform contract is under-specified

Do not silently bypass the harness.
