import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { SEARCH_MEMORY_STALE_AFTER_DAYS } from "../src/core/policy.ts";
import {
  createReviewActionContextResolver,
  type AuthenticatedPrincipal,
  type ReviewIdentityBindings
} from "../src/core/review-context.ts";
import { DevgodCoreService } from "../src/core/service.ts";
import {
  buildAutonomousExecutionSnapshot,
  isCheckpointStale,
  selectAutonomousNextTarget
} from "../src/runtime/autonomous-execution.ts";
import type {
  AutonomousExecutionState,
  MemoryEntryRecord,
  ReasoningQualityBlock,
  ReviewActionContext,
  ReviewRecord,
  TaskPacketInput
} from "../src/domain/types.ts";
import { MemoryStore } from "../src/store/memory-store.ts";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function isoHoursAgo(hours: number): string {
  return new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
}

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
        label: "default task reasoning",
        hypothesis: "the scoped task packet is sufficient to proceed",
        alternatives: ["expand evidence before changing scope"],
        evidenceRefs: ["tests/service.test.ts"],
        verificationRefs: ["verification-1"],
        traceRef: "test://service-task-packet",
        outcome: "supported",
        summary: "default test fixture carries strict reasoning evidence"
      }
    ],
    reasoningVerifications: overrides.reasoningVerifications ?? [
      {
        id: "verification-1",
        kind: "critic_review",
        ref: "test://service-task-packet",
        status: "passed",
        summary: "default service fixture includes critic verification"
      }
    ],
    reasoningVerdict: overrides.reasoningVerdict ?? {
      status: "supported",
      summary: "default service fixture is strict-complete",
      supportingAttemptIds: ["attempt-1"],
      blockingIssues: []
    },
    reasoningQuality: overrides.reasoningQuality ?? reasoningQualityBlock({
      confidence: "medium",
      decision: "supported"
    })
  };
}

function reasoningQualityBlock(
  overrides: Partial<ReasoningQualityBlock> = {}
): ReasoningQualityBlock {
  return {
    claim: overrides.claim ?? "The chosen approach is the strongest current option.",
    facts: overrides.facts ?? ["code path reproduced locally"],
    assumptions: overrides.assumptions ?? ["upstream contract is stable"],
    hypotheses: overrides.hypotheses ?? ["fix the narrowest failing boundary first"],
    evidenceRefs: overrides.evidenceRefs ?? ["src/core/service.ts", "tests/service.test.ts"],
    counterEvidence: overrides.counterEvidence ?? [],
    openQuestions: overrides.openQuestions ?? [],
    verificationPlan: overrides.verificationPlan ?? ["npm test"],
    fallbacks: overrides.fallbacks ?? ["escalate to reviewer if evidence stays weak"],
    budgets: overrides.budgets ?? { researchSteps: 2, debugSteps: 2, reviewPasses: 1, toolRetries: 1 },
    confidence: overrides.confidence ?? "medium",
    decision: overrides.decision ?? "continue"
  };
}

function mutateOnlyMemoryEntry(
  store: MemoryStore,
  mutate: (entry: MemoryEntryRecord) => MemoryEntryRecord
): MemoryEntryRecord {
  const memoryEntries = (store as unknown as { memoryEntries: Map<string, MemoryEntryRecord> }).memoryEntries;
  const [entry] = [...memoryEntries.values()];

  if (!entry) {
    assert.fail("expected one memory entry");
  }

  const nextEntry = mutate(entry);
  memoryEntries.set(nextEntry.id, nextEntry);
  return nextEntry;
}

function mutateMemoryEntryWhere(
  store: MemoryStore,
  predicate: (entry: MemoryEntryRecord) => boolean,
  mutate: (entry: MemoryEntryRecord) => MemoryEntryRecord
): MemoryEntryRecord {
  const memoryEntries = (store as unknown as { memoryEntries: Map<string, MemoryEntryRecord> }).memoryEntries;
  const entry = [...memoryEntries.values()].find(predicate);

  if (!entry) {
    assert.fail("expected matching memory entry");
  }

  const nextEntry = mutate(entry);
  memoryEntries.set(nextEntry.id, nextEntry);
  return nextEntry;
}

function mutateTaskWhere(
  store: MemoryStore,
  predicate: (task: TaskPacketInput) => boolean,
  mutate: (task: TaskPacketInput) => TaskPacketInput
): void {
  const tasks = (store as unknown as { tasks: Map<string, { packet: TaskPacketInput }> }).tasks;
  const entry = [...tasks.entries()].find(([, task]) => predicate(task.packet));

  if (!entry) {
    assert.fail("expected matching task");
  }

  const [taskId, task] = entry;
  tasks.set(taskId, {
    ...task,
    packet: mutate(task.packet)
  });
}

function mutateReviewWhere(
  store: MemoryStore,
  predicate: (review: ReviewRecord) => boolean,
  mutate: (review: ReviewRecord) => ReviewRecord
): void {
  const reviews = (store as unknown as { reviews: Map<string, ReviewRecord> }).reviews;
  const entry = [...reviews.entries()].find(([, review]) => predicate(review));

  if (!entry) {
    assert.fail("expected matching review");
  }

  const [reviewId, review] = entry;
  reviews.set(reviewId, mutate(review));
}

function reviewContext(
  actorRole: ReviewActionContext["actorRole"],
  overrides: Partial<ReviewActionContext> = {}
): ReviewActionContext {
  return {
    actor: overrides.actor ?? `${actorRole}-actor`,
    actorRole,
    waiverAuthority: overrides.waiverAuthority ?? "none"
  };
}

function deriveActorRole(actor: string): ReviewActionContext["actorRole"] {
  const normalized = actor.replace(/-actor$/, "").replace(/-\d+$/, "").replace(/-/g, "_");
  switch (normalized) {
    case "planner":
    case "product_strategist":
    case "solution_architect":
    case "docs_researcher":
    case "backend_engineer":
    case "frontend_designer":
    case "infra_engineer":
    case "reviewer":
    case "build_resolver":
    case "security_reviewer":
    case "qa_engineer":
    case "tdd_guide":
      return normalized === "tdd_guide" ? "tdd-guide" : normalized;
    case "e2e_runner":
      return "e2e-runner";
    case "release_readiness":
      return "release-readiness";
    case "memory_curator":
      return "memory_curator";
    default:
      return "planner";
  }
}

function createService(store: MemoryStore = new MemoryStore()) {
  const registeredContexts = new Map<string, ReviewActionContext>();
  const registeredPrincipals = new Map<string, AuthenticatedPrincipal>();
  const bindings: ReviewIdentityBindings = { bindings: [] };

  function upsertBinding(actor: string, context: ReviewActionContext, principal: AuthenticatedPrincipal) {
    let principalBinding = bindings.bindings.find(
      (binding) =>
        binding.principal.provider === principal.provider && binding.principal.subject === principal.subject
    );

    if (!principalBinding) {
      principalBinding = {
        principal: {
          provider: principal.provider,
          subject: principal.subject
        },
        actors: []
      };
      bindings.bindings.push(principalBinding);
    }

    const actorBinding = principalBinding.actors.find((binding) => binding.actor === actor);
    const nextActorBinding = {
      actor,
      roles: [context.actorRole],
      waiverAuthorities:
        context.waiverAuthority && context.waiverAuthority !== "none"
          ? [context.waiverAuthority]
          : undefined
    };

    if (!actorBinding) {
      principalBinding.actors.push(nextActorBinding);
      return;
    }

    actorBinding.roles = nextActorBinding.roles;
    actorBinding.waiverAuthorities = nextActorBinding.waiverAuthorities;
  }

  const service = new DevgodCoreService(store, {
    resolveReviewActionContext: createReviewActionContextResolver({
      bindings,
      resolveAuthenticatedPrincipal(input) {
        const context = registeredContexts.get(input.actor) ?? {
          actor: input.actor,
          actorRole: deriveActorRole(input.actor),
          waiverAuthority: "none" as const
        };
        const principal = registeredPrincipals.get(input.actor) ?? {
          provider: "test",
          subject: input.actor,
          verified: true
        };
        upsertBinding(input.actor, context, principal);
        return principal;
      }
    })
  });

  return {
    service,
    store,
    registerReviewContext(
      context: ReviewActionContext,
      principal: AuthenticatedPrincipal = {
        provider: "test",
        subject: context.actor,
        verified: true
      }
    ): string {
      registeredContexts.set(context.actor, context);
      registeredPrincipals.set(context.actor, principal);
      upsertBinding(context.actor, context, principal);
      return context.actor;
    }
  };
}

async function seedHealthyRuntimeRegistration(
  store: MemoryStore,
  repoPath: string = process.cwd()
): Promise<void> {
  const projectContext = await store.ensureProjectContext({
    workspaceSlug: "team",
    projectSlug: "devgod",
    repoPath
  });
  await store.saveProjectRuntimeRegistration({
    projectId: projectContext.project.id,
    workspaceId: projectContext.workspace.id,
    repoPath,
    runtimeProfile: "managed",
    dataRoot: `${repoPath}/.devgod/runtime/data`,
    qdrantUrl: "http://127.0.0.1:6333",
    qdrantCollection: "devgod-memory",
    installManifestPath: `${repoPath}/.devgod/install-manifest.json`,
    manifest: {},
    provenance: { authority: "runtime_authoritative" },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  });
}

test("claimTask blocks overlapping write scopes", async () => {
  const { service } = createService();
  const run = await service.intakeRequest({
    workspaceSlug: "team",
    projectSlug: "devgod",
    actor: "ceo",
    title: "Build core",
    request: "Ship the shared orchestration backend."
  });

  await service.createTaskGraph(run.id, [
    taskPacket({ taskId: "task-1", allowedWriteScope: ["src/core"] }),
    taskPacket({ taskId: "task-2", allowedWriteScope: ["src/core/service"] })
  ]);

  await service.claimTask(run.id, "task-1", "planner");

  await assert.rejects(
    service.claimTask(run.id, "task-2", "backend_engineer"),
    /write scope locked/
  );
});

test("recordReview keeps task blocked on high severity finding", async () => {
  const { service } = createService();
  const run = await service.intakeRequest({
    workspaceSlug: "team",
    projectSlug: "devgod",
    actor: "ceo",
    title: "Build core",
    request: "Ship the shared orchestration backend."
  });

  await service.createTaskGraph(run.id, [
    taskPacket({
      reasoningQuality: reasoningQualityBlock({
        confidence: "low",
        openQuestions: ["final runtime behavior still needs confirmation"],
        decision: "continue"
      })
    })
  ]);
  await service.claimTask(run.id, "task-1", "planner");
  await service.submitHandoff(run.id, "task-1", {
    actor: "planner",
    ownerRole: "planner",
    completionStandard: "specialist_verified",
    summary: "ready for review",
    changedFiles: ["src/core/service.ts"],
    blockers: [],
    verificationNotes: ["tests written"],
    executionEvidence: ["planner handoff recorded"],
    qualityGateEvidence: ["product acceptance captured in intake artifacts"],
    contextRefs: ["brief-1"]
  });

  const result = await service.recordReview(
    run.id,
    "task-1",
    reviewContext("security_reviewer").actor,
    {
      reviewerRole: "security_reviewer",
      state: "blocked",
      severity: "high",
      findings: ["write scope too broad"]
    }
  );

  assert.equal(result.task.status, "review_blocked");
  assert.ok(result.blockers.includes("required review not passed: security_reviewer is blocked"));
});

test("recordReview rejects contradictory passed security reviews", async () => {
  const { service } = createService();
  const run = await service.intakeRequest({
    workspaceSlug: "team",
    projectSlug: "devgod",
    actor: "ceo",
    title: "Build core",
    request: "Ship the shared orchestration backend."
  });

  await service.createTaskGraph(run.id, [taskPacket()]);
  await service.claimTask(run.id, "task-1", "planner");
  await service.submitHandoff(run.id, "task-1", {
    actor: "planner",
    ownerRole: "planner",
    completionStandard: "specialist_verified",
    summary: "ready for review",
    changedFiles: ["src/core/service.ts"],
    blockers: [],
    verificationNotes: ["tests written"],
    executionEvidence: ["planner handoff recorded"],
    qualityGateEvidence: ["product acceptance captured in intake artifacts"],
    contextRefs: ["brief-1"]
  });

  await assert.rejects(
    service.recordReview(run.id, "task-1", reviewContext("security_reviewer").actor, {
      reviewerRole: "security_reviewer",
      state: "passed",
      severity: "critical",
      findings: ["still exploitable"]
    }),
    /passed reviews must not carry findings; security_reviewer passed reviews must use low or medium severity, not critical/
  );
});

test("recordReview rejects approval attempts before a handoff exists", async () => {
  const { service } = createService();
  const run = await service.intakeRequest({
    workspaceSlug: "team",
    projectSlug: "devgod",
    actor: "ceo",
    title: "Build core",
    request: "Ship the shared orchestration backend."
  });

  await service.createTaskGraph(run.id, [taskPacket()]);

  await assert.rejects(
    service.recordReview(
      run.id,
      "task-1",
      reviewContext("reviewer").actor,
      {
        reviewerRole: "reviewer",
        state: "passed",
        severity: "low",
        findings: []
      }
    ),
    /must be review_blocked/
  );
});

test("submitHandoff rejects empty verification evidence", async () => {
  const { service } = createService();
  const run = await service.intakeRequest({
    workspaceSlug: "team",
    projectSlug: "devgod",
    actor: "ceo",
    title: "Build core",
    request: "Ship the shared orchestration backend."
  });

  await service.createTaskGraph(run.id, [taskPacket()]);
  await service.claimTask(run.id, "task-1", "planner");

  await assert.rejects(
    service.submitHandoff(run.id, "task-1", {
      actor: "planner",
      ownerRole: "planner",
      completionStandard: "specialist_verified",
      summary: "ready for review",
      changedFiles: [],
      blockers: [],
      verificationNotes: [],
      executionEvidence: [],
      qualityGateEvidence: [],
      contextRefs: []
    }),
    /Invalid handoff/
  );
});

test("submitHandoff rejects owner roles that do not match the task packet", async () => {
  const { service } = createService();
  const run = await service.intakeRequest({
    workspaceSlug: "team",
    projectSlug: "devgod",
    actor: "ceo",
    title: "Build core",
    request: "Ship the shared orchestration backend."
  });

  await service.createTaskGraph(run.id, [taskPacket({ ownerRole: "backend_engineer" })]);
  await service.claimTask(run.id, "task-1", "backend_engineer");

  await assert.rejects(
    service.submitHandoff(run.id, "task-1", {
      actor: "backend_engineer",
      ownerRole: "frontend_designer",
      completionStandard: "specialist_verified",
      summary: "ready for review",
      changedFiles: ["src/core/service.ts"],
      blockers: [],
      verificationNotes: ["npm test"],
      executionEvidence: ["frontend claim on backend task"],
      qualityGateEvidence: ["product acceptance checked"],
      contextRefs: ["brief-1"]
    }),
    /ownerRole must match task ownerRole backend_engineer/
  );
});

test("submitHandoff rejects completion standards that do not match the task packet", async () => {
  const { service } = createService();
  const run = await service.intakeRequest({
    workspaceSlug: "team",
    projectSlug: "devgod",
    actor: "ceo",
    title: "Build core",
    request: "Ship the shared orchestration backend."
  });

  await service.createTaskGraph(run.id, [taskPacket()]);
  await service.claimTask(run.id, "task-1", "planner");

  await assert.rejects(
    service.submitHandoff(run.id, "task-1", {
      actor: "planner",
      ownerRole: "planner",
      completionStandard: "artifact_complete",
      summary: "ready for review",
      changedFiles: ["src/core/service.ts"],
      blockers: [],
      verificationNotes: ["npm test"],
      executionEvidence: ["planner handoff recorded"],
      qualityGateEvidence: ["product acceptance checked"],
      contextRefs: ["brief-1"]
    }),
    /completionStandard must match task completionStandard specialist_verified/
  );
});

test("recordReview keeps task blocked when the latest required review is pending", async () => {
  const { service } = createService();
  const run = await service.intakeRequest({
    workspaceSlug: "team",
    projectSlug: "devgod",
    actor: "ceo",
    title: "Build core",
    request: "Ship the shared orchestration backend."
  });

  await service.createTaskGraph(run.id, [taskPacket()]);
  await service.claimTask(run.id, "task-1", "planner");
  await service.submitHandoff(run.id, "task-1", {
    actor: "planner",
    ownerRole: "planner",
    completionStandard: "specialist_verified",
    summary: "ready for review",
    changedFiles: ["src/core/policy.ts"],
    blockers: [],
    verificationNotes: ["npm test"],
    executionEvidence: ["planner handoff recorded"],
    qualityGateEvidence: ["product acceptance captured in intake artifacts"],
    contextRefs: ["brief-1"]
  });

  await service.recordReview(run.id, "task-1", reviewContext("reviewer").actor, {
    reviewerRole: "reviewer",
    state: "passed",
    severity: "low",
    findings: []
  });
  await service.recordReview(run.id, "task-1", reviewContext("security_reviewer").actor, {
    reviewerRole: "security_reviewer",
    state: "passed",
    severity: "low",
    findings: []
  });

  const result = await service.recordReview(run.id, "task-1", reviewContext("qa_engineer").actor, {
    reviewerRole: "qa_engineer",
    state: "pending",
    severity: "low",
    findings: []
  });

  assert.equal(result.task.status, "review_blocked");
  assert.ok(result.blockers.includes("required review not passed: qa_engineer is pending"));
});

test("recordReview approves only after reviewer, security, and QA all pass", async () => {
  const { service } = createService();
  const run = await service.intakeRequest({
    workspaceSlug: "team",
    projectSlug: "devgod",
    actor: "ceo",
    title: "Build core",
    request: "Ship the shared orchestration backend."
  });

  await service.createTaskGraph(run.id, [taskPacket()]);
  await service.claimTask(run.id, "task-1", "planner");
  await service.submitHandoff(run.id, "task-1", {
    actor: "planner",
    ownerRole: "planner",
    completionStandard: "specialist_verified",
    summary: "ready for review",
    changedFiles: ["src/core/policy.ts"],
    blockers: [],
    verificationNotes: ["npm test"],
    executionEvidence: ["planner handoff recorded"],
    qualityGateEvidence: ["product acceptance captured in intake artifacts"],
    contextRefs: ["brief-1"]
  });

  await service.recordReview(run.id, "task-1", reviewContext("reviewer").actor, {
    reviewerRole: "reviewer",
    state: "passed",
    severity: "low",
    findings: []
  });
  await service.recordReview(run.id, "task-1", reviewContext("security_reviewer").actor, {
    reviewerRole: "security_reviewer",
    state: "passed",
    severity: "low",
    findings: []
  });

  const result = await service.recordReview(run.id, "task-1", reviewContext("qa_engineer").actor, {
    reviewerRole: "qa_engineer",
    state: "passed",
    severity: "low",
    findings: []
  });

  assert.equal(result.task.status, "approved");
  assert.deepEqual(result.blockers, []);
});

test("recordReview rejects spoofed actor roles", async () => {
  const { service } = createService();
  const run = await service.intakeRequest({
    workspaceSlug: "team",
    projectSlug: "devgod",
    actor: "ceo",
    title: "Build core",
    request: "Ship the shared orchestration backend."
  });

  await service.createTaskGraph(run.id, [taskPacket()]);
  await service.claimTask(run.id, "task-1", "planner");
  await service.submitHandoff(run.id, "task-1", {
    actor: "planner",
    ownerRole: "planner",
    completionStandard: "specialist_verified",
    summary: "ready for review",
    changedFiles: ["src/core/service.ts"],
    blockers: [],
    verificationNotes: ["npm test"],
    executionEvidence: ["planner handoff recorded"],
    qualityGateEvidence: ["product acceptance captured in intake artifacts"],
    contextRefs: ["brief-1"]
  });

  await assert.rejects(
    service.recordReview(run.id, "task-1", reviewContext("planner").actor, {
      reviewerRole: "qa_engineer",
      state: "passed",
      severity: "low",
      findings: []
    }),
    /Invalid review action/
  );
});

