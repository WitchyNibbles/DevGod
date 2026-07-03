#!/usr/bin/env bash

set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
requested_task_id=""
runtime_authoritative_task_id=""

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

resolve_devgod_cli() {
  local source_cli="$repo_root/src/admin/devgod.ts"
  if [[ -f "$source_cli" ]]; then
    printf '%s\n' "$source_cli"
    return
  fi

  local resolved_cli=""
  resolved_cli="$(resolve_devgod_package_bin "$repo_root/node_modules/devgod")"
  if [[ -n "$resolved_cli" ]]; then
    printf '%s\n' "$resolved_cli"
    return
  fi

  local package_json="$repo_root/package.json"
  if [[ ! -f "$package_json" ]]; then
    printf 'missing package.json for devgod CLI resolution: %s\n' "${package_json#"$repo_root"/}" >&2
    exit 1
  fi

  resolved_cli="$(
    node --input-type=module - "$package_json" "$repo_root" <<'EOF'
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const rootPackageJsonPath = process.argv[2];
const repoRoot = process.argv[3];
const rootPackageJson = JSON.parse(readFileSync(rootPackageJsonPath, "utf8"));
const dependency =
  rootPackageJson.devDependencies?.devgod ??
  rootPackageJson.dependencies?.devgod ??
  rootPackageJson.optionalDependencies?.devgod;

if (typeof dependency !== "string" || !dependency.startsWith("file:")) {
  process.exit(0);
}

const rawPath = dependency.slice("file:".length);
const resolvedRoot = path.resolve(repoRoot, rawPath);
const resolvedPackageJsonPath = path.join(resolvedRoot, "package.json");

if (!existsSync(resolvedPackageJsonPath)) {
  process.exit(0);
}

const resolvedPackageJson = JSON.parse(readFileSync(resolvedPackageJsonPath, "utf8"));
const binEntry =
  typeof resolvedPackageJson.bin === "string"
    ? resolvedPackageJson.bin
    : typeof resolvedPackageJson.bin?.devgod === "string"
      ? resolvedPackageJson.bin.devgod
      : null;

if (!binEntry) {
  process.exit(0);
}

const cliPath = path.resolve(resolvedRoot, binEntry);
if (existsSync(cliPath)) {
  process.stdout.write(`${cliPath}\n`);
}
EOF
  )"

  if [[ -n "$resolved_cli" && -f "$resolved_cli" ]]; then
    printf '%s\n' "$resolved_cli"
    return
  fi

  printf 'unable to resolve devgod CLI for runtime workflow proof from %s\n' "$repo_root" >&2
  exit 1
}

resolve_devgod_package_bin() {
  local package_root="$1"
  local package_json="$package_root/package.json"
  if [[ ! -f "$package_json" ]]; then
    return 0
  fi

  node --input-type=module - "$package_json" "$package_root" <<'EOF'
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const packageJsonPath = process.argv[2];
const packageRoot = process.argv[3];
const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8"));
const binEntry =
  typeof packageJson.bin === "string"
    ? packageJson.bin
    : typeof packageJson.bin?.devgod === "string"
      ? packageJson.bin.devgod
      : null;

if (!binEntry) {
  process.exit(0);
}

const cliPath = path.resolve(packageRoot, binEntry);
if (existsSync(cliPath)) {
  process.stdout.write(`${cliPath}\n`);
}
EOF
}

run_devgod_cli() {
  local cli_path="$1"
  shift

  if [[ "$cli_path" == *.ts ]]; then
    node --experimental-strip-types "$cli_path" "$@"
    return
  fi

  node "$cli_path" "$@"
}

runtime_authority_configured() {
  [[ -n "${DEVGOD_CORE_DATABASE_URL:-}" && -n "${DEVGOD_WORKSPACE_SLUG:-}" && -n "${DEVGOD_PROJECT_SLUG:-}" ]] && return 0
  [[ -f "$repo_root/.env.devgod" ]] || return 1

  node --input-type=module - "$repo_root/.env.devgod" <<'EOF' >/dev/null
import { readFileSync } from "node:fs";

const dotEnv = readFileSync(process.argv[2], "utf8");
const values = new Map();
for (const rawLine of dotEnv.split(/\r?\n/)) {
  const line = rawLine.trim();
  if (!line || line.startsWith("#")) {
    continue;
  }
  const separator = line.indexOf("=");
  if (separator === -1) {
    continue;
  }
  values.set(line.slice(0, separator).trim(), line.slice(separator + 1).trim());
}

if (
  values.has("DEVGOD_CORE_DATABASE_URL") &&
  values.has("DEVGOD_WORKSPACE_SLUG") &&
  values.has("DEVGOD_PROJECT_SLUG")
) {
  process.exit(0);
}

process.exit(1);
EOF
}

resolve_runtime_task_context() {
  local cli_path="$1"
  local status_json=""

  if ! status_json="$(run_devgod_cli "$cli_path" status --run-id latest --format json 2>/dev/null)"; then
    return 1
  fi

  node --input-type=module - "$status_json" <<'EOF'
const payload = JSON.parse(process.argv[2]);
const runtimeState =
  payload?.integrity && typeof payload.integrity === "object"
    ? payload.integrity.runtimeState
    : undefined;
const activeTaskId =
  typeof runtimeState?.activeTaskId === "string" && runtimeState.activeTaskId.length > 0
    ? runtimeState.activeTaskId
    : "";
const projectStatus =
  typeof runtimeState?.projectStatus === "string" && runtimeState.projectStatus.length > 0
    ? runtimeState.projectStatus
    : "";

process.stdout.write(
  JSON.stringify({
    activeTaskId,
    projectStatus
  })
);
EOF
}

