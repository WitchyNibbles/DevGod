import {
  type HandoffInput,
  type GateReviewRole,
  type IdentityAssurance,
  type IntakeRequestInput,
  type IntakeSummary,
  type MemoryPromotionInput,
  type ReviewActionContext,
  type ReviewInput,
  type ReviewRecord,
  type RetrievalMetadata,
  type RetrievalRole,
  type ReviewWaiverAuthority,
  type SearchMemoryInput,
  type StopGoDecision,
  type CompletionStandard,
  type QualityGate,
  completionStandards,
  identityAssurances,
  qualityGates,
  reviewWaiverAuthorities,
  requiredGateReviews,
  retrievalRoles,
  stopGoDecisions,
  type TaskPacketInput
} from "./types.ts";

const maxQueryEmbeddingDimensions = 1536;
const retrievalRoleSet = new Set<string>(retrievalRoles);
const requiredGateReviewSet = new Set<string>(requiredGateReviews);
const reviewWaiverAuthoritySet = new Set<string>(reviewWaiverAuthorities);
const identityAssuranceSet = new Set<string>(identityAssurances);
const completionStandardSet = new Set<string>(completionStandards);
const qualityGateSet = new Set<string>(qualityGates);
const managerWaiverRoles = new Set<RetrievalRole>(["planner", "solution_architect"]);

export const DEFAULT_RETRIEVAL_ROLE: RetrievalRole = "planner";

export interface NormalizedRetrievalMetadata extends RetrievalMetadata {
  retrievalRoles: RetrievalRole[];
  tags: string[];
  supersededBy: string[];
  contradicts: string[];
}

function nonEmptyItems(values: readonly string[] | undefined, fallback: string[] = []): string[] {
  if (!values) {
    return [...fallback];
  }

  return values
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
}

function deriveGoal(input: IntakeRequestInput): string {
  if (input.goal && input.goal.trim().length > 0) {
    return input.goal.trim();
  }

  if (input.title.trim().length > 0) {
    return input.title.trim();
  }

  return input.request.trim().slice(0, 160);
}

function deriveStopGo(summary: Omit<IntakeSummary, "stopGo">): StopGoDecision {
  const hardStopRisk = summary.risks.some((risk) =>
    /(payment|production data|delete|credential|authz|deploy|security-sensitive)/i.test(risk)
  );

  if (hardStopRisk) {
    return "needs_review";
  }

  if (summary.unknowns.length > 0) {
    return "needs_review";
  }

  return "go";
}

function uniqueTrimmedItems(values: readonly string[] | undefined): string[] {
  const seen = new Set<string>();
  const items: string[] = [];

  for (const value of values ?? []) {
    const normalized = value.trim();
    if (normalized.length === 0 || seen.has(normalized)) {
      continue;
    }

    seen.add(normalized);
    items.push(normalized);
  }

  return items;
}

function duplicateTrimmedItems(values: readonly string[] | undefined): string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();

  for (const value of values ?? []) {
    const normalized = value.trim();
    if (normalized.length === 0) {
      continue;
    }

    if (seen.has(normalized)) {
      duplicates.add(normalized);
      continue;
    }

    seen.add(normalized);
  }

  return [...duplicates];
}

export function isRetrievalRole(value: string): value is RetrievalRole {
  return retrievalRoleSet.has(value);
}

export function isGateReviewRole(value: string): value is GateReviewRole {
  return requiredGateReviewSet.has(value);
}

export function isReviewWaiverAuthority(value: string): value is ReviewWaiverAuthority {
  return reviewWaiverAuthoritySet.has(value);
}

export function isIdentityAssurance(value: string): value is IdentityAssurance {
  return identityAssuranceSet.has(value);
}

export function isCompletionStandard(value: string): value is CompletionStandard {
  return completionStandardSet.has(value);
}

export function isQualityGate(value: string): value is QualityGate {
  return qualityGateSet.has(value);
}

export function canActorWaiveReview(input: {
  actorRole: RetrievalRole;
  reviewerRole: GateReviewRole;
  waiverAuthority: ReviewWaiverAuthority;
}): boolean {
  if (input.waiverAuthority === "manager") {
    return managerWaiverRoles.has(input.actorRole) && input.reviewerRole !== "security_reviewer";
  }

  if (input.waiverAuthority === "security_exception") {
    return input.actorRole === "security_reviewer" && input.reviewerRole === "security_reviewer";
  }

  return false;
}

export function defaultRetrievalRoles(): RetrievalRole[] {
  return [...retrievalRoles];
}

export function effectiveRequiredReviews(requiredReviews: readonly GateReviewRole[] | undefined): GateReviewRole[] {
  const effective = new Set<GateReviewRole>(requiredGateReviews);
  for (const role of requiredReviews ?? []) {
    if (isGateReviewRole(role)) {
      effective.add(role);
    }
  }
  return [...effective];
}

