import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildOperatorStatusReport } from "../src/admin/status.ts";
import { executeDoctorCommandFromArgs, executeDoctorRepairCommandFromArgs, executeStatusCommandFromArgs } from "../src/admin.ts";
import { createReviewActionContextResolver } from "../src/core/review-context.ts";
import { DevgodCoreService } from "../src/core/service.ts";
import type { RuntimeProjectRegistrationRecord, TaskPacketInput } from "../src/domain/types.ts";
import { MemoryStore } from "../src/store/memory-store.ts";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function taskPacket(overrides: Partial<TaskPacketInput> = {}): TaskPacketInput {
  return {
    taskId: overrides.taskId ?? "task-1",
    title: overrides.title ?? "Create task graph",
    ownerRole: overrides.ownerRole ?? "planner",
    completionStandard: overrides.completionStandard ?? "specialist_verified",
    requiredSpecialistRoles:
      overrides.requiredSpecialistRoles ??
      [((overrides.ownerRole ?? "planner") as TaskPacketInput["requiredSpecialistRoles"][number])],
    qualityGates: overrides.qualityGates ?? ["product_acceptance"],
    goal: overrides.goal ?? "Build task graph",
    inputs: overrides.inputs ?? ["intake brief"],
    outputs: overrides.outputs ?? ["task packets"],
    dependencies: overrides.dependencies ?? [],
    allowedWriteScope: overrides.allowedWriteScope ?? [".devgod/work/tasks"],
    outOfScope: overrides.outOfScope ?? ["production deploys"],
    acceptanceCriteria: overrides.acceptanceCriteria ?? ["task packet exists"],
    verificationSteps: overrides.verificationSteps ?? ["review generated packet"],
    uiSurface: overrides.uiSurface,
    playwrightRequired: overrides.playwrightRequired,
    requiredReviews: overrides.requiredReviews ?? ["reviewer", "security_reviewer", "qa_engineer"],
    securityChecks: overrides.securityChecks ?? ["ensure write scope is narrow"],
    antiPatterns: overrides.antiPatterns ?? ["broad repo edits"],
    rollbackNotes: overrides.rollbackNotes ?? "delete the generated task packet",
    handoffFormat: overrides.handoffFormat ?? "summary + blockers + changed files",
    reasoningPolicy: overrides.reasoningPolicy ?? {
      mode: "strict",
      requireBlock: true,
      requireAttempts: true,
      requireTraceRefs: true,
      requireVerification: true,
      requireCriticVerification: true,
      maxAttempts: 3
    },
    reasoningAttempts: overrides.reasoningAttempts ?? [
      {
        id: "attempt-1",
        label: "status report fixture reasoning",
        hypothesis: "the status fixture should remain runnable under strict defaults",
        alternatives: ["downgrade explicitly for compatibility-only cases"],
        evidenceRefs: ["tests/status-report.test.ts"],
        verificationRefs: ["verification-1"],
        traceRef: "test://status-task-packet",
        outcome: "supported",
        summary: "default status fixture includes strict reasoning evidence"
      }
    ],
    reasoningVerifications: overrides.reasoningVerifications ?? [
      {
        id: "verification-1",
        kind: "critic_review",
        ref: "test://status-task-packet",
        status: "passed",
        summary: "default status fixture includes critic verification"
      }
    ],
    reasoningVerdict: overrides.reasoningVerdict ?? {
      status: "supported",
      summary: "default status fixture is strict-complete",
      supportingAttemptIds: ["attempt-1"],
      blockingIssues: []
    },
    reasoningQuality: overrides.reasoningQuality ?? {
      claim: "the status fixture has sufficient evidence",
      facts: ["status report is under test"],
      assumptions: ["task scope remains bounded"],
      hypotheses: ["strict-ready task packets should keep status reporting green"],
      evidenceRefs: ["tests/status-report.test.ts"],
      counterEvidence: [],
      openQuestions: [],
      verificationPlan: ["npm test"],
      fallbacks: ["narrow the status fixture if a weaker mode is required"],
      budgets: { researchSteps: 1, debugSteps: 1, reviewPasses: 1, toolRetries: 1 },
      confidence: "medium",
      decision: "supported"
    }
  };
}

function gitNexusObservation(
  overrides: Partial<import("../src/admin/gitnexus.ts").GitNexusStatusObservation> = {}
): import("../src/admin/gitnexus.ts").GitNexusStatusObservation {
  return {
    authorityLabel: "derived_only",
    state: "unconfigured",
    configured: false,
    configuredScopes: [],
    configPaths: [],
    repoIndexed: false,
    indexRoot: "/repo/.gitnexus",
    metaPath: "/repo/.gitnexus/meta.json",
    recommendedCommand: "npx gitnexus analyze --skip-agents-md",
    notes: ["gitnexus MCP config was not detected in project or user Codex config"],
    ...overrides
  };
}

function runtimeRegistration(overrides: Partial<RuntimeProjectRegistrationRecord> = {}): RuntimeProjectRegistrationRecord {
  return {
    projectId: overrides.projectId ?? "project:team:devgod",
    workspaceId: overrides.workspaceId ?? "workspace:team",
    repoPath: overrides.repoPath ?? "/repo/devgod",
    runtimeProfile: overrides.runtimeProfile ?? "local-docker",
    dataRoot: overrides.dataRoot ?? "/home/eimi/.local/share/devgod/devgod",
    qdrantUrl: overrides.qdrantUrl ?? "http://127.0.0.1:6333",
    qdrantCollection: overrides.qdrantCollection ?? "devgod-memory",
    installManifestPath: overrides.installManifestPath ?? ".devgod/install-manifest.json",
    manifest: overrides.manifest ?? { version: 1 },
    provenance: overrides.provenance ?? { authority: "runtime_authoritative" },
    createdAt: overrides.createdAt ?? "2026-05-10T00:00:00.000Z",
    updatedAt: overrides.updatedAt ?? "2026-05-10T00:00:00.000Z"
  };
}

test("buildOperatorStatusReport labels authoritative and derived sections clearly", async () => {
  const service = new DevgodCoreService(new MemoryStore());
  const run = await service.intakeRequest({
    workspaceSlug: "team",
    projectSlug: "devgod",
    actor: "ceo",
    title: "Build core",
    request: "Ship the shared orchestration backend."
  });

  await service.createTaskGraph(run.id, [
    taskPacket({ taskId: "plan", allowedWriteScope: ["src/core"] }),
    taskPacket({
      taskId: "build",
      dependencies: ["plan"],
      allowedWriteScope: ["src/store"]
    })
  ]);
  await service.claimTask(run.id, "plan", "planner");

  const snapshot = await service.getStatus(run.id);
  const report = buildOperatorStatusReport({
    snapshot,
    reviewIdentity: {
      authorityLabel: "derived_only",
      adapterConfigured: false,
      adapterExists: false,
      availableBackends: [],
      bindingsPresent: true,
      bindingsPath: "/repo/.devgod/review-identity-bindings.json",
      bindingsUseShippedTemplate: false,
      liveTrustReady: false,
      notes: ["adapter module not configured"]
    },
    gitNexus: gitNexusObservation(),
    staleAfterDays: 0,
    now: "2100-01-01T00:00:00.000Z"
  });

  assert.equal(report.run.authorityLabel, "runtime_authoritative");
  assert.equal(report.tasks.authorityLabel, "runtime_authoritative");
  assert.equal(report.orchestration.authorityLabel, "derived_only");
  assert.equal(report.reviewIdentity.authorityLabel, "derived_only");
  assert.equal(report.run.taskCounts.in_progress, 1);
  assert.deepEqual(report.tasks.byStatus.in_progress, ["plan"]);
  assert.deepEqual(report.tasks.byStatus.ready, ["build"]);
  assert.deepEqual(report.tasks.activeLocks, [
    {
      taskId: "plan",
      scopePaths: ["src/core"]
    }
  ]);
  assert.equal(report.orchestration.freshness.status, "stale");
  assert.deepEqual(report.orchestration.nextTaskIds, []);
  assert.equal(report.autonomous.configured, false);
  assert.equal(report.autonomous.resume.status, "not_configured");
  assert.match(
    report.autonomous.resume.summary,
    /workflow proof for the run can still be valid, but this run does not prove active autonomous continuation/
  );
  assert.match(
    report.autonomous.resume.executionSummary,
    /run-level workflow proof may still be valid, but no autonomous continuation target is active/
  );
  assert.equal(report.reviewIdentity.liveTrustReady, false);
  assert.equal(report.gitNexus.state, "unconfigured");
  assert.deepEqual(report.reviewIdentity.notes, ["adapter module not configured"]);
});

test("buildOperatorStatusReport exposes autonomous coverage and resume guidance from runtime state", async () => {
  const service = new DevgodCoreService(new MemoryStore());
  const run = await service.intakeRequest({
    workspaceSlug: "team",
    projectSlug: "devgod",
    actor: "ceo",
    title: "Deep rewrite",
    request: "Show what coverage is complete and where resume starts."
  });

  await service.createTaskGraph(run.id, [
    taskPacket({
      taskId: "rewrite",
      qualityGates: [
        "product_acceptance",
        "coverage_ledger_required",
        "progress_proof_required",
        "checkpoint_resume_required"
      ]
    })
  ]);
  await service.configureAutonomousExecution(run.id, {
    profile: "legacy_rewrite",
    phase: "final_verification",
    manifest: {
      runId: run.id,
      profile: "legacy_rewrite",
      requiredCategories: ["services", "tests"],
      thresholds: {
        criticalItemCoverage: 0.8,
        criticalItemValidation: 0.6,
        callsiteCoverage: 0.85,
        runtimeTraceCoverage: 0.75
      }
    }
  });
  await service.upsertCoverageItems(run.id, [
    {
      id: "service:workflow-proof",
      category: "services",
      state: "validated",
      criticality: "critical",
      sources: ["src/core/service.ts:1"],
      callsiteCount: 2,
      callsitesAnalyzed: 2,
      runtimeTraced: true,
      businessRules: ["runtime proof must remain blocked until authenticated reviews complete"],
      evidenceRefs: ["src/core/service.ts:1"],
      verificationRefs: ["tests/status-report.test.ts"],
      lastUpdatedAt: "2026-05-15T10:00:00.000Z"
    }
  ]);
  await service.upsertUnderstandingMaps(run.id, [
    "repo_map",
    "subsystems",
    "route_map",
    "model_map",
    "integration_map",
    "authz_map",
    "config_coupling",
    "runtime_side_effects"
  ].map((kind) => ({
    kind,
    itemCount: 1,
    analyzedCount: 1,
    sourceRefs: ["src/core/service.ts:1"],
    evidenceRefs: ["tests/status-report.test.ts"],
    updatedAt: "2026-05-15T10:00:00.000Z"
  })));
  await service.upsertRuntimeTraces(run.id, [
    {
      traceId: "trace:status-report",
      targetId: "service:workflow-proof",
      kind: "side_effect",
      risky: true,
      sideEffects: ["records workflow-proof side effects"],
      evidenceRefs: ["tests/status-report.test.ts"],
      createdAt: "2026-05-15T10:00:00.000Z"
    }
  ]);
  await service.upsertCoverageGaps(run.id, [
    {
      id: "gap:resume-proof",
      targetId: "task:runtime-proof",
      kind: "missing_validation",
      severity: "high",
      description: "Authenticated runtime review proof is still pending.",
      blocking: true,
      evidenceRefs: ["src/admin.ts:1"],
      createdBy: "qa_engineer",
      suggestedNextActions: ["resolve the blocking runtime proof gap"],
      status: "open"
    }
  ]);
  await service.recordProgressProof(run.id, {
    cycle: 2,
    proofId: "proof-2",
    phaseBefore: "validation",
    phaseAfter: "final_verification",
    evidenceRefs: ["src/admin.ts:1"],
    coverageDelta: { validated: 1 },
    blockingGapDelta: { closed: 0, opened: 1 },
    nextTarget: "review:authenticated",
    whyNext: "Authenticated review proof is the remaining continuation target.",
    createdAt: "2026-05-15T10:05:00.000Z"
  });
  await service.checkpointRun(run.id, {
    checkpointId: "cp-2",
    phase: "final_verification",
    activeTargets: ["review:authenticated"],
    recentEvidenceRefs: ["src/admin.ts:1"],
    openGaps: ["gap:resume-proof"],
    nextActions: ["stale checkpoint action"],
    compressedContextRef: "memory://cp-2",
    createdAt: "2026-05-15T10:06:00.000Z"
  });

  const snapshot = await service.getStatus(run.id);
  const report = buildOperatorStatusReport({
    snapshot,
    reviewIdentity: {
      authorityLabel: "derived_only",
      adapterConfigured: true,
      adapterExists: true,
      availableBackends: [],
      bindingsPresent: true,
      bindingsPath: "/repo/.devgod/review-identity-bindings.json",
      bindingsUseShippedTemplate: false,
      liveTrustReady: true,
      notes: []
    },
    gitNexus: gitNexusObservation(),
    staleAfterDays: 1,
    now: "2026-05-15T10:07:00.000Z"
  });

  assert.equal(report.autonomous.configured, true);
  assert.equal(report.autonomous.profile, "legacy_rewrite");
  assert.equal(report.autonomous.coverageSummary?.criticalItemCoverage, 1);
  assert.equal(report.autonomous.comprehensionSummary?.inventoryCompleteness, 1);
  assert.equal(report.autonomous.blockers[0], "blocking gaps remain open: 1");
  assert.equal(report.autonomous.latestProgressProof?.proofId, "proof-2");
  assert.equal(report.autonomous.latestCheckpoint?.checkpointId, "cp-2");
  assert.equal(report.autonomous.resume.status, "blocked");
  assert.equal(report.autonomous.resume.source, "blocking_gap");
  assert.equal(report.autonomous.resume.nextTarget, "task:runtime-proof");
  assert.deepEqual(report.autonomous.resume.nextActions, ["resolve the blocking runtime proof gap"]);
});

