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
export const identityAssurances = ["authenticated", "legacy_backfill"] as const;
export const memoryScopes = ["global", "project"] as const;
export const memoryTypes = ["fact", "decision", "pattern", "lesson"] as const;
export const memoryStatuses = ["proposed", "approved", "rejected"] as const;
export const artifactKinds = ["plan", "markdown_chunk"] as const;
export const stopGoDecisions = ["go", "needs_review", "stop"] as const;
export const completionStandards = ["artifact_complete", "specialist_verified"] as const;
export const retrievalRoles = [
  "planner",
  "product_strategist",
  "solution_architect",
  "docs_researcher",
  "backend_engineer",
  "frontend_designer",
  "infra_engineer",
  "reviewer",
  "build_resolver",
  "security_reviewer",
  "qa_engineer",
  "tdd-guide",
  "e2e-runner",
  "release-readiness",
  "memory_curator"
] as const;
export const requiredGateReviews = ["reviewer", "security_reviewer", "qa_engineer"] as const;
export const reviewWaiverAuthorities = ["none", "manager", "security_exception"] as const;
export const qualityGates = [
  "product_acceptance",
  "frontend_acceptance",
  "accessibility_acceptance",
  "responsive_acceptance",
  "tdd_required",
  "e2e_required",
  "release_readiness_required",
  "performance_check_required",
  "setup_replay_required"
] as const;
export const routingRecommendationKinds = ["owner_dispatch", "review_dispatch", "wait"] as const;
export const recoveryIssueKinds = [
  "stalled_task",
  "stale_review_block",
  "stale_approval",
  "orphan_lock"
] as const;
export const recoveryActionKinds = [
  "reset_task_to_ready",
  "release_orphan_lock",
  "reblock_stale_approval",
  "request_missing_reviews"
] as const;

export type RunStatus = (typeof runStatuses)[number];
export type TaskStatus = (typeof taskStatuses)[number];
export type ReviewSeverity = (typeof reviewSeverities)[number];
export type ReviewState = (typeof reviewStates)[number];
export type ApprovalDecision = (typeof approvalDecisions)[number];
export type IdentityAssurance = (typeof identityAssurances)[number];
export type MemoryScope = (typeof memoryScopes)[number];
export type MemoryType = (typeof memoryTypes)[number];
export type MemoryStatus = (typeof memoryStatuses)[number];
export type ArtifactKind = (typeof artifactKinds)[number];
export type StopGoDecision = (typeof stopGoDecisions)[number];
export type CompletionStandard = (typeof completionStandards)[number];
export type RetrievalRole = (typeof retrievalRoles)[number];
export type GateReviewRole = (typeof requiredGateReviews)[number];
export type ReviewWaiverAuthority = (typeof reviewWaiverAuthorities)[number];
export type QualityGate = (typeof qualityGates)[number];
export type RoutingRecommendationKind = (typeof routingRecommendationKinds)[number];
export type RecoveryIssueKind = (typeof recoveryIssueKinds)[number];
export type RecoveryActionKind = (typeof recoveryActionKinds)[number];

export interface RetrievalMetadata {
  retrievalRoles?: RetrievalRole[] | undefined;
  tags?: string[] | undefined;
  reviewedAt?: string | undefined;
  staleAfterDays?: number | undefined;
  supersededBy?: string[] | undefined;
  contradicts?: string[] | undefined;
  authorityLevel?: "policy" | "reviewed_memory" | "repo_context" | "operational_context" | undefined;
}

export interface MarkdownArtifactMetadata extends RetrievalMetadata {
  chunkIndex?: number | undefined;
}

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
  completionStandard: CompletionStandard;
  requiredSpecialistRoles: RetrievalRole[];
  qualityGates: QualityGate[];
  goal: string;
  inputs: string[];
  outputs: string[];
  dependencies: string[];
  allowedWriteScope: string[];
  outOfScope: string[];
  acceptanceCriteria: string[];
  verificationSteps: string[];
  requiredReviews: GateReviewRole[];
  securityChecks: string[];
  antiPatterns: string[];
  rollbackNotes: string;
  handoffFormat: string;
}

export interface HandoffInput {
  actor: string;
  ownerRole: RetrievalRole;
  completionStandard: CompletionStandard;
  summary: string;
  changedFiles: string[];
  blockers: string[];
  verificationNotes: string[];
  executionEvidence: string[];
  qualityGateEvidence: string[];
  contextRefs: string[];
}

export interface ReviewInput {
  reviewerRole: GateReviewRole;
  state: ReviewState;
  severity: ReviewSeverity;
  findings: string[];
  waiverReason?: string | undefined;
}

export interface ReviewActionContext {
  actor: string;
  actorRole: RetrievalRole;
  waiverAuthority?: ReviewWaiverAuthority | undefined;
}

declare const trustedReviewActionContextBrand: unique symbol;

export interface TrustedReviewActionContext extends ReviewActionContext {
  identityAssurance: "authenticated";
  readonly [trustedReviewActionContextBrand]: true;
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
  metadata?: RetrievalMetadata | undefined;
}

