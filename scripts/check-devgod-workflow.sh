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
      if [[ "$1" == -* ]]; then
        printf 'unknown option: %s\n' "$1" >&2
        exit 2
      fi
      repo_root="$1"
      shift
      ;;
  esac
done

fail() {
  printf 'devgod workflow check failed: %s\n' "$1" >&2
  exit 1
}

validate_task_id() {
  local value="$1"
  [[ "$value" =~ ^[A-Za-z0-9][A-Za-z0-9._-]*$ ]] || fail "task_id must match ^[A-Za-z0-9][A-Za-z0-9._-]*$: ${value}"
}

if [[ -n "$requested_task_id" ]]; then
  validate_task_id "$requested_task_id"
fi

require_file() {
  local path="$1"
  [[ -f "$path" ]] || fail "missing file: ${path#"$repo_root"/}"
}

require_grep() {
  local pattern="$1"
  local path="$2"
  grep -Fq "$pattern" "$path" || fail "missing required text in ${path#"$repo_root"/}: $pattern"
}

require_heading() {
  local heading="$1"
  local path="$2"
  grep -Fq "$heading" "$path" || fail "missing heading ${heading} in ${path#"$repo_root"/}"
}

require_allowed_value() {
  local value="$1"
  local path="$2"
  shift 2
  local allowed
  for allowed in "$@"; do
    if [[ "$value" == "$allowed" ]]; then
      return
    fi
  done

  fail "unexpected value in ${path#"$repo_root"/}: ${value}"
}

require_runtime_proof_reference() {
  local block="$1"
  local path="$2"
  local heading="$3"

  printf '%s\n' "$block" |
    grep -Eq '^[[:space:]-]*Runtime proof:[[:space:]]*[^[:space:]<].*$' ||
    fail "specialist_verified runtime_verified summaries must cite Runtime proof in ${heading} of ${path#"$repo_root"/}"
}

extract_section_value() {
  local heading="$1"
  local path="$2"
  awk -v heading="$heading" '
    $0 == heading { in_section=1; next }
    in_section && /^## / { exit }
    in_section && NF {
      gsub(/\r/, "", $0)
      print
      exit
    }
  ' "$path"
}

extract_section_block() {
  local heading="$1"
  local path="$2"
  awk -v heading="$heading" '
    $0 == heading { in_section=1; next }
    in_section && /^## / { exit }
    in_section {
      gsub(/\r/, "", $0)
      print
    }
  ' "$path"
}

normalize_value() {
  printf '%s' "$1" | tr -d '\r' | sed -e 's/`//g' -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//'
}

extract_marked_block() {
  local start_marker="$1"
  local end_marker="$2"
  local path="$3"
  awk -v start_marker="$start_marker" -v end_marker="$end_marker" '
    index($0, start_marker) { in_block=1; next }
    index($0, end_marker) { exit }
    in_block { print }
  ' "$path"
}

extract_contract_value() {
  local key="$1"
  local path="$2"
  extract_marked_block \
    '<!-- devgod-workflow-contract:start -->' \
    '<!-- devgod-workflow-contract:end -->' \
    "$path" |
    awk -F= -v key="$key" '
      {
        line=$0
        gsub(/\r/, "", line)
        gsub(/^[[:space:]]+|[[:space:]]+$/, "", line)
        if (line == "" || line ~ /^#/) {
          next
        }

        current_key=$1
        gsub(/^[[:space:]]+|[[:space:]]+$/, "", current_key)
        if (current_key == key) {
          sub(/^[^=]*=/, "", line)
          print line
          exit
        }
      }
    '
}

require_section_equals() {
  local heading="$1"
  local expected="$2"
  local path="$3"
  local raw
  raw="$(extract_section_value "$heading" "$path")"
  [[ -n "$raw" ]] || fail "missing section value ${heading} in ${path#"$repo_root"/}"
  [[ "$(normalize_value "$raw")" == "$expected" ]] || fail "unexpected value for ${heading} in ${path#"$repo_root"/}: expected ${expected}"
}

require_contract_equals() {
  local key="$1"
  local expected="$2"
  local path="$3"
  local raw
  raw="$(extract_contract_value "$key" "$path")"
  [[ -n "$raw" ]] || fail "missing workflow contract key ${key} in ${path#"$repo_root"/}"
  [[ "$(normalize_value "$raw")" == "$expected" ]] || fail "unexpected workflow contract value for ${key} in ${path#"$repo_root"/}: expected ${expected}"
}