test("buildOperatorStatusReport reflects generated code-backed understanding inventory", async () => {
  const service = new DevgodCoreService(new MemoryStore());
  const run = await service.intakeRequest({
    workspaceSlug: "team",
    projectSlug: "devgod",
    actor: "ceo",
    title: "Generated inventory",
    request: "Surface generated repo understanding in status."
  });

  await service.createTaskGraph(run.id, [
    taskPacket({
      taskId: "inventory",
      qualityGates: ["product_acceptance", "coverage_ledger_required"]
    })
  ]);
  await service.configureAutonomousExecution(run.id, {
    profile: "legacy_rewrite",
    phase: "inventory",
    manifest: {
      runId: run.id,
      profile: "legacy_rewrite",
      requiredCategories: ["services", "tests"],
      thresholds: {
        criticalItemCoverage: 0.8,
        criticalItemValidation: 0.6,
        callsiteCoverage: 0.85,
        runtimeTraceCoverage: 0.75,
        inventoryCompleteness: 1
      }
    }
  });
  await service.generateRepoInventory(run.id, {
    repoRoot,
    now: "2026-05-20T12:31:00.000Z"
  });

  const snapshot = await service.getStatus(run.id);
  const report = buildOperatorStatusReport({
    snapshot,
    reviewIdentity: {
      authorityLabel: "derived_only",
      adapterConfigured: true,
      adapterExists: true,
      availableBackends: [],
      bindingsPresent: true,
      bindingsPath: "/repo/.devgod/review-identity-bindings.json",
      bindingsUseShippedTemplate: false,
      liveTrustReady: true,
      notes: []
    },
    gitNexus: gitNexusObservation(),
    staleAfterDays: 1,
    now: "2026-05-20T12:32:00.000Z"
  });

  assert.ok((report.autonomous.comprehensionSummary?.inventoryCompleteness ?? 0) > 0);
  assert.ok(report.autonomous.comprehensionSummary?.presentUnderstandingKinds.includes("repo_map"));
  assert.ok(report.autonomous.comprehensionSummary?.presentUnderstandingKinds.includes("runtime_side_effects"));
  assert.ok(report.autonomous.comprehensionSummary?.presentUnderstandingKinds.includes("domain_map"));
  assert.ok(report.autonomous.comprehensionSummary?.presentUnderstandingKinds.includes("symbol_graph"));
  assert.ok(report.autonomous.comprehensionSummary?.presentUnderstandingKinds.includes("dependency_graph"));
});

test("buildOperatorStatusReport surfaces code-backed inventory gaps from ambiguous repo code", async () => {
  const fixtureRoot = await mkdtemp(path.join(tmpdir(), "devgod-status-inventory-"));
  const service = new DevgodCoreService(new MemoryStore());

  try {
    await mkdir(path.join(fixtureRoot, "src", "admin"), { recursive: true });
    await mkdir(path.join(fixtureRoot, "src", "core"), { recursive: true });
    await mkdir(path.join(fixtureRoot, "src", "mcp"), { recursive: true });
    await mkdir(path.join(fixtureRoot, "src", "policy"), { recursive: true });
    await mkdir(path.join(fixtureRoot, "src", "domain"), { recursive: true });
    await mkdir(path.join(fixtureRoot, "src", "config"), { recursive: true });
    await mkdir(path.join(fixtureRoot, "scripts"), { recursive: true });

    await writeFile(path.join(fixtureRoot, "package.json"), '{"name":"fixture","version":"1.0.0"}\n', "utf8");
    await writeFile(path.join(fixtureRoot, "src", "admin", "router.ts"), 'export function handle(command: string) { if (command === "status") return "ok"; return "missing"; }\n', "utf8");
    await writeFile(path.join(fixtureRoot, "src", "admin", "dynamic.ts"), 'export function run(command: string, handlers: Record<string, () => string>) { const handler = handlers[command]; return handler?.() ?? "missing"; }\n', "utf8");
    await writeFile(path.join(fixtureRoot, "src", "core", "service.ts"), 'import { RecordModel } from "../domain/model"; export class BillingService { run(model: RecordModel) { return model.id; } }\n', "utf8");
    await writeFile(path.join(fixtureRoot, "src", "mcp", "client.ts"), 'export async function syncRemote() { return fetch("https://example.com/health"); }\n', "utf8");
    await writeFile(path.join(fixtureRoot, "src", "policy", "access.ts"), 'export function authorizeUser(token: string, permission: string) { return token.length > 0 && permission === "read"; }\n', "utf8");
    await writeFile(path.join(fixtureRoot, "src", "domain", "model.ts"), 'export interface RecordModel { id: string; }\n', "utf8");
    await writeFile(path.join(fixtureRoot, "src", "config", "runtime.ts"), 'export const apiUrl = process.env.API_URL ?? "https://example.com";\n', "utf8");
    await writeFile(path.join(fixtureRoot, "scripts", "sync.sh"), 'echo sync\n', "utf8");

    const run = await service.intakeRequest({
      workspaceSlug: "team",
      projectSlug: "devgod",
      actor: "ceo",
      title: "Ambiguous inventory report",
      request: "Expose code-backed discovery gaps in operator status."
    });

    await service.createTaskGraph(run.id, [
      taskPacket({
        taskId: "inventory",
        qualityGates: ["product_acceptance", "coverage_ledger_required"]
      })
    ]);
    await service.configureAutonomousExecution(run.id, {
      profile: "legacy_rewrite",
      phase: "inventory",
      manifest: {
        runId: run.id,
        profile: "legacy_rewrite",
        requiredCategories: ["services", "external_integrations", "configuration", "authorization"],
        thresholds: {
          criticalItemCoverage: 0.8,
          criticalItemValidation: 0.6,
          callsiteCoverage: 0.85,
          runtimeTraceCoverage: 0.75,
          inventoryCompleteness: 1
        }
      }
    });
    await service.generateRepoInventory(run.id, {
      repoRoot: fixtureRoot,
      now: "2026-05-20T16:01:00.000Z"
    });

    const snapshot = await service.getStatus(run.id);
    const report = buildOperatorStatusReport({
      snapshot,
      reviewIdentity: {
        authorityLabel: "derived_only",
        adapterConfigured: true,
        adapterExists: true,
        availableBackends: [],
        bindingsPresent: true,
        bindingsPath: "/repo/.devgod/review-identity-bindings.json",
        bindingsUseShippedTemplate: false,
        liveTrustReady: true,
        notes: []
      },
      gitNexus: gitNexusObservation(),
      staleAfterDays: 1,
      now: "2026-05-20T16:02:00.000Z"
    });

    assert.ok(report.autonomous.openGaps.some((gap) => gap.targetId === "file:src/admin/dynamic.ts"));
    assert.ok(report.autonomous.openGaps.some((gap) => /manual follow-up/.test(gap.description)));
    assert.ok(report.autonomous.comprehensionSummary?.presentUnderstandingKinds.includes("route_map"));
    assert.ok(report.autonomous.comprehensionSummary?.presentUnderstandingKinds.includes("integration_map"));
    assert.ok(report.autonomous.comprehensionSummary?.presentUnderstandingKinds.includes("config_coupling"));
    assert.ok(report.autonomous.comprehensionSummary?.presentUnderstandingKinds.includes("authz_map"));
    assert.ok(report.autonomous.comprehensionSummary?.presentUnderstandingKinds.includes("domain_map"));
    assert.ok(report.autonomous.comprehensionSummary?.presentUnderstandingKinds.includes("dependency_graph"));
  } finally {
    await rm(fixtureRoot, { recursive: true, force: true });
  }
});

test("buildOperatorStatusReport makes expanded standard-delivery gaps and profile limitations explicit", async () => {
  const service = new DevgodCoreService(new MemoryStore());
  const run = await service.intakeRequest({
    workspaceSlug: "team",
    projectSlug: "devgod",
    actor: "ceo",
    title: "Standard delivery scope",
    request: "Show that standard delivery is task-scoped and missing deeper understanding."
  });

  await service.createTaskGraph(run.id, [
    taskPacket({
      taskId: "delivery",
      qualityGates: ["product_acceptance", "coverage_ledger_required"]
    })
  ]);
  await service.configureAutonomousExecution(run.id, {
    profile: "standard_delivery",
    phase: "validation",
    manifest: {
      runId: run.id,
      profile: "standard_delivery",
      requiredCategories: ["services"],
      thresholds: {
        criticalItemCoverage: 0.8,
        criticalItemValidation: 0.6,
        callsiteCoverage: 0.85,
        runtimeTraceCoverage: 0.75
      }
    }
  });
  await service.upsertUnderstandingMaps(run.id, [
    "repo_map",
    "subsystems",
    "route_map"
  ].map((kind) => ({
    kind,
    itemCount: 1,
    analyzedCount: 1,
    sourceRefs: ["src/core/service.ts:1"],
    evidenceRefs: ["tests/status-report.test.ts"],
    updatedAt: "2026-05-20T15:00:00.000Z"
  })));

  const snapshot = await service.getStatus(run.id);
  const report = buildOperatorStatusReport({
    snapshot,
    reviewIdentity: {
      authorityLabel: "derived_only",
      adapterConfigured: true,
      adapterExists: true,
      availableBackends: [],
      bindingsPresent: true,
      bindingsPath: "/repo/.devgod/review-identity-bindings.json",
      bindingsUseShippedTemplate: false,
      liveTrustReady: true,
      notes: []
    },
    gitNexus: gitNexusObservation(),
    staleAfterDays: 1,
    now: "2026-05-20T15:01:00.000Z"
  });

  assert.equal(report.autonomous.comprehensionSummary?.readinessScope, "profile_limited");
  assert.equal(report.autonomous.comprehensionSummary?.rewriteReadiness, "blocked");
  assert.ok(report.autonomous.comprehensionSummary?.missingUnderstandingKinds.includes("integration_map"));
  assert.ok(report.autonomous.comprehensionSummary?.missingUnderstandingKinds.includes("config_coupling"));
  assert.ok(report.autonomous.comprehensionSummary?.missingUnderstandingKinds.includes("runtime_side_effects"));
  assert.match(
    report.autonomous.comprehensionSummary?.profileLimitations.join(" | ") ?? "",
    /does not establish broad rewrite readiness/
  );
});

test("buildOperatorStatusReport surfaces runtime trace registry summaries and missing risky targets", async () => {
  const service = new DevgodCoreService(new MemoryStore());
  const run = await service.intakeRequest({
    workspaceSlug: "team",
    projectSlug: "devgod",
    actor: "ceo",
    title: "Runtime trace visibility",
    request: "Show risky trace registry state in operator status."
  });

  await service.createTaskGraph(run.id, [
    taskPacket({
      taskId: "trace-registry",
      qualityGates: ["product_acceptance", "coverage_ledger_required"]
    })
  ]);
  await service.configureAutonomousExecution(run.id, {
    profile: "legacy_rewrite",
    phase: "final_verification",
    manifest: {
      runId: run.id,
      profile: "legacy_rewrite",
      requiredCategories: ["services", "external_integrations"],
      thresholds: {
        criticalItemCoverage: 0.8,
        criticalItemValidation: 0.6,
        callsiteCoverage: 0.85,
        runtimeTraceCoverage: 0.75
      }
    }
  });
  await service.upsertCoverageItems(run.id, [
    {
      id: "service:workflow-proof",
      category: "services",
      state: "validated",
      criticality: "critical",
      sources: ["src/core/service.ts:1"],
      callsiteCount: 2,
      callsitesAnalyzed: 2,
      evidenceRefs: ["src/core/service.ts:1"],
      verificationRefs: ["tests/status-report.test.ts"],
      lastUpdatedAt: "2026-05-20T13:10:00.000Z"
    },
    {
      id: "service:core-loop",
      category: "services",
      state: "validated",
      criticality: "critical",
      sources: ["src/core/service.ts:1"],
      callsiteCount: 1,
      callsitesAnalyzed: 1,
      evidenceRefs: ["src/core/service.ts:1"],
      verificationRefs: ["tests/status-report.test.ts"],
      lastUpdatedAt: "2026-05-20T13:10:00.000Z"
    },
    {
      id: "integration:payments",
      category: "external_integrations",
      state: "fully_analyzed",
      criticality: "high",
      sources: ["src/core/service.ts:1"],
      callsiteCount: 1,
      callsitesAnalyzed: 1,
      evidenceRefs: ["src/core/service.ts:1"],
      verificationRefs: ["tests/status-report.test.ts"],
      lastUpdatedAt: "2026-05-20T13:10:00.000Z"
    }
  ]);
  await service.upsertCoverageGaps(run.id, [
    {
      id: "gap:core-loop-trace",
      targetId: "service:core-loop",
      kind: "missing_runtime_trace",
      severity: "high",
      description: "Core loop still lacks a recorded risky runtime trace.",
      blocking: true,
      evidenceRefs: ["tests/status-report.test.ts"],
      createdBy: "qa_engineer",
      suggestedNextActions: ["record core loop runtime trace"],
      status: "open"
    },
    {
      id: "gap:payments-trace",
      targetId: "integration:payments",
      kind: "missing_runtime_trace",
      severity: "high",
      description: "Payment integration still lacks a recorded risky runtime trace.",
      blocking: true,
      evidenceRefs: ["tests/status-report.test.ts"],
      createdBy: "qa_engineer",
      suggestedNextActions: ["record payment runtime trace"],
      status: "open"
    }
  ]);
  await service.captureRuntimeTrace(run.id, {
    traceId: "trace:workflow-proof-side-effect",
    targetId: "service:workflow-proof",
    kind: "side_effect",
    risky: true,
    sideEffects: ["records workflow proof completion"],
    evidenceRefs: ["tests/status-report.test.ts"],
    createdAt: "2026-05-20T13:11:00.000Z"
  });
  await service.importRuntimeTrace(run.id, {
    traceId: "trace:payments-import",
    targetId: "integration:payments",
    kind: "integration",
    risky: true,
    sideEffects: ["submits a payment provider charge"],
    evidenceRefs: ["tests/status-report.test.ts"],
    createdAt: "2026-05-18T13:09:00.000Z"
  });

  const snapshot = await service.getStatus(run.id);
  const report = buildOperatorStatusReport({
    snapshot,
    reviewIdentity: {
      authorityLabel: "derived_only",
      adapterConfigured: true,
      adapterExists: true,
      availableBackends: [],
      bindingsPresent: true,
      bindingsPath: "/repo/.devgod/review-identity-bindings.json",
      bindingsUseShippedTemplate: false,
      liveTrustReady: true,
      notes: []
    },
    gitNexus: gitNexusObservation(),
    now: "2026-05-20T13:12:00.000Z"
  });

  assert.equal(report.traceRegistry.authorityLabel, "derived_only");
  assert.equal(report.traceRegistry.summary?.riskyTraceCount, 2);
  assert.deepEqual(report.traceRegistry.summary?.riskyTargetsMissingTrace, ["service:core-loop"]);
  assert.deepEqual(report.traceRegistry.summary?.openMissingTraceGapIds, ["gap:core-loop-trace"]);
  assert.deepEqual(report.traceRegistry.summary?.operatorImportTargetIds, ["integration:payments"]);
  assert.deepEqual(report.traceRegistry.summary?.staleTargetIds, ["integration:payments"]);
  assert.equal(
    report.traceRegistry.summary?.targets.find((target) => target.targetId === "service:workflow-proof")
      ?.latestAuthorityLabel,
    "runtime_capture"
  );
  assert.equal(
    report.traceRegistry.summary?.targets.find((target) => target.targetId === "integration:payments")
      ?.freshness,
    "stale"
  );
  assert.match(
    report.autonomous.comprehensionSummary?.missingEvidence.join(" | ") ?? "",
    /runtime trace missing for risky target: service:core-loop/
  );
});

