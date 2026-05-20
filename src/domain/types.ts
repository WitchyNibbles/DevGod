import type { TaskQueue } from "../devgod/task-queue.ts";

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
export const artifactKinds = ["plan", "markdown_chunk", "workflow_document"] as const;
export const workflowDocumentKinds = [
  "brief",
  "plan",
  "task_packet",
  "review_summary",
  "product_state",
  "task_queue",
  "coverage_manifest",
  "progress_proof",
  "checkpoint_summary",
  "export_snapshot",
  "policy_bundle"
] as const;
export const stopGoDecisions = ["go", "needs_review", "stop"] as const;
export const completionStandards = ["artifact_complete", "specialist_verified"] as const;
export const reasoningConfidenceLevels = ["low", "medium", "high"] as const;
export const reasoningDecisions = ["continue", "supported", "blocked"] as const;
export const reasoningWorkflowModes = ["legacy", "dual", "strict"] as const;
export const reasoningVerdictStatuses = [
  "supported",
  "insufficient_evidence",
  "contradicted",
  "budget_exhausted",
  "needs_review"
] as const;
export const reasoningAttemptOutcomes = [
  "supported",
  "contradicted",
  "inconclusive",
  "failed"
] as const;
export const reasoningVerificationKinds = [
  "test",
  "docs",
  "schema",
  "runtime",
  "tool_output",
  "critic_review",
  "diff_review",
  "human_review"
] as const;
export const reasoningVerificationStatuses = ["passed", "failed", "pending", "skipped"] as const;
export const retrievalRoles = [
  "planner",
  "product_strategist",
  "solution_architect",
  "docs_researcher",
  "backend_engineer",
  "frontend_designer",
  "git_operator",
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
  "regression_safety_required",
  "release_readiness_required",
  "performance_check_required",
  "setup_replay_required",
  "coverage_ledger_required",
  "progress_proof_required",
  "checkpoint_resume_required",
  "memory_compaction_required",
  "reasoning_dual_required",
  "reasoning_strict_required"
] as const;
export const routingRecommendationKinds = ["owner_dispatch", "review_dispatch", "wait"] as const;
export const executionDirectiveKinds = [
  "complete",
  "dispatch_owner",
  "dispatch_reviews",
  "apply_recovery",
  "continue_analysis",
  "blocked"
] as const;
export const continuationActionKinds = [
  "resolve_blocking_gap",
  "run_workflow_proof",
  "resume_target"
] as const;
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
export const coverageItemCategories = [
  "models",
  "services",
  "apis",
  "routes",
  "controllers_views",
  "serializers_forms",
  "database_access",
  "queries",
  "background_jobs",
  "async_tasks",
  "frontend_components",
  "state_management",
  "authentication",
  "authorization",
  "permissions",
  "caching",
  "feature_flags",
  "external_integrations",
  "infrastructure",
  "deployment",
  "ci_cd",
  "tests",
  "migrations",
  "dead_code",
  "duplicated_logic",
  "configuration",
  "environment_coupling",
  "runtime_side_effects"
] as const;
export const coverageItemStates = [
  "undiscovered",
  "discovered",
  "partially_analyzed",
  "fully_analyzed",
  "validated",
  "migrated",
  "deprecated",
  "blocked"
] as const;
export const coverageCriticalities = ["low", "medium", "high", "critical"] as const;
export const gapKinds = [
  "missing_inventory",
  "missing_callsite_coverage",
  "missing_dependency_edge",
  "missing_runtime_trace",
  "missing_validation",
  "contradicting_evidence",
  "hidden_write_side_effect",
  "orphaned_config_coupling",
  "dead_code_suspicion",
  "duplicate_logic_suspicion",
  "architecture_recommendation_before_threshold"
] as const;
export const gapSeverities = ["low", "medium", "high", "critical"] as const;
export const gapStatuses = ["open", "closed"] as const;
export const understandingMapKinds = [
  "repo_map",
  "subsystems",
  "route_map",
  "model_map",
  "integration_map",
  "authz_map",
  "config_coupling",
  "runtime_side_effects"
] as const;
export const runtimeTraceKinds = ["route", "job", "integration", "auth", "side_effect"] as const;
export const analysisPhases = [
  "discovery",
  "inventory",
  "dependency_mapping",
  "runtime_tracing",
  "subsystem_classification",
  "risk_analysis",
  "modernization_strategy",
  "migration_sequencing",
  "implementation",
  "validation",
  "regression_detection",
  "final_verification",
  "blocked",
  "done"
] as const;
export const runProfiles = ["standard_delivery", "legacy_rewrite", "debug_heavy"] as const;
export const phaseReadinessStatuses = ["ready", "blocked"] as const;
export const rewriteReadinessStatuses = ["ready", "blocked"] as const;

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
export type WorkflowDocumentKind = (typeof workflowDocumentKinds)[number];
export type StopGoDecision = (typeof stopGoDecisions)[number];
export type CompletionStandard = (typeof completionStandards)[number];
export type ReasoningConfidenceLevel = (typeof reasoningConfidenceLevels)[number];
export type ReasoningDecision = (typeof reasoningDecisions)[number];
export type ReasoningWorkflowMode = (typeof reasoningWorkflowModes)[number];
export type ReasoningVerdictStatus = (typeof reasoningVerdictStatuses)[number];
export type ReasoningAttemptOutcome = (typeof reasoningAttemptOutcomes)[number];
export type ReasoningVerificationKind = (typeof reasoningVerificationKinds)[number];
export type ReasoningVerificationStatus = (typeof reasoningVerificationStatuses)[number];
export type RetrievalRole = (typeof retrievalRoles)[number];
export type GateReviewRole = (typeof requiredGateReviews)[number];
export type ReviewWaiverAuthority = (typeof reviewWaiverAuthorities)[number];
export type QualityGate = (typeof qualityGates)[number];
export type RoutingRecommendationKind = (typeof routingRecommendationKinds)[number];
export type ExecutionDirectiveKind = (typeof executionDirectiveKinds)[number];
export type RecoveryIssueKind = (typeof recoveryIssueKinds)[number];
export type RecoveryActionKind = (typeof recoveryActionKinds)[number];
export type CoverageItemCategory = (typeof coverageItemCategories)[number];
export type CoverageItemState = (typeof coverageItemStates)[number];
export type CoverageCriticality = (typeof coverageCriticalities)[number];
export type GapKind = (typeof gapKinds)[number];
export type GapSeverity = (typeof gapSeverities)[number];
export type GapStatus = (typeof gapStatuses)[number];
export type UnderstandingMapKind = (typeof understandingMapKinds)[number];
export type RuntimeTraceKind = (typeof runtimeTraceKinds)[number];
export type AnalysisPhase = (typeof analysisPhases)[number];
export type RunProfile = (typeof runProfiles)[number];
export type PhaseReadinessStatus = (typeof phaseReadinessStatuses)[number];
export type RewriteReadinessStatus = (typeof rewriteReadinessStatuses)[number];

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

