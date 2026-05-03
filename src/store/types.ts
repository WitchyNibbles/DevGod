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

export type EmbeddingJobSourceTable = "artifacts" | "memory_entries";

export type EmbeddingJobStatus = "pending" | "processing" | "done" | "failed";

export interface EmbeddingJobRecord {
  id: string;
  workspaceId: string;
  projectId?: string | undefined;
  sourceTable: EmbeddingJobSourceTable;
  sourceId: string;
  embeddingModel: string;
  status: EmbeddingJobStatus;
  errorMessage?: string | undefined;
  createdAt: string;
  updatedAt: string;
}

export interface QueueEmbeddingJobInput {
  workspaceId: string;
  projectId?: string | undefined;
  sourceTable: EmbeddingJobSourceTable;
  sourceId: string;
  embeddingModel: string;
}

export interface LeaseEmbeddingJobsInput {
  limit: number;
}

export interface CompleteEmbeddingJobInput {
  jobId: string;
  sourceTable: EmbeddingJobSourceTable;
  sourceId: string;
  embeddingModel: string;
  embedding: readonly number[];
}

export interface EmbeddingSourceRecord {
  sourceTable: EmbeddingJobSourceTable;
  sourceId: string;
  title: string;
  content: string;
}

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
  queueEmbeddingJob(input: QueueEmbeddingJobInput): Promise<EmbeddingJobRecord>;
  leaseEmbeddingJobs(input: LeaseEmbeddingJobsInput): Promise<EmbeddingJobRecord[]>;
  getEmbeddingSource(sourceTable: EmbeddingJobSourceTable, sourceId: string): Promise<EmbeddingSourceRecord | undefined>;
  completeEmbeddingJob(input: CompleteEmbeddingJobInput): Promise<void>;
  failEmbeddingJob(jobId: string, errorMessage: string): Promise<void>;
  searchMemory(params: {
    workspaceSlug: string;
    projectSlug: string;
    query: string;
    limit: number;
    includeGlobal: boolean;
    queryEmbedding?: readonly number[] | undefined;
    embeddingModel?: string | undefined;
  }): Promise<SearchMemoryResult[]>;
}
