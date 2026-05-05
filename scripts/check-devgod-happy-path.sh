#!/usr/bin/env bash

set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
requested_task_id=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --repo-root)
      [[ $# -ge 2 ]] || { printf 'missing value for %s\n' "$1" >&2; exit 2; }
      repo_root="$2"
      shift 2
      ;;
    --task-id)
      [[ $# -ge 2 ]] || { printf 'missing value for %s\n' "$1" >&2; exit 2; }
      requested_task_id="$2"
      shift 2
      ;;
    *)
      printf 'unknown option: %s\n' "$1" >&2
      exit 2
      ;;
  esac
done

printf 'workflow live check\n'
workflow_args=(--repo-root "$repo_root")
if [[ -n "$requested_task_id" ]]; then
  workflow_args+=(--task-id "$requested_task_id")
fi

bash "$repo_root/scripts/check-devgod-workflow-live.sh" "${workflow_args[@]}"

printf 'retrieval advisory smoke (derived, non-authoritative)\n'
retrieval_eval="$repo_root/src/evals/retrieval-memory-baseline.ts"
if [[ ! -f "$retrieval_eval" ]]; then
  printf 'derived retrieval baseline skipped: eval surface unavailable at %s\n' "${retrieval_eval#"$repo_root"/}"
  printf 'devgod happy-path checks passed\n'
  exit 0
fi

(
  cd "$repo_root"
  node --experimental-strip-types --input-type=module <<'EOF'
import process from "node:process";
import { runRetrievalMemoryBaseline } from "./src/evals/retrieval-memory-baseline.ts";

const report = await runRetrievalMemoryBaseline();
const { failedCases, passedCases, totalCases } = report.summary;

if (failedCases !== 0) {
  console.error(
    `derived retrieval baseline failed: ${failedCases}/${totalCases} cases failed`
  );
  process.exit(1);
}

console.log(
  `derived retrieval baseline passed: ${passedCases}/${totalCases} cases passed`
);
EOF
)

printf 'devgod happy-path checks passed\n'
