import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  advanceTaskQueue,
  deriveTaskQueueEvidence,
  parseTaskQueueContent,
  readTaskQueue,
  repairTaskQueueContent,
  validateWorkflowTaskQueue
} from "../src/devgod/task-queue.ts";
import { executeRepairTaskQueueCommandFromArgs } from "../src/admin.ts";

test("parseTaskQueueContent accepts the legacy implementation_slice alias and canonicalizes it", () => {
  const queue = parseTaskQueueContent(
    JSON.stringify({
      project_status: "in_progress",
      current_task_id: null,
      tasks: [
        {
          id: "task-001",
          title: "Legacy slice",
          status: "pending",
          class: "implementation_slice",
          depends_on: [],
          acceptance_criteria: [],
          verification: [],
          evidence: [],
          blocker: null
        }
      ]
    })
  );

  assert.equal(queue.tasks[0]?.class, "prototype_slice");
});

test("repairTaskQueueContent rewrites the legacy implementation_slice alias", () => {
  const repaired = repairTaskQueueContent(
    JSON.stringify({
      project_status: "in_progress",
      current_task_id: null,
      tasks: [
        {
          id: "task-001",
          title: "Legacy slice",
          status: "pending",
          class: "implementation_slice",
          depends_on: [],
          acceptance_criteria: [],
          verification: [],
          evidence: [],
          blocker: null
        }
      ]
    })
  );

  assert.equal(repaired.changed, true);
  assert.match(repaired.content, /"class": "prototype_slice"/);
  assert.doesNotMatch(repaired.content, /implementation_slice/);
});

test("executeRepairTaskQueueCommandFromArgs rewrites an installed repo queue file to canonical classes", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "devgod-repair-task-queue-"));
  const queuePath = path.join(directory, ".devgod", "work", "task-queue.json");

  await mkdir(path.dirname(queuePath), { recursive: true });
  await writeFile(
    queuePath,
    `${JSON.stringify(
      {
        project_status: "in_progress",
        current_task_id: null,
        tasks: [
          {
            id: "task-001",
            title: "Legacy slice",
            status: "pending",
            class: "implementation_slice",
            depends_on: [],
            acceptance_criteria: [],
            verification: [],
            evidence: [],
            blocker: null
          }
        ]
      },
      null,
      2
    )}\n`,
    "utf8"
  );

  const result = await executeRepairTaskQueueCommandFromArgs([], {
    cwd: directory
  });

  assert.equal(result.changed, true);
  assert.equal(result.repairedTasks, 1);
  const content = await readFile(queuePath, "utf8");
  assert.match(content, /"class": "prototype_slice"/);
  assert.doesNotMatch(content, /implementation_slice/);
});

test("deriveTaskQueueEvidence trims, deduplicates, and filters blank verification entries", () => {
  const evidence = deriveTaskQueueEvidence({
    taskId: "task-001",
    verification: [
      "npm run check:coverage",
      "npm run check:coverage",
      "  npm run typecheck  ",
      "",
      "   "
    ],
    qualityGates: ["release_readiness_required", "release_readiness_required"]
  });

  assert.deepEqual(evidence, [
    "task packet: task-001",
    "verification: npm run check:coverage",
    "verification: npm run typecheck",
    "quality gate: release_readiness_required"
  ]);
});

