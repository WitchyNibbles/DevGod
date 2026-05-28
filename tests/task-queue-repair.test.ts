import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  parseTaskQueueContent,
  repairTaskQueueContent
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
