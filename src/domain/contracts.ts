import {
  type IntakeRequestInput,
  type IntakeSummary,
  type MemoryPromotionInput,
  type RetrievalMetadata,
  type RetrievalRole,
  type SearchMemoryInput,
  type StopGoDecision,
  retrievalRoles,
  stopGoDecisions,
  type TaskPacketInput
} from "./types.ts";

const maxQueryEmbeddingDimensions = 1536;
const retrievalRoleSet = new Set<string>(retrievalRoles);

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

export function isRetrievalRole(value: string): value is RetrievalRole {
  return retrievalRoleSet.has(value);
}

export function defaultRetrievalRoles(): RetrievalRole[] {
  return [...retrievalRoles];
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

  if (packet.taskId.trim().length === 0) {
    errors.push("taskId is required");
  }

  if (packet.ownerRole.trim().length === 0) {
    errors.push("ownerRole is required");
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

  const duplicateWriteScope = new Set<string>();
  for (const path of packet.allowedWriteScope) {
    if (duplicateWriteScope.has(path)) {
      errors.push(`duplicate write scope: ${path}`);
    }
    duplicateWriteScope.add(path);
  }

  return errors;
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
