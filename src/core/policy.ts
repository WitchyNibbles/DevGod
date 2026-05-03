import {
  type ApprovalDecision,
  type LockRecord,
  type MemoryEntryRecord,
  type ReviewRecord,
  type TaskPacketInput,
  type TaskRecord
} from "../domain/types.ts";

function pathOverlap(left: string, right: string): boolean {
  return left === right || left.startsWith(`${right}/`) || right.startsWith(`${left}/`);
}

export function hasOverlappingWriteScope(left: readonly string[], right: readonly string[]): boolean {
  return left.some((leftPath) => right.some((rightPath) => pathOverlap(leftPath, rightPath)));
}

export function findTaskDependencies(task: TaskPacketInput, allTasks: readonly TaskRecord[]): TaskRecord[] {
  const taskIds = new Set(task.dependencies);
  return allTasks.filter((candidate) => taskIds.has(candidate.packet.taskId));
}

export function findBlockingReasonsForTask(
  task: TaskRecord,
  allTasks: readonly TaskRecord[],
  activeLocks: readonly LockRecord[]
): string[] {
  const blockers: string[] = [];

  for (const dependency of findTaskDependencies(task.packet, allTasks)) {
    if (!["approved", "done"].includes(dependency.status)) {
      blockers.push(`dependency ${dependency.packet.taskId} is ${dependency.status}`);
    }
  }

  const lockConflict = activeLocks.find(
    (lock) =>
      lock.taskId !== task.packet.taskId &&
      lock.status === "active" &&
      hasOverlappingWriteScope(lock.scopePaths, task.packet.allowedWriteScope)
  );

  if (lockConflict) {
    blockers.push(`write scope locked by ${lockConflict.taskId}`);
  }

  return blockers;
}

export function evaluateReviewDecision(
  task: TaskRecord,
  reviews: readonly ReviewRecord[]
): { decision: ApprovalDecision; blockers: string[] } {
  const blockers: string[] = [];

  for (const requiredReview of task.packet.requiredReviews) {
    const matchingReviews = reviews.filter((review) => review.reviewerRole === requiredReview);
    if (matchingReviews.length === 0) {
      blockers.push(`missing required review: ${requiredReview}`);
      continue;
    }

    for (const review of matchingReviews) {
      if (review.state === "waived" && !review.waiverReason) {
        blockers.push(`waived review missing reason: ${requiredReview}`);
      }

      if (review.state === "blocked" && ["critical", "high"].includes(review.severity)) {
        blockers.push(`${requiredReview} review blocked with ${review.severity} severity`);
      }
    }
  }

  return {
    decision: blockers.length > 0 ? "blocked" : "approved",
    blockers
  };
}

export function scoreMemoryResult(
  entry: Pick<MemoryEntryRecord, "content" | "title" | "scope">,
  query: string,
  sameProject: boolean
): number {
  const normalizedQuery = query.trim().toLowerCase();
  const queryTerms = tokenizeSearchText(query);
  const titleTerms = new Set(tokenizeSearchText(entry.title));
  const contentTerms = new Set(tokenizeSearchText(entry.content));

  const titlePhraseBoost = normalizedQuery.length > 0 && entry.title.toLowerCase().includes(normalizedQuery) ? 6 : 0;
  const contentPhraseBoost = normalizedQuery.length > 0 && entry.content.toLowerCase().includes(normalizedQuery) ? 3 : 0;
  const titleCoverageBoost = scoreTermCoverage(titleTerms, queryTerms, 6);
  const contentCoverageBoost = scoreTermCoverage(contentTerms, queryTerms, 3);
  const projectBias = sameProject ? 4 : entry.scope === "global" ? 1 : 0;

  return titlePhraseBoost + contentPhraseBoost + titleCoverageBoost + contentCoverageBoost + projectBias;
}

export function compareMemorySearchResults(
  left: Pick<MemoryEntryRecord, "id" | "title"> & { score: number; projectSlug?: string | undefined },
  right: Pick<MemoryEntryRecord, "id" | "title"> & { score: number; projectSlug?: string | undefined }
): number {
  const leftAuthority = left.projectSlug ? 1 : 0;
  const rightAuthority = right.projectSlug ? 1 : 0;
  if (leftAuthority !== rightAuthority) {
    return rightAuthority - leftAuthority;
  }

  if (left.score !== right.score) {
    return right.score - left.score;
  }

  const titleComparison = left.title.localeCompare(right.title);
  if (titleComparison !== 0) {
    return titleComparison;
  }

  return left.id.localeCompare(right.id);
}

function tokenizeSearchText(value: string): string[] {
  return [...new Set(value.toLowerCase().match(/[a-z0-9]+/g) ?? [])];
}

function scoreTermCoverage(haystackTerms: ReadonlySet<string>, queryTerms: readonly string[], weight: number): number {
  if (queryTerms.length === 0) {
    return 0;
  }

  let hits = 0;
  for (const term of queryTerms) {
    if (haystackTerms.has(term)) {
      hits += 1;
    }
  }

  return (hits / queryTerms.length) * weight;
}
