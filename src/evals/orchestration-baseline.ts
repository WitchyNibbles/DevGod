import process from "node:process";
import { fileURLToPath } from "node:url";
import { createReviewActionContextResolver, type AuthenticatedPrincipal, type ReviewIdentityBindings } from "../core/review-context.ts";
import { DevgodCoreService } from "../core/service.ts";
import type { ReviewActionContext, ReviewRecord, TaskPacketInput } from "../domain/types.ts";
import { MemoryStore } from "../store/memory-store.ts";

type OrchestrationEvalArea = "gate" | "lifecycle" | "state" | "trust";
type EvalAuthorityLabel = "derived_only";

export interface OrchestrationEvalCaseResult {
  id: string;
  area: OrchestrationEvalArea;
  passed: boolean;
  score: number;
  threshold: number;
  authorityLabel: EvalAuthorityLabel;
  details: string;
}

export interface OrchestrationEvalSummary {
  totalCases: number;
  passedCases: number;
  failedCases: number;
  passRate: number;
  requiredPassRate: number;
  meetsThreshold: boolean;
  authorityLabel: EvalAuthorityLabel;
}

export interface OrchestrationEvalReport {
  cases: OrchestrationEvalCaseResult[];
  summary: OrchestrationEvalSummary;
}

const orchestrationRequiredPassRate = 1;

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
        label: "orchestration baseline default reasoning",
        hypothesis: "the baseline task packet should remain executable under strict defaults",
        alternatives: ["downgrade mode explicitly for compatibility-only cases"],
        evidenceRefs: ["src/evals/orchestration-baseline.ts"],
        verificationRefs: ["verification-1"],
        traceRef: "eval://orchestration-baseline/task-packet",
        outcome: "supported",
        summary: "default baseline fixture includes strict reasoning evidence"
      }
    ],
    reasoningVerifications: overrides.reasoningVerifications ?? [
      {
        id: "verification-1",
        kind: "critic_review",
        ref: "eval://orchestration-baseline/task-packet",
        status: "passed",
        summary: "default baseline fixture includes critic verification"
      }
    ],
    reasoningVerdict: overrides.reasoningVerdict ?? {
      status: "supported",
      summary: "default baseline fixture is strict-complete",
      supportingAttemptIds: ["attempt-1"],
      blockingIssues: []
    },
    reasoningQuality: overrides.reasoningQuality ?? {
      claim: "the baseline fixture has enough evidence to exercise routing behavior",
      facts: ["the orchestration baseline is under test"],
      assumptions: ["task packet scope remains bounded"],
      hypotheses: ["strict-complete packets should keep the lifecycle cases green"],
      evidenceRefs: ["src/evals/orchestration-baseline.ts"],
      counterEvidence: [],
      openQuestions: [],
      verificationPlan: ["npm test"],
      fallbacks: ["make compatibility mode explicit in eval cases when needed"],
      budgets: { researchSteps: 1, debugSteps: 1, reviewPasses: 1, toolRetries: 1 },
      confidence: "medium",
      decision: "supported"
    }
  };
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
      return normalized;
    case "tdd_guide":
      return "tdd-guide";
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

function createEvalService(overrides: {
  bindings?: ReviewIdentityBindings | undefined;
  principals?: Record<string, AuthenticatedPrincipal> | undefined;
  withResolver?: boolean | undefined;
} = {}) {
  const registeredContexts = new Map<string, ReviewActionContext>();
  const registeredPrincipals = new Map<string, AuthenticatedPrincipal>();
  const bindings: ReviewIdentityBindings = overrides.bindings ?? { bindings: [] };
  const store = new MemoryStore();

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

  const service = new DevgodCoreService(
    store,
    overrides.withResolver === false
      ? {}
      : {
          resolveReviewActionContext: createReviewActionContextResolver({
            bindings,
            resolveAuthenticatedPrincipal(input) {
              const principal = overrides.principals?.[input.actor] ??
                registeredPrincipals.get(input.actor) ?? {
                  provider: "test",
                  subject: input.actor,
                  verified: true
                };
              const context = registeredContexts.get(input.actor) ?? {
                actor: input.actor,
                actorRole: deriveActorRole(input.actor),
                waiverAuthority: "none" as const
              };
              upsertBinding(input.actor, context, principal);
              return principal;
            }
          })
        }
  );

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
    ) {
      registeredContexts.set(context.actor, context);
      registeredPrincipals.set(context.actor, principal);
      upsertBinding(context.actor, context, principal);
      return context.actor;
    }
  };
}

