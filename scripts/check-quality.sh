#!/usr/bin/env bash

set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"

echo "typecheck"
npm run typecheck

echo "coverage"
npm run check:coverage

echo "workflow schema"
npm run verify:workflow-schema

echo "agent caveman contract"
npm run verify:agent-caveman

echo "workflow fixtures"
npm run verify:workflow

echo "orchestration evals"
npm run eval:orchestration

echo "orchestration benchmark"
npm run benchmark:orchestration >/dev/null

echo "frontier model benchmark"
npm run benchmark:frontier-models >/dev/null

echo "docs/runtime drift"
bash scripts/check-docs-runtime-drift.sh

echo "audit"
npm audit --omit=dev

echo "package surface"
npm run verify:package-surface

echo "package dry run"
npm pack --dry-run >/dev/null

echo "quality checks passed"
