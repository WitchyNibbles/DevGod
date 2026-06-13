#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

cd "$REPO_ROOT"

if node -e 'const packageJson = require("./package.json"); process.exit(typeof packageJson.scripts?.["setup:local"] === "string" ? 0 : 1);'; then
  npm run setup:local -- "$@"
else
  npm run devgod -- setup-local "$@"
fi