function mutateReviewWhere(
  store: MemoryStore,
  predicate: (review: ReviewRecord) => boolean,
  mutate: (review: ReviewRecord) => ReviewRecord
): void {
  const reviews = (store as unknown as { reviews: Map<string, ReviewRecord> }).reviews;
  const entry = [...reviews.entries()].find(([, review]) => predicate(review));

  if (!entry) {
    throw new Error("expected matching review");
  }

  const [reviewId, review] = entry;
  reviews.set(reviewId, mutate(review));
}

async function seedInProgressTask(service: DevgodCoreService, packet: TaskPacketInput) {
  const run = await service.intakeRequest({
    workspaceSlug: "team",
    projectSlug: "devgod",
    actor: "ceo",
    title: "Build core",
    request: "Ship the shared orchestration backend."
  });

  await service.createTaskGraph(run.id, [packet]);
  await service.claimTask(run.id, packet.taskId, "planner");

  return { run };
}

async function submitReadyForReview(service: DevgodCoreService, runId: string, taskId: string) {
  await service.submitHandoff(runId, taskId, {
    actor: "planner",
    ownerRole: "planner",
    completionStandard: "specialist_verified",
    summary: "ready for review",
    changedFiles: ["src/core/service.ts"],
    blockers: [],
    verificationNotes: ["npm test"],
    executionEvidence: ["planner-owned handoff recorded"],
    qualityGateEvidence: ["product acceptance captured in intake artifacts"],
    contextRefs: ["brief-1"]
  });
}

function buildResult(input: Omit<OrchestrationEvalCaseResult, "authorityLabel" | "score" | "threshold"> & {
  score?: number;
  threshold?: number;
}): OrchestrationEvalCaseResult {
  const score = input.score ?? (input.passed ? 1 : 0);
  const threshold = input.threshold ?? 1;

  return {
    ...input,
    score,
    threshold,
    authorityLabel: "derived_only"
  };
}

