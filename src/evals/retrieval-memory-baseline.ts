import { DevgodCoreService } from "../core/service.ts";
import { MemoryStore } from "../store/memory-store.ts";

export interface RetrievalEvalCaseResult {
  id: string;
  goal: "recall_precision" | "provenance" | "redaction" | "freshness";
  passed: boolean;
  details: string;
}

export interface RetrievalEvalSummary {
  totalCases: number;
  passedCases: number;
  failedCases: number;
  passRate: number;
}

export interface RetrievalEvalReport {
  cases: RetrievalEvalCaseResult[];
  summary: RetrievalEvalSummary;
}

export async function runRetrievalMemoryBaseline(): Promise<RetrievalEvalReport> {
  const cases: RetrievalEvalCaseResult[] = [];
  const service = new DevgodCoreService(new MemoryStore());

  const projectRun = await service.intakeRequest({
    workspaceSlug: "team",
    projectSlug: "devgod",
    actor: "ceo",
    title: "Build core",
    request: "Ship the shared orchestration backend."
  });

  await service.promoteMemory(projectRun.id, {
    scope: "project",
    entryType: "decision",
    title: "Incident playbook",
    content: "release recoveries and rollback notes",
    sourceRunId: projectRun.id,
    sourceTaskId: "task-incident",
    reviewer: "memory_curator",
    actor: "memory_curator"
  });

  await service.promoteMemory(projectRun.id, {
    scope: "global",
    entryType: "pattern",
    title: "Global onboarding",
    content: "shared onboarding blueprint",
    sourceRunId: projectRun.id,
    sourceTaskId: "task-global",
    reviewer: "memory_curator@example.com",
    actor: "memory_curator@example.com"
  });

  const recallResults = await service.searchMemory({
    workspaceSlug: "team",
    projectSlug: "devgod",
    query: "incident playbook"
  });
  const recallTop = recallResults[0];
  cases.push({
    id: "project_recall_precision",
    goal: "recall_precision",
    passed: recallTop?.title === "Incident playbook",
    details: `top=${recallTop?.title ?? "none"}`
  });

  cases.push({
    id: "project_provenance_present",
    goal: "provenance",
    passed:
      recallTop?.authority.reviewedBy === "memory_curator" &&
      recallTop?.citation.runId === projectRun.id &&
      recallTop?.provenance.taskId === "task-incident",
    details: `reviewedBy=${recallTop?.authority.reviewedBy ?? "none"} taskId=${recallTop?.provenance.taskId ?? "none"}`
  });

  const redactionResults = await service.searchMemory({
    workspaceSlug: "team",
    projectSlug: "devgod",
    query: "shared onboarding",
    includeGlobal: true
  });
  const redactionTop = redactionResults.find((result) => result.scope === "global");
  cases.push({
    id: "global_redaction",
    goal: "redaction",
    passed:
      redactionTop?.scope === "global" &&
      redactionTop.authority.reviewedBy === undefined &&
      redactionTop.citation.runId === undefined &&
      redactionTop.provenance.actor === undefined,
    details: `scope=${redactionTop?.scope ?? "none"} reviewedBy=${redactionTop?.authority.reviewedBy ?? "redacted"}`
  });

  const freshnessResults = await service.searchMemory({
    workspaceSlug: "team",
    projectSlug: "devgod",
    query: "incident playbook"
  });
  const freshnessResult = freshnessResults[0];
  cases.push({
    id: "freshness_age_days",
    goal: "freshness",
    passed:
      freshnessResult?.freshness.createdAt === freshnessResult?.provenance.createdAt &&
      (freshnessResult?.freshness.ageDays ?? -1) >= 0,
    details: `ageDays=${freshnessResult?.freshness.ageDays ?? "none"}`
  });

  const passedCases = cases.filter((testCase) => testCase.passed).length;
  const failedCases = cases.length - passedCases;

  return {
    cases,
    summary: {
      totalCases: cases.length,
      passedCases,
      failedCases,
      passRate: cases.length === 0 ? 1 : passedCases / cases.length
    }
  };
}
