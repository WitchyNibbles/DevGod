#!/usr/bin/env bash

set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"

echo "typecheck"
npm run typecheck

echo "workflow fixtures"
npm run verify:workflow

echo "orchestration evals"
npm run eval:orchestration

echo "audit"
npm audit --omit=dev

echo "package dry run"
npm pack --dry-run >/dev/null

echo "quality checks passed"
