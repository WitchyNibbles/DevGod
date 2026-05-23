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

run_target npm run devgod:scaffold-workflow -- --task-id "$task_id" --force-active >/dev/null
run_target node --experimental-strip-types --input-type=module - "$workspace_slug" "$project_slug" "$task_id" <<'EOF'
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  executeReportCommandFromArgs,
  executeSeedModernizationProofCommandFromArgs,
  executeStatusCommandFromArgs
} from "./node_modules/devgod/src/admin.ts";
import { createReviewActionContextResolver } from "./node_modules/devgod/src/core/review-context.ts";
import { DevgodCoreService, MemoryStore } from "./node_modules/devgod/src/index.ts";

const [, , workspaceSlug, projectSlug, taskId] = process.argv;
const cwd = process.cwd();
const env = {
  ...process.env,
  DEVGOD_WORKSPACE_SLUG: workspaceSlug,
  DEVGOD_PROJECT_SLUG: projectSlug
};
const store = new MemoryStore();
const service = new DevgodCoreService(store, {
  resolveReviewActionContext: createReviewActionContextResolver({
    bindings: {
      bindings: [
        {
          principal: { provider: "devgod-local-seed", subject: "reviewer-actor" },
          actors: [{ actor: "reviewer-actor", roles: ["reviewer"] }]
        },
        {
          principal: { provider: "devgod-local-seed", subject: "security-actor" },
          actors: [{ actor: "security-actor", roles: ["security_reviewer"] }]
        },
        {
          principal: { provider: "devgod-local-seed", subject: "qa-actor" },
          actors: [{ actor: "qa-actor", roles: ["qa_engineer"] }]
        }
      ]
    },
    async resolveAuthenticatedPrincipal(input) {
      return {
        provider: "devgod-local-seed",
        subject: input.actor,
        verified: true
      };
    }
  })
});

const reviewIdentity = async () => ({
  authorityLabel: "derived_only",
  adapterConfigured: false,
  adapterExists: true,
  availableBackends: [],
  bindingsPresent: true,
  bindingsPath: join(cwd, ".devgod", "review-identity-bindings.json"),
  bindingsUseShippedTemplate: true,
  liveTrustReady: false,
  notes: ["installed harness fixture uses an in-memory review adapter"]
});

const gitNexus = async () => ({
  authorityLabel: "derived_only",
  state: "unconfigured",
  configured: false,
  configuredScopes: [],
  configPaths: [],
  repoIndexed: false,
  indexRoot: join(cwd, ".gitnexus"),
  metaPath: join(cwd, ".gitnexus", "meta.json"),
  recommendedCommand: "npx gitnexus analyze --skip-agents-md",
  notes: ["installed harness fixture does not require GitNexus indexing"]
});

const projectContext = await store.ensureProjectContext({
  workspaceSlug,
  projectSlug,
  repoPath: cwd
});
await store.saveProjectRuntimeState({
  projectId: projectContext.project.id,
  workspaceId: projectContext.workspace.id,
  activeRunId: undefined,
  activeTaskId: taskId,
  taskQueue: {
    project_status: "ready",
    current_task_id: null,
    tasks: []
  },
  productState: { status: "ready", items: [] },
  lastVerifiedRunId: undefined,
  metadata: {},
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString()
});

