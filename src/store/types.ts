import type {
  ApprovalRecord,
  HandoffRecord,
  LockRecord,
  MemoryEntryRecord,
  PlanArtifact,
  ProjectRecord,
  ReviewRecord,
  RunRecord,
  SearchMemoryResult,
  TaskRecord,
  WorkspaceRecord
} from "../domain/types.ts";

export interface DevgodStore {
  ensureProjectContext(params: {
    workspaceSlug: string;
    workspaceName?: string | undefined;
    projectSlug: string;
    projectName?: string | undefined;
    repoPath?: string | undefined;
  }): Promise<{ workspace: WorkspaceRecord; project: ProjectRecord }>;
  createRun(run: RunRecord): Promise<void>;
  getRun(runId: string): Promise<RunRecord | undefined>;
  updateRun(run: RunRecord): Promise<void>;
  savePlan(plan: PlanArtifact): Promise<void>;
  getPlan(runId: string): Promise<PlanArtifact | undefined>;
  replaceTasks(tasks: TaskRecord[]): Promise<void>;
  getTasksByRun(runId: string): Promise<TaskRecord[]>;
  getTask(runId: string, taskId: string): Promise<TaskRecord | undefined>;
  updateTask(task: TaskRecord): Promise<void>;
  createLock(lock: LockRecord): Promise<void>;
  releaseLocksForTask(runId: string, taskId: string, releasedAt: string): Promise<void>;
  getActiveLocks(projectId: string): Promise<LockRecord[]>;
  saveHandoff(handoff: HandoffRecord): Promise<void>;
  getHandoffs(taskId: string): Promise<HandoffRecord[]>;
  saveReview(review: ReviewRecord): Promise<void>;
  getReviews(taskId: string): Promise<ReviewRecord[]>;
  saveApproval(approval: ApprovalRecord): Promise<void>;
  getApprovals(taskId: string): Promise<ApprovalRecord[]>;
  saveMemoryEntry(entry: MemoryEntryRecord): Promise<void>;
  searchMemory(params: {
    workspaceSlug: string;
    projectSlug: string;
    query: string;
    limit: number;
    includeGlobal: boolean;
  }): Promise<SearchMemoryResult[]>;
}