export function normalizeRetrievalMetadata(metadata?: RetrievalMetadata): NormalizedRetrievalMetadata {
  const retrievalRoleValues = uniqueTrimmedItems(metadata?.retrievalRoles)
    .filter(isRetrievalRole);

  return {
    ...metadata,
    retrievalRoles: retrievalRoleValues.length > 0 ? retrievalRoleValues : defaultRetrievalRoles(),
    tags: uniqueTrimmedItems(metadata?.tags),
    supersededBy: uniqueTrimmedItems(metadata?.supersededBy),
    contradicts: uniqueTrimmedItems(metadata?.contradicts)
  };
}

function isIsoTimestamp(value: string): boolean {
  return !Number.isNaN(Date.parse(value));
}

export function normalizeIntakeRequest(input: IntakeRequestInput): IntakeSummary {
  const summaryBase = {
    goal: deriveGoal(input),
    audience: nonEmptyItems(input.audience, ["repo owner", "specialist agents"]),
    constraints: nonEmptyItems(input.constraints, ["Preserve repo-local reviewed policy in git"]),
    risks: nonEmptyItems(input.risks, ["Trust boundaries require explicit review"]),
    unknowns: nonEmptyItems(input.unknowns, ["Final implementation details need planner review"]),
    successCriteria: nonEmptyItems(input.successCriteria, [
      "A planner-approved task graph exists",
      "Security and QA gates are explicit"
    ]),
    outOfScope: nonEmptyItems(input.outOfScope, ["Unreviewed production changes"]),
    trustBoundaries: nonEmptyItems(input.trustBoundaries, [
      "Repo markdown is reviewed policy",
      "Shared backend owns orchestration state"
    ]),
    destructiveActions: nonEmptyItems(input.destructiveActions),
    externalIntegrations: nonEmptyItems(input.externalIntegrations)
  };

  return {
    ...summaryBase,
    stopGo: deriveStopGo(summaryBase)
  };
}

export function validateTaskPacket(packet: TaskPacketInput): string[] {
  const errors: string[] = [];
  const normalizedOwnerRole = packet.ownerRole.trim();
  const normalizedRequiredReviews = uniqueTrimmedItems(packet.requiredReviews);
  const normalizedSpecialistRoles = uniqueTrimmedItems(packet.requiredSpecialistRoles);
  const normalizedQualityGates = uniqueTrimmedItems(packet.qualityGates);

  if (packet.taskId.trim().length === 0) {
    errors.push("taskId is required");
  }

  if (normalizedOwnerRole.length === 0) {
    errors.push("ownerRole is required");
  } else if (!isRetrievalRole(normalizedOwnerRole)) {
    errors.push(`ownerRole must be one of: ${retrievalRoles.join(", ")}`);
  }

  if (!isCompletionStandard(packet.completionStandard)) {
    errors.push(`completionStandard must be one of: ${completionStandards.join(", ")}`);
  }

  if (packet.requiredSpecialistRoles.length === 0) {
    errors.push("requiredSpecialistRoles is required");
  } else {
    if (normalizedSpecialistRoles.length !== packet.requiredSpecialistRoles.length) {
      errors.push("requiredSpecialistRoles must not contain empty or duplicate values");
    }

    const invalidSpecialistRoles = normalizedSpecialistRoles.filter((role) => !retrievalRoleSet.has(role));
    if (invalidSpecialistRoles.length > 0) {
      errors.push(`requiredSpecialistRoles must be limited to: ${retrievalRoles.join(", ")}`);
    }

    if (normalizedOwnerRole.length > 0 && isRetrievalRole(normalizedOwnerRole)) {
      if (!normalizedSpecialistRoles.includes(normalizedOwnerRole)) {
        errors.push("requiredSpecialistRoles must include ownerRole");
      }
    }
  }

  if (packet.qualityGates.length === 0) {
    errors.push("qualityGates is required");
  } else {
    if (normalizedQualityGates.length !== packet.qualityGates.length) {
      errors.push("qualityGates must not contain empty or duplicate values");
    }

    const invalidQualityGates = normalizedQualityGates.filter((gate) => !qualityGateSet.has(gate));
    if (invalidQualityGates.length > 0) {
      errors.push(`qualityGates must be limited to: ${qualityGates.join(", ")}`);
    }
  }

  if (packet.completionStandard === "specialist_verified") {
    if (normalizedSpecialistRoles.length === 0) {
      errors.push("specialist_verified tasks require at least one specialist role");
    }

    if (normalizedQualityGates.length === 0) {
      errors.push("specialist_verified tasks require at least one quality gate");
    }
  }

  if (packet.goal.trim().length === 0) {
    errors.push("goal is required");
  }

  if (packet.allowedWriteScope.length === 0) {
    errors.push("allowedWriteScope is required");
  }

  if (packet.acceptanceCriteria.length === 0) {
    errors.push("acceptanceCriteria is required");
  }

  if (packet.verificationSteps.length === 0) {
    errors.push("verificationSteps is required");
  }

  if (packet.requiredReviews.length === 0) {
    errors.push("requiredReviews is required");
  } else {
    if (normalizedRequiredReviews.length !== packet.requiredReviews.length) {
      errors.push("requiredReviews must not contain empty or duplicate values");
    }

    const invalidRequiredReviews = normalizedRequiredReviews.filter((role) => !requiredGateReviewSet.has(role));
    if (invalidRequiredReviews.length > 0) {
      errors.push(`requiredReviews must be limited to: ${requiredGateReviews.join(", ")}`);
    }

    for (const requiredReview of requiredGateReviews) {
      if (!normalizedRequiredReviews.includes(requiredReview)) {
        errors.push(`missing required review gate: ${requiredReview}`);
      }
    }
  }

  if (packet.securityChecks.length === 0) {
    errors.push("securityChecks is required");
  }

  if (packet.antiPatterns.length === 0) {
    errors.push("antiPatterns is required");
  }

  if (packet.rollbackNotes.trim().length === 0) {
    errors.push("rollbackNotes is required");
  }

  if (packet.handoffFormat.trim().length === 0) {
    errors.push("handoffFormat is required");
  }

  const duplicateWriteScope = duplicateTrimmedItems(packet.allowedWriteScope);
  for (const path of duplicateWriteScope) {
    errors.push(`duplicate write scope: ${path}`);
  }

  return errors;
}

