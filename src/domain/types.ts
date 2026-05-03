export const runStatuses = [
  "intake",
  "planned",
  "decomposed",
  "ready",
  "in_progress",
  "review_blocked",
  "approved",
  "memorized",
  "done"
] as const;

export const taskStatuses = [
  "ready",
  "in_progress",
  "review_blocked",
  "approved",
  "done",
  "blocked"
] as const;

export const reviewSeverities = ["low", "medium", "high", "critical"] as const;
export const reviewStates = ["pending", "passed", "blocked", "waived"] as const;
export const approvalDecisions = ["approved", "blocked", "waived"] as const;
export const memoryScopes = ["global", "project"] as const;
export const memoryTypes = ["fact", "decision", "pattern", "lesson"] as const;
export const memoryStatuses = ["proposed", "approved", "rejected"] as const;
export const stopGoDecisions = ["go", "needs_review", "stop"] as const;

export type RunStatus = (typeof runStatuses)[number];
export type TaskStatus = (typeof taskStatuses)[number];
export type ReviewSeverity = (typeof reviewSeverities)[number];
export type ReviewState = (typeof reviewStates)[number];
export type ApprovalDecision = (typeof approvalDecisions)[number];
export type MemoryScope = (typeof memoryScopes)[number];
export type MemoryType = (typeof memoryTypes)[number];
export type MemoryStatus = (typeof memoryStatuses)[number];
export type StopGoDecision = (typeof stopGoDecisions)[number];

export interface ProjectRef {
  workspaceSlug: string;
  workspaceName?: string | undefined;
  projectSlug: string;
  projectName?: string | undefined;
  repoPath?: string | undefined;
}

export interface IntakeRequestInput extends ProjectRef {
  actor: string;
  title: string;
  request: string;
  goal?: string | undefined;
  audience?: string[] | undefined;
  constraints?: string[] | undefined;
  risks?: string[] | undefined;
  unknowns?: string[] | undefined;
  successCriteria?: string[] | undefined;
  outOfScope?: string[] | undefined;
  trustBoundaries?: string[] | undefined;
  destructiveActions?: string[] | undefined;
  externalIntegrations?: string[] | undefined;
}

export interface IntakeSummary {
  goal: string;
  audience: string[];
  constraints: string[];
  risks: string[];
  unknowns: string[];
  successCriteria: string[];
  outOfScope: string[];
  trustBoundaries: string[];
  destructiveActions: string[];
  externalIntegrations: string[];
  stopGo: StopGoDecision;
}

export interface PlanInput {
  runId: string;
  title: string;
  summary: string;
  milestones: string[];
  decisions: string[];
  residualRisks: string[];
  acceptanceCriteria: string[];
}

export interface TaskPacketInput {
  taskId: string;
  title: string;
  ownerRole: string;
  goal: string;
  inputs: string[];
  outputs: string[];
  dependencies: string[];
  allowedWriteScope: string[];
  outOfScope: string[];
  acceptanceCriteria: string[];
  verificationSteps: string[];
  requiredReviews: string[];
  securityChecks: string[];
  antiPatterns: string[];
  rollbackNotes: string;
  handoffFormat: string;
}

export interface HandoffInput {
  actor: string;
  summary: string;
  changedFiles: string[];
  blockers: string[];
  verificationNotes: string[];
  contextRefs: string[];
}

export interface ReviewInput {
  reviewerRole: string;
  state: ReviewState;
  severity: ReviewSeverity;
  findings: string[];
  waiverReason?: string | undefined;
}

export interface MemoryPromotionInput {
  scope: MemoryScope;
  entryType: MemoryType;
  title: string;
  content: string;
  sourceRunId: string;
  sourceTaskId?: string | undefined;
  reviewer: string;
  actor: string;
}

export interface SearchMemoryInput extends ProjectRef {
  query: string;
  limit?: number | undefined;
  includeGlobal?: boolean | undefined;
}

export interface WorkspaceRecord {
  id: string;
  slug: string;
  name: string;
  createdAt: string;
}

export interface ProjectRecord {
  id: string;
  workspaceId: string;
  slug: string;
  name: string;
  repoPath?: string | undefined;
  createdAt: string;
}

export interface RunRecord {
  id: string;
  workspaceId: string;
  projectId: string;
  actor: string;
  title: string;
  request: string;
  summary: IntakeSummary;
  status: RunStatus;
  createdAt: string;
  updatedAt: string;
}

export interface PlanArtifact {
  id: string;
  runId: string;
  kind: "plan";
  title: string;
  content: PlanInput;
  createdAt: string;
}

export interface TaskRecord {
  id: string;
  runId: string;
  workspaceId: string;
  projectId: string;
  packet: TaskPacketInput;
  status: TaskStatus;
  claimedBy?: string | undefined;
  createdAt: string;
  updatedAt: string;
}

export interface LockRecord {
  id: string;
  workspaceId: string;
  projectId: string;
  runId: string;
  taskId: string;
  scopePaths: string[];
  status: "active" | "released";
  createdAt: string;
  releasedAt?: string | undefined;
}

export interface HandoffRecord {
  id: string;
  runId: string;
  taskId: string;
  actor: string;
  summary: string;
  changedFiles: string[];
  blockers: string[];
  verificationNotes: string[];
  contextRefs: string[];
  createdAt: string;
}

export interface ReviewRecord {
  id: string;
  runId: string;
  taskId: string;
  reviewerRole: string;
  state: ReviewState;
  severity: ReviewSeverity;
  findings: string[];
  waiverReason?: string | undefined;
  createdAt: string;
}

export interface ApprovalRecord {
  id: string;
  runId: string;
  taskId: string;
  actor: string;
  decision: ApprovalDecision;
  rationale: string;
  createdAt: string;
}

export interface MemoryEntryRecord {
  id: string;
  workspaceId: string;
  projectId?: string | undefined;
  runId: string;
  taskId?: string | undefined;
  scope: MemoryScope;
  entryType: MemoryType;
  title: string;
  content: string;
  reviewer: string;
  actor: string;
  status: MemoryStatus;
  createdAt: string;
}

export interface SearchMemoryResult {
  id: string;
  title: string;
  content: string;
  scope: MemoryScope;
  projectSlug?: string | undefined;
  score: number;
}

export interface RunStatusSnapshot {
  run: RunRecord;
  plan?: PlanArtifact | undefined;
  tasks: TaskRecord[];
  activeLocks: LockRecord[];
  blockers: string[];
  nextTaskIds: string[];
}