test("buildOperatorStatusReport explains withheld rewrite readiness when inventory ambiguity remains open", async () => {
  const service = new DevgodCoreService(new MemoryStore());
  const run = await service.intakeRequest({
    workspaceSlug: "team",
    projectSlug: "devgod",
    actor: "ceo",
    title: "Rewrite gating report",
    request: "Explain why rewrite readiness was withheld."
  });

  await service.createTaskGraph(run.id, [
    taskPacket({
      taskId: "rewrite",
      qualityGates: ["product_acceptance", "coverage_ledger_required"]
    })
  ]);
  await service.configureAutonomousExecution(run.id, {
    profile: "legacy_rewrite",
    phase: "modernization_strategy",
    manifest: {
      runId: run.id,
      profile: "legacy_rewrite",
      requiredCategories: ["services"],
      thresholds: {
        criticalItemCoverage: 0.8,
        criticalItemValidation: 0.6,
        callsiteCoverage: 0.85,
        runtimeTraceCoverage: 0.75,
        inventoryCompleteness: 1,
        businessRuleCoverage: 1,
        maxContradictionGapCount: 0,
        maxOpenBlockers: 1
      }
    }
  });
  await service.upsertCoverageItems(run.id, [
    {
      id: "service:rewrite-core",
      category: "services",
      state: "validated",
      criticality: "critical",
      sources: ["src/core/service.ts:1"],
      callsiteCount: 2,
      callsitesAnalyzed: 2,
      runtimeTraced: true,
      businessRules: ["rewrite planning must require grounded repo comprehension"],
      evidenceRefs: ["src/core/service.ts:1"],
      verificationRefs: ["tests/status-report.test.ts"],
      lastUpdatedAt: "2026-05-20T16:20:00.000Z"
    }
  ]);
  await service.upsertUnderstandingMaps(run.id, [
    "repo_map",
    "subsystems",
    "route_map",
    "model_map",
    "integration_map",
    "authz_map",
    "config_coupling",
    "runtime_side_effects"
  ].map((kind) => ({
    kind,
    itemCount: 1,
    analyzedCount: 1,
    sourceRefs: ["src/core/service.ts:1"],
    evidenceRefs: ["tests/status-report.test.ts"],
    updatedAt: "2026-05-20T16:20:00.000Z"
  })));
  await service.upsertRuntimeTraces(run.id, [
    {
      traceId: "trace:rewrite-core",
      targetId: "service:rewrite-core",
      kind: "side_effect",
      risky: true,
      sideEffects: ["persists rewrite planning state"],
      evidenceRefs: ["tests/status-report.test.ts"],
      createdAt: "2026-05-20T16:20:00.000Z"
    }
  ]);
  await service.upsertCoverageGaps(run.id, [
    {
      id: "gap:rewrite-ambiguity",
      targetId: "file:src/admin/dynamic.ts",
      kind: "missing_inventory",
      severity: "medium",
      description: "dynamic discovery signals in src/admin/dynamic.ts require manual follow-up before rewrite planning is safe",
      blocking: false,
      evidenceRefs: ["tests/status-report.test.ts"],
      createdBy: "qa_engineer",
      suggestedNextActions: ["inspect src/admin/dynamic.ts and record the concrete handler surface"],
      status: "open"
    }
  ]);

  const snapshot = await service.getStatus(run.id);
  const report = buildOperatorStatusReport({
    snapshot,
    reviewIdentity: {
      authorityLabel: "derived_only",
      adapterConfigured: true,
      adapterExists: true,
      availableBackends: [],
      bindingsPresent: true,
      bindingsPath: "/repo/.devgod/review-identity-bindings.json",
      bindingsUseShippedTemplate: false,
      liveTrustReady: true,
      notes: []
    },
    gitNexus: gitNexusObservation(),
    staleAfterDays: 1,
    now: "2026-05-20T16:21:00.000Z"
  });

  assert.equal(report.autonomous.comprehensionSummary?.rewriteReadiness, "blocked");
  assert.match(
    report.autonomous.comprehensionSummary?.missingEvidence.join(" | ") ?? "",
    /inventory gap open: dynamic discovery signals in src\/admin\/dynamic.ts require manual follow-up/
  );
  assert.equal(report.autonomous.phaseReadiness?.status, "blocked");
});

test("buildOperatorStatusReport counts invariants toward rewrite comprehension coverage", async () => {
  const service = new DevgodCoreService(new MemoryStore());
  const run = await service.intakeRequest({
    workspaceSlug: "team",
    projectSlug: "devgod",
    actor: "ceo",
    title: "Invariant-backed rewrite report",
    request: "Treat invariants as semantic evidence in operator status."
  });

  await service.createTaskGraph(run.id, [
    taskPacket({
      taskId: "rewrite",
      qualityGates: ["product_acceptance", "coverage_ledger_required"]
    })
  ]);
  await service.configureAutonomousExecution(run.id, {
    profile: "legacy_rewrite",
    phase: "modernization_strategy",
    manifest: {
      runId: run.id,
      profile: "legacy_rewrite",
      requiredCategories: ["services"],
      thresholds: {
        criticalItemCoverage: 0.8,
        criticalItemValidation: 0.6,
        callsiteCoverage: 0.85,
        runtimeTraceCoverage: 0.75,
        inventoryCompleteness: 1,
        businessRuleCoverage: 1,
        maxContradictionGapCount: 0,
        maxOpenBlockers: 0
      }
    }
  });
  await service.upsertCoverageItems(run.id, [
    {
      id: "service:rewrite-core",
      category: "services",
      state: "validated",
      criticality: "critical",
      sources: ["src/core/service.ts:1"],
      callsiteCount: 2,
      callsitesAnalyzed: 2,
      runtimeTraced: true,
      invariants: ["authenticated review authority must hold before rewrite completion"],
      evidenceRefs: ["src/core/service.ts:1"],
      verificationRefs: ["tests/status-report.test.ts"],
      lastUpdatedAt: "2026-05-21T11:00:00.000Z"
    }
  ]);
  await service.upsertUnderstandingMaps(run.id, [
    "repo_map",
    "subsystems",
    "route_map",
    "model_map",
    "integration_map",
    "authz_map",
    "config_coupling",
    "runtime_side_effects"
  ].map((kind) => ({
    kind,
    itemCount: 1,
    analyzedCount: 1,
    sourceRefs: ["src/core/service.ts:1"],
    evidenceRefs: ["tests/status-report.test.ts"],
    updatedAt: "2026-05-21T11:00:00.000Z"
  })));
  await service.upsertRuntimeTraces(run.id, [
    {
      traceId: "trace:rewrite-core",
      targetId: "service:rewrite-core",
      kind: "side_effect",
      risky: true,
      sideEffects: ["persists rewrite gating evidence"],
      evidenceRefs: ["tests/status-report.test.ts"],
      createdAt: "2026-05-21T11:00:00.000Z"
    }
  ]);

  const snapshot = await service.getStatus(run.id);
  const report = buildOperatorStatusReport({
    snapshot,
    reviewIdentity: {
      authorityLabel: "derived_only",
      adapterConfigured: true,
      adapterExists: true,
      availableBackends: [],
      bindingsPresent: true,
      bindingsPath: "/repo/.devgod/review-identity-bindings.json",
      bindingsUseShippedTemplate: false,
      liveTrustReady: true,
      notes: []
    },
    gitNexus: gitNexusObservation(),
    staleAfterDays: 1,
    now: "2026-05-21T11:01:00.000Z"
  });

  assert.equal(report.autonomous.comprehensionSummary?.businessRuleCoverage, 1);
  assert.equal(report.autonomous.comprehensionSummary?.rewriteReadiness, "ready");
  assert.equal(
    report.autonomous.comprehensionSummary?.missingEvidence.some((entry) =>
      /business rule or invariant coverage/.test(entry)
    ),
    false
  );
});

test("buildOperatorStatusReport exposes duplicate family counts and centralization candidates", async () => {
  const service = new DevgodCoreService(new MemoryStore());
  const run = await service.intakeRequest({
    workspaceSlug: "team",
    projectSlug: "devgod",
    actor: "ceo",
    title: "Duplicate family report",
    request: "Surface duplicate-family centralization evidence in operator status."
  });

  await service.configureAutonomousExecution(run.id, {
    profile: "modernization_program",
    phase: "modernization_strategy",
    manifest: {
      runId: run.id,
      profile: "modernization_program",
      requiredCategories: ["services"],
      thresholds: {
        criticalItemCoverage: 0.9,
        criticalItemValidation: 0.75,
        callsiteCoverage: 0.9,
        runtimeTraceCoverage: 0.85,
        inventoryCompleteness: 1,
        businessRuleCoverage: 0.9,
        maxContradictionGapCount: 0,
        maxOpenBlockers: 0
      }
    }
  });
  await service.upsertDuplicateFamilies(run.id, [
    {
      familyId: "duplicate:approval-policy",
      capability: "approval policy evaluation",
      members: [
        { itemId: "service:approval-policy", kind: "shared_core", role: "service policy engine" },
        { itemId: "route:approval-policy", kind: "intentional_variant", role: "route adapter" }
      ],
      sharedAbstraction: "ApprovalPolicyEngine",
      intentionalVariants: ["route adapter emits extra audit metadata"],
      accidentalDivergences: [],
      centralizationCandidate: "route approval checks through ApprovalPolicyEngine",
      parityRequirements: ["prove both variants reach identical approval decisions for matching claims"],
      evidenceRefs: ["tests/status-report.test.ts"],
      verificationRefs: ["tests/status-report.test.ts"],
      lastUpdatedAt: "2026-05-21T11:20:00.000Z"
    }
  ]);

  const snapshot = await service.getStatus(run.id);
  const report = buildOperatorStatusReport({
    snapshot,
    reviewIdentity: {
      authorityLabel: "derived_only",
      adapterConfigured: true,
      adapterExists: true,
      availableBackends: [],
      bindingsPresent: true,
      bindingsPath: "/repo/.devgod/review-identity-bindings.json",
      bindingsUseShippedTemplate: false,
      liveTrustReady: true,
      notes: []
    },
    gitNexus: gitNexusObservation(),
    staleAfterDays: 1,
    now: "2026-05-21T11:21:00.000Z"
  });

  assert.equal(report.autonomous.comprehensionSummary?.duplicateFamilyCount, 1);
  assert.equal(report.autonomous.comprehensionSummary?.duplicateFamilyMemberCount, 2);
  assert.equal(report.autonomous.comprehensionSummary?.centralizationCandidateCount, 1);
});

