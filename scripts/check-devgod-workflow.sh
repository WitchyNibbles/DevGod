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

require_file() {
  local path="$1"
  [[ -f "$path" ]] || fail "missing file: ${path#"$repo_root"/}"
}

require_grep() {
  local pattern="$1"
  local path="$2"
  grep -Fq "$pattern" "$path" || fail "missing required text in ${path#"$repo_root"/}: $pattern"
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

normalize_value() {
  printf '%s' "$1" | tr -d '\r' | sed -e 's/`//g' -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//'
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

require_file "$active_file"
require_file "$agents_file"
require_file "$config_file"

mapfile -t active_lines < "$active_file"
[[ "${#active_lines[@]}" -eq 3 ]] || fail "unexpected .devgod/ACTIVE content"

[[ "${active_lines[0]}" == task_id=* ]] || fail "missing task_id in .devgod/ACTIVE"
[[ "${active_lines[1]}" == "workflow=devgod" ]] || fail "workflow must be devgod in .devgod/ACTIVE"
[[ "${active_lines[2]}" == "state=active" ]] || fail "state must be active in .devgod/ACTIVE"

task_id="${active_lines[0]#task_id=}"
[[ -n "$task_id" ]] || fail "task_id must not be empty in .devgod/ACTIVE"

if [[ -n "$requested_task_id" && "$requested_task_id" != "$task_id" ]]; then
  fail "requested task id ${requested_task_id} does not match active task ${task_id}"
fi

require_grep "route every substantive" "$agents_file"
require_grep 'devgod-intake' "$agents_file"
require_grep '.devgod/ACTIVE' "$agents_file"
require_grep 'current task' "$agents_file"
require_grep '.devgod/work/briefs/' "$agents_file"
require_grep '.devgod/work/plans/' "$agents_file"
require_grep 'check-devgod-workflow.sh --task-id' "$agents_file"
require_grep 'reviewer`, `qa_engineer`, and `security_reviewer`' "$agents_file"
require_grep 'AGENTS.md' "$config_file"
require_grep '.agents.md' "$config_file"

review_base="${task_id#task-}"
brief_file="$repo_root/.devgod/work/briefs/brief-${review_base}.md"
plan_file="$repo_root/.devgod/work/plans/plan-${review_base}.md"
task_file="$repo_root/.devgod/work/tasks/task-${review_base}.md"

require_file "$brief_file"
require_section_equals "## Task ID" "$task_id" "$brief_file"

if [[ -f "$plan_file" ]]; then
  require_section_equals "## Task ID" "$task_id" "$plan_file"
elif [[ -f "$task_file" ]]; then
  require_section_equals "## Task ID" "$task_id" "$task_file"
else
  fail "missing current plan or task artifact for ${task_id}"
fi

roles=("reviewer" "qa" "security")

for role in "${roles[@]}"; do
  case "$role" in
    reviewer)
      expected_role="reviewer"
      review_file="$(extract_review_file "$review_base" "reviewer" "reviewer")"
      ;;
    qa)
      expected_role="qa_engineer"
      review_file="$(extract_review_file "$review_base" "qa" "qa_engineer")"
      ;;
    security)
      expected_role="security_reviewer"
      review_file="$(extract_review_file "$review_base" "security" "security_reviewer")"
      ;;
  esac

  require_section_equals "## Task ID" "$task_id" "$review_file"
  require_section_equals "## Reviewer role" "$expected_role" "$review_file"
  review_state="$(normalize_value "$(extract_section_value "## Review state" "$review_file")")"
  decision="$(normalize_value "$(extract_section_value "## Decision" "$review_file")")"
  severity="$(normalize_value "$(extract_section_value "## Severity" "$review_file")")"
  waiver_reason="$(extract_section_value "## Waiver reason" "$review_file")"

  if [[ "$review_state" == "passed" && "$decision" == "approved" ]]; then
    :
  elif [[ "$review_state" == "waived" && "$decision" == "waived" ]]; then
    [[ -n "$waiver_reason" && "$(normalize_value "$waiver_reason")" != "None." && "$(normalize_value "$waiver_reason")" != "None" ]] || fail "waived review lacks waiver reason in ${review_file#"$repo_root"/}"
  else
    fail "unexpected gate outcome in ${review_file#"$repo_root"/}: state=${review_state} decision=${decision}"
  fi

  findings="$(extract_section_value "## Findings" "$review_file")"
  residual_risk="$(extract_section_value "## Residual risk" "$review_file")"
  verification_evidence="$(extract_section_value "## Verification evidence" "$review_file")"
  [[ -n "$findings" ]] || fail "missing findings in ${review_file#"$repo_root"/}"
  [[ -n "$residual_risk" ]] || fail "missing residual risk in ${review_file#"$repo_root"/}"
  [[ -n "$verification_evidence" ]] || fail "missing verification evidence in ${review_file#"$repo_root"/}"
  [[ "$severity" == "low" || "$severity" == "medium" ]] || fail "unexpected severity for approved/waived gate in ${review_file#"$repo_root"/}: ${severity}"
  source_handoff="$(extract_section_value "## Source handoff" "$review_file")"
  [[ -n "$source_handoff" ]] || fail "missing source handoff in ${review_file#"$repo_root"/}"
done

printf 'devgod workflow check passed for %s\n' "$task_id"