test("validateWorkflowTaskQueue exempts docs-only tasks but rejects release tasks without workflow evidence", () => {
  const docsOnlyQueue = parseTaskQueueContent(
    JSON.stringify({
      project_status: "in_progress",
      current_task_id: null,
      tasks: [
        {
          id: "docs-001",
          title: "Docs only",
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
  );

  assert.equal(validateWorkflowTaskQueue(docsOnlyQueue), docsOnlyQueue);

  const releaseQueue = parseTaskQueueContent(
    JSON.stringify({
      project_status: "in_progress",
      current_task_id: null,
      tasks: [
        {
          id: "release-001",
          title: "Release candidate",
          status: "pending",
          class: "release_candidate",
          depends_on: [],
          acceptance_criteria: [],
          verification: ["npm run check:quality"],
          evidence: ["task packet: release-001"],
          blocker: null
        }
      ]
    })
  );

  assert.throws(() => validateWorkflowTaskQueue(releaseQueue), /must include at least one acceptance criterion/);
});

test("validateWorkflowTaskQueue rejects blank-only verification steps for workflow tasks", () => {
  const queue = parseTaskQueueContent(
    JSON.stringify({
      project_status: "in_progress",
      current_task_id: null,
      tasks: [
        {
          id: "release-001",
          title: "Release candidate",
          status: "pending",
          class: "release_candidate",
          depends_on: [],
          acceptance_criteria: ["ship the candidate"],
          verification: ["", "   "],
          evidence: ["task packet: release-001"],
          blocker: null
        }
      ]
    })
  );

  assert.throws(() => validateWorkflowTaskQueue(queue), /must include at least one verification step/);
});

test("validateWorkflowTaskQueue rejects blank-only evidence references for workflow tasks", () => {
  const queue = parseTaskQueueContent(
    JSON.stringify({
      project_status: "in_progress",
      current_task_id: null,
      tasks: [
        {
          id: "release-001",
          title: "Release candidate",
          status: "pending",
          class: "release_candidate",
          depends_on: [],
          acceptance_criteria: ["ship the candidate"],
          verification: ["npm run check:quality"],
          evidence: ["", "   "],
          blocker: null
        }
      ]
    })
  );

  assert.throws(() => validateWorkflowTaskQueue(queue), /must include at least one evidence reference/);
});

test("advanceTaskQueue marks a completed terminal queue as done", () => {
  const queue = parseTaskQueueContent(
    JSON.stringify({
      project_status: "in_progress",
      current_task_id: "task-001",
      tasks: [
        {
          id: "task-001",
          title: "Only task",
          status: "in_progress",
          class: "prototype_slice",
          depends_on: [],
          acceptance_criteria: ["complete the slice"],
          verification: ["npm run check:coverage"],
          evidence: ["task packet: task-001"],
          blocker: null
        }
      ]
    })
  );

  const result = advanceTaskQueue(queue, "task-001");

  assert.equal(result.completedTask.status, "done");
  assert.equal(result.nextTask, null);
  assert.equal(result.queue.project_status, "done");
  assert.equal(result.queue.current_task_id, null);
  assert.equal(result.queue.tasks[0]?.status, "done");
});

test("advanceTaskQueue rejects non-current, blocked, missing, and already-done tasks", () => {
  const baseQueue = parseTaskQueueContent(
    JSON.stringify({
      project_status: "in_progress",
      current_task_id: "task-001",
      tasks: [
        {
          id: "task-001",
          title: "Current",
          status: "in_progress",
          class: "prototype_slice",
          depends_on: [],
          acceptance_criteria: ["complete the slice"],
          verification: ["npm run check:coverage"],
          evidence: ["task packet: task-001"],
          blocker: null
        },
        {
          id: "task-002",
          title: "Blocked",
          status: "blocked",
          class: "security_sensitive",
          depends_on: [],
          acceptance_criteria: ["security review"],
          verification: ["npm run check:quality"],
          evidence: ["task packet: task-002"],
          blocker: "needs review"
        }
      ]
    })
  );

  assert.throws(() => advanceTaskQueue(baseQueue, "missing"), /does not exist in the queue/);
  assert.throws(() => advanceTaskQueue(baseQueue, "task-002"), /is not the current active queue task/);

  const blockedQueue = parseTaskQueueContent(
    JSON.stringify({
      ...baseQueue,
      current_task_id: "task-002"
    })
  );
  assert.throws(() => advanceTaskQueue(blockedQueue, "task-002"), /is blocked and cannot advance/);

  const doneQueue = parseTaskQueueContent(
    JSON.stringify({
      ...baseQueue,
      tasks: [
        {
          ...baseQueue.tasks[0],
          status: "done"
        },
        baseQueue.tasks[1]
      ]
    })
  );
  assert.throws(() => advanceTaskQueue(doneQueue, "task-001"), /is already done/);
});

test("advanceTaskQueue keeps the queue in progress when remaining tasks are dependency gated", () => {
  const queue = parseTaskQueueContent(
    JSON.stringify({
      project_status: "in_progress",
      current_task_id: "task-001",
      tasks: [
        {
          id: "task-001",
          title: "Current",
          status: "in_progress",
          class: "prototype_slice",
          depends_on: [],
          acceptance_criteria: ["complete the slice"],
          verification: ["npm run check:coverage"],
          evidence: ["task packet: task-001"],
          blocker: null
        },
        {
          id: "task-002",
          title: "Dependency gated",
          status: "pending",
          class: "release_candidate",
          depends_on: ["task-003"],
          acceptance_criteria: ["release prep"],
          verification: ["npm run check:quality"],
          evidence: ["task packet: task-002"],
          blocker: null
        },
        {
          id: "task-003",
          title: "Blocked prerequisite",
          status: "blocked",
          class: "security_sensitive",
          depends_on: [],
          acceptance_criteria: ["security review"],
          verification: ["npm run check:quality"],
          evidence: ["task packet: task-003"],
          blocker: "waiting on review"
        }
      ]
    })
  );

  const result = advanceTaskQueue(queue, "task-001");

  assert.equal(result.completedTask.status, "done");
  assert.equal(result.nextTask, null);
  assert.equal(result.queue.current_task_id, null);
  assert.equal(result.queue.project_status, "in_progress");
  assert.equal(result.queue.tasks.find((task) => task.id === "task-002")?.status, "pending");
});

test("readTaskQueue loads the default installed queue path", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "devgod-read-task-queue-"));
  const queuePath = path.join(directory, ".devgod", "work", "task-queue.json");

  await mkdir(path.dirname(queuePath), { recursive: true });
  await writeFile(
    queuePath,
    `${JSON.stringify(
      {
        project_status: "in_progress",
        current_task_id: "task-001",
        tasks: [
          {
            id: "task-001",
            title: "Read queue",
            status: "in_progress",
            class: "prototype_slice",
            depends_on: [],
            acceptance_criteria: ["queue exists"],
            verification: ["node --experimental-strip-types src/devgod/autopilot-status.ts"],
            evidence: ["task packet: task-001"],
            blocker: null
          }
        ]
      },
      null,
      2
    )}\n`,
    "utf8"
  );

  const previousCwd = process.cwd();
  process.chdir(directory);
  try {
    const queue = await readTaskQueue();
    assert.equal(queue.current_task_id, "task-001");
    assert.equal(queue.tasks[0]?.title, "Read queue");
  } finally {
    process.chdir(previousCwd);
  }
});