extract_review_file() {
  local review_base="$1"
  local short_role="$2"
  local full_role="$3"
  local short_path="$repo_root/.devgod/work/reviews/review-${review_base}-${short_role}.md"
  local full_path="$repo_root/.devgod/work/reviews/review-${review_base}-${full_role}.md"

  if [[ "$short_role" == "$full_role" ]]; then
    [[ -f "$short_path" ]] || fail "missing review file for ${full_role}: expected ${short_path#"$repo_root"/}"
    printf '%s\n' "$short_path"
    return
  fi

  if [[ -f "$short_path" && -f "$full_path" ]]; then
    fail "duplicate review files for ${full_role}: ${short_path#"$repo_root"/} and ${full_path#"$repo_root"/}"
  fi

  if [[ -f "$short_path" ]]; then
    printf '%s\n' "$short_path"
    return
  fi

  if [[ -f "$full_path" ]]; then
    printf '%s\n' "$full_path"
    return
  fi

  fail "missing review file for ${full_role}: expected ${short_path#"$repo_root"/} or ${full_path#"$repo_root"/}"
}

active_file="$repo_root/.devgod/ACTIVE"
agents_file="$repo_root/AGENTS.md"
config_file="$repo_root/.codex/config.toml"
brief_template="$repo_root/.devgod/templates/intake-brief.md"
task_template="$repo_root/.devgod/templates/task-packet.md"
review_template="$repo_root/.devgod/templates/review-gate.md"

require_file "$active_file"
require_file "$agents_file"
require_file "$config_file"
require_file "$brief_template"
require_file "$task_template"
require_file "$review_template"

mapfile -t active_lines < "$active_file"
active_lines=("${active_lines[@]%$'\r'}")
[[ "${#active_lines[@]}" -eq 3 ]] || fail "unexpected .devgod/ACTIVE content"

[[ "${active_lines[0]}" == task_id=* ]] || fail "missing task_id in .devgod/ACTIVE"
[[ "${active_lines[1]}" == "workflow=devgod" ]] || fail "workflow must be devgod in .devgod/ACTIVE"
[[ "${active_lines[2]}" == "state=active" ]] || fail "state must be active in .devgod/ACTIVE"

task_id="${active_lines[0]#task_id=}"
task_id="${task_id%$'\r'}"
[[ -n "$task_id" ]] || fail "task_id must not be empty in .devgod/ACTIVE"
validate_task_id "$task_id"

if [[ -n "$requested_task_id" && "$requested_task_id" != "$task_id" ]]; then
  fail "requested task id ${requested_task_id} does not match active task ${task_id}"
fi

require_contract_equals "workflow" "devgod" "$agents_file"
require_contract_equals "active_file" ".devgod/ACTIVE" "$agents_file"
require_contract_equals "brief_file" ".devgod/work/briefs/brief-<task-id>.md" "$agents_file"
require_contract_equals "plan_file" ".devgod/work/plans/plan-<task-id>.md" "$agents_file"
require_contract_equals "task_file" ".devgod/work/tasks/task-<task-id>.md" "$agents_file"
require_contract_equals "review_file" ".devgod/work/reviews/review-<task-id>-<role>.md" "$agents_file"
require_contract_equals "brief_template" ".devgod/templates/intake-brief.md" "$agents_file"
require_contract_equals "task_template" ".devgod/templates/task-packet.md" "$agents_file"
require_contract_equals "review_template" ".devgod/templates/review-gate.md" "$agents_file"
require_contract_equals "required_review_roles" "reviewer,qa_engineer,security_reviewer" "$agents_file"
require_contract_equals "review_aliases" "reviewer:reviewer;qa_engineer:qa|qa_engineer;security_reviewer:security|security_reviewer" "$agents_file"
require_contract_equals "workflow_check" "bash scripts/check-devgod-workflow.sh --task-id <task-id>" "$agents_file"
require_contract_equals "workflow_check_scope" "artifact_contract_only" "$agents_file"
require_contract_equals "review_artifact_trust" "manager_summary_evidence_only" "$agents_file"
require_contract_equals "ci_scope" "artifact_contract_regression_fixtures_only" "$agents_file"
require_contract_equals "local_live_check" "bash scripts/check-devgod-workflow-live.sh [--task-id <task-id>]" "$agents_file"
require_grep 'AGENTS.md' "$config_file"
require_grep '.agents.md' "$config_file"

require_section_equals "## Task ID" "<task-id>" "$brief_template"
require_heading "## Success Criteria" "$brief_template"
require_heading "## Stop Go" "$brief_template"
require_section_equals "## Stop Go" "go | needs_review | stop" "$brief_template"