test("createTaskGraph rejects malformed reasoning-quality blocks", async () => {
  const { service } = createService();
  const run = await service.intakeRequest({
    workspaceSlug: "team",
    projectSlug: "devgod",
    actor: "ceo",
    title: "Build core",
    request: "Ship the shared orchestration backend."
  });

  await assert.rejects(
    service.createTaskGraph(run.id, [
      taskPacket({
        reasoningQuality: reasoningQualityBlock({
          claim: "",
          hypotheses: [],
          verificationPlan: []
        })
      })
    ]),
    /Invalid task graph/
  );
});

test("createPlan rejects malformed reasoning-quality blocks for architecture planning", async () => {
  const { service } = createService();
  const run = await service.intakeRequest({
    workspaceSlug: "team",
    projectSlug: "devgod",
    actor: "ceo",
    title: "Plan architecture",
    request: "Design the runtime surface."
  });

  await assert.rejects(
    service.createPlan({
      runId: run.id,
      title: "Architecture slice",
      summary: "Define the runtime surface.",
      milestones: ["runtime surface"],
      decisions: ["keep reviews authenticated"],
      residualRisks: [],
      acceptanceCriteria: ["plan exists"],
      reasoningQuality: reasoningQualityBlock({
        evidenceRefs: [],
        hypotheses: []
      })
    }),
    /Invalid plan/
  );
});

test("recommendRouting keeps owner dispatch advisory with a reasoning-quality checkpoint", async () => {
  const { service } = createService();
  const run = await service.intakeRequest({
    workspaceSlug: "team",
    projectSlug: "devgod",
    actor: "ceo",
    title: "Build core",
    request: "Ship the shared orchestration backend."
  });

  await service.createTaskGraph(run.id, [taskPacket()]);

  const report = await service.recommendRouting(run.id);
  const recommendation = report.recommendations.find(
    (entry) => entry.taskId === "task-1" && entry.recommendation === "owner_dispatch"
  );

  assert.ok(recommendation);
  assert.ok(
    recommendation.approvalCheckpoints.some((line) =>
      line.includes("reasoning-quality block includes evidence, alternatives, and a verification plan")
    )
  );
});

test("recommendRouting warns on low-confidence schema investigation after failed tool query", async () => {
  const { service } = createService();
  const run = await service.intakeRequest({
    workspaceSlug: "team",
    projectSlug: "devgod",
    actor: "ceo",
    title: "Investigate schema drift",
    request: "Check whether the migration path is safe."
  });

  await service.createTaskGraph(run.id, [
    taskPacket({
      taskId: "schema-check",
      title: "Investigate schema drift",
      reasoningQuality: reasoningQualityBlock({
        claim: "The current migration path is probably safe.",
        facts: ["migration files were inspected locally"],
        assumptions: ["the live schema matches the checked migration state"],
        hypotheses: ["missing index is causing the issue", "tool output is incomplete"],
        evidenceRefs: ["src/sql/migrations/001_initial_schema.sql"],
        openQuestions: ["live schema tool query failed before verification completed"],
        verificationPlan: ["re-run schema inspection with a working connection"],
        confidence: "low",
        decision: "continue"
      })
    })
  ]);

  const report = await service.recommendRouting(run.id);
  const recommendation = report.recommendations.find((entry) => entry.taskId === "schema-check");

  assert.ok(recommendation);
  assert.ok(
    recommendation.rationale.some((line) =>
      line.includes("reasoning-quality: task schema-check still has unresolved open questions")
    )
  );
  assert.ok(
    recommendation.rationale.some((line) =>
      line.includes("reasoning-quality: task schema-check is operating at low confidence")
    )
  );
});

test("recommendRouting does not owner-dispatch tasks with blocked reasoning decisions", async () => {
  const { service } = createService();
  const run = await service.intakeRequest({
    workspaceSlug: "team",
    projectSlug: "devgod",
    actor: "ceo",
    title: "Investigate risky change",
    request: "Do not proceed until the reasoning blocker is cleared."
  });

  await service.createTaskGraph(run.id, [
    taskPacket({
      taskId: "blocked-task",
      reasoningQuality: reasoningQualityBlock({
        evidenceRefs: ["src/core/service.ts"],
        decision: "blocked"
      })
    })
  ]);

  const report = await service.recommendRouting(run.id);
  const recommendation = report.recommendations.find((entry) => entry.taskId === "blocked-task");

  assert.ok(recommendation);
  assert.equal(recommendation.recommendation, "wait");
  assert.ok(
    recommendation.blockers.some((line) => line.includes("explicitly blocked by its reasoning decision"))
  );
});

test("recommendRouting treats unspecified reasoning mode as strict by default", async () => {
  const { service } = createService();
  const run = await service.intakeRequest({
    workspaceSlug: "team",
    projectSlug: "devgod",
    actor: "ceo",
    title: "Default strict mode",
    request: "Unspecified reasoning mode should fail closed."
  });

  const packet = taskPacket({ taskId: "implicit-strict-task" });
  delete (packet as Partial<TaskPacketInput>).reasoningPolicy;
  delete (packet as Partial<TaskPacketInput>).reasoningAttempts;
  delete (packet as Partial<TaskPacketInput>).reasoningVerifications;
  delete (packet as Partial<TaskPacketInput>).reasoningVerdict;
  delete (packet as Partial<TaskPacketInput>).reasoningQuality;

  await service.createTaskGraph(run.id, [packet]);

  const report = await service.recommendRouting(run.id);
  const recommendation = report.recommendations.find((entry) => entry.taskId === "implicit-strict-task");

  assert.ok(recommendation);
  assert.equal(recommendation.recommendation, "wait");
  assert.ok(
    recommendation.blockers.some((line) => line.includes("missing a reasoning-quality block"))
  );
  assert.ok(
    recommendation.blockers.some((line) => line.includes("records no reasoning attempts"))
  );
});

test("recommendRouting blocks strict reasoning tasks that lack attempts, verification, and verdict", async () => {
  const { service } = createService();
  const run = await service.intakeRequest({
    workspaceSlug: "team",
    projectSlug: "devgod",
    actor: "ceo",
    title: "Strict reasoning rollout",
    request: "Require strong reasoning evidence before execution."
  });

  await service.createTaskGraph(run.id, [
    taskPacket({
      taskId: "strict-task",
      qualityGates: ["product_acceptance", "reasoning_strict_required"],
      reasoningPolicy: {
        mode: "strict",
        requireAttempts: true,
        requireVerification: true,
        requireCriticVerification: true,
        requireTraceRefs: true
      },
      reasoningQuality: reasoningQualityBlock({
        evidenceRefs: ["src/core/service.ts"],
        verificationPlan: ["npm test"],
        decision: "supported"
      }),
      reasoningAttempts: [
        {
          id: "attempt-1",
          label: "partial strict record",
          hypothesis: "the change is safe",
          alternatives: ["coverage is incomplete"],
          evidenceRefs: ["src/core/service.ts"],
          verificationRefs: ["verification-1"],
          outcome: "supported",
          summary: "attempt exists but trace evidence is missing"
        }
      ],
      reasoningVerifications: [
        {
          id: "verification-1",
          kind: "test",
          ref: "npm test",
          status: "passed",
          summary: "tests passed but critic review is still missing"
        }
      ],
      reasoningVerdict: {
        status: "insufficient_evidence",
        summary: "needs stronger review evidence",
        supportingAttemptIds: ["attempt-1"],
        blockingIssues: ["trace and critic review are missing"]
      }
    })
  ]);

  const report = await service.recommendRouting(run.id);
  const recommendation = report.recommendations.find((entry) => entry.taskId === "strict-task");

  assert.ok(recommendation);
  assert.equal(recommendation.recommendation, "wait");
  assert.ok(
    recommendation.blockers.some((line) => line.includes("without trace references"))
  );
  assert.ok(
    recommendation.blockers.some((line) => line.includes("no passed critic or reviewer verification"))
  );
  assert.ok(
    recommendation.blockers.some((line) => line.includes("verdict remains insufficient_evidence"))
  );
});

test("getExecutionPlan blocks terminal strict tasks when reasoning verdict still needs review", async () => {
  const { service, registerReviewContext } = createService();
  const run = await service.intakeRequest({
    workspaceSlug: "team",
    projectSlug: "devgod",
    actor: "ceo",
    title: "Strict completion gate",
    request: "Keep completion blocked until strict reasoning verdict is supported."
  });

  await service.createTaskGraph(run.id, [
    taskPacket({
      taskId: "strict-finish",
      qualityGates: ["product_acceptance", "reasoning_strict_required"],
      reasoningPolicy: {
        mode: "strict",
        requireAttempts: true,
        requireVerification: true,
        requireCriticVerification: true,
        requireTraceRefs: true
      },
      reasoningQuality: reasoningQualityBlock({
        evidenceRefs: ["src/core/service.ts"],
        verificationPlan: ["npm test"],
        decision: "supported"
      }),
      reasoningAttempts: [
        {
          id: "attempt-1",
          label: "initial pass",
          hypothesis: "the fix is correct",
          alternatives: ["the tests are incomplete"],
          evidenceRefs: ["src/core/service.ts"],
          verificationRefs: ["verification-1"],
          traceRef: "memory://attempt-1",
          outcome: "supported",
          summary: "initial investigation completed"
        }
      ],
      reasoningVerifications: [
        {
          id: "verification-1",
          kind: "critic_review",
          ref: "review://critic-1",
          status: "passed",
          summary: "critic pass completed"
        }
      ],
      reasoningVerdict: {
        status: "needs_review",
        summary: "awaiting stronger review confirmation",
        supportingAttemptIds: ["attempt-1"],
        blockingIssues: ["verdict not yet supported"]
      }
    })
  ]);

  await service.claimTask(run.id, "strict-finish", "planner");
  await service.submitHandoff(run.id, "strict-finish", {
    actor: "planner",
    ownerRole: "planner",
    completionStandard: "specialist_verified",
    summary: "ready for review",
    changedFiles: ["src/core/service.ts"],
    blockers: [],
    verificationNotes: ["npm test"],
    executionEvidence: ["strict reasoning path implemented"],
    qualityGateEvidence: ["reasoning strict checks replayed"],
    contextRefs: ["brief://strict-finish"]
  });

  for (const role of ["reviewer", "security_reviewer", "qa_engineer"] as const) {
    registerReviewContext({
      actor: `${role}-actor`,
      actorRole: role,
      waiverAuthority: "none"
    });
    await service.recordReview(run.id, "strict-finish", `${role}-actor`, {
      reviewerRole: role,
      state: "passed",
      severity: "low",
      findings: []
    });
  }

  const plan = await service.getExecutionPlan(run.id);

  assert.equal(plan.directive.kind, "blocked");
  assert.ok(
    plan.directive.blockers.some((line) => line.includes("still needs trusted review before conclusion"))
  );
});

test("recordReview allows manager waiver for qa gate with provenance", async () => {
  const { service, registerReviewContext } = createService();
  const run = await service.intakeRequest({
    workspaceSlug: "team",
    projectSlug: "devgod",
    actor: "ceo",
    title: "Build core",
    request: "Ship the shared orchestration backend."
  });

  await service.createTaskGraph(run.id, [taskPacket()]);
  await service.claimTask(run.id, "task-1", "planner");
  await service.submitHandoff(run.id, "task-1", {
    actor: "planner",
    ownerRole: "planner",
    completionStandard: "specialist_verified",
    summary: "ready for review",
    changedFiles: ["src/core/policy.ts"],
    blockers: [],
    verificationNotes: ["npm test"],
    executionEvidence: ["planner handoff recorded"],
    qualityGateEvidence: ["product acceptance captured in intake artifacts"],
    contextRefs: ["brief-1"]
  });

  await service.recordReview(run.id, "task-1", reviewContext("reviewer").actor, {
    reviewerRole: "reviewer",
    state: "passed",
    severity: "low",
    findings: []
  });
  await service.recordReview(run.id, "task-1", reviewContext("security_reviewer").actor, {
    reviewerRole: "security_reviewer",
    state: "passed",
    severity: "low",
    findings: []
  });

  const result = await service.recordReview(
    run.id,
    "task-1",
    registerReviewContext(reviewContext("planner", {
      actor: "planner-1",
      waiverAuthority: "manager"
    })),
    {
      reviewerRole: "qa_engineer",
      state: "waived",
      severity: "low",
      findings: ["qa waiver documented"],
      waiverReason: "managed exception"
    }
  );

  assert.equal(result.task.status, "approved");
  assert.deepEqual(result.blockers, []);
  assert.equal(result.review.actor, "planner-1");
  assert.equal(result.review.waiverAuthority, "manager");
});

test("recordReview still requires reviewer gate for legacy task packets", async () => {
  const store = new MemoryStore();
  const { service } = createService(store);
  const run = await service.intakeRequest({
    workspaceSlug: "team",
    projectSlug: "devgod",
    actor: "ceo",
    title: "Build core",
    request: "Ship the shared orchestration backend."
  });

  await service.createTaskGraph(run.id, [taskPacket()]);
  mutateTaskWhere(store, (task) => task.taskId === "task-1", (task) => ({
    ...task,
    requiredReviews: ["security_reviewer", "qa_engineer"]
  }));
  await service.claimTask(run.id, "task-1", "planner");
  await service.submitHandoff(run.id, "task-1", {
    actor: "planner",
    ownerRole: "planner",
    completionStandard: "specialist_verified",
    summary: "ready for review",
    changedFiles: ["src/core/policy.ts"],
    blockers: [],
    verificationNotes: ["npm test"],
    executionEvidence: ["planner handoff recorded"],
    qualityGateEvidence: ["product acceptance captured in intake artifacts"],
    contextRefs: ["brief-1"]
  });

  await service.recordReview(run.id, "task-1", reviewContext("security_reviewer").actor, {
    reviewerRole: "security_reviewer",
    state: "passed",
    severity: "low",
    findings: []
  });

  const result = await service.recordReview(run.id, "task-1", reviewContext("qa_engineer").actor, {
    reviewerRole: "qa_engineer",
    state: "passed",
    severity: "low",
    findings: []
  });

  assert.equal(result.task.status, "review_blocked");
  assert.ok(result.blockers.includes("missing required review: reviewer"));
});

test("recordReview rejects manager waiver for security gate", async () => {
  const { service, registerReviewContext } = createService();
  const run = await service.intakeRequest({
    workspaceSlug: "team",
    projectSlug: "devgod",
    actor: "ceo",
    title: "Build core",
    request: "Ship the shared orchestration backend."
  });

  await service.createTaskGraph(run.id, [taskPacket()]);
  await service.claimTask(run.id, "task-1", "planner");
  await service.submitHandoff(run.id, "task-1", {
    actor: "planner",
    ownerRole: "planner",
    completionStandard: "specialist_verified",
    summary: "ready for review",
    changedFiles: ["src/core/policy.ts"],
    blockers: [],
    verificationNotes: ["npm test"],
    executionEvidence: ["planner handoff recorded"],
    qualityGateEvidence: ["product acceptance captured in intake artifacts"],
    contextRefs: ["brief-1"]
  });

  await assert.rejects(
    service.recordReview(
      run.id,
      "task-1",
      registerReviewContext(reviewContext("planner", {
        actor: "planner-1",
        waiverAuthority: "manager"
      })),
      {
        reviewerRole: "security_reviewer",
        state: "waived",
        severity: "low",
        findings: ["security waiver documented"],
        waiverReason: "managed exception"
      }
    ),
    /not allowed to waive security_reviewer/
  );
});

test("recordReview ignores reviews from other runs with the same task key", async () => {
  const { service } = createService();

  const firstRun = await service.intakeRequest({
    workspaceSlug: "team",
    projectSlug: "devgod",
    actor: "ceo",
    title: "First run",
    request: "Ship the shared orchestration backend."
  });
  const secondRun = await service.intakeRequest({
    workspaceSlug: "team",
    projectSlug: "devgod",
    actor: "ceo",
    title: "Second run",
    request: "Ship the shared orchestration backend."
  });

  await service.createTaskGraph(firstRun.id, [taskPacket()]);
  await service.createTaskGraph(secondRun.id, [taskPacket()]);

  await service.claimTask(firstRun.id, "task-1", "planner");
  await service.submitHandoff(firstRun.id, "task-1", {
    actor: "planner",
    ownerRole: "planner",
    completionStandard: "specialist_verified",
    summary: "ready for review",
    changedFiles: ["src/core/policy.ts"],
    blockers: [],
    verificationNotes: ["npm test"],
    executionEvidence: ["planner handoff recorded"],
    qualityGateEvidence: ["product acceptance captured in intake artifacts"],
    contextRefs: ["brief-1"]
  });
  await service.recordReview(firstRun.id, "task-1", reviewContext("reviewer").actor, {
    reviewerRole: "reviewer",
    state: "passed",
    severity: "low",
    findings: []
  });
  await service.recordReview(firstRun.id, "task-1", reviewContext("security_reviewer").actor, {
    reviewerRole: "security_reviewer",
    state: "passed",
    severity: "low",
    findings: []
  });
  await service.recordReview(firstRun.id, "task-1", reviewContext("qa_engineer").actor, {
    reviewerRole: "qa_engineer",
    state: "passed",
    severity: "low",
    findings: []
  });

  await service.claimTask(secondRun.id, "task-1", "planner");
  await service.submitHandoff(secondRun.id, "task-1", {
    actor: "planner",
    ownerRole: "planner",
    completionStandard: "specialist_verified",
    summary: "ready for review",
    changedFiles: ["src/core/service.ts"],
    blockers: [],
    verificationNotes: ["npm test"],
    executionEvidence: ["planner handoff recorded"],
    qualityGateEvidence: ["product acceptance captured in intake artifacts"],
    contextRefs: ["brief-2"]
  });

  const result = await service.recordReview(secondRun.id, "task-1", reviewContext("reviewer").actor, {
    reviewerRole: "reviewer",
    state: "passed",
    severity: "low",
    findings: []
  });

  assert.equal(result.task.status, "review_blocked");
  assert.ok(result.blockers.includes("missing required review: security_reviewer"));
  assert.ok(result.blockers.includes("missing required review: qa_engineer"));
});

test("claimTask blocks dependencies with stale approved legacy review state", async () => {
  const store = new MemoryStore();
  const { service } = createService(store);
  const run = await service.intakeRequest({
    workspaceSlug: "team",
    projectSlug: "devgod",
    actor: "ceo",
    title: "Build core",
    request: "Ship the shared orchestration backend."
  });

  await service.createTaskGraph(run.id, [
    taskPacket({ taskId: "plan" }),
    taskPacket({
      taskId: "build",
      dependencies: ["plan"],
      allowedWriteScope: ["src/store"]
    })
  ]);
  await service.claimTask(run.id, "plan", "planner");
  await service.submitHandoff(run.id, "plan", {
    actor: "planner",
    ownerRole: "planner",
    completionStandard: "specialist_verified",
    summary: "legacy plan ready for review",
    changedFiles: ["src/core/service.ts"],
    blockers: [],
    verificationNotes: ["npm test"],
    executionEvidence: ["planner handoff recorded"],
    qualityGateEvidence: ["product acceptance captured in intake artifacts"],
    contextRefs: ["brief-legacy-review"]
  });

  mutateTaskWhere(store, (task) => task.taskId === "plan", (task) => ({
    ...task,
    requiredReviews: ["security_reviewer", "qa_engineer"]
  }));
  const tasks = (store as unknown as { tasks: Map<string, { packet: TaskPacketInput; status: string }> }).tasks;
  const planEntry = [...tasks.entries()].find(([, task]) => task.packet.taskId === "plan");
  if (!planEntry) {
    assert.fail("expected matching plan task");
  }

  await service.recordReview(run.id, "plan", reviewContext("security_reviewer").actor, {
    reviewerRole: "security_reviewer",
    state: "passed",
    severity: "low",
    findings: []
  });
  await service.recordReview(run.id, "plan", reviewContext("qa_engineer").actor, {
    reviewerRole: "qa_engineer",
    state: "passed",
    severity: "low",
    findings: []
  });

  tasks.set(planEntry[0], {
    ...tasks.get(planEntry[0])!,
    status: "approved"
  });

  await assert.rejects(
    service.claimTask(run.id, "build", "backend_engineer"),
    /stale approval: missing required review: reviewer/
  );
});

