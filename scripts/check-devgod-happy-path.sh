#!/usr/bin/env bash

set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
requested_task_id=""
command_surface=""

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

if [[ -z "$requested_task_id" ]]; then
  active_file="$repo_root/.devgod/ACTIVE"
  [[ -f "$active_file" ]] || {
    printf 'missing active workflow file: %s\n' "${active_file#"$repo_root"/}" >&2
    printf 'pass --task-id <fixture-task-id> for synthetic install fixtures\n' >&2
    exit 1
  }

  requested_task_id="$(awk -F= '$1 == "task_id" { print $2; exit }' "$active_file")"
  requested_task_id="${requested_task_id%$'\r'}"
  [[ -n "$requested_task_id" ]] || {
    printf 'active workflow file lacks task_id: %s\n' "${active_file#"$repo_root"/}" >&2
    exit 1
  }
fi

brief_file="$repo_root/.devgod/work/briefs/brief-${requested_task_id}.md"
task_file="$repo_root/.devgod/work/tasks/task-${requested_task_id}.md"
review_dir="$repo_root/.devgod/work/reviews"
active_file="$repo_root/.devgod/ACTIVE"

require_file() {
  local file_path="$1"
  [[ -f "$file_path" ]] || {
    printf 'missing required fixture file: %s\n' "${file_path#"$repo_root"/}" >&2
    exit 1
  }
}

require_contains() {
  local file_path="$1"
  local expected="$2"
  if ! grep -Fq -- "$expected" "$file_path"; then
    printf 'fixture check failed: expected %s in %s\n' "$expected" "${file_path#"$repo_root"/}" >&2
    exit 1
  fi
}

package_file="$repo_root/package.json"

has_package_script() {
  local script_name="$1"
  node --input-type=module - "$package_file" "$script_name" <<'EOF' >/dev/null
import { readFileSync } from "node:fs";

const [packagePath, scriptName] = process.argv.slice(2);
const pkg = JSON.parse(readFileSync(packagePath, "utf8"));
const scriptValue = pkg.scripts?.[scriptName];

if (typeof scriptValue !== "string" || scriptValue.trim().length === 0) {
  process.exit(1);
}
EOF
}

require_package_script() {
  local script_name="$1"
  local error_prefix="$2"
  has_package_script "$script_name" || {
    printf '%s: package.json lacks %s\n' "$error_prefix" "$script_name" >&2
    exit 1
  }
}

if has_package_script "devgod:check:happy-path"; then
  command_surface="installed"
elif has_package_script "check:happy-path"; then
  command_surface="source"
else
  printf 'happy-path command surface missing: package.json lacks check:happy-path or devgod:check:happy-path\n' >&2
  exit 1
fi

synthetic_fixture_mode=0
if [[ "$requested_task_id" == fixture-* ]]; then
  synthetic_fixture_mode=1
fi

printf 'happy-path mode: %s\n' "$([[ "$synthetic_fixture_mode" -eq 1 ]] && printf 'synthetic-fixture' || printf 'workflow-task')"
printf 'command surface: %s\n' "$command_surface"

if [[ "$command_surface" == "source" ]]; then
  require_package_script "check:happy-path" "source repo happy-path setup incomplete"
  require_package_script "check:workflow" "source repo happy-path setup incomplete"
  require_package_script "verify:setup" "source repo happy-path setup incomplete"
else
  require_package_script "devgod:check:happy-path" "incomplete devgod setup"
  require_package_script "devgod:check-workflow" "incomplete devgod setup"
  require_package_script "devgod:verify:setup" "incomplete devgod setup"
fi

require_file "$brief_file"
require_file "$task_file"

if [[ "$synthetic_fixture_mode" -eq 1 ]]; then
  printf 'synthetic fixture check\n'
  require_contains "$brief_file" "Synthetic install-proof only"
  require_contains "$task_file" "fixture remains synthetic and non-authoritative"

  if [[ -f "$active_file" ]] && grep -Fq "task_id=$requested_task_id" "$active_file"; then
    printf 'synthetic fixture must not become the active workflow task: %s\n' "${active_file#"$repo_root"/}" >&2
    exit 1
  fi
fi

mapfile -t review_roles < <(
  node --input-type=module <<EOF
import { readFileSync } from "node:fs";
const schema = JSON.parse(readFileSync(${repo_root@Q} + "/.devgod/templates/workflow-schema.json", "utf8"));
for (const role of schema.workflowTemplateReviewRoles ?? []) {
  console.log(role);
}
EOF
)
for role in "${review_roles[@]}"; do
  review_file="$review_dir/review-${requested_task_id}-${role}.md"
  require_file "$review_file"

  if [[ "$synthetic_fixture_mode" -eq 1 ]]; then
    require_contains "$review_file" '`summary_only`'
    require_contains "$review_file" '`blocked`'
    require_contains "$review_file" 'Synthetic install fixture only'
    if grep -Fq 'Runtime proof:' "$review_file"; then
      printf 'synthetic fixture review must not claim runtime proof: %s\n' "${review_file#"$repo_root"/}" >&2
      exit 1
    fi
  fi
done

bindings_file="$repo_root/.devgod/review-identity-bindings.json"
adapter_file="$repo_root/devgod/review-identity-adapter.ts"
workflow_export_file="$repo_root/scripts/check-devgod-workflow.sh"
workflow_live_export_file="$repo_root/scripts/check-devgod-workflow-live.sh"

[[ -f "$bindings_file" ]] || {
  printf 'bad review identity bindings export: missing %s\n' "${bindings_file#"$repo_root"/}" >&2
  exit 1
}
if [[ "$synthetic_fixture_mode" -eq 1 ]]; then
  require_contains "$bindings_file" 'replace-with-authenticated-user-id'
fi

[[ -f "$adapter_file" ]] || {
  printf 'missing review identity adapter scaffold: %s\n' "${adapter_file#"$repo_root"/}" >&2
  exit 1
}
if [[ "$synthetic_fixture_mode" -eq 1 ]]; then
  require_contains "$adapter_file" 'Implement devgod/review-identity-adapter.ts'
fi

[[ -f "$workflow_export_file" ]] || {
  printf 'stale install export missing: %s\n' "${workflow_export_file#"$repo_root"/}" >&2
  exit 1
}

[[ -f "$workflow_live_export_file" ]] || {
  printf 'stale install export missing: %s\n' "${workflow_live_export_file#"$repo_root"/}" >&2
  exit 1
}

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