require_section_equals "## Task ID" "<task-id>" "$task_template"
require_section_equals "## Owner role" "<owner-role>" "$task_template"
require_section_equals "## Completion standard" "artifact_complete | specialist_verified" "$task_template"
require_heading "## Required specialist roles" "$task_template"
require_heading "## Quality gates" "$task_template"
require_heading "## Acceptance criteria" "$task_template"
require_heading "## Verification steps" "$task_template"
require_heading "## Required reviews" "$task_template"
require_grep '`reviewer`' "$task_template"
require_grep '`qa_engineer`' "$task_template"
require_grep '`security_reviewer`' "$task_template"
require_heading "## Rollback notes" "$task_template"

require_section_equals "## Task ID" "<task-id>" "$review_template"
require_section_equals "## Reviewer role" "reviewer | qa_engineer | security_reviewer" "$review_template"
require_section_equals "## Actor" "<recorded-actor-id>" "$review_template"
require_section_equals "## Actor role" "reviewer | qa_engineer | security_reviewer | planner | solution_architect" "$review_template"
require_section_equals "## Provenance status" "summary_only | runtime_verified | legacy_backfill" "$review_template"
require_section_equals "## Review state" "pending | passed | blocked | waived" "$review_template"
require_section_equals "## Severity" "low | medium | high | critical" "$review_template"
require_heading "## Specialist execution evidence" "$review_template"
require_heading "## Quality gate evidence" "$review_template"
require_heading "## Verification evidence" "$review_template"
require_section_equals "## Waiver authority" "none | manager | security_exception" "$review_template"
require_section_equals "## Decision" "approved | blocked | waived" "$review_template"
require_heading "## Source handoff" "$review_template"

artifact_task_id="$task_id"
brief_file="$repo_root/.devgod/work/briefs/brief-${artifact_task_id}.md"
plan_file="$repo_root/.devgod/work/plans/plan-${artifact_task_id}.md"
task_file="$repo_root/.devgod/work/tasks/task-${artifact_task_id}.md"

require_file "$brief_file"
require_section_equals "## Task ID" "$task_id" "$brief_file"

if [[ -f "$plan_file" ]]; then
  require_section_equals "## Task ID" "$task_id" "$plan_file"
elif [[ -f "$task_file" ]]; then
  require_section_equals "## Task ID" "$task_id" "$task_file"
else
  fail "missing current plan or task artifact for ${task_id}"
fi

task_completion_standard="artifact_complete"
if [[ -f "$task_file" ]]; then
  require_section_equals "## Task ID" "$task_id" "$task_file"
  task_completion_standard="$(normalize_value "$(extract_section_value "## Completion standard" "$task_file")")"
  require_allowed_value "$task_completion_standard" "$task_file" "artifact_complete" "specialist_verified"

  if [[ "$task_completion_standard" == "specialist_verified" ]]; then
    specialist_roles_block="$(extract_section_block "## Required specialist roles" "$task_file")"
    quality_gates_block="$(extract_section_block "## Quality gates" "$task_file")"
    [[ -n "$(normalize_value "$specialist_roles_block")" ]] || fail "missing required specialist roles in ${task_file#"$repo_root"/}"
    [[ -n "$(normalize_value "$quality_gates_block")" ]] || fail "missing quality gates in ${task_file#"$repo_root"/}"
  fi
fi

roles=("reviewer" "qa" "security")