test("claimTask blocks dependencies with legacy-backfilled review provenance", async () => {
  const store = new MemoryStore();
  const { service } = createService(store);
  const run = await service.intakeRequest({
    workspaceSlug: "team",
    projectSlug: "devgod",
    actor: "ceo",
    title: "Build core",
    request: "Ship the shared orchestration backend."
  });

  await service.createTaskGraph(run.id, [
    taskPacket({ taskId: "plan" }),
    taskPacket({
      taskId: "build",
      dependencies: ["plan"],
      allowedWriteScope: ["src/store"]
    })
  ]);
  await service.claimTask(run.id, "plan", "planner");
  await service.submitHandoff(run.id, "plan", {
    actor: "planner",
    ownerRole: "planner",
    completionStandard: "specialist_verified",
    summary: "plan ready for review",
    changedFiles: ["src/core/service.ts"],
    blockers: [],
    verificationNotes: ["npm test"],
    executionEvidence: ["planner handoff recorded"],
    qualityGateEvidence: ["product acceptance captured in intake artifacts"],
    contextRefs: ["brief-auth-assurance"]
  });
  await service.recordReview(run.id, "plan", reviewContext("reviewer").actor, {
    reviewerRole: "reviewer",
    state: "passed",
    severity: "low",
    findings: []
  });
  await service.recordReview(run.id, "plan", reviewContext("security_reviewer").actor, {
    reviewerRole: "security_reviewer",
    state: "passed",
    severity: "low",
    findings: []
  });
  await service.recordReview(run.id, "plan", reviewContext("qa_engineer").actor, {
    reviewerRole: "qa_engineer",
    state: "passed",
    severity: "low",
    findings: []
  });

  mutateReviewWhere(
    store,
    (review) => review.taskId === "plan" && review.reviewerRole === "reviewer",
    (review) => ({
      ...review,
      identityAssurance: "legacy_backfill"
    })
  );

  await assert.rejects(
    service.claimTask(run.id, "build", "backend_engineer"),
    /stale approval: required review provenance unauthenticated: reviewer/
  );
});

test("searchMemory ranks project entries ahead of global ones", async () => {
  const service = new DevgodCoreService(new MemoryStore());
  const run = await service.intakeRequest({
    workspaceSlug: "team",
    projectSlug: "devgod",
    actor: "ceo",
    title: "Build core",
    request: "Ship the shared orchestration backend."
  });

  await service.promoteMemory(run.id, {
    scope: "global",
    entryType: "pattern",
    title: "Global pattern",
    content: "shared orchestration pattern",
    sourceRunId: run.id,
    reviewer: "memory_curator",
    actor: "memory_curator"
  });

  await service.promoteMemory(run.id, {
    scope: "project",
    entryType: "lesson",
    title: "Project pattern",
    content: "shared orchestration pattern",
    sourceRunId: run.id,
    reviewer: "memory_curator",
    actor: "memory_curator"
  });

  const results = await service.searchMemory({
    workspaceSlug: "team",
    projectSlug: "devgod",
    query: "shared orchestration"
  });

  assert.equal(results[0]?.scope, "project");
});

test("searchMemory favors title matches over content-only matches", async () => {
  const service = new DevgodCoreService(new MemoryStore());
  const run = await service.intakeRequest({
    workspaceSlug: "team",
    projectSlug: "devgod",
    actor: "ceo",
    title: "Build core",
    request: "Ship the shared orchestration backend."
  });

  await service.promoteMemory(run.id, {
    scope: "project",
    entryType: "pattern",
    title: "Notes",
    content: "incident playbook for release recoveries",
    sourceRunId: run.id,
    reviewer: "memory_curator",
    actor: "memory_curator"
  });

  await service.promoteMemory(run.id, {
    scope: "project",
    entryType: "pattern",
    title: "Incident playbook",
    content: "release recoveries and rollback notes",
    sourceRunId: run.id,
    reviewer: "memory_curator",
    actor: "memory_curator"
  });

  const results = await service.searchMemory({
    workspaceSlug: "team",
    projectSlug: "devgod",
    query: "incident playbook"
  });

  assert.equal(results[0]?.title, "Incident playbook");
});

test("promoteMemory rejects Playwright visual artifacts in durable memory content", async () => {
  const service = new DevgodCoreService(new MemoryStore());
  const run = await service.intakeRequest({
    workspaceSlug: "team",
    projectSlug: "devgod",
    actor: "ceo",
    title: "Build core",
    request: "Ship the shared orchestration backend."
  });

  await assert.rejects(
    service.promoteMemory(run.id, {
      scope: "project",
      entryType: "lesson",
      title: "UI note",
      content: "artifact://.devgod/work/artifacts/playwright/task-7/home.png",
      sourceRunId: run.id,
      reviewer: "memory_curator",
      actor: "memory_curator"
    }),
    /must not embed screenshots, traces, or Playwright visual artifacts/
  );
});

test("searchMemory returns provenance, authority, freshness, and citation metadata", async () => {
  const store = new MemoryStore();
  const service = new DevgodCoreService(store);
  const run = await service.intakeRequest({
    workspaceSlug: "team",
    projectSlug: "devgod",
    actor: "ceo",
    title: "Build core",
    request: "Ship the shared orchestration backend."
  });

  await service.promoteMemory(run.id, {
    scope: "project",
    entryType: "decision",
    title: "Incident playbook",
    content: "release recoveries and rollback notes",
    sourceRunId: run.id,
    sourceTaskId: "task-1",
    reviewer: "memory_curator",
    actor: "memory_curator"
  });

  mutateOnlyMemoryEntry(store, (entry) => ({
    ...entry,
    sourcePath: ".devgod/memory/decision-log.md",
    sourceAnchor: "incident-playbook"
  }));

  const results = await service.searchMemory({
    workspaceSlug: "team",
    projectSlug: "devgod",
    query: "incident playbook"
  });

  assert.equal(results[0]?.authority.source, "shared_backend_memory");
  assert.equal(results[0]?.authority.precedence, "retrieval_hint");
  assert.equal(results[0]?.authority.reviewedBy, "memory_curator");
  assert.equal(results[0]?.citation.kind, "memory_entry");
  assert.equal(results[0]?.citation.label, "Incident playbook");
  assert.equal(results[0]?.citation.sourcePath, ".devgod/memory/decision-log.md");
  assert.equal(results[0]?.citation.sourceAnchor, "incident-playbook");
  assert.equal(results[0]?.citation.canonicalRef, ".devgod/memory/decision-log.md#incident-playbook");
  assert.equal(results[0]?.citation.runId, run.id);
  assert.equal(results[0]?.citation.taskId, "task-1");
  assert.equal(results[0]?.provenance.entryType, "decision");
  assert.equal(results[0]?.provenance.runId, run.id);
  assert.equal(results[0]?.provenance.taskId, "task-1");
  assert.equal(results[0]?.freshness.staleAfterDays, SEARCH_MEMORY_STALE_AFTER_DAYS);
  assert.equal(results[0]?.freshness.createdAt, results[0]?.provenance.createdAt);
  assert.ok((results[0]?.freshness.ageDays ?? -1) >= 0);
});

test("searchMemory marks old entries as stale", async () => {
  const store = new MemoryStore();
  const service = new DevgodCoreService(store);
  const run = await service.intakeRequest({
    workspaceSlug: "team",
    projectSlug: "devgod",
    actor: "ceo",
    title: "Build core",
    request: "Ship the shared orchestration backend."
  });

  await service.promoteMemory(run.id, {
    scope: "project",
    entryType: "decision",
    title: "Old incident playbook",
    content: "legacy release recoveries and rollback notes",
    sourceRunId: run.id,
    reviewer: "memory_curator",
    actor: "memory_curator"
  });

  mutateOnlyMemoryEntry(store, (entry) => ({
    ...entry,
    createdAt: "2000-01-01T00:00:00.000Z"
  }));

  const results = await service.searchMemory({
    workspaceSlug: "team",
    projectSlug: "devgod",
    query: "incident playbook"
  });

  assert.equal(results[0]?.freshness.status, "stale");
  assert.equal(results[0]?.freshness.staleAfterDays, SEARCH_MEMORY_STALE_AFTER_DAYS);
  assert.ok((results[0]?.freshness.ageDays ?? 0) > SEARCH_MEMORY_STALE_AFTER_DAYS);
});

test("searchMemory falls back to a memory URI canonical ref when only an anchor exists", async () => {
  const store = new MemoryStore();
  const service = new DevgodCoreService(store);
  const run = await service.intakeRequest({
    workspaceSlug: "team",
    projectSlug: "devgod",
    actor: "ceo",
    title: "Build core",
    request: "Ship the shared orchestration backend."
  });

  await service.promoteMemory(run.id, {
    scope: "project",
    entryType: "decision",
    title: "Anchor-only note",
    content: "canonical citation fallback",
    sourceRunId: run.id,
    reviewer: "memory_curator",
    actor: "memory_curator"
  });

  const updatedEntry = mutateOnlyMemoryEntry(store, (entry) => ({
    ...entry,
    sourceAnchor: "anchor-only"
  }));

  const results = await service.searchMemory({
    workspaceSlug: "team",
    projectSlug: "devgod",
    query: "anchor-only note"
  });

  assert.equal(results[0]?.citation.sourcePath, undefined);
  assert.equal(results[0]?.citation.sourceAnchor, "anchor-only");
  assert.equal(results[0]?.citation.canonicalRef, `memory://entry/${updatedEntry.id}#anchor-only`);
});

test("searchMemory demotes invalid timestamps and returns explicit freshness status", async () => {
  const store = new MemoryStore();
  const service = new DevgodCoreService(store);
  const run = await service.intakeRequest({
    workspaceSlug: "team",
    projectSlug: "devgod",
    actor: "ceo",
    title: "Build core",
    request: "Ship the shared orchestration backend."
  });

  await service.promoteMemory(run.id, {
    scope: "project",
    entryType: "decision",
    title: "Shared orchestration note",
    content: "valid marker",
    sourceRunId: run.id,
    reviewer: "memory_curator",
    actor: "memory_curator"
  });

  await service.promoteMemory(run.id, {
    scope: "project",
    entryType: "decision",
    title: "Shared orchestration note",
    content: "shared orchestration invalid marker",
    sourceRunId: run.id,
    reviewer: "memory_curator",
    actor: "memory_curator"
  });

  mutateMemoryEntryWhere(store, (entry) => entry.content === "shared orchestration invalid marker", (entry) => ({
    ...entry,
    createdAt: "not-a-date"
  }));

  const results = await service.searchMemory({
    workspaceSlug: "team",
    projectSlug: "devgod",
    query: "shared orchestration"
  });

  assert.equal(results[0]?.content, "valid marker");
  assert.equal(results[0]?.freshness.status, "fresh");
  assert.equal(results[1]?.content, "shared orchestration invalid marker");
  assert.equal(results[1]?.freshness.status, "invalid_timestamp");
  assert.equal(results[1]?.freshness.ageDays, undefined);
});

test("searchMemory demotes future timestamps and returns explicit freshness status", async () => {
  const store = new MemoryStore();
  const service = new DevgodCoreService(store);
  const run = await service.intakeRequest({
    workspaceSlug: "team",
    projectSlug: "devgod",
    actor: "ceo",
    title: "Build core",
    request: "Ship the shared orchestration backend."
  });

  await service.promoteMemory(run.id, {
    scope: "project",
    entryType: "decision",
    title: "Release runbook",
    content: "valid runbook",
    sourceRunId: run.id,
    reviewer: "memory_curator",
    actor: "memory_curator"
  });

  await service.promoteMemory(run.id, {
    scope: "project",
    entryType: "decision",
    title: "Release runbook",
    content: "release runbook future marker",
    sourceRunId: run.id,
    reviewer: "memory_curator",
    actor: "memory_curator"
  });

  mutateMemoryEntryWhere(store, (entry) => entry.content === "release runbook future marker", (entry) => ({
    ...entry,
    createdAt: "9999-01-01T00:00:00.000Z"
  }));

  const results = await service.searchMemory({
    workspaceSlug: "team",
    projectSlug: "devgod",
    query: "release runbook"
  });

  assert.equal(results[0]?.content, "valid runbook");
  assert.equal(results[1]?.content, "release runbook future marker");
  assert.equal(results[1]?.freshness.status, "future_timestamp");
  assert.equal(results[1]?.freshness.ageDays, undefined);
});

test("searchMemory redacts sensitive provenance for global results", async () => {
  const service = new DevgodCoreService(new MemoryStore());
  const run = await service.intakeRequest({
    workspaceSlug: "team",
    projectSlug: "devgod",
    actor: "ceo",
    title: "Build core",
    request: "Ship the shared orchestration backend."
  });

  await service.promoteMemory(run.id, {
    scope: "global",
    entryType: "pattern",
    title: "Shared pattern",
    content: "shared orchestration",
    sourceRunId: run.id,
    sourceTaskId: "task-global",
    reviewer: "memory_curator@example.com",
    actor: "memory_curator@example.com"
  });

  const results = await service.searchMemory({
    workspaceSlug: "team",
    projectSlug: "devgod",
    query: "shared orchestration",
    includeGlobal: true
  });

  assert.equal(results[0]?.scope, "global");
  assert.equal(results[0]?.authority.reviewedBy, undefined);
  assert.equal(results[0]?.citation.sourcePath, undefined);
  assert.equal(results[0]?.citation.sourceAnchor, undefined);
  assert.equal(results[0]?.citation.canonicalRef, `memory://entry/${results[0]?.citation.memoryId}`);
  assert.equal(results[0]?.citation.runId, undefined);
  assert.equal(results[0]?.citation.taskId, undefined);
  assert.equal(results[0]?.provenance.actor, undefined);
  assert.equal(results[0]?.provenance.reviewer, undefined);
  assert.equal(results[0]?.provenance.runId, undefined);
  assert.equal(results[0]?.provenance.taskId, undefined);
});

test("searchMemory enforces requesterRole for promoted memory and exposes retrieval metadata", async () => {
  const service = new DevgodCoreService(new MemoryStore());
  const run = await service.intakeRequest({
    workspaceSlug: "team",
    projectSlug: "devgod",
    actor: "ceo",
    title: "Build core",
    request: "Ship the shared orchestration backend."
  });

  await service.promoteMemory(run.id, {
    scope: "project",
    entryType: "lesson",
    title: "Security-only incident note",
    content: "contains scoped incident review guidance",
    sourceRunId: run.id,
    reviewer: "memory_curator",
    actor: "memory_curator",
    metadata: {
      retrievalRoles: ["security_reviewer"],
      tags: ["incident", "security"],
      staleAfterDays: 30
    }
  });

  const plannerResults = await service.searchMemory({
    workspaceSlug: "team",
    projectSlug: "devgod",
    query: "scoped incident review guidance"
  });
  assert.equal(plannerResults.length, 0);

  const securityResults = await service.searchMemory({
    workspaceSlug: "team",
    projectSlug: "devgod",
    query: "scoped incident review guidance",
    requesterRole: "security_reviewer"
  });

  assert.equal(securityResults[0]?.title, "Security-only incident note");
  assert.deepEqual(securityResults[0]?.authority.allowedRoles, ["security_reviewer"]);
  assert.deepEqual(securityResults[0]?.metadata.allowedRoles, ["security_reviewer"]);
  assert.deepEqual(securityResults[0]?.metadata.tags, ["incident", "security"]);
  assert.equal(securityResults[0]?.metadata.staleAfterDays, 30);
  assert.equal(securityResults[0]?.freshness.staleAfterDays, 30);
  assert.equal(securityResults[0]?.authority.authorityLevel, "reviewed_memory");
  assert.match(securityResults[0]?.metadata.reviewedAt ?? "", /^\d{4}-\d{2}-\d{2}T/);
});

test("searchMemory prefers fuller lexical coverage over partial matches", async () => {
  const service = new DevgodCoreService(new MemoryStore());
  const run = await service.intakeRequest({
    workspaceSlug: "team",
    projectSlug: "devgod",
    actor: "ceo",
    title: "Build core",
    request: "Ship the shared orchestration backend."
  });

  await service.promoteMemory(run.id, {
    scope: "project",
    entryType: "pattern",
    title: "Backend orchestration guide",
    content: "shared orchestration backend planning flow",
    sourceRunId: run.id,
    reviewer: "memory_curator",
    actor: "memory_curator"
  });

  await service.promoteMemory(run.id, {
    scope: "project",
    entryType: "pattern",
    title: "Backend notes",
    content: "backend only",
    sourceRunId: run.id,
    reviewer: "memory_curator",
    actor: "memory_curator"
  });

  const results = await service.searchMemory({
    workspaceSlug: "team",
    projectSlug: "devgod",
    query: "shared orchestration backend"
  });

  assert.equal(results[0]?.title, "Backend orchestration guide");
});

test("searchMemory uses a stable tie-break for equivalent scores", async () => {
  const service = new DevgodCoreService(new MemoryStore());
  const run = await service.intakeRequest({
    workspaceSlug: "team",
    projectSlug: "devgod",
    actor: "ceo",
    title: "Build core",
    request: "Ship the shared orchestration backend."
  });

  await service.promoteMemory(run.id, {
    scope: "global",
    entryType: "pattern",
    title: "Zeta pattern",
    content: "shared orchestration",
    sourceRunId: run.id,
    reviewer: "memory_curator",
    actor: "memory_curator"
  });

  await service.promoteMemory(run.id, {
    scope: "global",
    entryType: "pattern",
    title: "Alpha pattern",
    content: "shared orchestration",
    sourceRunId: run.id,
    reviewer: "memory_curator",
    actor: "memory_curator"
  });

  const results = await service.searchMemory({
    workspaceSlug: "team",
    projectSlug: "devgod",
    query: "shared orchestration",
    includeGlobal: true
  });

  assert.equal(results[0]?.title, "Alpha pattern");
  assert.equal(results[1]?.title, "Zeta pattern");
});

test("searchMemory uses query embeddings to break lexical ties when a matching embedding model is supplied", async () => {
  const store = new MemoryStore();
  const service = new DevgodCoreService(store);
  const run = await service.intakeRequest({
    workspaceSlug: "team",
    projectSlug: "devgod",
    actor: "ceo",
    title: "Build core",
    request: "Ship the shared orchestration backend."
  });

  const firstEntry = await service.promoteMemory(run.id, {
    scope: "project",
    entryType: "pattern",
    title: "Shared retrieval note",
    content: "candidate alpha",
    sourceRunId: run.id,
    reviewer: "memory_curator",
    actor: "memory_curator"
  });

  const secondEntry = await service.promoteMemory(run.id, {
    scope: "project",
    entryType: "pattern",
    title: "Shared retrieval note",
    content: "candidate beta",
    sourceRunId: run.id,
    reviewer: "memory_curator",
    actor: "memory_curator"
  });

  await store.queueEmbeddingJob({
    workspaceId: firstEntry.workspaceId,
    projectId: firstEntry.projectId,
    sourceTable: "memory_entries",
    sourceId: firstEntry.id,
    embeddingModel: "text-embedding-3-small"
  });
  await store.queueEmbeddingJob({
    workspaceId: secondEntry.workspaceId,
    projectId: secondEntry.projectId,
    sourceTable: "memory_entries",
    sourceId: secondEntry.id,
    embeddingModel: "text-embedding-3-small"
  });

  const leasedJobs = await store.leaseEmbeddingJobs({ limit: 2 });
  for (const job of leasedJobs) {
    await store.completeEmbeddingJob({
      jobId: job.id,
      sourceTable: job.sourceTable,
      sourceId: job.sourceId,
      embeddingModel: job.embeddingModel,
      embedding: job.sourceId === firstEntry.id ? [1, 0] : [0, 1]
    });
  }

  const results = await service.searchMemory({
    workspaceSlug: "team",
    projectSlug: "devgod",
    query: "shared retrieval",
    queryEmbedding: [1, 0],
    embeddingModel: "text-embedding-3-small"
  });

  assert.equal(results[0]?.id, firstEntry.id);
  assert.equal(results[1]?.id, secondEntry.id);
});