export interface ReasoningQualityBudget {
  researchSteps?: number | undefined;
  debugSteps?: number | undefined;
  reviewPasses?: number | undefined;
  toolRetries?: number | undefined;
}

export interface ReasoningQualityBlock {
  claim: string;
  facts?: string[] | undefined;
  assumptions: string[];
  hypotheses: string[];
  evidenceRefs: string[];
  counterEvidence?: string[] | undefined;
  openQuestions?: string[] | undefined;
  verificationPlan: string[];
  fallbacks?: string[] | undefined;
  budgets?: ReasoningQualityBudget | undefined;
  confidence: ReasoningConfidenceLevel;
  decision: ReasoningDecision;
}

export interface ReasoningPolicy {
  mode: ReasoningWorkflowMode;
  requireBlock?: boolean | undefined;
  requireEvidenceRefs?: boolean | undefined;
  requireAttempts?: boolean | undefined;
  requireTraceRefs?: boolean | undefined;
  requireVerification?: boolean | undefined;
  requireCriticVerification?: boolean | undefined;
  maxAttempts?: number | undefined;
}

export interface ReasoningVerification {
  id: string;
  kind: ReasoningVerificationKind;
  ref: string;
  status: ReasoningVerificationStatus;
  summary: string;
}

export interface ReasoningAttempt {
  id: string;
  label: string;
  hypothesis: string;
  alternatives?: string[] | undefined;
  evidenceRefs: string[];
  verificationRefs: string[];
  traceRef?: string | undefined;
  outcome: ReasoningAttemptOutcome;
  summary: string;
}

export interface ReasoningVerdict {
  status: ReasoningVerdictStatus;
  summary: string;
  supportingAttemptIds: string[];
  blockingIssues?: string[] | undefined;
}