for role in "${roles[@]}"; do
  case "$role" in
    reviewer)
      expected_role="reviewer"
      review_file="$(extract_review_file "$artifact_task_id" "reviewer" "reviewer")"
      ;;
    qa)
      expected_role="qa_engineer"
      review_file="$(extract_review_file "$artifact_task_id" "qa" "qa_engineer")"
      ;;
    security)
      expected_role="security_reviewer"
      review_file="$(extract_review_file "$artifact_task_id" "security" "security_reviewer")"
      ;;
  esac

  require_section_equals "## Task ID" "$task_id" "$review_file"
  require_section_equals "## Reviewer role" "$expected_role" "$review_file"
  actor="$(normalize_value "$(extract_section_value "## Actor" "$review_file")")"
  actor_role="$(normalize_value "$(extract_section_value "## Actor role" "$review_file")")"
  provenance_status="$(normalize_value "$(extract_section_value "## Provenance status" "$review_file")")"
  review_state="$(normalize_value "$(extract_section_value "## Review state" "$review_file")")"
  decision="$(normalize_value "$(extract_section_value "## Decision" "$review_file")")"
  severity="$(normalize_value "$(extract_section_value "## Severity" "$review_file")")"
  waiver_authority="$(normalize_value "$(extract_section_value "## Waiver authority" "$review_file")")"
  waiver_reason="$(extract_section_value "## Waiver reason" "$review_file")"

  [[ -n "$actor" ]] || fail "missing actor in ${review_file#"$repo_root"/}"
  [[ -n "$actor_role" ]] || fail "missing actor role in ${review_file#"$repo_root"/}"
  require_allowed_value "$provenance_status" "$review_file" "summary_only" "runtime_verified" "legacy_backfill"
  require_allowed_value "$review_state" "$review_file" "passed" "waived"
  require_allowed_value "$decision" "$review_file" "approved" "waived"
  require_allowed_value "$severity" "$review_file" "low" "medium" "high" "critical"
  require_allowed_value "$waiver_authority" "$review_file" "none" "manager" "security_exception"

  if [[ "$expected_role" == "security_reviewer" && "$review_state" == "passed" && "$decision" == "approved" ]]; then
    case "$severity" in
      high|critical)
        fail "passed security review summaries must use low or medium severity, not ${severity} in ${review_file#"$repo_root"/}"
        ;;
    esac
  fi

  if [[ "$task_completion_standard" == "specialist_verified" && "$provenance_status" != "runtime_verified" ]]; then
    fail "specialist_verified work requires runtime_verified review provenance in ${review_file#"$repo_root"/}"
  fi

  if [[ "$review_state" == "passed" && "$decision" == "approved" ]]; then
    [[ "$actor_role" == "$expected_role" ]] || fail "passed review summary must record actor role ${expected_role} in ${review_file#"$repo_root"/}"
    [[ "$waiver_authority" == "none" ]] || fail "passed review summary must use waiver authority none in ${review_file#"$repo_root"/}"
    if [[ "$expected_role" == "security_reviewer" && ( "$severity" == "high" || "$severity" == "critical" ) ]]; then
      fail "unresolved ${severity} security findings block completion in ${review_file#"$repo_root"/}"
    fi
  elif [[ "$review_state" == "waived" && "$decision" == "waived" ]]; then
    case "$expected_role" in
      reviewer|qa_engineer)
        [[ "$actor_role" == "planner" || "$actor_role" == "solution_architect" ]] || fail "waived ${expected_role} review summary must record planner or solution_architect actor role in ${review_file#"$repo_root"/}"
        [[ "$waiver_authority" == "manager" ]] || fail "waived ${expected_role} review summary must use manager waiver authority in ${review_file#"$repo_root"/}"
        ;;
      security_reviewer)
        [[ "$actor_role" == "security_reviewer" ]] || fail "waived security review summary must record security_reviewer actor role in ${review_file#"$repo_root"/}"
        [[ "$waiver_authority" == "security_exception" ]] || fail "waived security review summary must use security_exception authority in ${review_file#"$repo_root"/}"
        ;;
    esac
    [[ -n "$waiver_reason" && "$(normalize_value "$waiver_reason")" != "None." && "$(normalize_value "$waiver_reason")" != "None" ]] || fail "waived review lacks waiver reason in ${review_file#"$repo_root"/}"
  else
    fail "unexpected gate outcome in ${review_file#"$repo_root"/}: state=${review_state} decision=${decision}"
  fi

  findings="$(extract_section_value "## Findings" "$review_file")"
  residual_risk="$(extract_section_value "## Residual risk" "$review_file")"
  specialist_execution_evidence="$(extract_section_value "## Specialist execution evidence" "$review_file")"
  quality_gate_evidence="$(extract_section_value "## Quality gate evidence" "$review_file")"
  verification_evidence="$(extract_section_value "## Verification evidence" "$review_file")"
  verification_evidence_block="$(extract_section_block "## Verification evidence" "$review_file")"
  [[ -n "$findings" ]] || fail "missing findings in ${review_file#"$repo_root"/}"
  [[ -n "$residual_risk" ]] || fail "missing residual risk in ${review_file#"$repo_root"/}"
  if [[ "$task_completion_standard" == "specialist_verified" ]]; then
    [[ -n "$specialist_execution_evidence" ]] || fail "missing specialist execution evidence in ${review_file#"$repo_root"/}"
    [[ -n "$quality_gate_evidence" ]] || fail "missing quality gate evidence in ${review_file#"$repo_root"/}"
  fi
  [[ -n "$verification_evidence" ]] || fail "missing verification evidence in ${review_file#"$repo_root"/}"
  source_handoff="$(extract_section_value "## Source handoff" "$review_file")"
  source_handoff_block="$(extract_section_block "## Source handoff" "$review_file")"
  [[ -n "$source_handoff" ]] || fail "missing source handoff in ${review_file#"$repo_root"/}"
  if [[ "$task_completion_standard" == "specialist_verified" && "$provenance_status" == "runtime_verified" ]]; then
    require_runtime_proof_reference "$verification_evidence_block" "$review_file" "## Verification evidence"
    require_runtime_proof_reference "$source_handoff_block" "$review_file" "## Source handoff"
  fi
done

printf 'devgod workflow artifact check passed for %s\n' "$task_id"