test("searchMemory marks conflicting results explicitly", async () => {
  const service = new DevgodCoreService(new MemoryStore());
  const run = await service.intakeRequest({
    workspaceSlug: "team",
    projectSlug: "devgod",
    actor: "ceo",
    title: "Build core",
    request: "Ship the shared orchestration backend."
  });

  const adoptEntry = await service.promoteMemory(run.id, {
    scope: "project",
    entryType: "decision",
    title: "Adopt pgvector retrieval",
    content: "pgvector retrieval should be enabled for memory search",
    sourceRunId: run.id,
    reviewer: "memory_curator",
    actor: "memory_curator"
  });

  const delayEntry = await service.promoteMemory(run.id, {
    scope: "project",
    entryType: "decision",
    title: "Delay pgvector retrieval",
    content: "pgvector retrieval should stay disabled until backfill passes",
    sourceRunId: run.id,
    reviewer: "memory_curator",
    actor: "memory_curator"
  });

  const results = await service.searchMemory({
    workspaceSlug: "team",
    projectSlug: "devgod",
    query: "pgvector retrieval"
  });

  const adoptResult = results.find((result) => result.id === adoptEntry.id);
  const delayResult = results.find((result) => result.id === delayEntry.id);

  assert.equal(adoptResult?.conflict.detected, true);
  assert.deepEqual(adoptResult?.conflict.relatedIds, [delayEntry.id]);
  assert.equal(delayResult?.conflict.detected, true);
  assert.deepEqual(delayResult?.conflict.relatedIds, [adoptEntry.id]);
});

test("searchMemory excludes project memory from other projects", async () => {
  const service = new DevgodCoreService(new MemoryStore());
  const run = await service.intakeRequest({
    workspaceSlug: "team",
    projectSlug: "devgod",
    actor: "ceo",
    title: "Build core",
    request: "Ship the shared orchestration backend."
  });

  const otherRun = await service.intakeRequest({
    workspaceSlug: "team",
    projectSlug: "other-project",
    actor: "ceo",
    title: "Build other core",
    request: "Ship another backend."
  });

  await service.promoteMemory(run.id, {
    scope: "project",
    entryType: "pattern",
    title: "Local pattern",
    content: "shared orchestration",
    sourceRunId: run.id,
    reviewer: "memory_curator",
    actor: "memory_curator"
  });

  await service.promoteMemory(otherRun.id, {
    scope: "project",
    entryType: "pattern",
    title: "Foreign pattern",
    content: "shared orchestration",
    sourceRunId: otherRun.id,
    reviewer: "memory_curator",
    actor: "memory_curator"
  });

  const results = await service.searchMemory({
    workspaceSlug: "team",
    projectSlug: "devgod",
    query: "shared orchestration",
    includeGlobal: true
  });

  assert.equal(results.some((result) => result.title === "Foreign pattern"), false);
});

test("searchMemory rejects blank queries", async () => {
  const service = new DevgodCoreService(new MemoryStore());

  await assert.rejects(
    service.searchMemory({
      workspaceSlug: "team",
      projectSlug: "devgod",
      query: "   "
    }),
    /search query is required/
  );
});

test("searchMemory rejects non-finite query embeddings", async () => {
  const service = new DevgodCoreService(new MemoryStore());

  await assert.rejects(
    service.searchMemory({
      workspaceSlug: "team",
      projectSlug: "devgod",
      query: "incident playbook",
      queryEmbedding: [Number.NaN]
    }),
    /query embedding must contain only finite numbers/
  );
});

test("searchMemory rejects oversized query embeddings", async () => {
  const service = new DevgodCoreService(new MemoryStore());

  await assert.rejects(
    service.searchMemory({
      workspaceSlug: "team",
      projectSlug: "devgod",
      query: "incident playbook",
      queryEmbedding: new Array(1537).fill(0)
    }),
    /query embedding must not exceed 1536 dimensions/
  );
});

test("searchMemory returns no globals for an unknown project", async () => {
  const service = new DevgodCoreService(new MemoryStore());
  const run = await service.intakeRequest({
    workspaceSlug: "team",
    projectSlug: "devgod",
    actor: "ceo",
    title: "Build core",
    request: "Ship the shared orchestration backend."
  });

  await service.promoteMemory(run.id, {
    scope: "global",
    entryType: "pattern",
    title: "Global pattern",
    content: "shared orchestration",
    sourceRunId: run.id,
    reviewer: "memory_curator",
    actor: "memory_curator"
  });

  const results = await service.searchMemory({
    workspaceSlug: "team",
    projectSlug: "missing-project",
    query: "shared orchestration",
    includeGlobal: true
  });

  assert.deepEqual(results, []);
});

test("searchMemory blocks unprovenanced project hits", async () => {
  const store = new MemoryStore();
  const service = new DevgodCoreService(store);
  const run = await service.intakeRequest({
    workspaceSlug: "team",
    projectSlug: "devgod",
    actor: "ceo",
    title: "Build core",
    request: "Ship the shared orchestration backend."
  });

  await service.promoteMemory(run.id, {
    scope: "project",
    entryType: "decision",
    title: "Unprovenanced note",
    content: "missing reviewer should block",
    sourceRunId: run.id,
    reviewer: "memory_curator",
    actor: "memory_curator"
  });

  mutateOnlyMemoryEntry(store, (entry) => ({
    ...entry,
    reviewer: ""
  }));

  const results = await service.searchMemory({
    workspaceSlug: "team",
    projectSlug: "devgod",
    query: "unprovenanced note"
  });

  assert.deepEqual(results, []);
});

test("resumeRun returns ready tasks with satisfied dependencies", async () => {
  const { service } = createService();
  const run = await service.intakeRequest({
    workspaceSlug: "team",
    projectSlug: "devgod",
    actor: "ceo",
    title: "Build core",
    request: "Ship the shared orchestration backend."
  });

  await service.createTaskGraph(run.id, [
    taskPacket({ taskId: "plan" }),
    taskPacket({
      taskId: "build",
      dependencies: ["plan"],
      allowedWriteScope: ["src/store"]
    })
  ]);

  let status = await service.resumeRun(run.id);
  assert.deepEqual(status.nextTaskIds, ["plan"]);
  assert.equal(status.executionPlan.directive.kind, "dispatch_owner");
  if (status.executionPlan.directive.kind === "dispatch_owner") {
    assert.equal(status.executionPlan.directive.recommendation.taskId, "plan");
  }

  await service.claimTask(run.id, "plan", "planner");
  await service.submitHandoff(run.id, "plan", {
    actor: "planner",
    ownerRole: "planner",
    completionStandard: "specialist_verified",
    summary: "plan ready",
    changedFiles: [".devgod/work/plans/plan.md"],
    blockers: [],
    verificationNotes: ["plan reviewed"],
    executionEvidence: ["planner handoff recorded"],
    qualityGateEvidence: ["product acceptance captured in intake artifacts"],
    contextRefs: ["brief-1"]
  });
  await service.recordReview(run.id, "plan", reviewContext("security_reviewer").actor, {
    reviewerRole: "security_reviewer",
    state: "passed",
    severity: "low",
    findings: []
  });
  await service.recordReview(run.id, "plan", reviewContext("reviewer").actor, {
    reviewerRole: "reviewer",
    state: "passed",
    severity: "low",
    findings: []
  });
  await service.recordReview(run.id, "plan", reviewContext("qa_engineer").actor, {
    reviewerRole: "qa_engineer",
    state: "passed",
    severity: "low",
    findings: []
  });

  status = await service.resumeRun(run.id);
  assert.ok(status.nextTaskIds.includes("build"));
  assert.equal(status.executionPlan.directive.kind, "dispatch_owner");
  if (status.executionPlan.directive.kind === "dispatch_owner") {
    assert.equal(status.executionPlan.directive.recommendation.taskId, "build");
  }
});

test("recommendRouting returns advisory owner, review, and wait recommendations without auto-dispatch", async () => {
  const { service } = createService();
  const run = await service.intakeRequest({
    workspaceSlug: "team",
    projectSlug: "devgod",
    actor: "ceo",
    title: "Build core",
    request: "Ship the shared orchestration backend."
  });

  await service.createTaskGraph(run.id, [
    taskPacket({ taskId: "plan" }),
    taskPacket({
      taskId: "build",
      dependencies: ["plan"],
      allowedWriteScope: ["src/store"],
      ownerRole: "backend_engineer",
      requiredSpecialistRoles: ["backend_engineer"]
    })
  ]);

  await service.claimTask(run.id, "plan", "planner");
  await service.submitHandoff(run.id, "plan", {
    actor: "planner",
    ownerRole: "planner",
    completionStandard: "specialist_verified",
    summary: "ready for review",
    changedFiles: [".devgod/work/tasks/task-plan.md"],
    blockers: [],
    verificationNotes: ["review pending"],
    executionEvidence: ["planner handoff recorded"],
    qualityGateEvidence: ["product acceptance captured in intake artifacts"],
    contextRefs: ["brief-1"]
  });
  await service.recordReview(run.id, "plan", reviewContext("reviewer").actor, {
    reviewerRole: "reviewer",
    state: "passed",
    severity: "low",
    findings: []
  });

  const report = await service.recommendRouting(run.id);
  const waitRecommendation = report.recommendations.find((entry) => entry.taskId === "build");
  const reviewRecommendation = report.recommendations.find(
    (entry) => entry.taskId === "plan" && entry.targetReviewRole === "security_reviewer"
  );

  assert.equal(report.mode, "advisory_only");
  assert.equal(waitRecommendation?.recommendation, "wait");
  assert.deepEqual(waitRecommendation?.blockers, ["dependency plan is review_blocked"]);
  assert.equal(reviewRecommendation?.recommendation, "review_dispatch");
  assert.deepEqual(reviewRecommendation?.approvalCheckpoints, [
    "review actor must authenticate through the trusted review identity resolver",
    "manager must persist or attach authenticated reviewer evidence before completion",
    "reasoning-quality block includes evidence, alternatives, and a verification plan"
  ]);

  await service.recordReview(run.id, "plan", reviewContext("security_reviewer").actor, {
    reviewerRole: "security_reviewer",
    state: "passed",
    severity: "low",
    findings: []
  });
  await service.recordReview(run.id, "plan", reviewContext("qa_engineer").actor, {
    reviewerRole: "qa_engineer",
    state: "passed",
    severity: "low",
    findings: []
  });

  const readyReport = await service.recommendRouting(run.id);
  const ownerRecommendation = readyReport.recommendations.find((entry) => entry.taskId === "build");

  assert.equal(ownerRecommendation?.recommendation, "owner_dispatch");
  assert.equal(ownerRecommendation?.targetRole, "backend_engineer");
  assert.deepEqual(ownerRecommendation?.allowedWriteScope, ["src/store"]);
});

test("getExecutionPlan returns review dispatch for missing required reviews", async () => {
  const { service } = createService();
  const run = await service.intakeRequest({
    workspaceSlug: "team",
    projectSlug: "devgod",
    actor: "ceo",
    title: "Build core",
    request: "Ship the shared orchestration backend."
  });

  await service.createTaskGraph(run.id, [taskPacket({ taskId: "plan" })]);
  await service.claimTask(run.id, "plan", "planner");
  await service.submitHandoff(run.id, "plan", {
    actor: "planner",
    ownerRole: "planner",
    completionStandard: "specialist_verified",
    summary: "ready for review",
    changedFiles: [".devgod/work/tasks/task-plan.md"],
    blockers: [],
    verificationNotes: ["review pending"],
    executionEvidence: ["planner handoff recorded"],
    qualityGateEvidence: ["product acceptance captured in intake artifacts"],
    contextRefs: ["brief-1"]
  });
  await service.recordReview(run.id, "plan", reviewContext("reviewer").actor, {
    reviewerRole: "reviewer",
    state: "passed",
    severity: "low",
    findings: []
  });

  const plan = await service.getExecutionPlan(run.id);

  assert.equal(plan.mode, "runtime_authoritative");
  assert.equal(plan.directive.kind, "dispatch_reviews");
  if (plan.directive.kind === "dispatch_reviews") {
    assert.deepEqual(
      plan.directive.recommendations.map((recommendation) => recommendation.targetReviewRole),
      ["security_reviewer", "qa_engineer"]
    );
  }
});

test("executeDirectiveStep claims the owner-dispatch task, persists history, and re-evaluates the next directive", async () => {
  const { service, store } = createService();
  await seedHealthyRuntimeRegistration(store);
  const run = await service.intakeRequest({
    workspaceSlug: "team",
    projectSlug: "devgod",
    actor: "ceo",
    title: "Build core",
    request: "Ship the shared orchestration backend."
  });

  await service.createTaskGraph(run.id, [taskPacket({ taskId: "plan" })]);

  const result = await service.executeDirectiveStep(run.id, {
    ownerActor: "planner"
  });

  assert.equal(result.initialPlan.directive.kind, "dispatch_owner");
  assert.equal(result.steps.length, 1);
  assert.equal(result.steps[0]?.directiveKind, "dispatch_owner");
  assert.equal(result.steps[0]?.outcome, "executed");
  assert.equal(result.steps[0]?.taskId, "plan");
  assert.equal(result.steps[0]?.actor, "planner");
  assert.equal(result.finalPlan.directive.kind, "blocked");
  assert.equal(result.snapshot.tasks[0]?.status, "in_progress");
  assert.equal(result.snapshot.tasks[0]?.claimedBy, "planner");

  const history = await service.getLoopExecutionHistory(run.id);
  assert.equal(history.length, 1);
  assert.equal(history[0]?.provenance.runId, run.id);
  assert.equal(history[0]?.provenance.taskId, "plan");
  assert.ok(history[0]?.metadata.tags.includes("runtime_loop_history"));
  assert.ok(history[0]?.metadata.tags.includes("directive:dispatch_owner"));
  assert.ok(history[0]?.metadata.tags.includes("outcome:executed"));

  const memoryEntries = (store as unknown as { memoryEntries: Map<string, MemoryEntryRecord> }).memoryEntries;
  assert.equal(memoryEntries.size, 1);
});

test("executeDirectiveStep persists one history entry per supported review step", async () => {
  const { service, store } = createService();
  await seedHealthyRuntimeRegistration(store);
  const run = await service.intakeRequest({
    workspaceSlug: "team",
    projectSlug: "devgod",
    actor: "ceo",
    title: "Build core",
    request: "Ship the shared orchestration backend."
  });

  await service.createTaskGraph(run.id, [taskPacket({ taskId: "plan" })]);
  await service.claimTask(run.id, "plan", "planner");
  await service.submitHandoff(run.id, "plan", {
    actor: "planner",
    ownerRole: "planner",
    completionStandard: "specialist_verified",
    summary: "ready for review",
    changedFiles: [".devgod/work/tasks/task-plan.md"],
    blockers: [],
    verificationNotes: ["review pending"],
    executionEvidence: ["planner handoff recorded"],
    qualityGateEvidence: ["product acceptance captured in intake artifacts"],
    contextRefs: ["brief-1"]
  });
  await service.recordReview(run.id, "plan", reviewContext("reviewer").actor, {
    reviewerRole: "reviewer",
    state: "passed",
    severity: "low",
    findings: []
  });

  const executedRoles: string[] = [];
  const result = await service.executeDirectiveStep(run.id, {
    async executeReviewRecommendation({ directive }) {
      const recommendation = directive.recommendations[0];
      assert.ok(recommendation);
      assert.ok(recommendation.targetReviewRole);
      executedRoles.push(recommendation.targetReviewRole);
      const actor = reviewContext(recommendation.targetReviewRole).actor;
      await service.recordReview(run.id, recommendation.taskId, actor, {
        reviewerRole: recommendation.targetReviewRole,
        state: "passed",
        severity: "low",
        findings: []
      });
      return {
        executed: true,
        taskId: recommendation.taskId,
        actor,
        reviewRole: recommendation.targetReviewRole,
        evidence: [`recorded ${recommendation.targetReviewRole} for ${recommendation.taskId}`]
      };
    }
  });

  assert.deepEqual(executedRoles, ["security_reviewer", "qa_engineer"]);
  assert.equal(result.initialPlan.directive.kind, "dispatch_reviews");
  assert.equal(result.steps.length, 2);
  assert.equal(result.steps[0]?.directiveKind, "dispatch_reviews");
  assert.equal(result.steps[0]?.outcome, "executed");
  assert.equal(result.steps[1]?.directiveKind, "dispatch_reviews");
  assert.equal(result.steps[1]?.outcome, "executed");
  assert.equal(result.finalPlan.directive.kind, "complete");
  assert.equal(result.snapshot.tasks[0]?.status, "approved");

  const history = await service.getLoopExecutionHistory(run.id);
  assert.equal(history.length, 2);
  assert.ok(history.every((entry) => entry.metadata.tags.includes("runtime_loop_history")));
  assert.ok(history.every((entry) => entry.metadata.tags.includes("directive:dispatch_reviews")));
  assert.ok(history.some((entry) => entry.metadata.tags.includes("next:dispatch_reviews")));
  assert.ok(history.some((entry) => entry.metadata.tags.includes("next:complete")));

  const memoryEntries = (store as unknown as { memoryEntries: Map<string, MemoryEntryRecord> }).memoryEntries;
  assert.equal(memoryEntries.size, 2);
});

test("executeDirectiveStep fails closed on unsupported review dispatch and still records the stop reason", async () => {
  const { service, store } = createService();
  await seedHealthyRuntimeRegistration(store);
  const run = await service.intakeRequest({
    workspaceSlug: "team",
    projectSlug: "devgod",
    actor: "ceo",
    title: "Build core",
    request: "Ship the shared orchestration backend."
  });

  await service.createTaskGraph(run.id, [taskPacket({ taskId: "plan" })]);
  await service.claimTask(run.id, "plan", "planner");
  await service.submitHandoff(run.id, "plan", {
    actor: "planner",
    ownerRole: "planner",
    completionStandard: "specialist_verified",
    summary: "ready for review",
    changedFiles: [".devgod/work/tasks/task-plan.md"],
    blockers: [],
    verificationNotes: ["review pending"],
    executionEvidence: ["planner handoff recorded"],
    qualityGateEvidence: ["product acceptance captured in intake artifacts"],
    contextRefs: ["brief-1"]
  });
  await service.recordReview(run.id, "plan", reviewContext("reviewer").actor, {
    reviewerRole: "reviewer",
    state: "passed",
    severity: "low",
    findings: []
  });

  const result = await service.executeDirectiveStep(run.id);

  assert.equal(result.initialPlan.directive.kind, "dispatch_reviews");
  assert.equal(result.steps.length, 1);
  assert.equal(result.steps[0]?.directiveKind, "dispatch_reviews");
  assert.equal(result.steps[0]?.outcome, "unsupported");
  assert.equal(result.finalPlan.directive.kind, "dispatch_reviews");
  assert.equal(result.snapshot.tasks[0]?.status, "review_blocked");

  const history = await service.getLoopExecutionHistory(run.id);
  assert.equal(history.length, 1);
  assert.ok(history[0]?.metadata.tags.includes("directive:dispatch_reviews"));
  assert.ok(history[0]?.metadata.tags.includes("outcome:unsupported"));

  const memoryEntries = (store as unknown as { memoryEntries: Map<string, MemoryEntryRecord> }).memoryEntries;
  assert.equal(memoryEntries.size, 1);
});