devgod_cli="$(resolve_devgod_cli)"

if [[ -z "$requested_task_id" ]] && runtime_authority_configured; then
  if ! runtime_context="$(resolve_runtime_task_context "$devgod_cli")"; then
    printf 'runtime authority is configured but live status could not be resolved; do not fall back to local ACTIVE\n' >&2
    exit 1
  fi

  if [[ -n "$runtime_context" ]]; then
    runtime_task_id="$(
      node --input-type=module - "$runtime_context" <<'EOF'
const payload = JSON.parse(process.argv[2]);
if (typeof payload?.activeTaskId === "string" && payload.activeTaskId.length > 0) {
  process.stdout.write(`${payload.activeTaskId}\n`);
}
EOF
    )"
    runtime_project_status="$(
      node --input-type=module - "$runtime_context" <<'EOF'
const payload = JSON.parse(process.argv[2]);
if (typeof payload?.projectStatus === "string" && payload.projectStatus.length > 0) {
  process.stdout.write(`${payload.projectStatus}\n`);
}
EOF
    )"

    if [[ -n "$runtime_task_id" ]]; then
      requested_task_id="$runtime_task_id"
      runtime_authoritative_task_id="$runtime_task_id"
    elif [[ "$runtime_project_status" == "idle" || "$runtime_project_status" == "complete" || "$runtime_project_status" == "done" || "$runtime_project_status" == "approved" ]]; then
      printf '%s\n' "{\"status\":\"$runtime_project_status\",\"message\":\"devgod workflow is $runtime_project_status; no active task to verify. Pass --task-id <task-id> to verify a specific task explicitly.\"}"
      exit 0
    else
      printf 'runtime authority is configured but returned no active task or terminal status; do not fall back to local ACTIVE\n' >&2
      exit 1
    fi
  fi
fi

if [[ -z "$requested_task_id" ]]; then
  active_file="$repo_root/.devgod/ACTIVE"
  [[ -f "$active_file" ]] || {
    printf 'missing active workflow file: %s\n' "${active_file#"$repo_root"/}" >&2
    exit 1
  }

  active_state="$(awk -F= '$1 == "state" { print $2; exit }' "$active_file")"
  active_state="${active_state%$'\r'}"
  requested_task_id="$(awk -F= '$1 == "task_id" { print $2; exit }' "$active_file")"
  requested_task_id="${requested_task_id%$'\r'}"

  if [[ -z "$requested_task_id" && ( "$active_state" == "idle" || "$active_state" == "complete" ) ]]; then
    printf '%s\n' "{\"status\":\"$active_state\",\"message\":\"devgod workflow is $active_state; no active task to verify. Pass --task-id <task-id> to verify a specific task explicitly.\"}"
    exit 0
  fi

  [[ -n "$requested_task_id" ]] || {
    printf 'active workflow file lacks task_id: %s\n' "${active_file#"$repo_root"/}" >&2
    exit 1
  }
fi

workflow_proof_json="$(
  run_devgod_cli "$devgod_cli" workflow-proof --task-id "$requested_task_id" --run-id latest --format json
)"

proof_run_id="$(
  node --input-type=module - "$workflow_proof_json" <<'EOF'
const payload = JSON.parse(process.argv[2]);
if (typeof payload?.runId === "string" && payload.runId.length > 0) {
  process.stdout.write(`${payload.runId}\n`);
}
EOF
)"

if [[ -n "$proof_run_id" ]]; then
  status_json="$(
    run_devgod_cli "$devgod_cli" status --run-id "$proof_run_id" --format json
  )"
  node --input-type=module - "$status_json" <<'EOF'
const payload = JSON.parse(process.argv[2]);
const integrity = payload?.integrity;

if (!integrity || typeof integrity !== "object") {
  process.exit(0);
}

const contradictions = Array.isArray(integrity.contradictions)
  ? integrity.contradictions.filter((item) => typeof item === "string" && item.length > 0)
  : [];

if (integrity.status === "contradicted" || contradictions.length > 0) {
  const summary = contradictions.length > 0 ? contradictions.join("; ") : "runtime integrity is contradicted";
  process.stderr.write(`live workflow integrity contradicted after authoritative proof: ${summary}\n`);
  process.exit(1);
}

const seedFailure = integrity.runtimeState?.seedFailure;
if (seedFailure?.recoveryState === "stale_metadata") {
  process.stderr.write(
    `live workflow integrity contradicted after authoritative proof: stale persisted seed failure metadata for ${seedFailure.taskId ?? "unknown task"}\n`
  );
  process.exit(1);
}
EOF
fi

if [[ -n "$runtime_authoritative_task_id" && -f "$repo_root/.devgod/ACTIVE" ]]; then
  local_active_task_id="$(awk -F= '$1 == "task_id" { print $2; exit }' "$repo_root/.devgod/ACTIVE")"
  local_active_task_id="${local_active_task_id%$'\r'}"
  if [[ -n "$local_active_task_id" && "$local_active_task_id" != "$runtime_authoritative_task_id" ]]; then
    printf 'local ACTIVE export disagrees with runtime active task: local=%s runtime=%s\n' \
      "$local_active_task_id" "$runtime_authoritative_task_id" >&2
    printf 'repair local exports from runtime authority before relying on markdown workflow state\n' >&2
    exit 1
  fi
fi

bash "$repo_root/scripts/check-devgod-workflow.sh" --live --external-review-authority --repo-root "$repo_root" --task-id "$requested_task_id"
