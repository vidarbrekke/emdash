# Commerce plugin compliance handoff (authoritative)

This repository uses `HANDOVER.md` as the single authoritative source for current compliance status, open issues, and next execution steps for the commerce plugin.

- `../HANDOVER.md` contains the active project status, next tasks, and gotchas.
- `../project-review-next-steps-strict.md` contains the strict execution checklist for the next platform hardening cycle.
- `emdash_guide.md` remains the platform contract reference.
- `../guide-compliance-diff-patch-plan.md`, `../guide-compliance-ci-checklist.md`, and `../packages/plugins/commerce/src/commerce-guide-compliance.test.ts` are supporting artifacts.
- `../dc_full_platform_handoff/*` is the platform architecture and marketplace rules source-of-trust for this transition.

Do not use these supporting artifacts as independent source of truth. Execute all next steps and merge decisions from `../HANDOVER.md` first.