export interface PlanInput {
  runId: string;
  title: string;
  summary: string;
  milestones: string[];
  decisions: string[];
  residualRisks: string[];
  acceptanceCriteria: string[];
  reasoningPolicy?: ReasoningPolicy | undefined;
  reasoningAttempts?: ReasoningAttempt[] | undefined;
  reasoningVerifications?: ReasoningVerification[] | undefined;
  reasoningVerdict?: ReasoningVerdict | undefined;
  reasoningQuality?: ReasoningQualityBlock | undefined;
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
  reasoningPolicy?: ReasoningPolicy | undefined;
  reasoningAttempts?: ReasoningAttempt[] | undefined;
  reasoningVerifications?: ReasoningVerification[] | undefined;
  reasoningVerdict?: ReasoningVerdict | undefined;
  reasoningQuality?: ReasoningQualityBlock | undefined;
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

export interface WorkflowDocumentRecord {
  id: string;
  workspaceId: string;
  projectId: string;
  runId?: string | undefined;
  taskId?: string | undefined;
  kind: WorkflowDocumentKind;
  title: string;
  body: string;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface CoverageManifestThresholds {
  criticalItemCoverage?: number | undefined;
  criticalItemValidation?: number | undefined;
  callsiteCoverage?: number | undefined;
  runtimeTraceCoverage?: number | undefined;
  inventoryCompleteness?: number | undefined;
  businessRuleCoverage?: number | undefined;
  maxContradictionGapCount?: number | undefined;
  maxOpenBlockers?: number | undefined;
}

export interface CoverageManifestRecord {
  runId: string;
  profile: RunProfile;
  requiredCategories: CoverageItemCategory[];
  thresholds: CoverageManifestThresholds;
}

export interface CoverageItemRecord {
  id: string;
  category: CoverageItemCategory;
  state: CoverageItemState;
  criticality: CoverageCriticality;
  ownerAgent?: string | undefined;
  sources: string[];
  entryPoints?: string[] | undefined;
  dependencies?: string[] | undefined;
  dependents?: string[] | undefined;
  callsiteCount?: number | undefined;
  callsitesAnalyzed?: number | undefined;
  runtimeTraced?: boolean | undefined;
  behaviorSummary?: string | undefined;
  businessRules?: string[] | undefined;
  sideEffects?: string[] | undefined;
  openQuestions?: string[] | undefined;
  evidenceRefs: string[];
  verificationRefs?: string[] | undefined;
  confidence?: number | undefined;
  gapScore?: number | undefined;
  lastUpdatedAt: string;
}

export interface CoverageGapRecord {
  id: string;
  targetId: string;
  kind: GapKind;
  severity: GapSeverity;
  description: string;
  blocking: boolean;
  evidenceRefs: string[];
  createdBy: string;
  suggestedNextActions: string[];
  status: GapStatus;
}

export interface ProgressProofRecord {
  cycle: number;
  proofId: string;
  phaseBefore: AnalysisPhase;
  phaseAfter: AnalysisPhase;
  evidenceRefs: string[];
  coverageDelta: Partial<Record<CoverageItemState, number>>;
  blockingGapDelta?: {
    closed?: number | undefined;
    opened?: number | undefined;
  } | undefined;
  nextTarget: string;
  whyNext?: string | undefined;
  createdAt: string;
}

export interface UnderstandingMapRecord {
  kind: UnderstandingMapKind;
  itemCount: number;
  analyzedCount?: number | undefined;
  sourceRefs: string[];
  evidenceRefs: string[];
  updatedAt: string;
}

export interface RuntimeTraceRecord {
  traceId: string;
  targetId: string;
  kind: RuntimeTraceKind;
  risky: boolean;
  sideEffects: string[];
  evidenceRefs: string[];
  createdAt: string;
}

export interface CheckpointRecord {
  runId: string;
  checkpointId: string;
  authorityLabel: "runtime_authoritative" | "operator_import";
  phase: AnalysisPhase;
  activeTargets: string[];
  recentEvidenceRefs: string[];
  openGaps: string[];
  nextActions: string[];
  compressedContextRef?: string | undefined;
  createdAt: string;
}

export interface CoverageSummary {
  totalItems: number;
  discoveredItems: number;
  partiallyAnalyzedItems: number;
  fullyAnalyzedItems: number;
  validatedItems: number;
  migratedItems: number;
  blockedItems: number;
  criticalItemCoverage: number;
  criticalItemValidation: number;
  callsiteCoverage: number;
  runtimeTraceCoverage: number;
  openGapCount: number;
  blockingGapCount: number;
}

export interface ComprehensionSummary {
  inventoryCompleteness: number;
  businessRuleCoverage: number;
  contradictionGapCount: number;
  openBlockerCount: number;
  requiredUnderstandingKinds: UnderstandingMapKind[];
  presentUnderstandingKinds: UnderstandingMapKind[];
  missingUnderstandingKinds: UnderstandingMapKind[];
  runtimeTraceCount: number;
  rewriteReadiness: RewriteReadinessStatus;
  missingEvidence: string[];
}

export interface PhaseReadinessRecord {
  phase: AnalysisPhase;
  status: PhaseReadinessStatus;
  reasons: string[];
}

export interface AutonomousExecutionState {
  enabled: boolean;
  profile: RunProfile;
  phase: AnalysisPhase;
  manifest?: CoverageManifestRecord | undefined;
  coverageItems: CoverageItemRecord[];
  gaps: CoverageGapRecord[];
  checkpoints: CheckpointRecord[];
  progressProofs: ProgressProofRecord[];
  understandingMaps: UnderstandingMapRecord[];
  runtimeTraces: RuntimeTraceRecord[];
  pendingInvestigations: string[];
  executionEpoch: number;
  lastCheckpointId?: string | undefined;
  lastSuccessfulCheckpointId?: string | undefined;
  lastProgressProofId?: string | undefined;
  recoveryReason?: string | undefined;
  retryBudgetRemaining?: number | undefined;
  updatedAt: string;
}

export interface AutonomousExecutionSnapshot {
  state: AutonomousExecutionState;
  coverageSummary: CoverageSummary;
  comprehensionSummary: ComprehensionSummary;
  phaseReadiness: PhaseReadinessRecord;
  blockingGaps: CoverageGapRecord[];
}

export interface ProjectRuntimeMetadata extends Record<string, unknown> {
  autonomousExecution?: AutonomousExecutionState | undefined;
  devgodDaemon?: {
    sessionId?: string | undefined;
    lastRunId?: string | undefined;
    lastTaskId?: string | undefined;
    lastDirectiveKind?: string | undefined;
    updatedAt: string;
  } | undefined;
}

export interface ProjectRuntimeStateRecord {
  projectId: string;
  workspaceId: string;
  activeRunId?: string | undefined;
  activeTaskId?: string | undefined;
  taskQueue: TaskQueue;
  productState: Record<string, unknown>;
  lastVerifiedRunId?: string | undefined;
  metadata: ProjectRuntimeMetadata;
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
  source: "shared_backend_memory" | "repo_artifact" | "runtime_document";
  precedence: "retrieval_hint" | "repo_context" | "runtime_context";
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
  kind: "memory_entry" | "artifact" | "workflow_document";
  memoryId?: string | undefined;
  artifactId?: string | undefined;
  documentId?: string | undefined;
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
  autonomousExecution?: AutonomousExecutionSnapshot | undefined;
}

export interface BaseExecutionDirective {
  kind: ExecutionDirectiveKind;
  rationale: string[];
}

export interface CompleteExecutionDirective extends BaseExecutionDirective {
  kind: "complete";
}

export interface DispatchOwnerExecutionDirective extends BaseExecutionDirective {
  kind: "dispatch_owner";
  recommendation: RoutingRecommendation;
}

export interface DispatchReviewsExecutionDirective extends BaseExecutionDirective {
  kind: "dispatch_reviews";
  recommendations: RoutingRecommendation[];
}

export interface ApplyRecoveryExecutionDirective extends BaseExecutionDirective {
  kind: "apply_recovery";
  actions: RecoveryAction[];
}

export interface ResolveBlockingGapContinuationAction {
  kind: "resolve_blocking_gap";
  gapId: string;
  targetId: string;
}

export interface RunWorkflowProofContinuationAction {
  kind: "run_workflow_proof";
  taskId: string;
}

export interface ResumeTargetContinuationAction {
  kind: "resume_target";
  targetId: string;
  source: "blocking_gap" | "progress_proof" | "checkpoint";
  sourceId?: string | undefined;
}

export type ContinuationAction =
  | ResolveBlockingGapContinuationAction
  | RunWorkflowProofContinuationAction
  | ResumeTargetContinuationAction;

export interface ContinueAnalysisExecutionDirective extends BaseExecutionDirective {
  kind: "continue_analysis";
  targetId: string;
  source: "blocking_gap" | "progress_proof" | "checkpoint";
  actions: ContinuationAction[];
  nextActions: string[];
  blockers: string[];
}

export interface BlockedExecutionDirective extends BaseExecutionDirective {
  kind: "blocked";
  blockers: string[];
}

export type RunExecutionDirective =
  | CompleteExecutionDirective
  | DispatchOwnerExecutionDirective
  | DispatchReviewsExecutionDirective
  | ApplyRecoveryExecutionDirective
  | ContinueAnalysisExecutionDirective
  | BlockedExecutionDirective;

export interface RunExecutionPlan {
  mode: "runtime_authoritative";
  runId: string;
  runStatus: RunStatus;
  directive: RunExecutionDirective;
  autonomousExecution?: AutonomousExecutionSnapshot | undefined;
}

export interface RunResumeSnapshot extends RunStatusSnapshot {
  executionPlan: RunExecutionPlan;
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