test("executeDirectiveStep persists complete and blocked terminations without changing task state", async () => {
  const { service, store } = createService();
  await seedHealthyRuntimeRegistration(store);
  const completeRun = await service.intakeRequest({
    workspaceSlug: "team",
    projectSlug: "devgod",
    actor: "ceo",
    title: "Build core",
    request: "Ship the shared orchestration backend."
  });

  await service.createTaskGraph(completeRun.id, [taskPacket({ taskId: "plan" })]);
  await service.claimTask(completeRun.id, "plan", "planner");
  await service.submitHandoff(completeRun.id, "plan", {
    actor: "planner",
    ownerRole: "planner",
    completionStandard: "specialist_verified",
    summary: "ready for review",
    changedFiles: [".devgod/work/tasks/task-plan.md"],
    blockers: [],
    verificationNotes: ["all reviews passed"],
    executionEvidence: ["planner handoff recorded"],
    qualityGateEvidence: ["product acceptance captured in intake artifacts"],
    contextRefs: ["brief-1"]
  });
  await service.recordReview(completeRun.id, "plan", reviewContext("reviewer").actor, {
    reviewerRole: "reviewer",
    state: "passed",
    severity: "low",
    findings: []
  });
  await service.recordReview(completeRun.id, "plan", reviewContext("security_reviewer").actor, {
    reviewerRole: "security_reviewer",
    state: "passed",
    severity: "low",
    findings: []
  });
  await service.recordReview(completeRun.id, "plan", reviewContext("qa_engineer").actor, {
    reviewerRole: "qa_engineer",
    state: "passed",
    severity: "low",
    findings: []
  });

  const completeResult = await service.executeDirectiveStep(completeRun.id);
  assert.equal(completeResult.initialPlan.directive.kind, "complete");
  assert.equal(completeResult.steps[0]?.directiveKind, "complete");
  assert.equal(completeResult.steps[0]?.outcome, "complete");
  assert.equal(completeResult.snapshot.tasks[0]?.status, "approved");
  const completeHistory = await service.getLoopExecutionHistory(completeRun.id);
  assert.equal(completeHistory.length, 1);
  assert.ok(completeHistory[0]?.metadata.tags.includes("directive:complete"));
  assert.ok(completeHistory[0]?.metadata.tags.includes("outcome:complete"));

  const blockedRun = await service.intakeRequest({
    workspaceSlug: "team",
    projectSlug: "devgod",
    actor: "ceo",
    title: "Build core",
    request: "Ship the shared orchestration backend."
  });

  await service.createTaskGraph(blockedRun.id, [taskPacket({ taskId: "plan" })]);
  await service.claimTask(blockedRun.id, "plan", "planner");

  const blockedResult = await service.executeDirectiveStep(blockedRun.id);
  assert.equal(blockedResult.initialPlan.directive.kind, "blocked");
  assert.equal(blockedResult.steps[0]?.directiveKind, "blocked");
  assert.equal(blockedResult.steps[0]?.outcome, "blocked");
  assert.equal(blockedResult.snapshot.tasks[0]?.status, "in_progress");
  const blockedHistory = await service.getLoopExecutionHistory(blockedRun.id);
  assert.equal(blockedHistory.length, 1);
  assert.ok(blockedHistory[0]?.metadata.tags.includes("directive:blocked"));
  assert.ok(blockedHistory[0]?.metadata.tags.includes("outcome:blocked"));

  const memoryEntries = (store as unknown as { memoryEntries: Map<string, MemoryEntryRecord> }).memoryEntries;
  assert.equal(memoryEntries.size, 2);
});

test("executeDirectiveStep rejects direct low-level execution without runtime registration", async () => {
  const { service } = createService();
  const run = await service.intakeRequest({
    workspaceSlug: "team",
    projectSlug: "devgod",
    actor: "ceo",
    title: "Build core",
    request: "Ship the shared orchestration backend."
  });

  await service.createTaskGraph(run.id, [taskPacket({ taskId: "plan" })]);

  await assert.rejects(
    service.executeDirectiveStep(run.id, {
      ownerActor: "planner"
    }),
    /directive execution requires runtime registration/
  );
});

test("getExecutionPlan returns safe recovery actions before more routing", async () => {
  const store = new MemoryStore();
  const { service } = createService(store);
  const run = await service.intakeRequest({
    workspaceSlug: "team",
    projectSlug: "devgod",
    actor: "ceo",
    title: "Build core",
    request: "Ship the shared orchestration backend."
  });

  await service.createTaskGraph(run.id, [taskPacket({ taskId: "plan" })]);
  await service.claimTask(run.id, "plan", "planner");
  await service.submitHandoff(run.id, "plan", {
    actor: "planner",
    ownerRole: "planner",
    completionStandard: "specialist_verified",
    summary: "ready for review",
    changedFiles: [".devgod/work/tasks/task-plan.md"],
    blockers: [],
    verificationNotes: ["all reviews passed"],
    executionEvidence: ["planner handoff recorded"],
    qualityGateEvidence: ["product acceptance captured in intake artifacts"],
    contextRefs: ["brief-1"]
  });
  await service.recordReview(run.id, "plan", reviewContext("reviewer").actor, {
    reviewerRole: "reviewer",
    state: "passed",
    severity: "low",
    findings: []
  });
  await service.recordReview(run.id, "plan", reviewContext("security_reviewer").actor, {
    reviewerRole: "security_reviewer",
    state: "passed",
    severity: "low",
    findings: []
  });
  await service.recordReview(run.id, "plan", reviewContext("qa_engineer").actor, {
    reviewerRole: "qa_engineer",
    state: "passed",
    severity: "low",
    findings: []
  });

  mutateReviewWhere(
    store,
    (review) => review.taskId === "plan" && review.reviewerRole === "qa_engineer",
    (review) => ({
      ...review,
      state: "blocked",
      severity: "high",
      findings: ["approval should be reblocked"]
    })
  );

  const plan = await service.getExecutionPlan(run.id);

  assert.equal(plan.directive.kind, "apply_recovery");
  if (plan.directive.kind === "apply_recovery") {
    assert.ok(plan.directive.actions.some((action) => action.kind === "reblock_stale_approval"));
  }
});

test("getExecutionPlan returns complete when all tasks are terminal", async () => {
  const { service } = createService();
  const run = await service.intakeRequest({
    workspaceSlug: "team",
    projectSlug: "devgod",
    actor: "ceo",
    title: "Build core",
    request: "Ship the shared orchestration backend."
  });

  await service.createTaskGraph(run.id, [taskPacket({ taskId: "plan" })]);
  await service.claimTask(run.id, "plan", "planner");
  await service.submitHandoff(run.id, "plan", {
    actor: "planner",
    ownerRole: "planner",
    completionStandard: "specialist_verified",
    summary: "ready for review",
    changedFiles: [".devgod/work/tasks/task-plan.md"],
    blockers: [],
    verificationNotes: ["all reviews passed"],
    executionEvidence: ["planner handoff recorded"],
    qualityGateEvidence: ["product acceptance captured in intake artifacts"],
    contextRefs: ["brief-1"]
  });
  await service.recordReview(run.id, "plan", reviewContext("reviewer").actor, {
    reviewerRole: "reviewer",
    state: "passed",
    severity: "low",
    findings: []
  });
  await service.recordReview(run.id, "plan", reviewContext("security_reviewer").actor, {
    reviewerRole: "security_reviewer",
    state: "passed",
    severity: "low",
    findings: []
  });
  await service.recordReview(run.id, "plan", reviewContext("qa_engineer").actor, {
    reviewerRole: "qa_engineer",
    state: "passed",
    severity: "low",
    findings: []
  });

  const plan = await service.getExecutionPlan(run.id);

  assert.equal(plan.directive.kind, "complete");
});

test("getStatus surfaces autonomous execution coverage and readiness when configured", async () => {
  const { service } = createService();
  const run = await service.intakeRequest({
    workspaceSlug: "team",
    projectSlug: "devgod",
    actor: "ceo",
    title: "Rewrite readiness",
    request: "Track coverage and progress for the rewrite gate."
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
      businessRules: ["workflow proof must not pass before authenticated reviews complete"],
      evidenceRefs: ["src/core/service.ts:1"],
      verificationRefs: ["tests/service.test.ts"],
      lastUpdatedAt: new Date().toISOString()
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
    evidenceRefs: ["tests/service.test.ts"],
    updatedAt: new Date().toISOString()
  })));
  await service.upsertRuntimeTraces(run.id, [
    {
      traceId: "trace:workflow-proof",
      targetId: "service:workflow-proof",
      kind: "side_effect",
      risky: true,
      sideEffects: ["records authenticated workflow proof"],
      evidenceRefs: ["tests/service.test.ts"],
      createdAt: new Date().toISOString()
    }
  ]);
  await service.recordProgressProof(run.id, {
    cycle: 1,
    proofId: "proof-1",
    phaseBefore: "runtime_tracing",
    phaseAfter: "final_verification",
    evidenceRefs: ["src/core/service.ts:1"],
    coverageDelta: { validated: 1 },
    blockingGapDelta: { closed: 1, opened: 0 },
    nextTarget: "task:final-review",
    whyNext: "all critical coverage thresholds are now satisfied",
    createdAt: new Date().toISOString()
  });
  await service.checkpointRun(run.id, {
    checkpointId: "cp-1",
    phase: "final_verification",
    activeTargets: ["task:final-review"],
    recentEvidenceRefs: ["src/core/service.ts:1"],
    openGaps: [],
    nextActions: ["request final reviews"],
    compressedContextRef: "memory://cp-1",
    createdAt: new Date().toISOString()
  });

  const status = await service.getStatus(run.id);

  assert.ok(status.autonomousExecution);
  assert.equal(status.autonomousExecution?.state.profile, "legacy_rewrite");
  assert.equal(status.autonomousExecution?.coverageSummary.criticalItemCoverage, 1);
  assert.equal(status.autonomousExecution?.coverageSummary.runtimeTraceCoverage, 1);
  assert.equal(status.autonomousExecution?.comprehensionSummary?.rewriteReadiness, "ready");
  assert.equal(status.autonomousExecution?.phaseReadiness.status, "ready");
});

test("getStatus marks standard_delivery readiness as profile_limited even when task-scoped evidence is complete", async () => {
  const { service } = createService();
  const run = await service.intakeRequest({
    workspaceSlug: "team",
    projectSlug: "devgod",
    actor: "ceo",
    title: "Task-scoped readiness",
    request: "Do not confuse standard delivery coverage with broad rewrite readiness."
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
  await service.upsertCoverageItems(run.id, [
    {
      id: "service:delivery-core",
      category: "services",
      state: "validated",
      criticality: "critical",
      sources: ["src/core/service.ts:1"],
      callsiteCount: 2,
      callsitesAnalyzed: 2,
      runtimeTraced: true,
      businessRules: ["delivery sequencing must preserve runtime authority"],
      evidenceRefs: ["src/core/service.ts:1"],
      verificationRefs: ["tests/service.test.ts"],
      lastUpdatedAt: new Date().toISOString()
    }
  ]);
  await service.upsertUnderstandingMaps(run.id, [
    "repo_map",
    "subsystems",
    "route_map",
    "integration_map",
    "config_coupling",
    "runtime_side_effects"
  ].map((kind) => ({
    kind,
    itemCount: 1,
    analyzedCount: 1,
    sourceRefs: ["src/core/service.ts:1"],
    evidenceRefs: ["tests/service.test.ts"],
    updatedAt: new Date().toISOString()
  })));
  await service.upsertRuntimeTraces(run.id, [
    {
      traceId: "trace:delivery-core",
      targetId: "service:delivery-core",
      kind: "side_effect",
      risky: true,
      sideEffects: ["persists task-scoped delivery evidence"],
      evidenceRefs: ["tests/service.test.ts"],
      createdAt: new Date().toISOString()
    }
  ]);

  const status = await service.getStatus(run.id);

  assert.equal(status.autonomousExecution?.state.profile, "standard_delivery");
  assert.equal(status.autonomousExecution?.comprehensionSummary?.readinessScope, "profile_limited");
  assert.equal(status.autonomousExecution?.comprehensionSummary?.rewriteReadiness, "profile_limited");
  assert.match(
    status.autonomousExecution?.comprehensionSummary?.profileLimitations.join(" | ") ?? "",
    /does not establish broad rewrite readiness/
  );
});

test("getStatus blocks modernization_program until modernization artifact classes are present", async () => {
  const { service } = createService();
  const run = await service.intakeRequest({
    workspaceSlug: "team",
    projectSlug: "devgod",
    actor: "ceo",
    title: "Modernization gating",
    request: "Require modernization-only artifact classes before broad modernization readiness."
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
      businessRules: ["modernization planning must stay blocked until artifact coverage is complete"],
      evidenceRefs: ["src/core/service.ts:1"],
      verificationRefs: ["tests/service.test.ts"],
      lastUpdatedAt: new Date().toISOString()
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
    evidenceRefs: ["tests/service.test.ts"],
    updatedAt: new Date().toISOString()
  })));
  await service.upsertRuntimeTraces(run.id, [
    {
      traceId: "trace:modernization-core",
      targetId: "service:modernization-core",
      kind: "side_effect",
      risky: true,
      sideEffects: ["persists modernization readiness evidence"],
      evidenceRefs: ["tests/service.test.ts"],
      createdAt: new Date().toISOString()
    }
  ]);

  const status = await service.getStatus(run.id);

  assert.equal(status.autonomousExecution?.state.profile, "modernization_program");
  assert.equal(status.autonomousExecution?.comprehensionSummary?.readinessScope, "broad");
  assert.equal(status.autonomousExecution?.comprehensionSummary?.rewriteReadiness, "blocked");
  assert.ok(status.autonomousExecution?.comprehensionSummary?.missingArtifactKinds.includes("domain_map"));
  assert.ok(status.autonomousExecution?.comprehensionSummary?.missingArtifactKinds.includes("migration_ledger"));
  assert.ok(status.autonomousExecution?.comprehensionSummary?.missingArtifactKinds.includes("parity_matrix"));
  assert.match(
    status.autonomousExecution?.comprehensionSummary?.missingEvidence.join(" | ") ?? "",
    /modernization artifact missing: domain_map/
  );
});

test("getStatus marks modernization_program ready when modernization artifact classes are present", async () => {
  const { service } = createService();
  const run = await service.intakeRequest({
    workspaceSlug: "team",
    projectSlug: "devgod",
    actor: "ceo",
    title: "Modernization ready",
    request: "Mark modernization readiness ready only when modernization artifact classes are present."
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
      businessRules: ["modernization planning must preserve all validated invariants"],
      evidenceRefs: ["src/core/service.ts:1"],
      verificationRefs: ["tests/service.test.ts"],
      lastUpdatedAt: new Date().toISOString()
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
    "runtime_side_effects",
    "domain_map",
    "symbol_graph",
    "call_graph",
    "dependency_graph",
    "invariant_ledger",
    "duplicate_families",
    "architecture_decisions",
    "migration_ledger",
    "parity_matrix"
  ].map((kind) => ({
    kind,
    itemCount: 1,
    analyzedCount: 1,
    sourceRefs: ["src/core/service.ts:1"],
    evidenceRefs: ["tests/service.test.ts"],
    updatedAt: new Date().toISOString()
  })));
  await service.upsertRuntimeTraces(run.id, [
    {
      traceId: "trace:modernization-core",
      targetId: "service:modernization-core",
      kind: "side_effect",
      risky: true,
      sideEffects: ["persists modernization artifact evidence"],
      evidenceRefs: ["tests/service.test.ts"],
      createdAt: new Date().toISOString()
    }
  ]);

  const status = await service.getStatus(run.id);

  assert.equal(status.autonomousExecution?.state.profile, "modernization_program");
  assert.equal(status.autonomousExecution?.comprehensionSummary?.readinessScope, "broad");
  assert.equal(status.autonomousExecution?.comprehensionSummary?.rewriteReadiness, "ready");
  assert.deepEqual(status.autonomousExecution?.comprehensionSummary?.missingArtifactKinds, []);
  assert.equal(status.autonomousExecution?.phaseReadiness.status, "ready");
});

test("exportCoverageLedger emits the richer exported ledger artifact set from runtime state", async () => {
  const { service } = createService();
  const run = await service.intakeRequest({
    workspaceSlug: "team",
    projectSlug: "devgod",
    actor: "ceo",
    title: "Coverage ledger export",
    request: "Export the authoritative coverage ledger artifact set."
  });

  await service.createTaskGraph(run.id, [
    taskPacket({
      taskId: "rewrite",
      qualityGates: ["product_acceptance", "coverage_ledger_required"]
    })
  ]);
  await service.claimTask(run.id, "rewrite", "planner");
  await service.submitHandoff(run.id, "rewrite", {
    actor: "planner",
    ownerRole: "planner",
    completionStandard: "specialist_verified",
    summary: "ready for review",
    changedFiles: [".devgod/work/tasks/task-rewrite.md"],
    blockers: [],
    verificationNotes: ["all reviews passed"],
    executionEvidence: ["planner handoff recorded"],
    qualityGateEvidence: ["autonomous execution artifacts recorded"],
    contextRefs: ["brief-1"]
  });
  await service.recordReview(run.id, "rewrite", reviewContext("reviewer").actor, {
    reviewerRole: "reviewer",
    state: "passed",
    severity: "low",
    findings: []
  });
  await service.recordReview(run.id, "rewrite", reviewContext("security_reviewer").actor, {
    reviewerRole: "security_reviewer",
    state: "passed",
    severity: "low",
    findings: []
  });
  await service.recordReview(run.id, "rewrite", reviewContext("qa_engineer").actor, {
    reviewerRole: "qa_engineer",
    state: "passed",
    severity: "low",
    findings: []
  });
  await service.configureAutonomousExecution(run.id, {
    profile: "legacy_rewrite",
    phase: "validation",
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
      dependencies: ["test:workflow-proof"],
      callsiteCount: 2,
      callsitesAnalyzed: 2,
      runtimeTraced: true,
      invariants: ["workflow proof must only close after authenticated live validation"],
      evidenceRefs: ["src/core/service.ts:1"],
      verificationRefs: ["tests/service.test.ts"],
      lastUpdatedAt: "2026-05-20T12:00:00.000Z"
    },
    {
      id: "test:workflow-proof",
      category: "tests",
      state: "fully_analyzed",
      criticality: "medium",
      sources: ["tests/service.test.ts:1"],
      evidenceRefs: ["tests/service.test.ts:1"],
      lastUpdatedAt: "2026-05-20T12:01:00.000Z"
    }
  ]);
  await service.upsertCoverageGaps(run.id, [
    {
      id: "gap:workflow-proof",
      targetId: "service:workflow-proof",
      kind: "missing_validation",
      severity: "high",
      description: "workflow proof still needs live validation",
      blocking: true,
      evidenceRefs: ["tests/service.test.ts:1"],
      createdBy: "qa_engineer",
      suggestedNextActions: ["run live workflow proof"],
      status: "open"
    }
  ]);
  await service.upsertRuntimeTraces(run.id, [
    {
      traceId: "trace:workflow-proof",
      targetId: "service:workflow-proof",
      kind: "side_effect",
      risky: true,
      sideEffects: ["records workflow proof completion"],
      evidenceRefs: ["tests/service.test.ts:1"],
      createdAt: "2026-05-20T12:02:00.000Z"
    }
  ]);
  await service.upsertDuplicateFamilies(run.id, [
    {
      familyId: "duplicate:workflow-proof",
      capability: "workflow proof orchestration",
      members: [
        {
          itemId: "service:workflow-proof",
          kind: "shared_core",
          role: "runtime orchestrator"
        },
        {
          itemId: "test:workflow-proof",
          kind: "intentional_variant",
          role: "verification harness"
        }
      ],
      sharedAbstraction: "WorkflowProofAdapter",
      intentionalVariants: ["test harness keeps extra diagnostics hooks"],
      accidentalDivergences: [],
      centralizationCandidate: "centralize workflow proof lifecycle behind WorkflowProofAdapter",
      parityRequirements: ["prove runtime and harness variants emit equivalent workflow-proof milestones"],
      evidenceRefs: ["tests/service.test.ts"],
      verificationRefs: ["tests/service.test.ts"],
      lastUpdatedAt: "2026-05-20T12:03:00.000Z"
    }
  ]);
  await service.upsertArchitectureDecisions(run.id, [
    {
      decisionId: "adr:workflow-proof-boundary",
      title: "Workflow proof stays behind a shared adapter boundary",
      status: "accepted",
      options: ["inline service orchestration", "shared adapter boundary"],
      chosenOption: "shared adapter boundary",
      boundedContexts: ["workflow-proof", "operator-reporting"],
      consistencyNeeds: ["shared proof semantics", "single authz gate"],
      rationale: ["shared boundary reduces proof drift across callers"],
      evidenceRefs: ["tests/service.test.ts"],
      verificationRefs: ["tests/service.test.ts"],
      lastUpdatedAt: "2026-05-20T12:04:00.000Z"
    }
  ]);
  await service.upsertMigrationLedgerEntries(run.id, [
    {
      entryId: "migration:workflow-proof-status",
      boundedContext: "workflow-proof",
      sourceModels: ["legacy_workflow_proofs"],
      targetModels: ["workflow_proof_records"],
      strategy: "expand_contract",
      consistencyClass: "strong",
      ownership: "backend_engineer",
      rolloutSteps: ["add new proof table", "backfill legacy rows", "cut reads to new table"],
      rollbackPlan: ["restore reads to legacy table", "leave additive schema in place"],
      evidenceRefs: ["tests/service.test.ts"],
      verificationRefs: ["tests/service.test.ts"],
      lastUpdatedAt: "2026-05-20T12:05:00.000Z"
    }
  ]);
  await service.upsertParityRequirements(run.id, [
    {
      requirementId: "parity:workflow-proof-lifecycle",
      capability: "workflow proof lifecycle",
      status: "planned",
      legacyRefs: ["legacy_workflow_proofs.status"],
      targetRefs: ["workflow_proof_records.status"],
      acceptanceChecks: ["prove both paths expose the same terminal workflow-proof states"],
      evidenceRefs: ["tests/service.test.ts"],
      verificationRefs: ["tests/service.test.ts"],
      lastUpdatedAt: "2026-05-20T12:06:00.000Z"
    }
  ]);

  const artifacts = await service.exportCoverageLedger(run.id);

  assert.equal(artifacts.manifest.run_id, run.id);
  assert.equal(artifacts.items.length, 2);
  assert.equal(artifacts.gaps.length, 1);
  assert.ok(Array.isArray(artifacts.understanding_maps));
  assert.equal(artifacts.invariants.length, 1);
  assert.equal(artifacts.invariants[0]?.target_id, "service:workflow-proof");
  assert.deepEqual(artifacts.invariants[0]?.invariants, [
    "workflow proof must only close after authenticated live validation"
  ]);
  assert.deepEqual(artifacts.invariants[0]?.business_rules, []);
  assert.ok(artifacts.invariants[0]?.evidence_refs.includes("src/core/service.ts:1"));
  assert.ok(artifacts.invariants[0]?.evidence_refs.includes("tests/service.test.ts:1"));
  assert.deepEqual(artifacts.invariants[0]?.verification_refs, ["tests/service.test.ts"]);
  assert.equal(artifacts.invariants[0]?.last_updated_at, "2026-05-20T12:02:00.000Z");
  assert.equal(artifacts.duplicate_families.length, 1);
  assert.equal(artifacts.duplicate_families[0]?.family_id, "duplicate:workflow-proof");
  assert.equal(
    artifacts.duplicate_families[0]?.centralization_candidate,
    "centralize workflow proof lifecycle behind WorkflowProofAdapter"
  );
  assert.deepEqual(artifacts.duplicate_families[0]?.parity_requirements, [
    "prove runtime and harness variants emit equivalent workflow-proof milestones"
  ]);
  assert.equal(artifacts.architecture_decisions.length, 1);
  assert.equal(artifacts.architecture_decisions[0]?.decision_id, "adr:workflow-proof-boundary");
  assert.equal(artifacts.migration_ledger.length, 1);
  assert.equal(artifacts.migration_ledger[0]?.entry_id, "migration:workflow-proof-status");
  assert.equal(artifacts.parity_matrix.length, 1);
  assert.equal(artifacts.parity_matrix[0]?.requirement_id, "parity:workflow-proof-lifecycle");
  assert.equal(artifacts.traces.length, 1);
  assert.ok(
    artifacts.dependency_graph.edges.some(
      (edge) => edge.from === "service:workflow-proof" && edge.to === "test:workflow-proof"
    )
  );
});

