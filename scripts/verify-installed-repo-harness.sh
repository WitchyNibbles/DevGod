#!/usr/bin/env bash

set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
target_root=""
keep_target=0
workspace_slug="default"
task_id="harness-proof"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --target)
      [[ $# -ge 2 ]] || { printf 'missing value for %s\n' "$1" >&2; exit 2; }
      target_root="$2"
      shift 2
      ;;
    --keep-target)
      keep_target=1
      shift
      ;;
    --workspace-slug)
      [[ $# -ge 2 ]] || { printf 'missing value for %s\n' "$1" >&2; exit 2; }
      workspace_slug="$2"
      shift 2
      ;;
    --task-id)
      [[ $# -ge 2 ]] || { printf 'missing value for %s\n' "$1" >&2; exit 2; }
      task_id="$2"
      shift 2
      ;;
    *)
      printf 'unknown option: %s\n' "$1" >&2
      exit 2
      ;;
  esac
done

created_target=0
if [[ -z "$target_root" ]]; then
  target_root="$(mktemp -d -t devgod-installed-harness-XXXXXX)"
  created_target=1
fi

cleanup() {
  if [[ "$created_target" -eq 1 && "$keep_target" -eq 0 ]]; then
    python3 -c "import shutil, sys; shutil.rmtree(sys.argv[1], ignore_errors=True)" "$target_root"
  fi
}
trap cleanup EXIT

mkdir -p "$target_root"
printf '{"name":"devgod-installed-harness","private":true}\n' > "$target_root/package.json"

project_slug="$(basename "$target_root" | tr "[:upper:]" "[:lower:]")"

sanitize_env() {
  env \
    -u DEVGOD_PROJECT_SLUG \
    -u DEVGOD_PROJECT_NAME \
    -u DEVGOD_WORKSPACE_SLUG \
    -u DEVGOD_RUNTIME_PROFILE \
    -u DEVGOD_RUNTIME_MODE \
    -u DEVGOD_RUNTIME_DATA_ROOT \
    -u DEVGOD_DOCKER_CONTAINER_NAME \
    -u DEVGOD_QDRANT_CONTAINER_NAME \
    "$@"
}

run_target() {
  (
    cd "$target_root"
    sanitize_env DEVGOD_WORKSPACE_SLUG="$workspace_slug" DEVGOD_PROJECT_SLUG="$project_slug" "$@"
  )
}

node --experimental-strip-types "$repo_root/src/install/cli.ts" init --apply --target "$target_root" >/dev/null

(
  cd "$target_root"
  npm install >/dev/null
)

run_target npm run devgod:setup:local >/dev/null
run_target npm run devgod:bootstrap >/dev/null
run_target npm run devgod:verify:setup >/dev/null
run_target npm run devgod:scaffold-workflow -- --task-id "$task_id" --force-active >/dev/null
run_target npm run devgod:seed-workflow-proof -- --task-id "$task_id" >/dev/null

status_json="$(run_target node --experimental-strip-types ./node_modules/devgod/src/admin/devgod.ts status)"

STATUS_JSON="$status_json" node --input-type=module - "$task_id" <<'EOF'
const [, , taskId] = process.argv;
const payload = JSON.parse(process.env.STATUS_JSON ?? "");
const approvedTasks = payload?.tasks?.byStatus?.approved;
if (!Array.isArray(approvedTasks) || !approvedTasks.includes(taskId)) {
  console.error(`installed repo harness failed: status did not report approved task ${taskId}`);
  process.exit(1);
}
if (approvedTasks.some((candidate) => candidate === "2026-05-21-verification-gate-tightening")) {
  console.error("installed repo harness failed: status leaked package-repo task state into the fresh target repo");
  process.exit(1);
}
EOF

run_target bash scripts/check-devgod-workflow-live.sh --task-id "$task_id" >/dev/null

printf 'installed repo harness passed\n'
printf 'workspace: %s\n' "$workspace_slug"
printf 'project: %s\n' "$project_slug"
printf 'task: %s\n' "$task_id"
printf 'target: %s\n' "$target_root"