export function validateHandoff(input: HandoffInput): string[] {
  const errors: string[] = [];

  if (input.actor.trim().length === 0) {
    errors.push("handoff actor is required");
  }

  if (!isRetrievalRole(input.ownerRole)) {
    errors.push(`handoff ownerRole must be one of: ${retrievalRoles.join(", ")}`);
  }

  if (!isCompletionStandard(input.completionStandard)) {
    errors.push(`handoff completionStandard must be one of: ${completionStandards.join(", ")}`);
  }

  if (input.summary.trim().length === 0) {
    errors.push("handoff summary is required");
  }

  if (uniqueTrimmedItems(input.changedFiles).length !== input.changedFiles.length || input.changedFiles.length === 0) {
    errors.push("handoff changedFiles must contain at least one non-empty path");
  }

  if (
    uniqueTrimmedItems(input.verificationNotes).length !== input.verificationNotes.length ||
    input.verificationNotes.length === 0
  ) {
    errors.push("handoff verificationNotes must contain at least one non-empty item");
  }

  if (
    uniqueTrimmedItems(input.executionEvidence).length !== input.executionEvidence.length ||
    input.executionEvidence.length === 0
  ) {
    errors.push("handoff executionEvidence must contain at least one non-empty item");
  }

  if (
    uniqueTrimmedItems(input.qualityGateEvidence).length !== input.qualityGateEvidence.length ||
    input.qualityGateEvidence.length === 0
  ) {
    errors.push("handoff qualityGateEvidence must contain at least one non-empty item");
  }

  if (uniqueTrimmedItems(input.contextRefs).length !== input.contextRefs.length || input.contextRefs.length === 0) {
    errors.push("handoff contextRefs must contain at least one non-empty item");
  }

  return errors;
}

export function validateReviewAction(context: ReviewActionContext, review: ReviewInput): string[] {
  const errors: string[] = [];
  const normalizedActor = context.actor.trim();
  const waiverAuthority = context.waiverAuthority ?? "none";

  if (normalizedActor.length === 0) {
    errors.push("review actor is required");
  }

  if (!isRetrievalRole(context.actorRole)) {
    errors.push(`review actorRole must be one of: ${retrievalRoles.join(", ")}`);
  }

  if (!isGateReviewRole(review.reviewerRole)) {
    errors.push(`reviewerRole must be one of: ${requiredGateReviews.join(", ")}`);
  }

  if (!isReviewWaiverAuthority(waiverAuthority)) {
    errors.push(`waiverAuthority must be one of: ${reviewWaiverAuthorities.join(", ")}`);
  }

  if (review.findings.some((finding) => finding.trim().length === 0)) {
    errors.push("review findings must not contain empty items");
  }

  if (review.state === "waived") {
    if (!review.waiverReason || review.waiverReason.trim().length === 0) {
      errors.push("waived reviews require waiverReason");
    }

    if (waiverAuthority === "none") {
      errors.push("waived reviews require waiverAuthority");
    } else if (
      isRetrievalRole(context.actorRole) &&
      isGateReviewRole(review.reviewerRole) &&
      isReviewWaiverAuthority(waiverAuthority) &&
      !canActorWaiveReview({
        actorRole: context.actorRole,
        reviewerRole: review.reviewerRole,
        waiverAuthority
      })
    ) {
      errors.push(`actorRole ${context.actorRole} is not allowed to waive ${review.reviewerRole}`);
    }
  } else {
    if (waiverAuthority !== "none") {
      errors.push("non-waived reviews must use waiverAuthority none");
    }

    if (isRetrievalRole(context.actorRole) && context.actorRole !== review.reviewerRole) {
      errors.push(`actorRole ${context.actorRole} cannot record ${review.reviewerRole} review state ${review.state}`);
    }
  }

  return errors;
}