test("generateRepoInventory persists code-backed coverage items and understanding maps", async () => {
  const { service } = createService();
  const run = await service.intakeRequest({
    workspaceSlug: "team",
    projectSlug: "devgod",
    actor: "ceo",
    title: "Repo inventory",
    request: "Generate code-backed understanding state."
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

  const state = await service.generateRepoInventory(run.id, {
    repoRoot,
    now: "2026-05-20T12:30:00.000Z"
  });

  assert.ok(state.coverageItems.some((item) => item.id === "file:src/core/service.ts"));
  assert.ok(state.coverageItems.some((item) => item.category === "tests"));
  assert.ok(state.understandingMaps?.some((map) => map.kind === "repo_map"));
  assert.ok(state.understandingMaps?.some((map) => map.kind === "runtime_side_effects"));
  assert.ok(state.understandingMaps?.some((map) => map.kind === "domain_map"));
  assert.ok(state.understandingMaps?.some((map) => map.kind === "symbol_graph"));
  assert.ok(state.understandingMaps?.some((map) => map.kind === "dependency_graph"));
});

test("generateRepoInventory derives code-backed surfaces and explicit ambiguity gaps", async () => {
  const fixtureRoot = await mkdtemp(resolve(tmpdir(), "devgod-code-inventory-"));
  try {
    await mkdir(resolve(fixtureRoot, "src", "admin"), { recursive: true });
    await mkdir(resolve(fixtureRoot, "src", "core"), { recursive: true });
    await mkdir(resolve(fixtureRoot, "src", "mcp"), { recursive: true });
    await mkdir(resolve(fixtureRoot, "src", "policy"), { recursive: true });
    await mkdir(resolve(fixtureRoot, "src", "domain"), { recursive: true });
    await mkdir(resolve(fixtureRoot, "src", "config"), { recursive: true });
    await mkdir(resolve(fixtureRoot, "scripts"), { recursive: true });

    await writeFile(resolve(fixtureRoot, "package.json"), '{"name":"fixture","version":"1.0.0"}\n', "utf8");
    await writeFile(
      resolve(fixtureRoot, "src", "admin", "router.ts"),
      'export function handle(command: string) { if (command === "status") return "ok"; return "missing"; }\n',
      "utf8"
    );
    await writeFile(
      resolve(fixtureRoot, "src", "admin", "dynamic.ts"),
      'export function run(command: string, handlers: Record<string, () => string>) { const handler = handlers[command]; return handler?.() ?? "missing"; }\n',
      "utf8"
    );
    await writeFile(
      resolve(fixtureRoot, "src", "core", "service.ts"),
      'import { RecordModel } from "../domain/model"; export class BillingService { run(model: RecordModel) { return model.id; } }\n',
      "utf8"
    );
    await writeFile(
      resolve(fixtureRoot, "src", "mcp", "client.ts"),
      'export async function syncRemote() { return fetch("https://example.com/health"); }\n',
      "utf8"
    );
    await writeFile(
      resolve(fixtureRoot, "src", "policy", "access.ts"),
      'export function authorizeUser(token: string, permission: string) { return token.length > 0 && permission === "read"; }\n',
      "utf8"
    );
    await writeFile(
      resolve(fixtureRoot, "src", "domain", "model.ts"),
      'export interface RecordModel { id: string; }\n',
      "utf8"
    );
    await writeFile(
      resolve(fixtureRoot, "src", "config", "runtime.ts"),
      'export const apiUrl = process.env.API_URL ?? "https://example.com";\n',
      "utf8"
    );
    await writeFile(resolve(fixtureRoot, "scripts", "sync.sh"), 'echo sync\n', "utf8");

    const { service } = createService();
    const run = await service.intakeRequest({
      workspaceSlug: "team",
      projectSlug: "devgod",
      actor: "ceo",
      title: "Code-backed inventory",
      request: "Generate signal-derived repo understanding with explicit ambiguity gaps."
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

    const state = await service.generateRepoInventory(run.id, {
      repoRoot: fixtureRoot,
      now: "2026-05-20T16:00:00.000Z"
    });

    const routeItem = state.coverageItems.find((item) => item.id === "route:src/admin/router.ts");
    const serviceItem = state.coverageItems.find((item) => item.id === "service:src/core/service.ts");
    const integrationItem = state.coverageItems.find((item) => item.id === "integration:src/mcp/client.ts");
    const configItem = state.coverageItems.find((item) => item.id === "configuration:src/config/runtime.ts");
    const authzItem = state.coverageItems.find((item) => item.id === "authorization:src/policy/access.ts");
    const ambiguityGap = state.gaps.find((gap) => gap.targetId === "file:src/admin/dynamic.ts");

    assert.ok(routeItem);
    assert.ok(routeItem?.evidenceRefs.includes("signal://path:src-admin"));
    assert.ok(serviceItem?.evidenceRefs.includes("signal://path:core-runtime"));
    assert.ok(integrationItem?.evidenceRefs.includes("signal://path:integration-surface"));
    assert.ok(configItem?.evidenceRefs.includes("signal://content:configuration-coupling"));
    assert.ok(authzItem?.evidenceRefs.includes("signal://content:authorization-keywords"));
    assert.ok(ambiguityGap);
    assert.equal(ambiguityGap?.kind, "missing_inventory");
    assert.ok(ambiguityGap?.evidenceRefs.includes("ambiguity://computed-dispatch-table"));
    assert.ok(state.understandingMaps?.some((map) => map.kind === "route_map" && map.sourceRefs.includes("src/admin/router.ts")));
    assert.ok(state.understandingMaps?.some((map) => map.kind === "integration_map" && map.sourceRefs.includes("src/mcp/client.ts")));
    assert.ok(state.understandingMaps?.some((map) => map.kind === "config_coupling" && map.sourceRefs.includes("src/config/runtime.ts")));
    assert.ok(state.understandingMaps?.some((map) => map.kind === "authz_map" && map.sourceRefs.includes("src/policy/access.ts")));
    assert.ok(state.understandingMaps?.some((map) => map.kind === "domain_map" && map.sourceRefs.includes("domain:core")));
    assert.ok(state.understandingMaps?.some((map) => map.kind === "symbol_graph" && map.sourceRefs.some((ref) => ref.includes("src/core/service.ts#BillingService"))));
    assert.ok(state.understandingMaps?.some((map) => map.kind === "dependency_graph" && map.sourceRefs.some((ref) => ref.includes("src/core/service.ts->src/domain/model.ts"))));
  } finally {
    await rm(fixtureRoot, { recursive: true, force: true });
  }
});

test("getExecutionPlan returns rebuild_inventory when repo-understanding thresholds are unmet", async () => {
  const { service } = createService();
  const run = await service.intakeRequest({
    workspaceSlug: "team",
    projectSlug: "devgod",
    actor: "ceo",
    title: "Rewrite readiness",
    request: "Block modernization advice until repo understanding is complete."
  });

  await service.createTaskGraph(run.id, [
    taskPacket({
      taskId: "rewrite",
      qualityGates: ["product_acceptance", "coverage_ledger_required"]
    })
  ]);
  await service.claimTask(run.id, "rewrite", "planner");
  await service.submitHandoff(run.id, "rewrite", {
    actor: "planner",
    ownerRole: "planner",
    completionStandard: "specialist_verified",
    summary: "ready for review",
    changedFiles: [".devgod/work/tasks/task-rewrite.md"],
    blockers: [],
    verificationNotes: ["all reviews passed"],
    executionEvidence: ["planner handoff recorded"],
    qualityGateEvidence: ["autonomous execution artifacts recorded"],
    contextRefs: ["brief-1"]
  });
  await service.recordReview(run.id, "rewrite", reviewContext("reviewer").actor, {
    reviewerRole: "reviewer",
    state: "passed",
    severity: "low",
    findings: []
  });
  await service.recordReview(run.id, "rewrite", reviewContext("security_reviewer").actor, {
    reviewerRole: "security_reviewer",
    state: "passed",
    severity: "low",
    findings: []
  });
  await service.recordReview(run.id, "rewrite", reviewContext("qa_engineer").actor, {
    reviewerRole: "qa_engineer",
    state: "passed",
    severity: "low",
    findings: []
  });
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
      businessRules: ["rewrite planning must respect authenticated proof authority"],
      evidenceRefs: ["src/core/service.ts:1"],
      verificationRefs: ["tests/service.test.ts"],
      lastUpdatedAt: new Date().toISOString()
    }
  ]);

  const plan = await service.getExecutionPlan(run.id);

  assert.equal(plan.directive.kind, "rebuild_inventory");
  if (plan.directive.kind === "rebuild_inventory") {
    assert.deepEqual(plan.directive.missingUnderstandingKinds, [
      "repo_map",
      "subsystems",
      "route_map",
      "model_map",
      "integration_map",
      "authz_map",
      "config_coupling",
      "runtime_side_effects"
    ]);
    assert.ok(plan.directive.blockers.some((blocker) => blocker.includes("understanding map missing: repo_map")));
    assert.ok(plan.directive.nextActions.some((action) => action.includes("rebuild understanding map: repo_map")));
  }
});

test("getExecutionPlan returns checkpoint when autonomous execution evidence is missing and no continuation target exists", async () => {
  const { service } = createService();
  const run = await service.intakeRequest({
    workspaceSlug: "team",
    projectSlug: "devgod",
    actor: "ceo",
    title: "Rewrite readiness",
    request: "Do not mark the rewrite ready without coverage evidence."
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
  await service.claimTask(run.id, "rewrite", "planner");
  await service.submitHandoff(run.id, "rewrite", {
    actor: "planner",
    ownerRole: "planner",
    completionStandard: "specialist_verified",
    summary: "ready for review",
    changedFiles: [".devgod/work/tasks/task-rewrite.md"],
    blockers: [],
    verificationNotes: ["all reviews passed"],
    executionEvidence: ["planner handoff recorded"],
    qualityGateEvidence: ["task packet captured autonomous execution gates"],
    contextRefs: ["brief-1"]
  });
  await service.recordReview(run.id, "rewrite", reviewContext("reviewer").actor, {
    reviewerRole: "reviewer",
    state: "passed",
    severity: "low",
    findings: []
  });
  await service.recordReview(run.id, "rewrite", reviewContext("security_reviewer").actor, {
    reviewerRole: "security_reviewer",
    state: "passed",
    severity: "low",
    findings: []
  });
  await service.recordReview(run.id, "rewrite", reviewContext("qa_engineer").actor, {
    reviewerRole: "qa_engineer",
    state: "passed",
    severity: "low",
    findings: []
  });

  const plan = await service.getExecutionPlan(run.id);

  assert.equal(plan.directive.kind, "checkpoint");
  if (plan.directive.kind === "checkpoint") {
    assert.ok(plan.directive.blockers.some((blocker) => blocker.includes("progress proof")));
    assert.ok(plan.directive.blockers.some((blocker) => blocker.includes("checkpoint")));
  }
});

test("getExecutionPlan rebuilds inventory when rewrite-phase ambiguity gaps remain open", async () => {
  const { service } = createService();
  const run = await service.intakeRequest({
    workspaceSlug: "team",
    projectSlug: "devgod",
    actor: "ceo",
    title: "Rewrite ambiguity gating",
    request: "Do not continue rewrite planning while inventory ambiguity remains open."
  });

  await service.createTaskGraph(run.id, [
    taskPacket({
      taskId: "rewrite",
      qualityGates: ["product_acceptance", "coverage_ledger_required"]
    })
  ]);
  await service.claimTask(run.id, "rewrite", "planner");
  await service.submitHandoff(run.id, "rewrite", {
    actor: "planner",
    ownerRole: "planner",
    completionStandard: "specialist_verified",
    summary: "ready for review",
    changedFiles: [".devgod/work/tasks/task-rewrite.md"],
    blockers: [],
    verificationNotes: ["all reviews passed"],
    executionEvidence: ["planner handoff recorded"],
    qualityGateEvidence: ["autonomous execution artifacts recorded"],
    contextRefs: ["brief-1"]
  });
  await service.recordReview(run.id, "rewrite", reviewContext("reviewer").actor, {
    reviewerRole: "reviewer",
    state: "passed",
    severity: "low",
    findings: []
  });
  await service.recordReview(run.id, "rewrite", reviewContext("security_reviewer").actor, {
    reviewerRole: "security_reviewer",
    state: "passed",
    severity: "low",
    findings: []
  });
  await service.recordReview(run.id, "rewrite", reviewContext("qa_engineer").actor, {
    reviewerRole: "qa_engineer",
    state: "passed",
    severity: "low",
    findings: []
  });
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
      verificationRefs: ["tests/service.test.ts"],
      lastUpdatedAt: new Date().toISOString()
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
    evidenceRefs: ["tests/service.test.ts"],
    updatedAt: new Date().toISOString()
  })));
  await service.upsertRuntimeTraces(run.id, [
    {
      traceId: "trace:rewrite-core",
      targetId: "service:rewrite-core",
      kind: "side_effect",
      risky: true,
      sideEffects: ["persists rewrite planning state"],
      evidenceRefs: ["tests/service.test.ts"],
      createdAt: new Date().toISOString()
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
      evidenceRefs: ["tests/service.test.ts"],
      createdBy: "qa_engineer",
      suggestedNextActions: ["inspect src/admin/dynamic.ts and record the concrete handler surface"],
      status: "open"
    }
  ]);

  const plan = await service.getExecutionPlan(run.id);

  assert.equal(plan.directive.kind, "rebuild_inventory");
  if (plan.directive.kind === "rebuild_inventory") {
    assert.ok(
      plan.directive.blockers.some((blocker) => blocker.includes("dynamic discovery signals in src/admin/dynamic.ts"))
    );
    assert.ok(
      plan.directive.missingEvidence.some((evidence) => evidence.includes("inventory gap open: dynamic discovery signals in src/admin/dynamic.ts"))
    );
    assert.ok(
      plan.directive.nextActions.some((action) => action.includes("inspect src/admin/dynamic.ts and record the concrete handler surface"))
    );
  }
});

test("getExecutionPlan returns continue_analysis when autonomous blockers still have an actionable next target", async () => {
  const { service } = createService();
  const run = await service.intakeRequest({
    workspaceSlug: "team",
    projectSlug: "devgod",
    actor: "ceo",
    title: "Autonomous continuation",
    request: "Keep moving while autonomous work remains."
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
  await service.claimTask(run.id, "rewrite", "planner");
  await service.submitHandoff(run.id, "rewrite", {
    actor: "planner",
    ownerRole: "planner",
    completionStandard: "specialist_verified",
    summary: "ready for review",
    changedFiles: [".devgod/work/tasks/task-rewrite.md"],
    blockers: [],
    verificationNotes: ["all reviews passed"],
    executionEvidence: ["planner handoff recorded"],
    qualityGateEvidence: ["autonomous continuation evidence recorded"],
    contextRefs: ["brief-1"]
  });
  await service.recordReview(run.id, "rewrite", reviewContext("reviewer").actor, {
    reviewerRole: "reviewer",
    state: "passed",
    severity: "low",
    findings: []
  });
  await service.recordReview(run.id, "rewrite", reviewContext("security_reviewer").actor, {
    reviewerRole: "security_reviewer",
    state: "passed",
    severity: "low",
    findings: []
  });
  await service.recordReview(run.id, "rewrite", reviewContext("qa_engineer").actor, {
    reviewerRole: "qa_engineer",
    state: "passed",
    severity: "low",
    findings: []
  });
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
      verificationRefs: ["tests/service.test.ts"],
      lastUpdatedAt: new Date().toISOString()
    }
  ]);
  await service.upsertCoverageGaps(run.id, [
    {
      id: "gap:autonomous-proof",
      targetId: "task:runtime-proof",
      kind: "missing_validation",
      severity: "high",
      description: "Runtime proof still needs to run.",
      blocking: true,
      evidenceRefs: ["src/admin.ts:1"],
      createdBy: "qa_engineer",
      suggestedNextActions: ["run workflow-proof after authenticated reviews"],
      status: "open"
    }
  ]);
  await service.recordProgressProof(run.id, {
    cycle: 1,
    proofId: "proof-1",
    phaseBefore: "validation",
    phaseAfter: "final_verification",
    evidenceRefs: ["src/core/service.ts:1"],
    coverageDelta: { validated: 1 },
    blockingGapDelta: { closed: 0, opened: 1 },
    nextTarget: "review:authenticated",
    whyNext: "Runtime proof is the next autonomous target.",
    createdAt: new Date().toISOString()
  });
  await service.checkpointRun(run.id, {
    checkpointId: "cp-1",
    phase: "final_verification",
    activeTargets: ["review:authenticated"],
    recentEvidenceRefs: ["src/core/service.ts:1"],
    openGaps: ["gap:autonomous-proof"],
    nextActions: ["stale checkpoint action"],
    compressedContextRef: "memory://cp-1",
    createdAt: new Date().toISOString()
  });

  const plan = await service.getExecutionPlan(run.id);

  assert.equal(plan.directive.kind, "continue_analysis");
  if (plan.directive.kind === "continue_analysis") {
    assert.equal(plan.directive.source, "blocking_gap");
    assert.equal(plan.directive.targetId, "task:runtime-proof");
    assert.deepEqual(plan.directive.actions, [{ kind: "run_workflow_proof", taskId: "runtime-proof" }]);
    assert.deepEqual(plan.directive.nextActions, ["run workflow-proof after authenticated reviews"]);
    assert.ok(plan.directive.blockers.some((blocker) => blocker.includes("blocking gaps remain open")));
  }
});