test("buildOperatorStatusReport exposes architecture and migration evidence counts", async () => {
  const service = new DevgodCoreService(new MemoryStore());
  const run = await service.intakeRequest({
    workspaceSlug: "team",
    projectSlug: "devgod",
    actor: "ceo",
    title: "Architecture and migration report",
    request: "Surface architecture-fit and migration evidence counts in operator status."
  });

  await service.configureAutonomousExecution(run.id, {
    profile: "modernization_program",
    phase: "migration_sequencing",
    manifest: {
      runId: run.id,
      profile: "modernization_program",
      requiredCategories: ["services"],
      thresholds: {
        criticalItemCoverage: 0.9,
        criticalItemValidation: 0.75,
        callsiteCoverage: 0.9,
        runtimeTraceCoverage: 0.85,
        inventoryCompleteness: 1,
        businessRuleCoverage: 0.9,
        maxContradictionGapCount: 0,
        maxOpenBlockers: 0
      }
    }
  });
  await service.upsertArchitectureDecisions(run.id, [
    {
      decisionId: "adr:auth-boundary",
      title: "Keep auth policy in a modular monolith boundary first",
      status: "accepted",
      options: ["extract auth service now", "stabilize auth boundary inside modular monolith"],
      chosenOption: "stabilize auth boundary inside modular monolith",
      boundedContexts: ["auth", "workflow-proof"],
      consistencyNeeds: ["strong authorization decisions", "low-latency proof checks"],
      rationale: ["tight consistency beats premature extraction during the first migration wave"],
      evidenceRefs: ["tests/status-report.test.ts"],
      verificationRefs: ["tests/status-report.test.ts"],
      lastUpdatedAt: "2026-05-21T11:45:00.000Z"
    }
  ]);
  await service.upsertMigrationLedgerEntries(run.id, [
    {
      entryId: "migration:auth-policies",
      boundedContext: "auth",
      sourceModels: ["legacy_policy_rules"],
      targetModels: ["policy_rule_snapshots"],
      strategy: "expand_contract",
      consistencyClass: "strong",
      ownership: "backend_engineer",
      rolloutSteps: ["add snapshot table", "dual-write policy changes", "cut reads after parity pass"],
      rollbackPlan: ["stop reads from snapshot table", "keep dual-write flag disabled"],
      evidenceRefs: ["tests/status-report.test.ts"],
      verificationRefs: ["tests/status-report.test.ts"],
      lastUpdatedAt: "2026-05-21T11:46:00.000Z"
    }
  ]);
  await service.upsertParityRequirements(run.id, [
    {
      requirementId: "parity:auth-policies",
      capability: "auth policy evaluation",
      status: "planned",
      legacyRefs: ["legacy_policy_rules"],
      targetRefs: ["policy_rule_snapshots"],
      acceptanceChecks: ["prove legacy and snapshot-backed decisions match for the seeded policy corpus"],
      evidenceRefs: ["tests/status-report.test.ts"],
      verificationRefs: ["tests/status-report.test.ts"],
      lastUpdatedAt: "2026-05-21T11:47:00.000Z"
    }
  ]);

  const snapshot = await service.getStatus(run.id);
  const report = buildOperatorStatusReport({
    snapshot,
    reviewIdentity: {
      authorityLabel: "derived_only",
      adapterConfigured: true,
      adapterExists: true,
      availableBackends: [],
      bindingsPresent: true,
      bindingsPath: "/repo/.devgod/review-identity-bindings.json",
      bindingsUseShippedTemplate: false,
      liveTrustReady: true,
      notes: []
    },
    gitNexus: gitNexusObservation(),
    staleAfterDays: 1,
    now: "2026-05-21T11:48:00.000Z"
  });

  assert.equal(report.autonomous.comprehensionSummary?.architectureDecisionCount, 1);
  assert.equal(report.autonomous.comprehensionSummary?.migrationLedgerCount, 1);
  assert.equal(report.autonomous.comprehensionSummary?.parityRequirementCount, 1);
});

test("buildOperatorStatusReport surfaces missing modernization artifact classes for modernization_program", async () => {
  const service = new DevgodCoreService(new MemoryStore());
  const run = await service.intakeRequest({
    workspaceSlug: "team",
    projectSlug: "devgod",
    actor: "ceo",
    title: "Modernization artifact visibility",
    request: "Surface missing modernization artifact classes in operator status."
  });

  await service.createTaskGraph(run.id, [
    taskPacket({
      taskId: "modernize",
      qualityGates: ["product_acceptance", "coverage_ledger_required"]
    })
  ]);
  await service.configureAutonomousExecution(run.id, {
    profile: "modernization_program",
    phase: "modernization_strategy",
    manifest: {
      runId: run.id,
      profile: "modernization_program",
      requiredCategories: ["services"],
      thresholds: {
        criticalItemCoverage: 0.9,
        criticalItemValidation: 0.75,
        callsiteCoverage: 0.9,
        runtimeTraceCoverage: 0.85,
        inventoryCompleteness: 1,
        businessRuleCoverage: 0.9,
        maxContradictionGapCount: 0,
        maxOpenBlockers: 0
      }
    }
  });
  await service.upsertCoverageItems(run.id, [
    {
      id: "service:modernization-core",
      category: "services",
      state: "validated",
      criticality: "critical",
      sources: ["src/core/service.ts:1"],
      callsiteCount: 2,
      callsitesAnalyzed: 2,
      runtimeTraced: true,
      businessRules: ["modernization planning must stay blocked until modernization artifacts exist"],
      evidenceRefs: ["src/core/service.ts:1"],
      verificationRefs: ["tests/status-report.test.ts"],
      lastUpdatedAt: "2026-05-21T10:00:00.000Z"
    }
  ]);
  await service.upsertUnderstandingMaps(run.id, [
    "repo_map",
    "subsystems",
    "route_map",
    "model_map",
    "integration_map",
    "authz_map",
    "config_coupling",
    "runtime_side_effects"
  ].map((kind) => ({
    kind,
    itemCount: 1,
    analyzedCount: 1,
    sourceRefs: ["src/core/service.ts:1"],
    evidenceRefs: ["tests/status-report.test.ts"],
    updatedAt: "2026-05-21T10:00:00.000Z"
  })));
  await service.upsertRuntimeTraces(run.id, [
    {
      traceId: "trace:modernization-core",
      targetId: "service:modernization-core",
      kind: "side_effect",
      risky: true,
      sideEffects: ["persists modernization readiness evidence"],
      evidenceRefs: ["tests/status-report.test.ts"],
      createdAt: "2026-05-21T10:00:00.000Z"
    }
  ]);

  const snapshot = await service.getStatus(run.id);
  const report = buildOperatorStatusReport({
    snapshot,
    reviewIdentity: {
      authorityLabel: "derived_only",
      adapterConfigured: true,
      adapterExists: true,
      availableBackends: [],
      bindingsPresent: true,
      bindingsPath: "/repo/.devgod/review-identity-bindings.json",
      bindingsUseShippedTemplate: false,
      liveTrustReady: true,
      notes: []
    },
    gitNexus: gitNexusObservation(),
    staleAfterDays: 1,
    now: "2026-05-21T10:01:00.000Z"
  });

  assert.equal(report.autonomous.profile, "modernization_program");
  assert.equal(report.autonomous.comprehensionSummary?.readinessScope, "broad");
  assert.equal(report.autonomous.comprehensionSummary?.rewriteReadiness, "blocked");
  assert.ok(report.autonomous.comprehensionSummary?.missingArtifactKinds.includes("domain_map"));
  assert.ok(report.autonomous.comprehensionSummary?.missingArtifactKinds.includes("duplicate_families"));
  assert.ok(report.autonomous.comprehensionSummary?.missingArtifactKinds.includes("architecture_decisions"));
  assert.match(
    report.autonomous.comprehensionSummary?.missingEvidence.join(" | ") ?? "",
    /modernization artifact missing: architecture_decisions/
  );
});

test("buildOperatorStatusReport surfaces operational checkpoint compaction and self-referential checkpoint resume guidance", async () => {
  const service = new DevgodCoreService(new MemoryStore());
  const run = await service.intakeRequest({
    workspaceSlug: "team",
    projectSlug: "devgod",
    actor: "ceo",
    title: "Checkpoint compaction visibility",
    request: "Show generated compressed context in operator status."
  });

  await service.createTaskGraph(run.id, [
    taskPacket({
      taskId: "resume",
      qualityGates: ["product_acceptance", "memory_compaction_required"]
    })
  ]);
  await service.configureAutonomousExecution(run.id, {
    profile: "standard_delivery",
    phase: "validation",
    manifest: {
      runId: run.id,
      profile: "standard_delivery",
      requiredCategories: ["services"],
      thresholds: {
        criticalItemCoverage: 0.8,
        criticalItemValidation: 0.6,
        callsiteCoverage: 0.85,
        runtimeTraceCoverage: 0.75
      }
    }
  });
  await service.checkpointRun(run.id, {
    checkpointId: "cp-generated",
    phase: "validation",
    activeTargets: [],
    recentEvidenceRefs: ["src/core/service.ts:1", "tests/status-report.test.ts"],
    openGaps: [],
    nextActions: ["resume generated checkpoint context"],
    createdAt: "2026-05-20T13:43:00.000Z"
  });

  const snapshot = await service.getStatus(run.id);
  const report = buildOperatorStatusReport({
    snapshot,
    reviewIdentity: {
      authorityLabel: "derived_only",
      adapterConfigured: true,
      adapterExists: true,
      availableBackends: [],
      bindingsPresent: true,
      bindingsPath: "/repo/.devgod/review-identity-bindings.json",
      bindingsUseShippedTemplate: false,
      liveTrustReady: true,
      notes: []
    },
    gitNexus: gitNexusObservation(),
    now: "2026-05-20T13:44:00.000Z"
  });

  assert.equal(report.compaction.authorityLabel, "runtime_authoritative");
  assert.equal(report.compaction.status, "present");
  assert.equal(report.compaction.checkpointId, "cp-generated");
  assert.equal(report.compaction.ref, "memory://checkpoint/cp-generated/compressed-context");
  assert.deepEqual(report.compaction.sourceRefs, [
    "src/core/service.ts:1",
    "tests/status-report.test.ts"
  ]);
  assert.match(report.compaction.summary ?? "", /validation/);
});

test("buildOperatorStatusReport surfaces external eval posture and explicit review controls", async () => {
  const service = new DevgodCoreService(new MemoryStore());
  const run = await service.intakeRequest({
    workspaceSlug: "team",
    projectSlug: "devgod",
    actor: "ceo",
    title: "Eval posture visibility",
    request: "Show external eval and review controls in status."
  });

  await service.configureAutonomousExecution(run.id, {
    profile: "legacy_rewrite",
    phase: "final_verification",
    manifest: {
      runId: run.id,
      profile: "legacy_rewrite",
      requiredCategories: ["services"],
      thresholds: {
        criticalItemCoverage: 0.8,
        criticalItemValidation: 0.6,
        callsiteCoverage: 0.85,
        runtimeTraceCoverage: 0.75
      }
    }
  });
  await service.upsertExternalEvals(run.id, [
    {
      evalId: "eval:orchestration-replay",
      label: "Replay-grade orchestration baseline",
      scope: "repo_local",
      harness: "replay_grade_orchestration",
      artifactRef: "replay://orchestration/generated-baseline",
      evidenceRefs: ["tests/status-report.test.ts"],
      createdAt: "2026-05-20T14:01:00.000Z"
    },
    {
      evalId: "eval:swe-bench",
      label: "SWE-bench verified sample",
      scope: "semi_external",
      harness: "swe_bench_verified",
      artifactRef: "https://www.swebench.com/verified.html",
      evidenceRefs: ["tests/status-report.test.ts"],
      createdAt: "2026-05-20T14:02:00.000Z"
    }
  ]);
  await service.upsertSensitiveActionControls(run.id, [
    {
      controlId: "control:workflow-proof-auth",
      actionType: "workflow_proof",
      enforcement: "authenticated_runtime",
      summary: "workflow proof remains gated on authenticated runtime review evidence",
      evidenceRefs: ["tests/status-report.test.ts"],
      createdAt: "2026-05-20T14:03:00.000Z"
    }
  ]);

  const snapshot = await service.getStatus(run.id);
  const report = buildOperatorStatusReport({
    snapshot,
    reviewIdentity: {
      authorityLabel: "derived_only",
      adapterConfigured: true,
      adapterExists: true,
      availableBackends: [],
      bindingsPresent: true,
      bindingsPath: "/repo/.devgod/review-identity-bindings.json",
      bindingsUseShippedTemplate: false,
      liveTrustReady: true,
      notes: []
    },
    gitNexus: gitNexusObservation(),
    now: "2026-05-20T14:04:00.000Z"
  });

  assert.equal(report.evalPosture.status, "semi_external_ready");
  assert.deepEqual(report.evalPosture.repoLocalLabels, ["Replay-grade orchestration baseline"]);
  assert.deepEqual(report.evalPosture.broaderEvidenceLabels, ["SWE-bench verified sample"]);
  assert.match(report.evalPosture.boundarySummary, /Repo-local eval evidence and broader replay-grade or external evidence are both present/);
  assert.deepEqual(report.evalPosture.labels, ["Replay-grade orchestration baseline", "SWE-bench verified sample"]);
  assert.equal(report.reviewControls.status, "explicit");
  assert.deepEqual(report.reviewControls.controls.map((control) => control.controlId), [
    "control:workflow-proof-auth"
  ]);
});

