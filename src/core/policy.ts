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
  const lowerQuery = query.toLowerCase();
  const haystack = `${entry.title} ${entry.content}`.toLowerCase();
  const lexicalScore = haystack.includes(lowerQuery) ? 10 : 0;
  const projectBias = sameProject ? 5 : entry.scope === "global" ? 1 : 0;
  return lexicalScore + projectBias;
}