test("getExecutionPlan returns trace_runtime when risky trace evidence is still missing", async () => {
  const { service } = createService();
  const run = await service.intakeRequest({
    workspaceSlug: "team",
    projectSlug: "devgod",
    actor: "ceo",
    title: "Trace runtime gaps",
    request: "Keep risky runtime traces explicit before completion."
  });

  await service.createTaskGraph(run.id, [
    taskPacket({
      taskId: "trace-runtime",
      qualityGates: ["product_acceptance", "coverage_ledger_required"]
    })
  ]);
  await service.claimTask(run.id, "trace-runtime", "planner");
  await service.submitHandoff(run.id, "trace-runtime", {
    actor: "planner",
    ownerRole: "planner",
    completionStandard: "specialist_verified",
    summary: "trace evidence is almost complete",
    changedFiles: ["src/core/service.ts"],
    blockers: [],
    verificationNotes: ["all reviews passed"],
    executionEvidence: ["trace work recorded"],
    qualityGateEvidence: ["runtime trace registry initialized"],
    contextRefs: ["brief-1"]
  });
  await service.recordReview(run.id, "trace-runtime", reviewContext("reviewer").actor, {
    reviewerRole: "reviewer",
    state: "passed",
    severity: "low",
    findings: []
  });
  await service.recordReview(run.id, "trace-runtime", reviewContext("security_reviewer").actor, {
    reviewerRole: "security_reviewer",
    state: "passed",
    severity: "low",
    findings: []
  });
  await service.recordReview(run.id, "trace-runtime", reviewContext("qa_engineer").actor, {
    reviewerRole: "qa_engineer",
    state: "passed",
    severity: "low",
    findings: []
  });
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
        runtimeTraceCoverage: 1
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
      callsiteCount: 1,
      callsitesAnalyzed: 1,
      runtimeTraced: true,
      businessRules: ["risky runtime traces must be recorded before final verification"],
      evidenceRefs: ["src/core/service.ts:1"],
      verificationRefs: ["tests/service.test.ts"],
      lastUpdatedAt: new Date().toISOString()
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
    evidenceRefs: ["tests/service.test.ts"],
    updatedAt: new Date().toISOString()
  })));
  await service.recordProgressProof(run.id, {
    cycle: 1,
    proofId: "proof-1",
    phaseBefore: "validation",
    phaseAfter: "final_verification",
    evidenceRefs: ["src/core/service.ts:1"],
    coverageDelta: { validated: 1 },
    blockingGapDelta: { closed: 1, opened: 0 },
    nextTarget: "   ",
    whyNext: undefined,
    createdAt: new Date().toISOString()
  });
  await service.checkpointRun(run.id, {
    checkpointId: "cp-1",
    phase: "final_verification",
    activeTargets: [],
    recentEvidenceRefs: ["src/core/service.ts:1"],
    openGaps: [],
    nextActions: [],
    createdAt: new Date().toISOString()
  });
  const plan = await service.getExecutionPlan(run.id);

  assert.equal(plan.directive.kind, "trace_runtime");
  if (plan.directive.kind === "trace_runtime") {
    assert.deepEqual(plan.directive.targetIds, []);
    assert.deepEqual(plan.directive.gapIds, []);
    assert.deepEqual(plan.directive.nextActions, []);
    assert.ok(plan.directive.blockers.some((blocker) => blocker.includes("runtime trace")));
  }
});

test("getExecutionPlan returns checkpoint and executeDirectiveStep preserves the native checkpoint blocker", async () => {
  const { service, store } = createService();
  await seedHealthyRuntimeRegistration(store);
  const run = await service.intakeRequest({
    workspaceSlug: "team",
    projectSlug: "devgod",
    actor: "ceo",
    title: "Checkpoint evidence",
    request: "Do not complete until checkpoint and progress proof evidence exist."
  });

  await service.createTaskGraph(run.id, [
    taskPacket({
      taskId: "checkpoint-evidence",
      qualityGates: [
        "product_acceptance",
        "coverage_ledger_required",
        "progress_proof_required",
        "checkpoint_resume_required"
      ]
    })
  ]);
  await service.claimTask(run.id, "checkpoint-evidence", "planner");
  await service.submitHandoff(run.id, "checkpoint-evidence", {
    actor: "planner",
    ownerRole: "planner",
    completionStandard: "specialist_verified",
    summary: "coverage is complete but checkpoint evidence is missing",
    changedFiles: ["src/core/service.ts"],
    blockers: [],
    verificationNotes: ["all reviews passed"],
    executionEvidence: ["coverage threshold reached"],
    qualityGateEvidence: ["checkpoint/progress-proof gates still open"],
    contextRefs: ["brief-1"]
  });
  await service.recordReview(run.id, "checkpoint-evidence", reviewContext("reviewer").actor, {
    reviewerRole: "reviewer",
    state: "passed",
    severity: "low",
    findings: []
  });
  await service.recordReview(run.id, "checkpoint-evidence", reviewContext("security_reviewer").actor, {
    reviewerRole: "security_reviewer",
    state: "passed",
    severity: "low",
    findings: []
  });
  await service.recordReview(run.id, "checkpoint-evidence", reviewContext("qa_engineer").actor, {
    reviewerRole: "qa_engineer",
    state: "passed",
    severity: "low",
    findings: []
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
  await service.upsertCoverageItems(run.id, [
    {
      id: "service:checkpoint-ready",
      category: "services",
      state: "validated",
      criticality: "critical",
      sources: ["src/core/service.ts:1"],
      callsiteCount: 2,
      callsitesAnalyzed: 2,
      runtimeTraced: true,
      businessRules: ["checkpoint and progress proof evidence must exist before completion"],
      evidenceRefs: ["src/core/service.ts:1"],
      verificationRefs: ["tests/service.test.ts"],
      lastUpdatedAt: new Date().toISOString()
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
    evidenceRefs: ["tests/service.test.ts"],
    updatedAt: new Date().toISOString()
  })));
  await service.upsertRuntimeTraces(run.id, [
    {
      traceId: "trace:checkpoint-ready-side-effect",
      targetId: "service:checkpoint-ready",
      kind: "side_effect",
      risky: true,
      sideEffects: ["persists checkpoint evidence"],
      evidenceRefs: ["tests/service.test.ts"],
      createdAt: "2026-05-20T13:02:00.000Z"
    }
  ]);

  const plan = await service.getExecutionPlan(run.id);

  assert.equal(plan.directive.kind, "checkpoint");
  if (plan.directive.kind === "checkpoint") {
    assert.ok(plan.directive.blockers.some((blocker) => blocker.includes("progress proof")));
    assert.ok(plan.directive.blockers.some((blocker) => blocker.includes("checkpoint")));
  }

  const execution = await service.executeDirectiveStep(run.id);
  assert.equal(execution.initialPlan.directive.kind, "checkpoint");
  assert.equal(execution.steps[0]?.directiveKind, "checkpoint");
  assert.equal(execution.steps[0]?.outcome, "blocked");
});

test("getExecutionPlan returns dispatch_subagents when pending investigations remain queued", async () => {
  const { service } = createService();
  const run = await service.intakeRequest({
    workspaceSlug: "team",
    projectSlug: "devgod",
    actor: "ceo",
    title: "Dispatch queued investigations",
    request: "Surface bounded native subagent dispatch when investigation work remains queued."
  });

  await service.createTaskGraph(run.id, [
    taskPacket({
      taskId: "dispatch-investigations",
      qualityGates: ["product_acceptance", "coverage_ledger_required"]
    })
  ]);
  await service.claimTask(run.id, "dispatch-investigations", "planner");
  await service.submitHandoff(run.id, "dispatch-investigations", {
    actor: "planner",
    ownerRole: "planner",
    completionStandard: "specialist_verified",
    summary: "implementation is complete but investigation branches remain queued",
    changedFiles: ["src/core/service.ts"],
    blockers: [],
    verificationNotes: ["all reviews passed"],
    executionEvidence: ["runtime-native directive work recorded"],
    qualityGateEvidence: ["queued investigations preserved in runtime metadata"],
    contextRefs: ["brief-1"]
  });
  await service.recordReview(run.id, "dispatch-investigations", reviewContext("reviewer").actor, {
    reviewerRole: "reviewer",
    state: "passed",
    severity: "low",
    findings: []
  });
  await service.recordReview(run.id, "dispatch-investigations", reviewContext("security_reviewer").actor, {
    reviewerRole: "security_reviewer",
    state: "passed",
    severity: "low",
    findings: []
  });
  await service.recordReview(run.id, "dispatch-investigations", reviewContext("qa_engineer").actor, {
    reviewerRole: "qa_engineer",
    state: "passed",
    severity: "low",
    findings: []
  });
  await service.configureAutonomousExecution(run.id, {
    profile: "standard_delivery",
    phase: "discovery",
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
    },
    pendingInvestigations: [
      "map authz boundary before broader rewrite handoff",
      "inspect migration coupling for queued follow-through"
    ]
  });

  const plan = await service.getExecutionPlan(run.id);

  assert.equal(plan.directive.kind, "dispatch_subagents");
  if (plan.directive.kind === "dispatch_subagents") {
    assert.deepEqual(plan.directive.pendingInvestigations, [
      "map authz boundary before broader rewrite handoff",
      "inspect migration coupling for queued follow-through"
    ]);
    assert.ok(
      plan.directive.blockers.includes(
        "pending investigation: map authz boundary before broader rewrite handoff"
      )
    );
    assert.ok(
      plan.directive.nextActions.includes(
        "dispatch subagent investigation: inspect migration coupling for queued follow-through"
      )
    );
  }
});

test("getExecutionPlan returns replan_migration when migration sequencing falls back without a continuation target", async () => {
  const { service } = createService();
  const run = await service.intakeRequest({
    workspaceSlug: "team",
    projectSlug: "devgod",
    actor: "ceo",
    title: "Replan migration sequencing",
    request: "Require a runtime-backed replanning step when migration sequencing is blocked."
  });

  await service.createTaskGraph(run.id, [
    taskPacket({
      taskId: "replan-migration",
      qualityGates: ["product_acceptance", "coverage_ledger_required"]
    })
  ]);
  await service.claimTask(run.id, "replan-migration", "planner");
  await service.submitHandoff(run.id, "replan-migration", {
    actor: "planner",
    ownerRole: "planner",
    completionStandard: "specialist_verified",
    summary: "the current migration sequence is stale and needs replanning",
    changedFiles: ["src/core/service.ts"],
    blockers: [],
    verificationNotes: ["all reviews passed"],
    executionEvidence: ["migration sequencing analysis recorded"],
    qualityGateEvidence: ["runtime-native migration planning remains blocked"],
    contextRefs: ["brief-1"]
  });
  await service.recordReview(run.id, "replan-migration", reviewContext("reviewer").actor, {
    reviewerRole: "reviewer",
    state: "passed",
    severity: "low",
    findings: []
  });
  await service.recordReview(run.id, "replan-migration", reviewContext("security_reviewer").actor, {
    reviewerRole: "security_reviewer",
    state: "passed",
    severity: "low",
    findings: []
  });
  await service.recordReview(run.id, "replan-migration", reviewContext("qa_engineer").actor, {
    reviewerRole: "qa_engineer",
    state: "passed",
    severity: "low",
    findings: []
  });
  await service.configureAutonomousExecution(run.id, {
    profile: "standard_delivery",
    phase: "migration_sequencing",
    manifest: {
      runId: run.id,
      profile: "standard_delivery",
      requiredCategories: ["services"],
      thresholds: {
        criticalItemCoverage: 1,
        criticalItemValidation: 0,
        callsiteCoverage: 0,
        runtimeTraceCoverage: 0
      }
    }
  });

  const plan = await service.getExecutionPlan(run.id);

  assert.equal(plan.directive.kind, "replan_migration");
  if (plan.directive.kind === "replan_migration") {
    assert.equal(plan.directive.phase, "migration_sequencing");
    assert.equal(plan.directive.fallbackPhase, "modernization_strategy");
    assert.ok(
      plan.directive.blockers.some((blocker) =>
        blocker.includes("critical item coverage 0 is below threshold 1")
      )
    );
    assert.ok(plan.directive.nextActions.includes("replan toward modernization_strategy"));
  }
});

test("selectAutonomousNextTarget falls back to the latest progress proof when no blocking gap or checkpoint remains", () => {
  const target = selectAutonomousNextTarget({
    enabled: true,
    profile: "legacy_rewrite",
    phase: "validation",
    coverageItems: [],
    gaps: [],
    checkpoints: [],
    progressProofs: [
      {
        cycle: 3,
        proofId: "proof-3",
        phaseBefore: "validation",
        phaseAfter: "final_verification",
        evidenceRefs: ["src/core/service.ts:1"],
        coverageDelta: { validated: 1 },
        blockingGapDelta: { closed: 1, opened: 0 },
        nextTarget: "proof:target",
        whyNext: "proof guidance wins before checkpoint fallback",
        createdAt: "2026-05-15T12:05:00.000Z"
      }
    ],
    pendingInvestigations: [],
    executionEpoch: 1,
    updatedAt: "2026-05-15T12:05:00.000Z"
  });

  assert.equal(target?.source, "progress_proof");
  assert.equal(target?.targetId, "proof:target");
  assert.deepEqual(target?.actions, [
    {
      kind: "resume_target",
      targetId: "proof:target",
      source: "progress_proof",
      sourceId: "proof-3"
    }
  ]);
  assert.deepEqual(target?.nextActions, ["proof guidance wins before checkpoint fallback"]);
});

test("selectAutonomousNextTarget returns undefined when only checkpoint compaction evidence remains", () => {
  const target = selectAutonomousNextTarget({
    enabled: true,
    profile: "legacy_rewrite",
    phase: "validation",
    coverageItems: [],
    gaps: [],
    checkpoints: [
      {
        runId: "run-1",
        checkpointId: "cp-2",
        authorityLabel: "runtime_authoritative",
        phase: "validation",
        activeTargets: [],
        recentEvidenceRefs: ["src/core/service.ts:1"],
        openGaps: [],
        nextActions: ["resume the checkpoint target"],
        compressedContextRef: "memory://cp-2",
        createdAt: "2026-05-15T12:06:00.000Z"
      }
    ],
    progressProofs: [
      {
        cycle: 3,
        proofId: "proof-3",
        phaseBefore: "validation",
        phaseAfter: "validation",
        evidenceRefs: ["src/core/service.ts:1"],
        coverageDelta: { validated: 0 },
        blockingGapDelta: { closed: 0, opened: 0 },
        nextTarget: "   ",
        whyNext: undefined,
        createdAt: "2026-05-15T12:05:00.000Z"
      }
    ],
    pendingInvestigations: [],
    executionEpoch: 1,
    updatedAt: "2026-05-15T12:06:00.000Z"
  });

  assert.equal(target, undefined);
});

test("selectAutonomousNextTarget derives a self-referential progress-proof target when the explicit next target is blank", () => {
  const target = selectAutonomousNextTarget({
    enabled: true,
    profile: "legacy_rewrite",
    phase: "validation",
    coverageItems: [],
    gaps: [],
    checkpoints: [],
    progressProofs: [
      {
        cycle: 4,
        proofId: "proof-4",
        phaseBefore: "validation",
        phaseAfter: "regression_detection",
        evidenceRefs: ["src/core/service.ts:1"],
        coverageDelta: { validated: 1 },
        blockingGapDelta: { closed: 1, opened: 0 },
        nextTarget: "   ",
        whyNext: "resume from the proof checkpoint",
        createdAt: "2026-05-20T13:40:00.000Z"
      }
    ],
    pendingInvestigations: [],
    executionEpoch: 1,
    updatedAt: "2026-05-20T13:40:00.000Z"
  });

  assert.equal(target, undefined);
});

test("selectAutonomousNextTarget does not derive a self-referential checkpoint target when no active checkpoint target remains", () => {
  const target = selectAutonomousNextTarget({
    enabled: true,
    profile: "legacy_rewrite",
    phase: "validation",
    coverageItems: [],
    gaps: [],
    checkpoints: [
      {
        runId: "run-1",
        checkpointId: "cp-3",
        authorityLabel: "runtime_authoritative",
        phase: "validation",
        activeTargets: [],
        recentEvidenceRefs: ["src/core/service.ts:1"],
        openGaps: [],
        nextActions: ["resume generated checkpoint context"],
        compressedContextRef: "memory://checkpoint/cp-3/compressed-context",
        createdAt: "2026-05-20T13:41:00.000Z"
      }
    ],
    progressProofs: [],
    pendingInvestigations: [],
    executionEpoch: 1,
    updatedAt: "2026-05-20T13:41:00.000Z"
  });

  assert.equal(target, undefined);
});

test("selectAutonomousNextTarget ignores stale checkpoints from older execution epochs", () => {
  const state: AutonomousExecutionState = {
    enabled: true,
    profile: "standard_delivery" as const,
    phase: "validation" as const,
    manifest: {
      runId: "run-1",
      profile: "standard_delivery" as const,
      requiredCategories: ["services"],
      thresholds: {
        criticalItemCoverage: 0.8,
        criticalItemValidation: 0.6,
        callsiteCoverage: 0.85,
        runtimeTraceCoverage: 0.75
      }
    },
    coverageItems: [],
    gaps: [],
    checkpoints: [
      {
        runId: "run-1",
        checkpointId: "cp-stale",
        authorityLabel: "runtime_authoritative" as const,
        phase: "inventory" as const,
        executionEpoch: 1,
        activeTargets: ["checkpoint:stale"],
        recentEvidenceRefs: ["tests/service.test.ts"],
        openGaps: [],
        nextActions: ["resume stale checkpoint"],
        compressedContextRef: "memory://cp-stale",
        createdAt: "2026-05-20T12:00:00.000Z"
      }
    ],
    progressProofs: [],
    understandingMaps: [],
    runtimeTraces: [],
    pendingInvestigations: [],
    executionEpoch: 3,
    updatedAt: "2026-05-20T12:10:00.000Z"
  };

  assert.equal(isCheckpointStale(state, state.checkpoints[0]), true);
  assert.equal(selectAutonomousNextTarget(state), undefined);

  const snapshot = buildAutonomousExecutionSnapshot(state);
  assert.equal(snapshot.phaseReadiness.blockerKind, "stale_checkpoint");
  assert.equal(snapshot.phaseReadiness.staleCheckpoint, true);
  assert.ok(snapshot.comprehensionSummary?.missingUnderstandingKinds.includes("integration_map"));
  assert.ok(snapshot.comprehensionSummary?.missingUnderstandingKinds.includes("config_coupling"));
  assert.ok(snapshot.comprehensionSummary?.missingUnderstandingKinds.includes("runtime_side_effects"));
});