export async function runOrchestrationBaseline(): Promise<OrchestrationEvalReport> {
  const cases: OrchestrationEvalCaseResult[] = [];

  {
    const { service } = createEvalService();
    const run = await service.intakeRequest({
      workspaceSlug: "team",
      projectSlug: "devgod",
      actor: "ceo",
      title: "Build core",
      request: "Ship the shared orchestration backend."
    });

    let message = "invalid task graph accepted";
    try {
      await service.createTaskGraph(run.id, [
        taskPacket({
          taskId: "invalid-task",
          requiredReviews: ["reviewer", "security_reviewer"]
        })
      ]);
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }

    cases.push(
      buildResult({
        id: "task_packet_contract_rejected",
        area: "gate",
        passed: message.includes("missing required review gate: qa_engineer"),
        details: message
      })
    );
  }

  {
    const { service } = createEvalService();
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

    const initialStatus = await service.resumeRun(run.id);
    await service.claimTask(run.id, "plan", "planner");
    await submitReadyForReview(service, run.id, "plan");
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
    const finalStatus = await service.resumeRun(run.id);

    cases.push(
      buildResult({
        id: "dependency_ready_set_progresses",
        area: "lifecycle",
        passed:
          initialStatus.nextTaskIds.length === 1 &&
          initialStatus.nextTaskIds[0] === "plan" &&
          finalStatus.nextTaskIds.includes("build"),
        details: `initial=${initialStatus.nextTaskIds.join(",")} final=${finalStatus.nextTaskIds.join(",")}`
      })
    );

    const routingReport = await service.recommendRouting(run.id);
    const ownerRecommendation = routingReport.recommendations.find((entry) => entry.taskId === "build");
    cases.push(
      buildResult({
        id: "routing_advisory_owner_dispatch",
        area: "lifecycle",
        passed:
          routingReport.mode === "advisory_only" &&
          ownerRecommendation?.recommendation === "owner_dispatch" &&
          ownerRecommendation.targetRole === "backend_engineer",
        details: `mode=${routingReport.mode} route=${ownerRecommendation?.recommendation ?? "none"} target=${ownerRecommendation?.targetRole ?? "none"}`
      })
    );
  }

  {
    const { service } = createEvalService();
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
    let message = "second claim unexpectedly succeeded";
    try {
      await service.claimTask(run.id, "task-2", "backend_engineer");
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }

    cases.push(
      buildResult({
        id: "overlapping_write_scope_locked",
        area: "state",
        passed: message.includes("write scope locked"),
        details: message
      })
    );
  }

  {
    const { service } = createEvalService();
    const { run } = await seedInProgressTask(service, taskPacket());
    await submitReadyForReview(service, run.id, "task-1");

    const reviewResult = await service.recordReview(run.id, "task-1", reviewContext("reviewer").actor, {
      reviewerRole: "reviewer",
      state: "passed",
      severity: "low",
      findings: []
    });

    cases.push(
      buildResult({
        id: "partial_reviews_keep_task_blocked",
        area: "gate",
        passed:
          reviewResult.task.status === "review_blocked" &&
          reviewResult.blockers.some((blocker) => blocker.includes("missing required review: security_reviewer")) &&
          reviewResult.blockers.some((blocker) => blocker.includes("missing required review: qa_engineer")),
        details: `status=${reviewResult.task.status} blockers=${reviewResult.blockers.join(" | ")}`
      })
    );
  }

  {
    const { service, store } = createEvalService();
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
    await submitReadyForReview(service, run.id, "plan");
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
      (review) => review.runId === run.id && review.taskId === "plan" && review.reviewerRole === "qa_engineer",
      (review) => ({
        ...review,
        identityAssurance: "legacy_backfill"
      })
    );

    const status = await service.resumeRun(run.id);
    const blockingLine = status.blockers.find((blocker) => blocker.includes("dependency plan has stale approval"));

    cases.push(
      buildResult({
        id: "stale_approved_dependency_reblocked",
        area: "gate",
        passed: status.nextTaskIds.length === 0 && blockingLine !== undefined,
        details: `next=${status.nextTaskIds.join(",")} blocker=${blockingLine ?? "none"}`
      })
    );
  }

  {
    const { service } = createEvalService({ withResolver: false });
    const { run } = await seedInProgressTask(service, taskPacket());
    await submitReadyForReview(service, run.id, "task-1");

    let message = "spoofed review unexpectedly accepted";
    try {
      await service.recordReview(run.id, "task-1", "security-reviewer-1", {
        reviewerRole: "security_reviewer",
        state: "passed",
        severity: "low",
        findings: []
      });
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }

    cases.push(
      buildResult({
        id: "caller_asserted_review_authority_rejected",
        area: "trust",
        passed: message.includes("trusted review action context resolver"),
        details: message
      })
    );
  }

  {
    const bindings: ReviewIdentityBindings = {
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
    };
    const store = new MemoryStore();
    const service = new DevgodCoreService(store, {
      resolveReviewActionContext: createReviewActionContextResolver({
        bindings,
        resolveAuthenticatedPrincipal() {
          return {
            provider: "github",
            subject: "mallory",
            verified: true
          };
        }
      })
    });
    const { run } = await seedInProgressTask(service, taskPacket());
    await submitReadyForReview(service, run.id, "task-1");

    let message = "unbound principal unexpectedly accepted";
    try {
      await service.recordReview(run.id, "task-1", "alice-reviewer", {
        reviewerRole: "reviewer",
        state: "passed",
        severity: "low",
        findings: []
      });
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }

    cases.push(
      buildResult({
        id: "unbound_principal_rejected",
        area: "trust",
        passed: message.includes("No review identity binding for github:mallory"),
        details: message
      })
    );
  }

  const passedCases = cases.filter((testCase) => testCase.passed).length;
  const totalCases = cases.length;
  const failedCases = totalCases - passedCases;
  const passRate = totalCases === 0 ? 0 : passedCases / totalCases;

  return {
    cases,
    summary: {
      totalCases,
      passedCases,
      failedCases,
      passRate,
      requiredPassRate: orchestrationRequiredPassRate,
      meetsThreshold: passRate >= orchestrationRequiredPassRate,
      authorityLabel: "derived_only"
    }
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  runOrchestrationBaseline()
    .then((report) => {
      console.log(JSON.stringify(report));
      if (!report.summary.meetsThreshold) {
        process.exitCode = 1;
      }
    })
    .catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      console.error(message);
      process.exitCode = 1;
    });
}