await executeSeedModernizationProofCommandFromArgs(
  ["--workspace-slug", workspaceSlug, "--project-slug", projectSlug, "--task-id", taskId],
  {
    cwd,
    env,
    getProjectContext(params) {
      return store.getProjectContext(params);
    },
    getProjectRuntimeState(projectId) {
      return store.getProjectRuntimeState(projectId);
    },
    saveProjectRuntimeState(state) {
      return store.saveProjectRuntimeState(state);
    },
    intakeRequest(input) {
      return service.intakeRequest(input);
    },
    createTaskGraph(runId, taskPackets) {
      return service.createTaskGraph(runId, taskPackets);
    },
    claimTask(runId, activeTaskId, actor) {
      return service.claimTask(runId, activeTaskId, actor);
    },
    submitHandoff(runId, activeTaskId, handoff) {
      return service.submitHandoff(runId, activeTaskId, handoff);
    },
    recordReview(runId, activeTaskId, actor, review) {
      return service.recordReview(runId, activeTaskId, actor, review);
    },
    configureAutonomousExecution(runId, input) {
      return service.configureAutonomousExecution(runId, input);
    },
    upsertCoverageItems(runId, items) {
      return service.upsertCoverageItems(runId, items);
    },
    upsertUnderstandingMaps(runId, maps) {
      return service.upsertUnderstandingMaps(runId, maps);
    },
    upsertRuntimeTraces(runId, traces) {
      return service.upsertRuntimeTraces(runId, traces);
    },
    upsertDuplicateFamilies(runId, records) {
      return service.upsertDuplicateFamilies(runId, records);
    },
    upsertArchitectureDecisions(runId, records) {
      return service.upsertArchitectureDecisions(runId, records);
    },
    upsertMigrationLedgerEntries(runId, records) {
      return service.upsertMigrationLedgerEntries(runId, records);
    },
    upsertParityRequirements(runId, records) {
      return service.upsertParityRequirements(runId, records);
    },
    getStatusSnapshot(runId) {
      return service.getStatus(runId);
    },
    getReviews(runId, activeTaskId) {
      return store.getReviews(runId, activeTaskId);
    },
    getApprovals(runId, activeTaskId) {
      return store.getApprovals(runId, activeTaskId);
    }
  }
);

const status = await executeStatusCommandFromArgs([], {
  cwd,
  env,
  findLatestRun(candidateWorkspaceSlug, candidateProjectSlug) {
    return store.findLatestRun({
      workspaceSlug: candidateWorkspaceSlug,
      projectSlug: candidateProjectSlug
    });
  },
  getStatusSnapshot(runId) {
    return service.getStatus(runId);
  },
  inspectReviewIdentity: reviewIdentity,
  inspectGitNexus: gitNexus
});

const report = await executeReportCommandFromArgs(["--format", "json"], {
  cwd,
  env,
  findLatestRun(candidateWorkspaceSlug, candidateProjectSlug) {
    return store.findLatestRun({
      workspaceSlug: candidateWorkspaceSlug,
      projectSlug: candidateProjectSlug
    });
  },
  getStatusSnapshot(runId) {
    return service.getStatus(runId);
  },
  getExecutionPlan(runId, staleAfterHours) {
    return service.getExecutionPlan(runId, { staleAfterHours });
  },
  getRoutingReport(runId) {
    return service.recommendRouting(runId);
  },
  inspectRecovery(runId, staleAfterHours) {
    return service.inspectRecovery(runId, { staleAfterHours });
  },
  getHandoffs(runId, activeTaskId) {
    return store.getHandoffs(runId, activeTaskId);
  },
  getReviews(runId, activeTaskId) {
    return store.getReviews(runId, activeTaskId);
  },
  getApprovals(runId, activeTaskId) {
    return store.getApprovals(runId, activeTaskId);
  },
  inspectReviewIdentity: reviewIdentity,
  inspectGitNexus: gitNexus
});

assert.ok(status.tasks.byStatus.approved.includes(taskId));
assert.ok(!status.tasks.byStatus.approved.includes("2026-05-21-verification-gate-tightening"));
assert.equal(status.autonomous.configured, true);
assert.equal(status.autonomous.profile, "modernization_program");
assert.equal(status.autonomous.comprehensionSummary?.rewriteReadiness, "ready");
assert.equal(status.autonomous.comprehensionSummary?.duplicateFamilyCount, 1);
assert.equal(status.autonomous.comprehensionSummary?.architectureDecisionCount, 1);
assert.equal(status.autonomous.comprehensionSummary?.migrationLedgerCount, 1);
assert.equal(status.autonomous.comprehensionSummary?.parityRequirementCount, 1);
assert.equal(report.report.autonomous.comprehensionSummary?.rewriteReadiness, "ready");

const activeExport = await readFile(join(cwd, ".devgod", "ACTIVE"), "utf8");
assert.equal(activeExport, `task_id=${taskId}\nworkflow=devgod\nstate=active\n`);
EOF

printf 'installed repo harness passed\n'
printf 'workspace: %s\n' "$workspace_slug"
printf 'project: %s\n' "$project_slug"
printf 'task: %s\n' "$task_id"
printf 'profile: modernization_program\n'
printf 'rewrite_readiness: ready\n'
printf 'target: %s\n' "$target_root"