test("recordProgressProof advances the execution epoch and checkpointRun persists it", async () => {
  const { service } = createService();
  const run = await service.intakeRequest({
    workspaceSlug: "team",
    projectSlug: "devgod",
    actor: "ceo",
    title: "Checkpoint epochs",
    request: "Persist execution epochs across progress transitions."
  });

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

  const afterProof = await service.recordProgressProof(run.id, {
    cycle: 1,
    proofId: "proof-epoch-1",
    phaseBefore: "validation",
    phaseAfter: "regression_detection",
    evidenceRefs: ["tests/service.test.ts"],
    coverageDelta: { validated: 1 },
    blockingGapDelta: { closed: 1, opened: 0 },
    nextTarget: "task:regression-check",
    whyNext: "regression detection is the next phase",
    createdAt: "2026-05-20T12:15:00.000Z"
  });

  assert.equal(afterProof.executionEpoch, 2);

  const afterCheckpoint = await service.checkpointRun(run.id, {
    checkpointId: "cp-epoch-2",
    phase: "regression_detection",
    activeTargets: ["task:regression-check"],
    recentEvidenceRefs: ["tests/service.test.ts"],
    openGaps: [],
    nextActions: ["resume regression detection"],
    compressedContextRef: "memory://cp-epoch-2",
    createdAt: "2026-05-20T12:16:00.000Z"
  });

  assert.equal(afterCheckpoint.checkpoints.at(-1)?.executionEpoch, 2);
});

test("checkpointRun operationalizes compressed context artifacts when they are omitted", async () => {
  const { service } = createService();
  const run = await service.intakeRequest({
    workspaceSlug: "team",
    projectSlug: "devgod",
    actor: "ceo",
    title: "Checkpoint compaction",
    request: "Generate operational compressed context artifacts at checkpoint time."
  });

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

  const state = await service.checkpointRun(run.id, {
    checkpointId: "cp-generated",
    phase: "validation",
    activeTargets: [],
    recentEvidenceRefs: ["src/core/service.ts:1", "tests/service.test.ts"],
    openGaps: [],
    nextActions: ["resume generated checkpoint context"],
    createdAt: "2026-05-20T13:42:00.000Z"
  });

  const checkpoint = state.checkpoints.at(-1);
  assert.equal(checkpoint?.compressedContextRef, "memory://checkpoint/cp-generated/compressed-context");
  assert.deepEqual(checkpoint?.compressedContextSourceRefs, [
    "src/core/service.ts:1",
    "tests/service.test.ts"
  ]);
  assert.equal(checkpoint?.compressedContextGeneratedAt, "2026-05-20T13:42:00.000Z");
  assert.match(checkpoint?.compressedContextSummary ?? "", /validation/);
});

test("buildAutonomousExecutionSnapshot exposes fallback guidance for contradiction loops", () => {
  const snapshot = buildAutonomousExecutionSnapshot({
    enabled: true,
    profile: "legacy_rewrite",
    phase: "modernization_strategy",
    manifest: {
      runId: "run-1",
      profile: "legacy_rewrite",
      requiredCategories: ["services"],
      thresholds: {
        criticalItemCoverage: 0.8,
        criticalItemValidation: 0.6,
        callsiteCoverage: 0.85,
        runtimeTraceCoverage: 0.75,
        inventoryCompleteness: 1,
        businessRuleCoverage: 0.8,
        maxContradictionGapCount: 0,
        maxOpenBlockers: 0
      }
    },
    coverageItems: [
      {
        id: "service:rewrite-core",
        category: "services",
        state: "validated",
        criticality: "critical",
        sources: ["src/core/service.ts:1"],
        callsiteCount: 1,
        callsitesAnalyzed: 1,
        runtimeTraced: true,
        businessRules: ["preserve authenticated proof authority"],
        evidenceRefs: ["src/core/service.ts:1"],
        verificationRefs: ["tests/service.test.ts"],
        lastUpdatedAt: "2026-05-20T12:00:00.000Z"
      }
    ],
    gaps: [
      {
        id: "gap:contradiction",
        targetId: "service:rewrite-core",
        kind: "contradicting_evidence",
        severity: "critical",
        description: "runtime evidence still contradicts the extracted business rules",
        blocking: true,
        evidenceRefs: ["tests/service.test.ts"],
        createdBy: "qa_engineer",
        suggestedNextActions: ["reopen runtime tracing"],
        status: "open"
      }
    ],
    checkpoints: [],
    progressProofs: [],
    understandingMaps: [
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
      sourceRefs: ["docs/autonomous-execution-redesign.md"],
      evidenceRefs: ["tests/service.test.ts"],
      updatedAt: "2026-05-20T12:00:00.000Z"
    })),
    runtimeTraces: [
      {
        traceId: "trace:rewrite-core",
        targetId: "service:rewrite-core",
        kind: "side_effect",
        risky: true,
        sideEffects: ["records workflow proof state"],
        evidenceRefs: ["tests/service.test.ts"],
        createdAt: "2026-05-20T12:00:00.000Z"
      }
    ],
    pendingInvestigations: [],
    executionEpoch: 1,
    updatedAt: "2026-05-20T12:00:00.000Z"
  });

  assert.equal(snapshot.phaseReadiness.status, "blocked");
  assert.equal(snapshot.phaseReadiness.blockerKind, "contradiction_loop");
  assert.equal(snapshot.phaseReadiness.transition, "fallback");
  assert.equal(snapshot.phaseReadiness.fallbackPhase, "runtime_tracing");
});

test("recordProgressProof rejects narrative-only progress proofs with no measurable delta", async () => {
  const { service } = createService();
  const run = await service.intakeRequest({
    workspaceSlug: "team",
    projectSlug: "devgod",
    actor: "ceo",
    title: "Progress proof validation",
    request: "Reject shallow progress proofs."
  });

  await assert.rejects(
    service.recordProgressProof(run.id, {
      cycle: 1,
      proofId: "proof-invalid",
      phaseBefore: "validation",
      phaseAfter: "validation",
      evidenceRefs: ["src/core/service.ts:1"],
      coverageDelta: { validated: 0 },
      blockingGapDelta: { closed: 0, opened: 0 },
      nextTarget: "task:rewrite",
      whyNext: "narrative only",
      createdAt: new Date().toISOString()
    }),
    /measurable delta/i
  );
});

test("getExecutionPlan returns complete once autonomous execution evidence satisfies the gates", async () => {
  const { service } = createService();
  const run = await service.intakeRequest({
    workspaceSlug: "team",
    projectSlug: "devgod",
    actor: "ceo",
    title: "Rewrite readiness",
    request: "Allow completion only after the autonomous proof stack is in place."
  });

  await service.createTaskGraph(run.id, [
    taskPacket({
      taskId: "rewrite",
      qualityGates: [
        "product_acceptance",
        "coverage_ledger_required",
        "progress_proof_required",
        "checkpoint_resume_required",
        "memory_compaction_required"
      ]
    })
  ]);
  await service.claimTask(run.id, "rewrite", "planner");
  await service.submitHandoff(run.id, "rewrite", {
    actor: "planner",
    ownerRole: "planner",
    completionStandard: "specialist_verified",
    summary: "ready for review",
    changedFiles: [".devgod/work/tasks/task-rewrite.md"],
    blockers: [],
    verificationNotes: ["all reviews passed"],
    executionEvidence: ["planner handoff recorded"],
    qualityGateEvidence: ["autonomous execution artifacts recorded"],
    contextRefs: ["brief-1"]
  });
  await service.recordReview(run.id, "rewrite", reviewContext("reviewer").actor, {
    reviewerRole: "reviewer",
    state: "passed",
    severity: "low",
    findings: []
  });
  await service.recordReview(run.id, "rewrite", reviewContext("security_reviewer").actor, {
    reviewerRole: "security_reviewer",
    state: "passed",
    severity: "low",
    findings: []
  });
  await service.recordReview(run.id, "rewrite", reviewContext("qa_engineer").actor, {
    reviewerRole: "qa_engineer",
    state: "passed",
    severity: "low",
    findings: []
  });
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
      callsiteCount: 4,
      callsitesAnalyzed: 4,
      runtimeTraced: true,
      businessRules: ["workflow proof completion remains gated by authenticated reviews"],
      evidenceRefs: ["src/core/service.ts:1"],
      verificationRefs: ["tests/service.test.ts"],
      lastUpdatedAt: new Date().toISOString()
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
    evidenceRefs: ["tests/service.test.ts"],
    updatedAt: new Date().toISOString()
  })));
  await service.upsertRuntimeTraces(run.id, [
    {
      traceId: "trace:workflow-proof-complete",
      targetId: "service:workflow-proof",
      kind: "side_effect",
      risky: true,
      sideEffects: ["approves runtime workflow proof"],
      evidenceRefs: ["tests/service.test.ts"],
      createdAt: new Date().toISOString()
    }
  ]);
  await service.recordProgressProof(run.id, {
    cycle: 1,
    proofId: "proof-1",
    phaseBefore: "validation",
    phaseAfter: "final_verification",
    evidenceRefs: ["src/core/service.ts:1"],
    coverageDelta: { validated: 1 },
    blockingGapDelta: { closed: 2, opened: 0 },
    nextTarget: "review:authenticated",
    whyNext: "all required autonomous gates are satisfied",
    createdAt: new Date().toISOString()
  });
  await service.checkpointRun(run.id, {
    checkpointId: "cp-1",
    phase: "final_verification",
    activeTargets: ["review:authenticated"],
    recentEvidenceRefs: ["src/core/service.ts:1"],
    openGaps: [],
    nextActions: ["run workflow proof"],
    compressedContextRef: "memory://cp-1",
    createdAt: new Date().toISOString()
  });

  const plan = await service.getExecutionPlan(run.id);

  assert.equal(plan.directive.kind, "complete");
  assert.ok(plan.autonomousExecution);
  assert.equal(plan.autonomousExecution?.comprehensionSummary?.rewriteReadiness, "ready");
  assert.equal(plan.autonomousExecution?.phaseReadiness.status, "ready");
});

test("getExecutionPlan returns blocked when work is already in progress", async () => {
  const { service } = createService();
  const run = await service.intakeRequest({
    workspaceSlug: "team",
    projectSlug: "devgod",
    actor: "ceo",
    title: "Build core",
    request: "Ship the shared orchestration backend."
  });

  await service.createTaskGraph(run.id, [taskPacket({ taskId: "plan" })]);
  await service.claimTask(run.id, "plan", "planner");

  const plan = await service.getExecutionPlan(run.id);

  assert.equal(plan.directive.kind, "blocked");
  if (plan.directive.kind === "blocked") {
    assert.ok(plan.directive.blockers.some((blocker) => blocker.includes("already claimed by planner")));
  }
});

test("getRuntimeTraceRegistry summarizes risky traces and missing risky targets", async () => {
  const { service } = createService();
  const run = await service.intakeRequest({
    workspaceSlug: "team",
    projectSlug: "devgod",
    actor: "ceo",
    title: "Runtime trace registry",
    request: "Make risky trace evidence inspectable."
  });

  await service.createTaskGraph(run.id, [
    taskPacket({
      taskId: "trace-registry",
      qualityGates: ["product_acceptance", "coverage_ledger_required"]
    })
  ]);
  await service.configureAutonomousExecution(run.id, {
    profile: "legacy_rewrite",
    phase: "runtime_tracing",
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
      verificationRefs: ["tests/service.test.ts"],
      lastUpdatedAt: isoHoursAgo(2)
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
      verificationRefs: ["tests/service.test.ts"],
      lastUpdatedAt: isoHoursAgo(2)
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
      verificationRefs: ["tests/service.test.ts"],
      lastUpdatedAt: isoHoursAgo(2)
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
      evidenceRefs: ["tests/service.test.ts"],
      createdBy: "qa_engineer",
      suggestedNextActions: ["record core loop runtime trace"],
      status: "open"
    },
    {
      id: "gap:payments-trace",
      targetId: "integration:payments",
      kind: "missing_runtime_trace",
      severity: "high",
      description: "Payment integration still lacks a risky runtime trace.",
      blocking: true,
      evidenceRefs: ["tests/service.test.ts"],
      createdBy: "qa_engineer",
      suggestedNextActions: ["record payment runtime trace"],
      status: "open"
    }
  ]);
  await service.captureRuntimeTrace(run.id, {
    traceId: "trace:workflow-proof-auth",
    targetId: "service:workflow-proof",
    kind: "auth",
    risky: false,
    sideEffects: [],
    evidenceRefs: ["tests/service.test.ts"],
    createdAt: isoHoursAgo(2)
  });
  await service.captureRuntimeTrace(run.id, {
    traceId: "trace:workflow-proof-side-effect",
    targetId: "service:workflow-proof",
    kind: "side_effect",
    risky: true,
    sideEffects: ["records workflow proof completion"],
    evidenceRefs: ["tests/service.test.ts"],
    createdAt: isoHoursAgo(1)
  });
  await service.importRuntimeTrace(run.id, {
    traceId: "trace:payments-import",
    targetId: "integration:payments",
    kind: "integration",
    risky: true,
    sideEffects: ["submits a payment provider charge"],
    evidenceRefs: ["tests/service.test.ts"],
    createdAt: isoHoursAgo(49)
  });

  const registry = await service.getRuntimeTraceRegistry(run.id);
  const snapshot = await service.getStatus(run.id);
  const paymentsGap = snapshot.autonomousExecution?.state.gaps.find((gap) => gap.id === "gap:payments-trace");
  const paymentsItem = snapshot.autonomousExecution?.state.coverageItems.find(
    (item) => item.id === "integration:payments"
  );

  assert.equal(registry.totalTraces, 3);
  assert.equal(registry.riskyTraceCount, 2);
  assert.equal(registry.tracedTargetCount, 2);
  assert.deepEqual(registry.riskyTargetsMissingTrace, ["service:core-loop"]);
  assert.deepEqual(registry.openMissingTraceGapIds, ["gap:core-loop-trace"]);
  assert.deepEqual(registry.operatorImportTargetIds, ["integration:payments"]);
  assert.deepEqual(registry.targets.map((target) => target.targetId), [
    "integration:payments",
    "service:workflow-proof"
  ]);
  assert.equal(registry.targets[0]?.latestAuthorityLabel, "operator_import");
  assert.deepEqual(registry.targets[0]?.authorityLabels, ["operator_import"]);
  assert.equal(registry.targets[0]?.freshness, "stale");
  assert.equal(registry.targets[1]?.latestAuthorityLabel, "runtime_capture");
  assert.deepEqual(registry.targets[1]?.authorityLabels, ["runtime_capture"]);
  assert.equal(registry.targets[1]?.freshness, "fresh");
  assert.equal(paymentsGap?.status, "closed");
  assert.equal(paymentsItem?.runtimeTraced, true);
});

test("upsertExternalEvals and upsertSensitiveActionControls persist explicit runtime evidence", async () => {
  const { service } = createService();
  const run = await service.intakeRequest({
    workspaceSlug: "team",
    projectSlug: "devgod",
    actor: "ceo",
    title: "External eval evidence",
    request: "Persist external eval and sensitive-action controls."
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
      evalId: "eval:swe-bench",
      label: "SWE-bench verified sample",
      scope: "semi_external",
      harness: "swe_bench_verified",
      artifactRef: "https://www.swebench.com/verified.html",
      evidenceRefs: ["tests/service.test.ts"],
      createdAt: "2026-05-20T14:00:00.000Z"
    }
  ]);
  await service.upsertSensitiveActionControls(run.id, [
    {
      controlId: "control:workflow-proof-auth",
      actionType: "workflow_proof",
      enforcement: "authenticated_runtime",
      summary: "workflow proof remains gated on authenticated runtime review evidence",
      evidenceRefs: ["tests/service.test.ts"],
      createdAt: "2026-05-20T14:01:00.000Z"
    }
  ]);

  const status = await service.getStatus(run.id);

  assert.equal(status.autonomousExecution?.state.externalEvals?.[0]?.scope, "semi_external");
  assert.equal(
    status.autonomousExecution?.state.sensitiveActionControls?.[0]?.enforcement,
    "authenticated_runtime"
  );
});

test("upsertDuplicateFamilies persists centralization candidates and parity requirements", async () => {
  const { service } = createService();
  const run = await service.intakeRequest({
    workspaceSlug: "team",
    projectSlug: "devgod",
    actor: "ceo",
    title: "Duplicate family evidence",
    request: "Persist duplicate-family centralization evidence."
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
      familyId: "duplicate:access-policy",
      capability: "access policy enforcement",
      members: [
        { itemId: "service:access-policy", kind: "shared_core", role: "backend policy service" },
        { itemId: "route:access-policy", kind: "accidental_divergence", role: "route-level override" }
      ],
      sharedAbstraction: "AccessPolicyEngine",
      intentionalVariants: [],
      accidentalDivergences: ["route layer skips one audit branch"],
      centralizationCandidate: "move route policy checks behind AccessPolicyEngine",
      parityRequirements: ["prove route and service checks deny identical unauthorized requests"],
      evidenceRefs: ["tests/service.test.ts"],
      verificationRefs: ["tests/service.test.ts"],
      lastUpdatedAt: "2026-05-21T11:15:00.000Z"
    }
  ]);

  const status = await service.getStatus(run.id);

  assert.equal(status.autonomousExecution?.state.duplicateFamilies?.length, 1);
  assert.equal(status.autonomousExecution?.comprehensionSummary?.duplicateFamilyCount, 1);
  assert.equal(status.autonomousExecution?.comprehensionSummary?.centralizationCandidateCount, 1);
  assert.deepEqual(status.autonomousExecution?.state.duplicateFamilies?.[0]?.parityRequirements, [
    "prove route and service checks deny identical unauthorized requests"
  ]);
});

test("upsertArchitectureAndMigrationEvidence persists decisions ledgers and parity requirements", async () => {
  const { service } = createService();
  const run = await service.intakeRequest({
    workspaceSlug: "team",
    projectSlug: "devgod",
    actor: "ceo",
    title: "Architecture and migration evidence",
    request: "Persist architecture-fit, migration-ledger, and parity evidence."
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
      evidenceRefs: ["tests/service.test.ts"],
      verificationRefs: ["tests/service.test.ts"],
      lastUpdatedAt: "2026-05-21T11:40:00.000Z"
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
      evidenceRefs: ["tests/service.test.ts"],
      verificationRefs: ["tests/service.test.ts"],
      lastUpdatedAt: "2026-05-21T11:41:00.000Z"
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
      evidenceRefs: ["tests/service.test.ts"],
      verificationRefs: ["tests/service.test.ts"],
      lastUpdatedAt: "2026-05-21T11:42:00.000Z"
    }
  ]);

  const status = await service.getStatus(run.id);

  assert.equal(status.autonomousExecution?.state.architectureDecisions?.length, 1);
  assert.equal(status.autonomousExecution?.state.migrationLedger?.length, 1);
  assert.equal(status.autonomousExecution?.state.parityMatrix?.length, 1);
  assert.equal(status.autonomousExecution?.comprehensionSummary?.architectureDecisionCount, 1);
  assert.equal(status.autonomousExecution?.comprehensionSummary?.migrationLedgerCount, 1);
  assert.equal(status.autonomousExecution?.comprehensionSummary?.parityRequirementCount, 1);
});

test("searchMemory can retrieve runtime workflow documents generated by intake and planning", async () => {
  const { service } = createService();
  const run = await service.intakeRequest({
    workspaceSlug: "team",
    projectSlug: "devgod",
    actor: "ceo",
    title: "Ship operator dashboard",
    request: "Build the runtime-only operator dashboard."
  });

  await service.createPlan({
    runId: run.id,
    title: "Operator dashboard plan",
    summary: "Keep workflow ownership in runtime state.",
    milestones: ["define runtime state", "wire command surfaces"],
    decisions: ["remove file authority"],
    residualRisks: ["installer still references legacy files"],
    acceptanceCriteria: ["runtime docs are searchable"]
  });

  const results = await service.searchMemory({
    workspaceSlug: "team",
    projectSlug: "devgod",
    query: "runtime-only operator dashboard"
  });

  assert.ok(results.some((result) => result.authority.source === "runtime_document"));
  assert.ok(
    results.some(
      (result) =>
        result.authority.source === "runtime_document" &&
        result.citation.kind === "workflow_document" &&
        result.title.includes("Operator dashboard plan")
    )
  );
});
