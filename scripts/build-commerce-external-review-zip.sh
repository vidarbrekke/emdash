#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

STAMP="$(date +%Y%m%d-%H%M%S)"
OUT="commerce-plugin-external-review-${STAMP}.zip"
TMP_STAGING="$(mktemp -d)"

cleanup() {
  rm -rf "$TMP_STAGING"
}
trap cleanup EXIT

rsync -a \
  --exclude '.git' \
  --exclude 'node_modules' \
  --exclude '.turbo' \
  --exclude '.vite' \
  --exclude '.cache' \
  --exclude 'dist' \
  --exclude 'build' \
  packages/plugins/commerce/ "$TMP_STAGING/packages/plugins/commerce/"

REVIEW_FILES=(
  "HANDOVER.md"
  "pre-frontend-backend-hardening.md"
  "GOVERNANCE_INDEX.md"
  "emdash-dashingcommerce-repo-governance.md"
  "emdash-compliance-layer.md"
  "emdash-contract-driven-compliance.md"
  "emdash_authoritative_spec.md"
  "commerce-plugin-architecture.md"
  "dashcommerce-extension-architecture-spec.md"
  "gdpr-plugin-implementation-spec.md"
  "emdash-commerce-gdpr-extension-authoritative-guide.md"
  "eu-selling-marketing-gdpr-guide.md"
  "scripts/generate-commerce-route-compliance-snapshot.mjs"
  "scripts/lint-json.mjs"
  "scripts/build-commerce-external-review-zip.sh"
  "docs/compliance.md"
  "docs/compliance-source-of-truth.md"
  "packages/core/src/astro/routes/api/plugins/route-handler.ts"
  "packages/core/src/astro/routes/api/plugins/[pluginId]/[...path].ts"
  "packages/core/tests/unit/plugins/plugin-route-auth.test.ts"
  "ADMIN_CONSUMER_UI_SMOKE_READINESS.md"
  "README.md"
  "AGENTS.md"
  "guide-compliance-diff-patch-plan.md"
  "guide-compliance-ci-checklist.md"
  "package.json"
  "pnpm-workspace.yaml"
  "pnpm-lock.yaml"
  "docs/archived-commerce-governance"
  "docs/archive/2026-04-commerce-hardening/README.md"
  "docs/archive/2026-04-commerce-hardening/dashing-commerce-diff-patch-update.md"
  "docs/archive/2026-04-commerce-hardening/dashing-commerce-diff-style-patch-plan.md"
  "docs/archive/2026-04-commerce-hardening/dashing-commerce-execution-plan.md"
  "docs/archive/2026-04-commerce-hardening/dashing-commerce-execution-plan-update.md"
  "packages/plugins/commerce/COMMERCE_DOCS_INDEX.md"
  "packages/plugins/commerce/COMMERCE_EXTENSION_SURFACE.md"
  "packages/plugins/commerce/FINALIZATION_REVIEW_AUDIT.md"
  "packages/plugins/commerce/CI_REGRESSION_CHECKLIST.md"
)

for file in "${REVIEW_FILES[@]}"; do
  if [ -d "$file" ]; then
    mkdir -p "$TMP_STAGING/$(dirname "$file")"
    cp -R "$file" "$TMP_STAGING/$file"
  elif [ -f "$file" ]; then
    mkdir -p "$TMP_STAGING/$(dirname "$file")"
    cp "$file" "$TMP_STAGING/$file"
  fi
done

find "$TMP_STAGING" -type f -name '*.zip' -delete

if (cd "$TMP_STAGING" && zip -rq "$ROOT/$OUT" . -x "*.DS_Store"); then
  echo "Wrote $ROOT/$OUT"
else
  echo "Failed to create zip bundle at $ROOT/$OUT"
  exit 1
fi
