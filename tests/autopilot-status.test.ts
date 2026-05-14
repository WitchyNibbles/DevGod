import assert from "node:assert/strict";
import test from "node:test";
import {
  advanceTaskQueue,
  parseTaskQueueContent,
  selectNextUnblockedTask,
  summarizeTaskQueue
} from "../src/devgod/task-queue.ts";

type QueueFixture = {
  project_status: string;
  current_task_id: string | null;
  tasks: Array<Record<string, unknown>>;
};

function buildQueue(overrides: Partial<QueueFixture> = {}): QueueFixture {
  return {
    project_status: "in_progress",
    current_task_id: null,
    tasks: [],
    ...overrides
  };
}

test("selectNextUnblockedTask returns the first eligible task", () => {
  const queue = parseTaskQueueContent(
    JSON.stringify(
      buildQueue({
        tasks: [
          {
            id: "task-001",
            title: "First",
            status: "done",
            class: "prototype_slice",
            depends_on: [],
            acceptance_criteria: [],
            verification: [],
            evidence: [],
            blocker: null
          },
          {
            id: "task-002",
            title: "Second",
            status: "pending",
            class: "prototype_slice",
            depends_on: [],
            acceptance_criteria: [],
            verification: [],
            evidence: [],
            blocker: null
          }
        ]
      })
    )
  );

  assert.equal(selectNextUnblockedTask(queue)?.id, "task-002");
  assert.equal(summarizeTaskQueue(queue).pendingCount, 1);
});

test("selectNextUnblockedTask skips blocked tasks", () => {
  const queue = parseTaskQueueContent(
    JSON.stringify(
      buildQueue({
        tasks: [
          {
            id: "task-001",
            title: "Blocked",
            status: "blocked",
            class: "prototype_slice",
            depends_on: [],
            acceptance_criteria: [],
            verification: [],
            evidence: [],
            blocker: "needs approval"
          },
          {
            id: "task-002",
            title: "Ready",
            status: "pending",
            class: "docs_only",
            depends_on: [],
            acceptance_criteria: [],
            verification: [],
            evidence: [],
            blocker: null
          }
        ]
      })
    )
  );

  assert.equal(selectNextUnblockedTask(queue)?.id, "task-002");
  assert.equal(summarizeTaskQueue(queue).blockedTasks.map((task) => task.id).join(","), "task-001");
});

test("selectNextUnblockedTask skips tasks with unmet dependencies", () => {
  const queue = parseTaskQueueContent(
    JSON.stringify(
      buildQueue({
        tasks: [
          {
            id: "task-001",
            title: "Base",
            status: "pending",
            class: "prototype_slice",
            depends_on: [],
            acceptance_criteria: [],
            verification: [],
            evidence: [],
            blocker: null
          },
          {
            id: "task-002",
            title: "Dependent",
            status: "pending",
            class: "release_candidate",
            depends_on: ["task-001"],
            acceptance_criteria: [],
            verification: [],
            evidence: [],
            blocker: null
          },
          {
            id: "task-003",
            title: "Independent",
            status: "pending",
            class: "docs_only",
            depends_on: [],
            acceptance_criteria: [],
            verification: [],
            evidence: [],
            blocker: null
          }
        ]
      })
    )
  );

  assert.equal(selectNextUnblockedTask(queue)?.id, "task-001");
});

test("parseTaskQueueContent rejects invalid task statuses", () => {
  assert.throws(
    () =>
      parseTaskQueueContent(
        JSON.stringify(
          buildQueue({
            tasks: [
              {
                id: "task-001",
                title: "Bad",
                status: "ready",
                class: "prototype_slice",
                depends_on: [],
                acceptance_criteria: [],
                verification: [],
                evidence: [],
                blocker: null
              }
            ]
          })
        )
      ),
    /invalid status/i
  );
});

test("parseTaskQueueContent rejects invalid task classes", () => {
  assert.throws(
    () =>
      parseTaskQueueContent(
        JSON.stringify(
          buildQueue({
            tasks: [
              {
                id: "task-001",
                title: "Bad",
                status: "pending",
                class: "feature_flag",
                depends_on: [],
                acceptance_criteria: [],
                verification: [],
                evidence: [],
                blocker: null
              }
            ]
          })
        )
      ),
    /invalid class/i
  );
});

test("parseTaskQueueContent rejects missing dependencies", () => {
  assert.throws(
    () =>
      parseTaskQueueContent(
        JSON.stringify(
          buildQueue({
            tasks: [
              {
                id: "task-001",
                title: "Dependent",
                status: "pending",
                class: "prototype_slice",
                depends_on: ["task-999"],
                acceptance_criteria: [],
                verification: [],
                evidence: [],
                blocker: null
              }
            ]
          })
        )
      ),
    /missing dependency/i
  );
});

test("advanceTaskQueue marks the active task done and activates the next eligible task", () => {
  const queue = parseTaskQueueContent(
    JSON.stringify(
      buildQueue({
        current_task_id: "task-001",
        tasks: [
          {
            id: "task-001",
            title: "Current",
            status: "in_progress",
            class: "prototype_slice",
            depends_on: [],
            acceptance_criteria: [],
            verification: [],
            evidence: [],
            blocker: null
          },
          {
            id: "task-002",
            title: "Blocked next",
            status: "blocked",
            class: "release_candidate",
            depends_on: [],
            acceptance_criteria: [],
            verification: [],
            evidence: [],
            blocker: "waiting"
          },
          {
            id: "task-003",
            title: "Dependency gated",
            status: "pending",
            class: "release_candidate",
            depends_on: ["task-002"],
            acceptance_criteria: [],
            verification: [],
            evidence: [],
            blocker: null
          },
          {
            id: "task-004",
            title: "Eligible",
            status: "pending",
            class: "release_candidate",
            depends_on: ["task-001"],
            acceptance_criteria: [],
            verification: [],
            evidence: [],
            blocker: null
          }
        ]
      })
    )
  );

  const result = advanceTaskQueue(queue, "task-001");

  assert.equal(result.completedTask.id, "task-001");
  assert.equal(result.nextTask?.id, "task-004");
  assert.equal(result.queue.current_task_id, "task-004");
  assert.equal(result.queue.tasks.find((task) => task.id === "task-001")?.status, "done");
  assert.equal(result.queue.tasks.find((task) => task.id === "task-004")?.status, "in_progress");
});