export interface SearchMemoryInput extends ProjectRef {
  query: string;
  limit?: number | undefined;
  includeGlobal?: boolean | undefined;
  queryEmbedding?: readonly number[] | undefined;
  embeddingModel?: string | undefined;
  requesterRole?: RetrievalRole | undefined;
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

export interface RuntimeProjectRegistrationRecord {
  projectId: string;
  workspaceId: string;
  repoPath: string;
  runtimeProfile: string;
  dataRoot: string;
  qdrantUrl?: string | undefined;
  qdrantCollection: string;
  installManifestPath?: string | undefined;
  manifest: Record<string, unknown>;
  provenance: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface RuntimeMigrationJournalRecord {
  id: string;
  workspaceId: string;
  projectId: string;
  runId?: string | undefined;
  phase: string;
  status: string;
  backupManifestPath: string;
  verificationReportPath: string;
  rollbackState: string;
  details: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
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
  ownerRole: RetrievalRole;
  completionStandard: CompletionStandard;
  summary: string;
  changedFiles: string[];
  blockers: string[];
  verificationNotes: string[];
  executionEvidence: string[];
  qualityGateEvidence: string[];
  contextRefs: string[];
  createdAt: string;
}

export interface ReviewRecord {
  id: string;
  runId: string;
  taskId: string;
  reviewerRole: GateReviewRole;
  actor: string;
  actorRole: RetrievalRole;
  identityAssurance: IdentityAssurance;
  state: ReviewState;
  severity: ReviewSeverity;
  findings: string[];
  waiverReason?: string | undefined;
  waiverAuthority: ReviewWaiverAuthority;
  createdAt: string;
}

export interface ApprovalRecord {
  id: string;
  runId: string;
  taskId: string;
  actor: string;
  actorRole: RetrievalRole;
  identityAssurance: IdentityAssurance;
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
  sourcePath?: string | undefined;
  sourceAnchor?: string | undefined;
  metadata: RetrievalMetadata;
  createdAt: string;
}

export interface SearchMemoryAuthority {
  source: "shared_backend_memory" | "repo_artifact";
  precedence: "retrieval_hint" | "repo_context";
  scope: MemoryScope;
  reviewedBy?: string | undefined;
  authorityLevel?: RetrievalMetadata["authorityLevel"];
  allowedRoles: RetrievalRole[];
}

export interface SearchMemoryFreshness {
  status: "fresh" | "stale" | "invalid_timestamp" | "future_timestamp";
  createdAt: string;
  ageDays?: number | undefined;
  staleAfterDays: number;
}

export interface SearchMemoryCitation {
  kind: "memory_entry" | "artifact";
  memoryId?: string | undefined;
  artifactId?: string | undefined;
  label: string;
  sourcePath?: string | undefined;
  sourceAnchor?: string | undefined;
  canonicalRef: string;
  runId?: string | undefined;
  taskId?: string | undefined;
}

export interface SearchMemoryProvenance {
  entryType?: MemoryType | undefined;
  artifactKind?: ArtifactKind | undefined;
  actor?: string | undefined;
  reviewer?: string | undefined;
  runId?: string | undefined;
  taskId?: string | undefined;
  createdAt: string;
}

export interface SearchMemoryMetadata {
  allowedRoles: RetrievalRole[];
  tags: string[];
  reviewedAt?: string | undefined;
  staleAfterDays: number;
  supersededBy: string[];
  contradicts: string[];
}

export interface SearchMemoryResult {
  id: string;
  title: string;
  content: string;
  scope: MemoryScope;
  projectSlug?: string | undefined;
  score: number;
  authority: SearchMemoryAuthority;
  freshness: SearchMemoryFreshness;
  citation: SearchMemoryCitation;
  provenance: SearchMemoryProvenance;
  metadata: SearchMemoryMetadata;
  conflict: {
    detected: boolean;
    relatedIds: string[];
  };
}

export interface MarkdownArtifactRecord {
  id: string;
  workspaceId: string;
  projectId: string;
  runId: string;
  kind: "markdown_chunk";
  title: string;
  content: string;
  sourcePath: string;
  sourceAnchor?: string | undefined;
  metadata: MarkdownArtifactMetadata;
  createdAt: string;
}

export interface RunStatusSnapshot {
  run: RunRecord;
  plan?: PlanArtifact | undefined;
  tasks: TaskRecord[];
  activeLocks: LockRecord[];
  blockers: string[];
  nextTaskIds: string[];
}

export interface RoutingRecommendation {
  taskId: string;
  taskStatus: TaskStatus;
  recommendation: RoutingRecommendationKind;
  authorityLabel: "derived_only";
  targetRole?: RetrievalRole | undefined;
  targetReviewRole?: GateReviewRole | undefined;
  rationale: string[];
  blockers: string[];
  allowedWriteScope: string[];
  retrievalGuidance: string[];
  approvalCheckpoints: string[];
}

export interface RoutingRecommendationReport {
  mode: "advisory_only";
  runId: string;
  recommendations: RoutingRecommendation[];
}

export interface RecoveryIssue {
  id: string;
  authorityLabel: "derived_only";
  kind: RecoveryIssueKind;
  taskId?: string | undefined;
  lockTaskId?: string | undefined;
  ageHours?: number | undefined;
  details: string[];
  suggestedActionIds: string[];
}

export interface RecoveryAction {
  id: string;
  authorityLabel: "derived_only";
  kind: RecoveryActionKind;
  taskId?: string | undefined;
  safeToApply: boolean;
  rationale: string[];
}

export interface RecoveryInspectionReport {
  mode: "advisory_only";
  runId: string;
  staleAfterHours: number;
  issues: RecoveryIssue[];
  actions: RecoveryAction[];
  summary: {
    totalIssues: number;
    safeActions: number;
    blockedTasks: string[];
    staleTaskIds: string[];
    orphanLockTaskIds: string[];
  };
}

export interface RecoveryApplyResult {
  mode: "applied";
  runId: string;
  appliedActionIds: string[];
  skippedActionIds: string[];
  snapshot: RunStatusSnapshot;
}