export function canReviewRecordSatisfyGate(review: ReviewRecord): boolean {
  if (review.identityAssurance !== "authenticated") {
    return false;
  }

  if (review.state === "passed") {
    return true;
  }

  if (review.state !== "waived") {
    return false;
  }

  if (!review.waiverReason || review.waiverReason.trim().length === 0) {
    return false;
  }

  return canActorWaiveReview({
    actorRole: review.actorRole,
    reviewerRole: review.reviewerRole,
    waiverAuthority: review.waiverAuthority
  });
}

const secretPatterns = [
  /-----BEGIN [A-Z ]+ PRIVATE KEY-----/,
  /\bAKIA[0-9A-Z]{16}\b/,
  /\bghp_[A-Za-z0-9]{20,}\b/,
  /\bsk-[A-Za-z0-9]{16,}\b/,
  /\bpostgres(?:ql)?:\/\/[^/\s]+:[^@\s]+@/i
];

export function findSecretSignals(content: string): string[] {
  return secretPatterns
    .filter((pattern) => pattern.test(content))
    .map((pattern) => pattern.source);
}

export function hasFutureTenseClaim(content: string): boolean {
  return /\b(will always|automatically learns|guarantees future|self-modifies)\b/i.test(content);
}

export function validateMemoryPromotion(input: MemoryPromotionInput): string[] {
  const errors: string[] = [];

  if (findSecretSignals(input.content).length > 0) {
    errors.push("memory content appears to contain a secret");
  }

  if (hasFutureTenseClaim(input.content)) {
    errors.push("memory content contains speculative future claims");
  }

  if (input.reviewer.trim().length === 0) {
    errors.push("reviewer is required");
  }

  if (input.sourceRunId.trim().length === 0) {
    errors.push("sourceRunId is required");
  }

  if (input.metadata) {
    const invalidRoles = uniqueTrimmedItems(input.metadata.retrievalRoles).filter((role) => !isRetrievalRole(role));
    if (invalidRoles.length > 0) {
      errors.push(`invalid retrieval roles: ${invalidRoles.join(", ")}`);
    }

    if (
      input.metadata.staleAfterDays !== undefined &&
      (!Number.isInteger(input.metadata.staleAfterDays) || input.metadata.staleAfterDays <= 0)
    ) {
      errors.push("metadata.staleAfterDays must be a positive integer");
    }

    if (input.metadata.reviewedAt && !isIsoTimestamp(input.metadata.reviewedAt)) {
      errors.push("metadata.reviewedAt must be a valid ISO timestamp");
    }
  }

  return errors;
}

export function normalizeSearchInput(
  input: SearchMemoryInput
): SearchMemoryInput & { limit: number; includeGlobal: boolean; requesterRole: RetrievalRole } {
  const query = input.query.trim();
  if (query.length === 0) {
    throw new Error("search query is required");
  }

  if (input.queryEmbedding) {
    if (input.queryEmbedding.length === 0 || input.queryEmbedding.some((value) => !Number.isFinite(value))) {
      throw new Error("query embedding must contain only finite numbers");
    }

    if (input.queryEmbedding.length > maxQueryEmbeddingDimensions) {
      throw new Error(`query embedding must not exceed ${maxQueryEmbeddingDimensions} dimensions`);
    }
  }

  const requesterRole = input.requesterRole ?? DEFAULT_RETRIEVAL_ROLE;
  if (!isRetrievalRole(requesterRole)) {
    throw new Error(`requesterRole must be one of: ${retrievalRoles.join(", ")}`);
  }

  return {
    ...input,
    query,
    limit: input.limit ?? 10,
    includeGlobal: input.includeGlobal ?? true,
    requesterRole
  };
}

export function isValidStopGoDecision(value: string): value is StopGoDecision {
  return (stopGoDecisions as readonly string[]).includes(value);
}