test("executeStatusCommandFromArgs parses flags and reports env-derived review identity posture", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "devgod-status-command-"));
  const service = new DevgodCoreService(new MemoryStore());
  const run = await service.intakeRequest({
    workspaceSlug: "team",
    projectSlug: "devgod",
    actor: "ceo",
    title: "Build core",
    request: "Ship the shared orchestration backend."
  });

  await service.createTaskGraph(run.id, [taskPacket({ taskId: "plan", allowedWriteScope: ["src/core"] })]);

  try {
    await mkdir(path.join(directory, ".devgod"), { recursive: true });
    await writeFile(path.join(directory, "review-identity-adapter.ts"), "export default async () => ({ verified: true });\n");
    await writeFile(
      path.join(directory, ".devgod/review-identity-bindings.json"),
      JSON.stringify(
        {
          bindings: [
            {
              principal: {
                provider: "github",
                subject: "replace-with-authenticated-user-id"
              },
              actors: [
                {
                  actor: "replace-with-review-actor",
                  roles: ["reviewer"]
                }
              ]
            }
          ]
        },
        null,
        2
      ),
      "utf8"
    );

    const report = await executeStatusCommandFromArgs(["--run-id", run.id, "--stale-after-days", "0"], {
      cwd: directory,
      env: {
        ...process.env,
        DEVGOD_REVIEW_IDENTITY_ADAPTER_MODULE: "./review-identity-adapter.ts",
        DEVGOD_REVIEW_IDENTITY_BINDINGS: ".devgod/review-identity-bindings.json"
      },
      getStatusSnapshot(runId) {
        return service.getStatus(runId);
      },
      inspectGitNexus: async () =>
        gitNexusObservation({
          state: "missing_index",
          configured: true,
          configuredScopes: ["project"],
          configPaths: [path.join(directory, ".codex/config.toml")],
          notes: ["gitnexus MCP is configured but this repo has not been indexed yet"]
        })
    });

    assert.equal(report.run.id, run.id);
    assert.equal(report.run.authorityLabel, "runtime_authoritative");
    assert.equal(report.reviewIdentity.authorityLabel, "derived_only");
    assert.equal(report.reviewIdentity.adapterConfigured, true);
    assert.deepEqual(report.reviewIdentity.availableBackends, []);
    assert.equal(report.reviewIdentity.bindingsPresent, true);
    assert.equal(report.reviewIdentity.liveTrustReady, false);
    assert.equal(report.gitNexus.state, "missing_index");
    assert.match(
      report.reviewIdentity.notes.join(" "),
      /still contains shipped placeholder values/
    );
    assert.equal(report.orchestration.freshness.status, "fresh");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("executeStatusCommandFromArgs degrades malformed bindings into a derived warning", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "devgod-status-command-invalid-bindings-"));
  const service = new DevgodCoreService(new MemoryStore());
  const run = await service.intakeRequest({
    workspaceSlug: "team",
    projectSlug: "devgod",
    actor: "ceo",
    title: "Build core",
    request: "Ship the shared orchestration backend."
  });

  await service.createTaskGraph(run.id, [taskPacket({ taskId: "plan", allowedWriteScope: ["src/core"] })]);

  try {
    await mkdir(path.join(directory, ".devgod"), { recursive: true });
    await writeFile(path.join(directory, "review-identity-adapter.ts"), "export default async () => ({ verified: true });\n");
    await writeFile(path.join(directory, ".devgod/review-identity-bindings.json"), "{ invalid json\n", "utf8");

    const report = await executeStatusCommandFromArgs(["--run-id", run.id], {
      cwd: directory,
      env: {
        ...process.env,
        DEVGOD_REVIEW_IDENTITY_ADAPTER_MODULE: "./review-identity-adapter.ts",
        DEVGOD_REVIEW_IDENTITY_BINDINGS: ".devgod/review-identity-bindings.json"
      },
      getStatusSnapshot(runId) {
        return service.getStatus(runId);
      },
      inspectGitNexus: async () => gitNexusObservation()
    });

    assert.equal(report.reviewIdentity.liveTrustReady, false);
    assert.equal(report.gitNexus.state, "unconfigured");
    assert.match(report.reviewIdentity.notes.join(" "), /bindings file is invalid and cannot be trusted/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("executeStatusCommandFromArgs surfaces contradictory local completion claims against unverified runtime state", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "devgod-status-integrity-"));
  const store = new MemoryStore();
  const service = new DevgodCoreService(store);
  const run = await service.intakeRequest({
    workspaceSlug: "team",
    projectSlug: "devgod",
    actor: "ceo",
    title: "Integrity drift",
    request: "Detect local exports that overstate runtime completion."
  });

  await service.createTaskGraph(run.id, [taskPacket({ taskId: "plan", allowedWriteScope: ["src/core"] })]);
  await service.claimTask(run.id, "plan", "planner");
  const context = await store.getProjectContext({ workspaceSlug: "team", projectSlug: "devgod" });
  assert.ok(context);
  await store.saveProjectRuntimeState({
    projectId: context.project.id,
    workspaceId: context.workspace.id,
    activeRunId: run.id,
    activeTaskId: "plan",
    taskQueue: {
      project_status: "in_progress",
      current_task_id: "plan",
      tasks: []
    },
    productState: { status: "in_progress", items: [] },
    lastVerifiedRunId: undefined,
    metadata: {},
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  });

  try {
    await mkdir(path.join(directory, ".devgod", "work"), { recursive: true });
    await writeFile(path.join(directory, ".devgod", "ACTIVE"), "workflow=devgod\nstate=complete\n", "utf8");
    await writeFile(
      path.join(directory, ".devgod", "work", "task-queue.json"),
      `${JSON.stringify({ project_status: "complete", current_task_id: null, tasks: [] }, null, 2)}\n`,
      "utf8"
    );

    const report = await executeStatusCommandFromArgs(["--run-id", run.id], {
      cwd: directory,
      env: process.env,
      getStatusSnapshot(runId) {
        return service.getStatus(runId);
      },
      getProjectRuntimeState(projectId) {
        return store.getProjectRuntimeState(projectId);
      },
      inspectGitNexus: async () => gitNexusObservation()
    });

    assert.equal(report.integrity.status, "contradicted");
    assert.equal(report.integrity.runtimeState?.lastVerifiedRunId, null);
    assert.equal(report.integrity.localExports?.activeState, "complete");
    assert.match(report.integrity.contradictions.join(" | "), /local exports claim complete/i);
    assert.match(report.integrity.contradictions.join(" | "), /runtime run status is in_progress/i);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("executeStatusCommandFromArgs marks advisory continuation as operator-required when an execution plan is available", async () => {
  const service = new DevgodCoreService(new MemoryStore());
  const run = await service.intakeRequest({
    workspaceSlug: "team",
    projectSlug: "devgod",
    actor: "ceo",
    title: "Advisory continuation",
    request: "Show when status should stop at operator-required continuation."
  });

  await service.createTaskGraph(run.id, [
    taskPacket({
      taskId: "rewrite",
      qualityGates: [
        "product_acceptance",
        "coverage_ledger_required",
        "progress_proof_required",
        "checkpoint_resume_required"
      ]
    })
  ]);
  await service.configureAutonomousExecution(run.id, {
    profile: "legacy_rewrite",
    phase: "final_verification",
    manifest: {
      runId: run.id,
      profile: "legacy_rewrite",
      requiredCategories: ["services", "tests"],
      thresholds: {
        criticalItemCoverage: 0.8,
        criticalItemValidation: 0.6,
        callsiteCoverage: 0.85,
        runtimeTraceCoverage: 0.75
      }
    }
  });
  await service.upsertCoverageItems(run.id, [
    {
      id: "service:workflow-proof",
      category: "services",
      state: "validated",
      criticality: "critical",
      sources: ["src/core/service.ts:1"],
      callsiteCount: 2,
      callsitesAnalyzed: 2,
      runtimeTraced: true,
      evidenceRefs: ["src/core/service.ts:1"],
      verificationRefs: ["tests/status-report.test.ts"],
      lastUpdatedAt: "2026-05-15T10:00:00.000Z"
    }
  ]);
  await service.recordProgressProof(run.id, {
    cycle: 1,
    proofId: "proof-1",
    phaseBefore: "validation",
    phaseAfter: "final_verification",
    evidenceRefs: ["src/admin.ts:1"],
    coverageDelta: { validated: 1 },
    blockingGapDelta: { closed: 1, opened: 0 },
    nextTarget: "artifact:resume",
    whyNext: "This remains advisory-only.",
    createdAt: "2026-05-15T10:05:00.000Z"
  });

  const report = await executeStatusCommandFromArgs(["--run-id", run.id], {
    env: process.env,
    getStatusSnapshot(runId) {
      return service.getStatus(runId);
    },
    getExecutionPlan() {
      return Promise.resolve({
        mode: "runtime_authoritative",
        runId: run.id,
        runStatus: "approved",
        autonomousExecution: undefined,
        directive: {
          kind: "continue_analysis",
          targetId: "artifact:resume",
          source: "progress_proof",
          actions: [
            {
              kind: "resume_target",
              targetId: "artifact:resume",
              source: "progress_proof",
              sourceId: "proof-1"
            }
          ],
          nextActions: ["This remains advisory-only."],
          blockers: [],
          rationale: ["operator evidence is still required"]
        }
      });
    },
    inspectGitNexus: async () => gitNexusObservation()
  });

  assert.equal(report.autonomous.resume.executionMode, "operator_required");
  assert.equal(report.autonomous.resume.provider, "codex_cli_exec_scheduler");
  assert.equal(report.autonomous.resume.wakeOwner, "operator");
  assert.match(
    report.autonomous.resume.executionSummary,
    /operator input is required for advisory continuation target artifact:resume/
  );
});

test("executeStatusCommandFromArgs exposes daemon continuation status when local daemon state is blocked", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "devgod-status-daemon-continuation-"));
  const service = new DevgodCoreService(new MemoryStore());
  const run = await service.intakeRequest({
    workspaceSlug: "team",
    projectSlug: "devgod",
    actor: "ceo",
    title: "Daemon continuation visibility",
    request: "Surface the daemon continuation blocker through status."
  });

  await service.createTaskGraph(run.id, [taskPacket({ taskId: "rewrite" })]);
  const otherRun = await service.intakeRequest({
    workspaceSlug: "team",
    projectSlug: "devgod",
    actor: "ceo",
    title: "Daemon supervisor visibility other run",
    request: "Keep a second run around to verify filtered history views."
  });
  await service.createTaskGraph(otherRun.id, [taskPacket({ taskId: "stabilize" })]);

  try {
    await mkdir(path.join(directory, ".devgod", "work", "daemon"), { recursive: true });
    await writeFile(
      path.join(directory, ".devgod", "work", "daemon", "continuation-status.json"),
      `${JSON.stringify(
        {
          state: "blocked",
          directiveKind: "continue_analysis",
          executionMode: "operator_required",
          targetId: "artifact:resume",
          source: "progress_proof",
          sourceId: "proof-1",
          actionKind: "resume_target",
          summary: "operator input is required for advisory continuation target artifact:resume from progress_proof (proof-1)",
          nextActions: ["consult operator evidence before resuming the artifact target"],
          blockers: ["blocking gaps remain open"],
          updatedAt: "2026-05-16T10:00:00.000Z"
        },
        null,
        2
      )}\n`,
      "utf8"
    );
    await writeFile(
      path.join(directory, ".devgod", "work", "daemon", "operator-handoff.json"),
      `${JSON.stringify(
        {
          state: "blocked",
          blockerKind: "operator_required_continuation",
          reason: "operator input is required for advisory continuation target artifact:resume from progress_proof (proof-1)",
          workspaceSlug: "team",
          projectSlug: "devgod",
          activeRunId: run.id,
          activeTaskId: "rewrite",
          sessionId: null,
          cycle: 1,
          directiveKind: "continue_analysis",
          nextActions: ["consult operator evidence before resuming the artifact target"],
          detailFiles: {
            continuationStatus: ".devgod/work/daemon/continuation-status.json",
            appAutomationRequest: ".devgod/work/daemon/app-automation-request.json",
            cliSchedulerRequest: ".devgod/work/daemon/cli-scheduler-request.json"
          },
          updatedAt: "2026-05-16T10:00:00.000Z"
        },
        null,
        2
      )}\n`,
      "utf8"
    );

    const report = await executeStatusCommandFromArgs(["--run-id", run.id], {
      cwd: directory,
      env: process.env,
      getStatusSnapshot(runId) {
        return service.getStatus(runId);
      },
      inspectGitNexus: async () => gitNexusObservation()
    });

    assert.equal(report.daemon.continuation?.state, "blocked");
    assert.equal(report.daemon.continuation?.executionMode, "operator_required");
    assert.equal(report.daemon.continuation?.targetId, "artifact:resume");
    assert.equal(report.daemon.continuation?.source, "progress_proof");
    assert.equal(report.daemon.continuation?.sourceId, "proof-1");
    assert.equal(report.daemon.continuation?.actionKind, "resume_target");
    assert.equal(report.daemon.continuation?.provider, "codex_cli_exec_scheduler");
    assert.equal(report.daemon.continuation?.wakeOwner, "operator");
    assert.deepEqual(report.daemon.continuation?.nextActions, [
      "consult operator evidence before resuming the artifact target"
    ]);
    assert.deepEqual(report.daemon.continuation?.blockers, ["blocking gaps remain open"]);
    assert.equal(report.daemon.handoff?.state, "blocked");
    assert.equal(report.daemon.handoff?.blockerKind, "operator_required_continuation");
    assert.equal(
      report.daemon.handoff?.reason,
      "operator input is required for advisory continuation target artifact:resume from progress_proof (proof-1)"
    );
    assert.equal(report.daemon.handoff?.activeRunId, run.id);
    assert.equal(report.daemon.handoff?.activeTaskId, "rewrite");
    assert.equal(report.daemon.handoff?.directiveKind, "continue_analysis");
    assert.deepEqual(report.daemon.handoff?.nextActions, [
      "consult operator evidence before resuming the artifact target"
    ]);
    assert.equal(
      report.daemon.handoff?.detailFiles.continuationStatus,
      ".devgod/work/daemon/continuation-status.json"
    );
    assert.equal(
      report.daemon.handoff?.detailFiles.appAutomationRequest,
      ".devgod/work/daemon/app-automation-request.json"
    );
    assert.equal(
      report.daemon.handoff?.detailFiles.cliSchedulerRequest,
      ".devgod/work/daemon/cli-scheduler-request.json"
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("executeStatusCommandFromArgs exposes daemon supervisor state with action history and missing review actors", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "devgod-status-daemon-supervisor-"));
  const service = new DevgodCoreService(new MemoryStore());
  const run = await service.intakeRequest({
    workspaceSlug: "team",
    projectSlug: "devgod",
    actor: "ceo",
    title: "Daemon supervisor visibility",
    request: "Surface the supervisor blocker through status."
  });

  await service.createTaskGraph(run.id, [taskPacket({ taskId: "rewrite" })]);
  const otherRun = await service.intakeRequest({
    workspaceSlug: "team",
    projectSlug: "devgod",
    actor: "ceo",
    title: "Daemon supervisor visibility other run",
    request: "Keep a second run around to verify filtered history views."
  });
  await service.createTaskGraph(otherRun.id, [taskPacket({ taskId: "stabilize" })]);

  try {
    await mkdir(path.join(directory, ".devgod", "work", "daemon"), { recursive: true });
    await writeFile(
      path.join(directory, ".devgod", "work", "daemon", "supervisor-status.json"),
      `${JSON.stringify(
        {
          state: "blocked",
          blockerKind: "missing_review_actor_bindings",
          reason: "supervisor is missing review actor bindings for: security_reviewer, qa_engineer",
          workspaceSlug: "team",
          projectSlug: "devgod",
          activeRunId: run.id,
          activeTaskId: "rewrite",
          sessionId: "session-supervisor",
          supervisorCycles: 1,
          nextActions: [
            "provide --review-actor security_reviewer=<actor>",
            "provide --review-actor qa_engineer=<actor>"
          ],
          missingReviewRoles: ["security_reviewer", "qa_engineer"],
          actions: [
            {
              cycle: 1,
              action: "enqueue_operator_continuation",
              targetId: "artifact:resume",
              filePath: ".devgod/operator-actions/action-1.json",
              summary: "queued trusted continuation follow-up"
            }
          ],
          updatedAt: "2026-05-16T12:00:00.000Z"
        },
        null,
        2
      )}\n`,
      "utf8"
    );
    await writeFile(
      path.join(directory, ".devgod", "work", "daemon", "supervisor-history.jsonl"),
      `${JSON.stringify(
        {
          recordedAt: "2026-05-16T11:30:00.000Z",
          state: "completed",
          reason: "previous supervisor run completed after enqueuing trusted review actions",
          workspaceSlug: "team",
          projectSlug: "devgod",
          activeRunId: run.id,
          activeTaskId: "rewrite",
          sessionId: "session-supervisor-previous",
          supervisorCycles: 2,
          nextActions: [],
          missingReviewRoles: [],
          actions: [
            {
              cycle: 1,
              action: "enqueue_review_action",
              taskId: "rewrite",
              reviewRole: "security_reviewer",
              filePath: ".devgod/review-actions/security.json",
              summary: "queued trusted security review action via security-actor"
            }
          ]
        }
      )}\n${JSON.stringify(
        {
          recordedAt: "2026-05-16T11:45:00.000Z",
          state: "completed",
          reason: "other run completed after a clean supervisor pass",
          workspaceSlug: "team",
          projectSlug: "devgod",
          activeRunId: otherRun.id,
          activeTaskId: "stabilize",
          sessionId: "session-supervisor-other",
          supervisorCycles: 1,
          nextActions: [],
          missingReviewRoles: [],
          actions: []
        }
      )}\n${JSON.stringify(
        {
          recordedAt: "2026-05-16T12:00:00.000Z",
          state: "blocked",
          blockerKind: "missing_review_actor_bindings",
          reason: "supervisor is missing review actor bindings for: security_reviewer, qa_engineer",
          workspaceSlug: "team",
          projectSlug: "devgod",
          activeRunId: run.id,
          activeTaskId: "rewrite",
          sessionId: "session-supervisor",
          supervisorCycles: 1,
          nextActions: [
            "provide --review-actor security_reviewer=<actor>",
            "provide --review-actor qa_engineer=<actor>"
          ],
          missingReviewRoles: ["security_reviewer", "qa_engineer"],
          actions: [
            {
              cycle: 1,
              action: "enqueue_operator_continuation",
              targetId: "artifact:resume",
              filePath: ".devgod/operator-actions/action-1.json",
              summary: "queued trusted continuation follow-up"
            }
          ]
        }
      )}\n`,
      "utf8"
    );

    const report = await executeStatusCommandFromArgs(["--run-id", run.id], {
      cwd: directory,
      env: process.env,
      getStatusSnapshot(runId) {
        return service.getStatus(runId);
      },
      inspectGitNexus: async () => gitNexusObservation()
    });

    assert.equal(report.daemon.supervisor?.state, "blocked");
    assert.equal(report.daemon.supervisor?.blockerKind, "missing_review_actor_bindings");
    assert.equal(
      report.daemon.supervisor?.reason,
      "supervisor is missing review actor bindings for: security_reviewer, qa_engineer"
    );
    assert.equal(report.daemon.supervisor?.activeRunId, run.id);
    assert.equal(report.daemon.supervisor?.activeTaskId, "rewrite");
    assert.equal(report.daemon.supervisor?.sessionId, "session-supervisor");
    assert.equal(report.daemon.supervisor?.supervisorCycles, 1);
    assert.deepEqual(report.daemon.supervisor?.missingReviewRoles, ["security_reviewer", "qa_engineer"]);
    assert.deepEqual(report.daemon.supervisor?.nextActions, [
      "provide --review-actor security_reviewer=<actor>",
      "provide --review-actor qa_engineer=<actor>"
    ]);
    assert.deepEqual(report.daemon.supervisor?.actions, [
      {
        cycle: 1,
        action: "enqueue_operator_continuation",
        targetId: "artifact:resume",
        taskId: undefined,
        reviewRole: undefined,
        filePath: ".devgod/operator-actions/action-1.json",
        summary: "queued trusted continuation follow-up"
      }
    ]);
    assert.deepEqual(report.daemon.supervisor?.history, [
      {
        recordedAt: "2026-05-16T11:30:00.000Z",
        state: "completed",
        activeRunId: run.id,
        activeTaskId: "rewrite",
        blockerKind: undefined,
        reason: "previous supervisor run completed after enqueuing trusted review actions",
        supervisorCycles: 2,
        actionCount: 1
      },
      {
        recordedAt: "2026-05-16T12:00:00.000Z",
        state: "blocked",
        activeRunId: run.id,
        activeTaskId: "rewrite",
        blockerKind: "missing_review_actor_bindings",
        reason: "supervisor is missing review actor bindings for: security_reviewer, qa_engineer",
        supervisorCycles: 1,
        actionCount: 1
      }
    ]);
    assert.deepEqual(report.daemon.supervisor?.historyView, {
      scope: "run",
      runId: run.id,
      limit: 5,
      retainedCount: 3,
      filteredCount: 2,
      returnedCount: 2,
      truncated: false
    });

    const allRunsReport = await executeStatusCommandFromArgs(
      [
        "--run-id",
        run.id,
        "--daemon-supervisor-history-scope",
        "all",
        "--daemon-supervisor-history-limit",
        "1"
      ],
      {
        cwd: directory,
        env: process.env,
        getStatusSnapshot(runId) {
          return service.getStatus(runId);
        },
        inspectGitNexus: async () => gitNexusObservation()
      }
    );
    assert.deepEqual(allRunsReport.daemon.supervisor?.history, [
      {
        recordedAt: "2026-05-16T12:00:00.000Z",
        state: "blocked",
        activeRunId: run.id,
        activeTaskId: "rewrite",
        blockerKind: "missing_review_actor_bindings",
        reason: "supervisor is missing review actor bindings for: security_reviewer, qa_engineer",
        supervisorCycles: 1,
        actionCount: 1
      }
    ]);
    assert.deepEqual(allRunsReport.daemon.supervisor?.historyView, {
      scope: "all",
      runId: undefined,
      limit: 1,
      retainedCount: 3,
      filteredCount: 3,
      returnedCount: 1,
      truncated: true
    });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("executeStatusCommandFromArgs reports multi-backend review adapters and requires selection", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "devgod-status-command-multi-backend-"));
  const service = new DevgodCoreService(new MemoryStore());
  const run = await service.intakeRequest({
    workspaceSlug: "team",
    projectSlug: "devgod",
    actor: "ceo",
    title: "Build core",
    request: "Ship the shared orchestration backend."
  });

  await service.createTaskGraph(run.id, [taskPacket({ taskId: "plan", allowedWriteScope: ["src/core"] })]);

  try {
    await mkdir(path.join(directory, ".devgod"), { recursive: true });
    await writeFile(
      path.join(directory, "review-identity-adapter.ts"),
      `export const reviewIdentityAdapters = {
  one: async () => ({ provider: "test", subject: "one", verified: true }),
  two: async () => ({ provider: "test", subject: "two", verified: true })
};
`,
      "utf8"
    );
    await writeFile(
      path.join(directory, ".devgod/review-identity-bindings.json"),
      JSON.stringify(
        {
          bindings: [
            {
              principal: {
                provider: "github",
                subject: "alice"
              },
              actors: [
                {
                  actor: "alice-reviewer",
                  roles: ["reviewer"]
                }
              ]
            }
          ]
        },
        null,
        2
      ),
      "utf8"
    );

    const report = await executeStatusCommandFromArgs(["--run-id", run.id], {
      cwd: directory,
      env: {
        ...process.env,
        DEVGOD_REVIEW_IDENTITY_ADAPTER_MODULE: "./review-identity-adapter.ts",
        DEVGOD_REVIEW_IDENTITY_BINDINGS: ".devgod/review-identity-bindings.json"
      },
      getStatusSnapshot(runId) {
        return service.getStatus(runId);
      },
      inspectGitNexus: async () =>
        gitNexusObservation({
          state: "ready",
          configured: true,
          configuredScopes: ["user"],
          configPaths: [path.join(directory, ".codex/config.toml")],
          repoIndexed: true,
          indexedAt: "2026-05-06T00:00:00.000Z",
          indexedCommit: "abc123",
          headCommit: "abc123",
          notes: ["gitnexus advisory context is ready"]
        })
    });

    assert.deepEqual(report.reviewIdentity.availableBackends, ["one", "two"]);
    assert.equal(report.reviewIdentity.selectedBackend, undefined);
    assert.equal(report.reviewIdentity.liveTrustReady, false);
    assert.match(report.reviewIdentity.notes.join(" "), /multiple review backends are available but none is selected/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("executeStatusCommandFromArgs rejects missing run ids and invalid stale-after-days flags", async () => {
  await assert.rejects(
    executeStatusCommandFromArgs([], {
      env: process.env,
      async getStatusSnapshot() {
        assert.fail("status should not resolve a snapshot without --run-id");
      }
    }),
    /status-like commands require --run-id/
  );

  await assert.rejects(
    executeStatusCommandFromArgs(["--run-id", "run-123", "--stale-after-days", "nope"], {
      env: process.env,
      async getStatusSnapshot() {
        assert.fail("status should not resolve a snapshot for invalid stale-after-days");
      }
    }),
    /Invalid --stale-after-days value: nope/
  );
});

test("executeDoctorCommandFromArgs fails when a bootstrapped project has no runtime registration", async () => {
  const store = new MemoryStore();
  const service = new DevgodCoreService(store);
  const run = await service.intakeRequest({
    workspaceSlug: "team",
    projectSlug: "devgod",
    actor: "ceo",
    title: "Build core",
    request: "Ship the shared orchestration backend."
  });

  await service.createTaskGraph(run.id, [taskPacket({ taskId: "plan", allowedWriteScope: ["src/core"] })]);

  const report = await executeDoctorCommandFromArgs(["--run-id", run.id], {
    cwd: "/repo/devgod",
    env: process.env,
    getStatusSnapshot(runId) {
      return service.getStatus(runId);
    },
    getProjectRuntimeRegistration(projectId) {
      return store.getProjectRuntimeRegistration(projectId);
    },
    inspectGitNexus: async () => gitNexusObservation(),
    inspectReviewIdentity: async () => ({
      authorityLabel: "derived_only",
      adapterConfigured: false,
      adapterExists: false,
      availableBackends: [],
      bindingsPresent: false,
      bindingsPath: "/repo/devgod/.devgod/review-identity-bindings.json",
      bindingsUseShippedTemplate: false,
      liveTrustReady: false,
      notes: ["review identity bindings file missing"]
    })
  });

  assert.equal(report.ok, false);
  assert.equal(report.checks.registration.ok, false);
  assert.equal(report.checks.repoPath.ok, false);
  assert.equal(report.checks.reviewIdentity.ok, false);
  assert.deepEqual(report.advisories, ["review identity bindings file missing"]);
  assert.match(report.checks.registration.summary, /not runtime-registered/);
});

test("executeDoctorCommandFromArgs works without a run id when a project is bootstrapped", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "devgod-doctor-zero-run-"));
  const store = new MemoryStore();

  try {
    const context = await store.ensureProjectContext({
      workspaceSlug: "team",
      projectSlug: "devgod",
      repoPath: directory
    });
    await mkdir(path.join(directory, "runtime-root"), { recursive: true });
    await store.saveProjectRuntimeRegistration(
      runtimeRegistration({
        projectId: context.project.id,
        workspaceId: context.workspace.id,
        repoPath: directory,
        dataRoot: path.join(directory, "runtime-root")
      })
    );

    const report = await executeDoctorCommandFromArgs([], {
      cwd: directory,
      env: {
        ...process.env,
        DEVGOD_WORKSPACE_SLUG: "team",
        DEVGOD_PROJECT_SLUG: "devgod"
      },
      async findProjectContext(workspaceSlug, projectSlug) {
        return store.getProjectContext({ workspaceSlug, projectSlug });
      },
      async getStatusSnapshot() {
        assert.fail("doctor should not require a run snapshot for bootstrapped projects");
      },
      getProjectRuntimeRegistration(projectId) {
        return store.getProjectRuntimeRegistration(projectId);
      },
      inspectReviewIdentity: async () => ({
        authorityLabel: "derived_only",
        adapterConfigured: false,
        adapterExists: false,
        availableBackends: [],
        bindingsPresent: false,
        bindingsPath: path.join(directory, ".devgod/review-identity-bindings.json"),
        bindingsUseShippedTemplate: false,
        liveTrustReady: false,
        notes: ["review identity bindings file missing"]
      }),
      inspectQdrant: async () => ({
        ok: true,
        summary: "qdrant reachable"
      })
    });

    assert.equal(report.ok, true);
    assert.equal(report.run, undefined);
    assert.equal(report.project.workspaceSlug, "team");
    assert.equal(report.project.projectSlug, "devgod");
    assert.equal(report.checks.reviewIdentity.ok, false);
    assert.deepEqual(report.blockers, []);
    assert.deepEqual(report.advisories, ["review identity bindings file missing"]);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("executeDoctorCommandFromArgs reports runtime mode derived from registration profile", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "devgod-doctor-runtime-mode-"));
  const store = new MemoryStore();

  try {
    const context = await store.ensureProjectContext({
      workspaceSlug: "team",
      projectSlug: "devgod",
      repoPath: directory
    });
    await mkdir(path.join(directory, "runtime-root"), { recursive: true });
    await store.saveProjectRuntimeRegistration(
      runtimeRegistration({
        projectId: context.project.id,
        workspaceId: context.workspace.id,
        repoPath: directory,
        dataRoot: path.join(directory, "runtime-root"),
        runtimeProfile: "local-native"
      })
    );

    const report = await executeDoctorCommandFromArgs([], {
      cwd: directory,
      env: {
        ...process.env,
        DEVGOD_WORKSPACE_SLUG: "team",
        DEVGOD_PROJECT_SLUG: "devgod"
      },
      async findProjectContext(workspaceSlug, projectSlug) {
        return store.getProjectContext({ workspaceSlug, projectSlug });
      },
      async getStatusSnapshot() {
        assert.fail("doctor should not require a run snapshot for bootstrapped projects");
      },
      getProjectRuntimeRegistration(projectId) {
        return store.getProjectRuntimeRegistration(projectId);
      },
      inspectReviewIdentity: async () => ({
        authorityLabel: "derived_only",
        adapterConfigured: false,
        adapterExists: false,
        availableBackends: [],
        bindingsPresent: false,
        bindingsPath: path.join(directory, ".devgod/review-identity-bindings.json"),
        bindingsUseShippedTemplate: false,
        liveTrustReady: false,
        notes: ["review identity bindings file missing"]
      }),
      inspectQdrant: async () => ({
        ok: true,
        summary: "qdrant reachable"
      })
    });

    assert.equal(report.runtime.runtimeProfile, "local-native");
    assert.equal(report.runtime.runtimeMode, "native");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("executeDoctorCommandFromArgs reports repo-path mismatch and missing review bindings as separate findings", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "devgod-doctor-command-"));
  const store = new MemoryStore();
  const service = new DevgodCoreService(store);
  const run = await service.intakeRequest({
    workspaceSlug: "team",
    projectSlug: "devgod",
    actor: "ceo",
    title: "Build core",
    request: "Ship the shared orchestration backend."
  });

  await service.createTaskGraph(run.id, [taskPacket({ taskId: "plan", allowedWriteScope: ["src/core"] })]);

  try {
    await mkdir(path.join(directory, "runtime-root"), { recursive: true });
    await store.saveProjectRuntimeRegistration(
      runtimeRegistration({
        projectId: run.projectId,
        workspaceId: run.workspaceId,
        repoPath: "/other/repo",
        dataRoot: path.join(directory, "runtime-root")
      })
    );

    const report = await executeDoctorCommandFromArgs(["--run-id", run.id], {
      cwd: directory,
      env: process.env,
      getStatusSnapshot(runId) {
        return service.getStatus(runId);
      },
      getProjectRuntimeRegistration(projectId) {
        return store.getProjectRuntimeRegistration(projectId);
      },
      inspectGitNexus: async () => gitNexusObservation(),
      inspectReviewIdentity: async () => ({
        authorityLabel: "derived_only",
        adapterConfigured: true,
        adapterExists: true,
        availableBackends: [],
        bindingsPresent: false,
        bindingsPath: path.join(directory, ".devgod/review-identity-bindings.json"),
        bindingsUseShippedTemplate: false,
        liveTrustReady: false,
        notes: ["review identity bindings file missing"]
      }),
      inspectQdrant: async () => ({
        ok: true,
        summary: "qdrant reachable"
      })
    });

    assert.equal(report.ok, false);
    assert.equal(report.checks.registration.ok, true);
    assert.equal(report.checks.dataRoot.ok, true);
    assert.equal(report.checks.qdrant.ok, true);
    assert.equal(report.checks.repoPath.ok, false);
    assert.equal(report.checks.reviewIdentity.ok, false);
    assert.deepEqual(report.advisories, ["review identity bindings file missing"]);
    assert.match(report.checks.repoPath.summary, /repo path mismatch/);
    assert.match(report.checks.reviewIdentity.summary, /bindings file missing/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("executeDoctorRepairCommandFromArgs repairs runtime registration drift with bootstrap repair only", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "devgod-doctor-repair-bootstrap-"));
  const store = new MemoryStore();
  let bootstrapRepairCalls = 0;
  let setupRepairCalls = 0;

  try {
    const context = await store.ensureProjectContext({
      workspaceSlug: "team",
      projectSlug: "devgod",
      repoPath: directory
    });

    const result = await executeDoctorRepairCommandFromArgs(["--repair"], {
      cwd: directory,
      env: {
        ...process.env,
        DEVGOD_WORKSPACE_SLUG: "team",
        DEVGOD_PROJECT_SLUG: "devgod"
      },
      async findProjectContext(workspaceSlug, projectSlug) {
        return store.getProjectContext({ workspaceSlug, projectSlug });
      },
      async getStatusSnapshot() {
        assert.fail("repair should not require a run snapshot for bootstrapped projects");
      },
      getProjectRuntimeRegistration(projectId) {
        return store.getProjectRuntimeRegistration(projectId);
      },
      inspectReviewIdentity: async () => ({
        authorityLabel: "derived_only",
        adapterConfigured: true,
        adapterExists: true,
        availableBackends: [],
        bindingsPresent: true,
        bindingsPath: path.join(directory, ".devgod/review-identity-bindings.json"),
        bindingsUseShippedTemplate: false,
        liveTrustReady: true,
        notes: []
      }),
      inspectQdrant: async () => ({
        ok: true,
        summary: "qdrant reachable"
      }),
      async runBootstrapRepair() {
        bootstrapRepairCalls += 1;
        await mkdir(path.join(directory, "runtime-root"), { recursive: true });
        await store.saveProjectRuntimeRegistration(
          runtimeRegistration({
            projectId: context.project.id,
            workspaceId: context.workspace.id,
            repoPath: directory,
            dataRoot: path.join(directory, "runtime-root")
          })
        );
      },
      async runSetupRepair() {
        setupRepairCalls += 1;
      }
    });

    assert.equal(bootstrapRepairCalls, 1);
    assert.equal(setupRepairCalls, 0);
    assert.equal(result.ok, true);
    assert.equal(result.executionReady, true);
    assert.equal(result.repair.status, "repaired");
    assert.deepEqual(result.repair.stepsApplied, ["rerun bootstrap-project and verify-setup"]);
    assert.equal(result.report?.checks.registration.ok, true);
    assert.equal(result.report?.checks.repoPath.ok, true);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("executeDoctorRepairCommandFromArgs skips live-trust review identity remediation", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "devgod-doctor-repair-review-identity-"));
  const store = new MemoryStore();
  let bootstrapRepairCalls = 0;
  let setupRepairCalls = 0;

  try {
    const context = await store.ensureProjectContext({
      workspaceSlug: "team",
      projectSlug: "devgod",
      repoPath: directory
    });
    await mkdir(path.join(directory, "runtime-root"), { recursive: true });
    await store.saveProjectRuntimeRegistration(
      runtimeRegistration({
        projectId: context.project.id,
        workspaceId: context.workspace.id,
        repoPath: directory,
        dataRoot: path.join(directory, "runtime-root")
      })
    );

    const result = await executeDoctorRepairCommandFromArgs(["--repair"], {
      cwd: directory,
      env: {
        ...process.env,
        DEVGOD_WORKSPACE_SLUG: "team",
        DEVGOD_PROJECT_SLUG: "devgod"
      },
      async findProjectContext(workspaceSlug, projectSlug) {
        return store.getProjectContext({ workspaceSlug, projectSlug });
      },
      async getStatusSnapshot() {
        assert.fail("repair should not require a run snapshot for bootstrapped projects");
      },
      getProjectRuntimeRegistration(projectId) {
        return store.getProjectRuntimeRegistration(projectId);
      },
      inspectReviewIdentity: async () => ({
        authorityLabel: "derived_only",
        adapterConfigured: false,
        adapterExists: false,
        availableBackends: [],
        bindingsPresent: false,
        bindingsPath: path.join(directory, ".devgod/review-identity-bindings.json"),
        bindingsUseShippedTemplate: false,
        liveTrustReady: false,
        notes: ["review identity bindings file missing"]
      }),
      inspectQdrant: async () => ({
        ok: true,
        summary: "qdrant reachable"
      }),
      async runBootstrapRepair() {
        bootstrapRepairCalls += 1;
      },
      async runSetupRepair() {
        setupRepairCalls += 1;
      }
    });

    assert.equal(bootstrapRepairCalls, 0);
    assert.equal(setupRepairCalls, 0);
    assert.equal(result.ok, true);
    assert.equal(result.executionReady, false);
    assert.equal(result.repair.status, "skipped");
    assert.match(result.repair.skippedReasons[0] ?? "", /review identity requires live operator remediation/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("executeDoctorRepairCommandFromArgs replays setup for database connectivity failures", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "devgod-doctor-repair-connectivity-"));
  const store = new MemoryStore();
  const context = await store.ensureProjectContext({
    workspaceSlug: "team",
    projectSlug: "devgod",
    repoPath: directory
  });
  await mkdir(path.join(directory, "runtime-root"), { recursive: true });
  await store.saveProjectRuntimeRegistration(
    runtimeRegistration({
      projectId: context.project.id,
      workspaceId: context.workspace.id,
      repoPath: directory,
      dataRoot: path.join(directory, "runtime-root")
    })
  );

  let attempts = 0;
  let setupRepairCalls = 0;

  try {
    const result = await executeDoctorRepairCommandFromArgs(["--repair"], {
      cwd: directory,
      env: {
        ...process.env,
        DEVGOD_WORKSPACE_SLUG: "team",
        DEVGOD_PROJECT_SLUG: "devgod"
      },
      async findProjectContext(workspaceSlug, projectSlug) {
        attempts += 1;
        if (attempts === 1) {
          throw new Error("connect ECONNREFUSED 127.0.0.1:55432");
        }
        return store.getProjectContext({ workspaceSlug, projectSlug });
      },
      async getStatusSnapshot() {
        assert.fail("repair should not require a run snapshot for bootstrapped projects");
      },
      getProjectRuntimeRegistration(projectId) {
        return store.getProjectRuntimeRegistration(projectId);
      },
      inspectReviewIdentity: async () => ({
        authorityLabel: "derived_only",
        adapterConfigured: true,
        adapterExists: true,
        availableBackends: [],
        bindingsPresent: true,
        bindingsPath: path.join(directory, ".devgod/review-identity-bindings.json"),
        bindingsUseShippedTemplate: false,
        liveTrustReady: true,
        notes: []
      }),
      inspectQdrant: async () => ({
        ok: true,
        summary: "qdrant reachable"
      }),
      async runSetupRepair() {
        setupRepairCalls += 1;
      }
    });

    assert.equal(setupRepairCalls, 1);
    assert.equal(result.ok, true);
    assert.equal(result.executionReady, true);
    assert.equal(result.repair.status, "repaired");
    assert.deepEqual(result.repair.stepsApplied, ["run local devgod setup script"]);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("executeDoctorRepairCommandFromArgs applies safe runtime reconcile after runtime health passes", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "devgod-doctor-repair-reconcile-"));
  const store = new MemoryStore();
  const service = new DevgodCoreService(store);
  let bootstrapRepairCalls = 0;
  let setupRepairCalls = 0;

  try {
    const run = await service.intakeRequest({
      workspaceSlug: "team",
      projectSlug: "devgod",
      actor: "ceo",
      title: "Repair runtime drift",
      request: "Heal a uniquely determined runtime task drift."
    });
    await service.createTaskGraph(run.id, [taskPacket({ taskId: "task-owner", allowedWriteScope: ["src/runtime"] })]);

    const context = await store.getProjectContext({ workspaceSlug: "team", projectSlug: "devgod" });
    assert.ok(context);
    await mkdir(path.join(directory, "runtime-root"), { recursive: true });
    await store.saveProjectRuntimeRegistration(
      runtimeRegistration({
        projectId: context.project.id,
        workspaceId: context.workspace.id,
        repoPath: directory,
        dataRoot: path.join(directory, "runtime-root")
      })
    );
    await store.saveProjectRuntimeState({
      projectId: context.project.id,
      workspaceId: context.workspace.id,
      activeRunId: run.id,
      activeTaskId: undefined,
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

    const result = await executeDoctorRepairCommandFromArgs(["--repair"], {
      cwd: directory,
      env: {
        ...process.env,
        DEVGOD_WORKSPACE_SLUG: "team",
        DEVGOD_PROJECT_SLUG: "devgod"
      },
      findLatestRun(workspaceSlug, projectSlug) {
        return store.findLatestRun({ workspaceSlug, projectSlug });
      },
      async findProjectContext(workspaceSlug, projectSlug) {
        return store.getProjectContext({ workspaceSlug, projectSlug });
      },
      getProjectContext(params) {
        return store.getProjectContext(params);
      },
      getProjectRuntimeState(projectId) {
        return store.getProjectRuntimeState(projectId);
      },
      saveProjectRuntimeState(state) {
        return store.saveProjectRuntimeState(state);
      },
      getStatusSnapshot(runId) {
        return service.getStatus(runId);
      },
      getExecutionPlan(runId, staleAfterHours) {
        return service.getExecutionPlan(runId, { staleAfterHours });
      },
      applyRecovery(runId, actionIds, staleAfterHours) {
        return service.applyRecovery(runId, actionIds, { staleAfterHours });
      },
      getProjectRuntimeRegistration(projectId) {
        return store.getProjectRuntimeRegistration(projectId);
      },
      inspectReviewIdentity: async () => ({
        authorityLabel: "derived_only",
        adapterConfigured: true,
        adapterExists: true,
        availableBackends: [],
        bindingsPresent: true,
        bindingsPath: path.join(directory, ".devgod/review-identity-bindings.json"),
        bindingsUseShippedTemplate: false,
        liveTrustReady: true,
        notes: []
      }),
      inspectQdrant: async () => ({
        ok: true,
        summary: "qdrant reachable"
      }),
      async runBootstrapRepair() {
        bootstrapRepairCalls += 1;
      },
      async runSetupRepair() {
        setupRepairCalls += 1;
      }
    });

    const runtimeState = await store.getProjectRuntimeState(context.project.id);
    assert.equal(bootstrapRepairCalls, 0);
    assert.equal(setupRepairCalls, 0);
    assert.equal(result.ok, true);
    assert.equal(result.executionReady, true);
    assert.equal(result.repair.status, "repaired");
    assert.deepEqual(result.repair.stepsApplied, ["reconcile authoritative runtime task state"]);
    assert.deepEqual(result.repair.integrityRepairsAttempted, ["reconcile authoritative runtime task state"]);
    assert.deepEqual(result.repair.integrityRepairsApplied, ["reconcile authoritative runtime task state"]);
    assert.equal(runtimeState?.metadata?.lastIntegrityRepair?.source, "doctor_repair");
    assert.equal(runtimeState?.metadata?.lastIntegrityRepair?.kind, "runtime_task_reconcile");
    assert.match(
      String(runtimeState?.metadata?.lastIntegrityRepair?.summary ?? ""),
      /reconcile authoritative runtime task state/i
    );
    assert.equal(runtimeState?.activeTaskId, "task-owner");
    assert.equal((runtimeState?.taskQueue as { current_task_id?: string | null }).current_task_id, "task-owner");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("executeDoctorRepairCommandFromArgs keeps execution blocked when semantic drift needs operator review", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "devgod-doctor-repair-semantic-block-"));
  const store = new MemoryStore();
  const service = new DevgodCoreService(store, {
    resolveReviewActionContext: createReviewActionContextResolver({
      bindings: {
        bindings: [
          {
            principal: { provider: "test", subject: "reviewer-actor" },
            actors: [{ actor: "reviewer-actor", roles: ["reviewer"] }]
          },
          {
            principal: { provider: "test", subject: "security-actor" },
            actors: [{ actor: "security-actor", roles: ["security_reviewer"] }]
          },
          {
            principal: { provider: "test", subject: "qa-actor" },
            actors: [{ actor: "qa-actor", roles: ["qa_engineer"] }]
          }
        ]
      },
      resolveAuthenticatedPrincipal(input) {
        return {
          provider: "test",
          subject: input.actor,
          verified: true
        };
      }
    })
  });

  try {
    const run = await service.intakeRequest({
      workspaceSlug: "team",
      projectSlug: "devgod",
      actor: "ceo",
      title: "Approved runtime drift",
      request: "Do not auto-clear a stale active task from a completed run."
    });
    await service.createTaskGraph(run.id, [taskPacket({ taskId: "task-owner", allowedWriteScope: ["src/runtime"] })]);
    await service.claimTask(run.id, "task-owner", "planner");
    await service.submitHandoff(run.id, "task-owner", {
      actor: "planner",
      ownerRole: "planner",
      completionStandard: "specialist_verified",
      summary: "Prepared approved task.",
      changedFiles: ["src/admin.ts"],
      blockers: [],
      verificationNotes: ["verified repair guardrails"],
      executionEvidence: ["task packet written"],
      qualityGateEvidence: ["tdd scenarios listed"],
      contextRefs: ["brief://task-owner"]
    });
    await service.recordReview(run.id, "task-owner", "reviewer-actor", {
      reviewerRole: "reviewer",
      state: "passed",
      severity: "low",
      findings: []
    });
    await service.recordReview(run.id, "task-owner", "security-actor", {
      reviewerRole: "security_reviewer",
      state: "passed",
      severity: "low",
      findings: []
    });
    await service.recordReview(run.id, "task-owner", "qa-actor", {
      reviewerRole: "qa_engineer",
      state: "passed",
      severity: "low",
      findings: []
    });

    const context = await store.getProjectContext({ workspaceSlug: "team", projectSlug: "devgod" });
    assert.ok(context);
    await mkdir(path.join(directory, "runtime-root"), { recursive: true });
    await store.saveProjectRuntimeRegistration(
      runtimeRegistration({
        projectId: context.project.id,
        workspaceId: context.workspace.id,
        repoPath: directory,
        dataRoot: path.join(directory, "runtime-root")
      })
    );
    await store.saveProjectRuntimeState({
      projectId: context.project.id,
      workspaceId: context.workspace.id,
      activeRunId: run.id,
      activeTaskId: "task-stale",
      taskQueue: {
        project_status: "in_progress",
        current_task_id: "task-stale",
        tasks: []
      },
      productState: { status: "in_progress", items: [] },
      lastVerifiedRunId: undefined,
      metadata: {},
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });

    const result = await executeDoctorRepairCommandFromArgs(["--repair"], {
      cwd: directory,
      env: {
        ...process.env,
        DEVGOD_WORKSPACE_SLUG: "team",
        DEVGOD_PROJECT_SLUG: "devgod"
      },
      findLatestRun(workspaceSlug, projectSlug) {
        return store.findLatestRun({ workspaceSlug, projectSlug });
      },
      async findProjectContext(workspaceSlug, projectSlug) {
        return store.getProjectContext({ workspaceSlug, projectSlug });
      },
      getProjectContext(params) {
        return store.getProjectContext(params);
      },
      getProjectRuntimeState(projectId) {
        return store.getProjectRuntimeState(projectId);
      },
      saveProjectRuntimeState(state) {
        return store.saveProjectRuntimeState(state);
      },
      getStatusSnapshot(runId) {
        return service.getStatus(runId);
      },
      getExecutionPlan(runId, staleAfterHours) {
        return service.getExecutionPlan(runId, { staleAfterHours });
      },
      applyRecovery(runId, actionIds, staleAfterHours) {
        return service.applyRecovery(runId, actionIds, { staleAfterHours });
      },
      getProjectRuntimeRegistration(projectId) {
        return store.getProjectRuntimeRegistration(projectId);
      },
      inspectReviewIdentity: async () => ({
        authorityLabel: "derived_only",
        adapterConfigured: true,
        adapterExists: true,
        availableBackends: [],
        bindingsPresent: true,
        bindingsPath: path.join(directory, ".devgod/review-identity-bindings.json"),
        bindingsUseShippedTemplate: false,
        liveTrustReady: true,
        notes: []
      }),
      inspectQdrant: async () => ({
        ok: true,
        summary: "qdrant reachable"
      })
    });

    const runtimeState = await store.getProjectRuntimeState(context.project.id);
    assert.equal(result.ok, true);
    assert.equal(result.executionReady, false);
    assert.equal(result.repair.status, "skipped");
    assert.match(
      result.repair.skippedReasons.join(" | "),
      /runtime reconcile requires operator review: cleared a stale active task from a completed runtime run/
    );
    assert.equal(runtimeState?.activeTaskId, "task-stale");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("executeDoctorRepairCommandFromArgs resyncs contradictory local exports from runtime state", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "devgod-doctor-repair-export-sync-"));
  const store = new MemoryStore();
  const service = new DevgodCoreService(store);

  try {
    const run = await service.intakeRequest({
      workspaceSlug: "team",
      projectSlug: "devgod",
      actor: "ceo",
      title: "Repair export drift",
      request: "Resync local workflow exports when runtime authority is healthy."
    });
    await service.createTaskGraph(run.id, [taskPacket({ taskId: "task-owner", allowedWriteScope: ["src/runtime"] })]);
    await service.claimTask(run.id, "task-owner", "planner");

    const context = await store.getProjectContext({ workspaceSlug: "team", projectSlug: "devgod" });
    assert.ok(context);
    await mkdir(path.join(directory, ".devgod", "work"), { recursive: true });
    await mkdir(path.join(directory, "runtime-root"), { recursive: true });
    await writeFile(path.join(directory, ".devgod", "ACTIVE"), "workflow=devgod\nstate=complete\n", "utf8");
    await writeFile(
      path.join(directory, ".devgod", "work", "task-queue.json"),
      `${JSON.stringify({ project_status: "complete", current_task_id: null, tasks: [] }, null, 2)}\n`,
      "utf8"
    );
    await store.saveProjectRuntimeRegistration(
      runtimeRegistration({
        projectId: context.project.id,
        workspaceId: context.workspace.id,
        repoPath: directory,
        dataRoot: path.join(directory, "runtime-root")
      })
    );
    const existingRuntimeState = await store.getProjectRuntimeState(context.project.id);
    assert.ok(existingRuntimeState);
    await store.saveProjectRuntimeState({
      ...existingRuntimeState,
      activeRunId: run.id,
      activeTaskId: "task-owner",
      lastVerifiedRunId: undefined,
      updatedAt: new Date().toISOString()
    });

    const result = await executeDoctorRepairCommandFromArgs(["--repair"], {
      cwd: directory,
      env: {
        ...process.env,
        DEVGOD_WORKSPACE_SLUG: "team",
        DEVGOD_PROJECT_SLUG: "devgod"
      },
      findLatestRun(workspaceSlug, projectSlug) {
        return store.findLatestRun({ workspaceSlug, projectSlug });
      },
      async findProjectContext(workspaceSlug, projectSlug) {
        return store.getProjectContext({ workspaceSlug, projectSlug });
      },
      getProjectContext(params) {
        return store.getProjectContext(params);
      },
      getProjectRuntimeState(projectId) {
        return store.getProjectRuntimeState(projectId);
      },
      saveProjectRuntimeState(state) {
        return store.saveProjectRuntimeState(state);
      },
      getStatusSnapshot(runId) {
        return service.getStatus(runId);
      },
      getExecutionPlan(runId, staleAfterHours) {
        return service.getExecutionPlan(runId, { staleAfterHours });
      },
      applyRecovery(runId, actionIds, staleAfterHours) {
        return service.applyRecovery(runId, actionIds, { staleAfterHours });
      },
      getProjectRuntimeRegistration(projectId) {
        return store.getProjectRuntimeRegistration(projectId);
      },
      inspectReviewIdentity: async () => ({
        authorityLabel: "derived_only",
        adapterConfigured: true,
        adapterExists: true,
        availableBackends: [],
        bindingsPresent: true,
        bindingsPath: path.join(directory, ".devgod/review-identity-bindings.json"),
        bindingsUseShippedTemplate: false,
        liveTrustReady: true,
        notes: []
      }),
      inspectQdrant: async () => ({
        ok: true,
        summary: "qdrant reachable"
      })
    });

    const activeExport = await readFile(path.join(directory, ".devgod", "ACTIVE"), "utf8");
    const queueExport = JSON.parse(
      await readFile(path.join(directory, ".devgod", "work", "task-queue.json"), "utf8")
    ) as { project_status?: string; current_task_id?: string | null };
    assert.equal(result.ok, true);
    assert.equal(result.executionReady, true);
    assert.equal(result.repair.status, "repaired");
    assert.ok(result.repair.stepsApplied.includes("sync local workflow exports from runtime state"));
    assert.equal(activeExport, "task_id=task-owner\nworkflow=devgod\nstate=active\n");
    assert.equal(queueExport.project_status, "in_progress");
    assert.equal(queueExport.current_task_id, "task-owner");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("executeStatusCommandFromArgs treats stale persisted seed failure metadata after proof as an integrity contradiction", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "devgod-status-stale-seed-failure-"));
  const store = new MemoryStore();
  const service = new DevgodCoreService(store);

  try {
    const run = await service.intakeRequest({
      workspaceSlug: "team",
      projectSlug: "devgod",
      actor: "ceo",
      title: "Stale seed failure metadata",
      request: "Surface persisted seed failure residue that survived authoritative proof."
    });
    await service.createTaskGraph(run.id, [taskPacket({ taskId: "task-proof", allowedWriteScope: ["src/runtime"] })]);
    await service.claimTask(run.id, "task-proof", "planner");

    const context = await store.getProjectContext({ workspaceSlug: "team", projectSlug: "devgod" });
    assert.ok(context);
    await store.saveProjectRuntimeState({
      projectId: context.project.id,
      workspaceId: context.workspace.id,
      activeRunId: run.id,
      activeTaskId: undefined,
      taskQueue: {
        project_status: "done",
        current_task_id: null,
        tasks: []
      },
      productState: { status: "done", items: [] },
      lastVerifiedRunId: run.id,
      metadata: {
        seedFailure: {
          runId: run.id,
          taskId: "task-proof",
          reason: "seed failure residue should have been cleared",
          failedAt: "2026-05-31T10:00:00.000Z"
        }
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
    await mkdir(path.join(directory, ".devgod", "work"), { recursive: true });

    const report = await executeStatusCommandFromArgs(["--run-id", run.id], {
      cwd: directory,
      env: process.env,
      getStatusSnapshot(runId) {
        return service.getStatus(runId);
      },
      getProjectRuntimeState(projectId) {
        return store.getProjectRuntimeState(projectId);
      }
    });

    assert.equal(report.integrity.status, "contradicted");
    assert.equal(report.integrity.runtimeState?.seedFailure?.recoveryState, "stale_metadata");
    assert.match(report.integrity.contradictions.join(" | "), /still carries persisted seed failure metadata/i);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
