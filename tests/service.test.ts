import test from "node:test";
import assert from "node:assert/strict";
import { SEARCH_MEMORY_STALE_AFTER_DAYS } from "../src/core/policy.ts";
import {
  createReviewActionContextResolver,
  type AuthenticatedPrincipal,
  type ReviewIdentityBindings
} from "../src/core/review-context.ts";
import { DevgodCoreService } from "../src/core/service.ts";
import { selectAutonomousNextTarget } from "../src/runtime/autonomous-execution.ts";
import type {
  MemoryEntryRecord,
  ReasoningQualityBlock,
  ReviewActionContext,
  ReviewRecord,
  TaskPacketInput
} from "../src/domain/types.ts";
import { MemoryStore } from "../src/store/memory-store.ts";

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
      evidenceRefs: ["src/core/service.ts:1"],
      verificationRefs: ["tests/service.test.ts"],
      lastUpdatedAt: new Date().toISOString()
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
  assert.equal(status.autonomousExecution?.phaseReadiness.status, "ready");
});

test("getExecutionPlan blocks terminal tasks when autonomous execution evidence is missing", async () => {
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

  assert.equal(plan.directive.kind, "blocked");
  if (plan.directive.kind === "blocked") {
    assert.ok(plan.directive.blockers.some((blocker) => blocker.includes("coverage manifest")));
    assert.ok(plan.directive.blockers.some((blocker) => blocker.includes("progress proof")));
    assert.ok(plan.directive.blockers.some((blocker) => blocker.includes("checkpoint")));
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
    assert.deepEqual(plan.directive.nextActions, ["run workflow-proof after authenticated reviews"]);
    assert.ok(plan.directive.blockers.some((blocker) => blocker.includes("blocking gaps remain open")));
  }
});

test("selectAutonomousNextTarget falls back to the latest progress proof when no blocking gap remains", () => {
  const target = selectAutonomousNextTarget({
    enabled: true,
    profile: "legacy_rewrite",
    phase: "validation",
    coverageItems: [],
    gaps: [],
    checkpoints: [
      {
        runId: "run-1",
        checkpointId: "cp-1",
        authorityLabel: "runtime_authoritative",
        phase: "validation",
        activeTargets: ["checkpoint:target"],
        recentEvidenceRefs: ["src/core/service.ts:1"],
        openGaps: [],
        nextActions: ["resume from checkpoint"],
        compressedContextRef: "memory://cp-1",
        createdAt: "2026-05-15T12:00:00.000Z"
      }
    ],
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
  assert.deepEqual(target?.nextActions, ["proof guidance wins before checkpoint fallback"]);
});

test("selectAutonomousNextTarget falls back to the latest checkpoint when no blocking gap or proof target remains", () => {
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
        activeTargets: ["checkpoint:target"],
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

  assert.equal(target?.source, "checkpoint");
  assert.equal(target?.targetId, "checkpoint:target");
  assert.deepEqual(target?.nextActions, ["resume the checkpoint target"]);
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
      evidenceRefs: ["src/core/service.ts:1"],
      verificationRefs: ["tests/service.test.ts"],
      lastUpdatedAt: new Date().toISOString()
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
