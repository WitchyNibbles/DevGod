import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
// @ts-expect-error internal hook policy module is a runtime .mjs helper without TypeScript declarations
import { evaluatePreToolUse, evaluateStop } from "../plugins/devgod/scripts/hook-policy.mjs";
// @ts-expect-error internal hook utility module is a runtime .mjs helper without TypeScript declarations
import { readActiveTaskContext } from "../plugins/devgod/scripts/hook-utils.mjs";

test("pre-tool-use hook denies apply_patch edits outside the active task scope", () => {
  const parsed = evaluatePreToolUse(
    {
      tool_name: "apply_patch",
      tool_input: {
        command: ["*** Begin Patch", "*** Update File: AGENTS.md", "+changed", "*** End Patch"].join("\n")
      }
    },
    {
      repoRoot: "/tmp/devgod-hook-test",
      activeTaskId: "task-hook-1",
      allowedWriteScope: ["src/core"],
      queueCurrentTaskId: undefined
    }
  );

  assert.ok(parsed);
  assert.equal(parsed.hookSpecificOutput.hookEventName, "PreToolUse");
  assert.equal(parsed.hookSpecificOutput.permissionDecision, "deny");
  assert.match(parsed.hookSpecificOutput.permissionDecisionReason, /AGENTS\.md|managed control-layer/i);
});

test("stop hook continues when an active devgod task remains and no real blocker is stated", () => {
  const parsed = evaluateStop(
    {
      last_assistant_message: "Implemented the first slice and stopping here."
    },
    {
      repoRoot: "/tmp/devgod-hook-test",
      activeTaskId: "task-hook-2",
      allowedWriteScope: [],
      queueCurrentTaskId: undefined
    }
  );

  assert.ok(parsed);
  assert.equal(parsed.decision, "block");
  assert.match(parsed.reason, /active devgod task task-hook-2 remains in progress/i);
});

test("stop hook allows explicit write-scope blockers to end the loop", () => {
  const parsed = evaluateStop(
    {
      last_assistant_message:
        "I can't continue because apply_patch target AGENTS.md is outside the active devgod task write scope and managed control-layer edits are blocked outside explicit task scope."
    },
    {
      repoRoot: "/tmp/devgod-hook-test",
      activeTaskId: "task-hook-3",
      allowedWriteScope: ["src/core"],
      queueCurrentTaskId: undefined
    }
  );

  assert.equal(parsed, undefined);
});

test("stop hook allows explicit task-state blockers to end the loop", () => {
  const parsed = evaluateStop(
    {
      last_assistant_message:
        "I cannot continue because the queue state says current_task_id is null while .devgod/ACTIVE still points at task-hook-4, so this devgod task state mismatch needs repair before I can proceed."
    },
    {
      repoRoot: "/tmp/devgod-hook-test",
      activeTaskId: "task-hook-4",
      allowedWriteScope: ["src/core"],
      queueCurrentTaskId: "task-hook-4"
    }
  );

  assert.equal(parsed, undefined);
});

test("stop hook allows explicit completion summaries when only external runtime closure remains", () => {
  const parsed = evaluateStop(
    {
      last_assistant_message: [
        "No blocker remains. The scoped task is complete.",
        "",
        "There is nothing left to execute within the active task scope.",
        "The remaining step is external workflow/runtime closure for this completed task."
      ].join("\n")
    },
    {
      repoRoot: "/tmp/devgod-hook-test",
      activeTaskId: "task-hook-4b",
      allowedWriteScope: [
        "/home/gii/apps/lexer/GII2/lexia/core/senders/jump_api.py",
        "/home/gii/apps/lexer/GII2/lexia/tests/test_jump_api.py"
      ],
      queueCurrentTaskId: undefined
    }
  );

  assert.equal(parsed, undefined);
});

test("stop hook still blocks vague blocker summaries without a concrete devgod cause", () => {
  const parsed = evaluateStop(
    {
      last_assistant_message: "I'm blocked and stopping here."
    },
    {
      repoRoot: "/tmp/devgod-hook-test",
      activeTaskId: "task-hook-5",
      allowedWriteScope: ["src/core"],
      queueCurrentTaskId: undefined
    }
  );

  assert.ok(parsed);
  assert.equal(parsed.decision, "block");
  assert.match(parsed.reason, /state the real blocker explicitly/i);
});

test("stop hook still blocks completion summaries without an external closure cause", () => {
  const parsed = evaluateStop(
    {
      last_assistant_message: "The scoped task is complete and I'm stopping here."
    },
    {
      repoRoot: "/tmp/devgod-hook-test",
      activeTaskId: "task-hook-5b",
      allowedWriteScope: ["src/core"],
      queueCurrentTaskId: undefined
    }
  );

  assert.ok(parsed);
  assert.equal(parsed.decision, "block");
  assert.match(parsed.reason, /state the real blocker explicitly/i);
});

test("hook context prefers queue state over stale ACTIVE export when the queue is complete", async () => {
  const repoRoot = await mkdtemp(join(tmpdir(), "devgod-hook-context-"));

  try {
    await mkdir(join(repoRoot, ".devgod", "work", "tasks"), { recursive: true });
    await writeFile(
      join(repoRoot, ".devgod", "ACTIVE"),
      "task_id=packet-rw-008-geospatial-dueon-sgp\nworkflow=devgod\nstate=active\n",
      "utf8"
    );
    await writeFile(
      join(repoRoot, ".devgod", "work", "task-queue.json"),
      JSON.stringify(
        {
          project_status: "complete",
          current_task_id: null,
          tasks: []
        },
        null,
        2
      ),
      "utf8"
    );

    const context = await readActiveTaskContext({ repoRoot });
    const parsed = evaluateStop(
      {
        last_assistant_message: "Implemented the fix and tests."
      },
      context
    );

    assert.equal(context.activeTaskId, undefined);
    assert.equal(context.queueCurrentTaskId, null);
    assert.equal(parsed, undefined);
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
  }
});

test("hook context loads write scope from the queue-selected task instead of stale ACTIVE", async () => {
  const repoRoot = await mkdtemp(join(tmpdir(), "devgod-hook-scope-"));

  try {
    await mkdir(join(repoRoot, ".devgod", "work", "tasks"), { recursive: true });
    await writeFile(
      join(repoRoot, ".devgod", "ACTIVE"),
      "task_id=task-stale\nworkflow=devgod\nstate=active\n",
      "utf8"
    );
    await writeFile(
      join(repoRoot, ".devgod", "work", "task-queue.json"),
      JSON.stringify(
        {
          project_status: "in_progress",
          current_task_id: "task-authoritative",
          tasks: []
        },
        null,
        2
      ),
      "utf8"
    );
    await writeFile(
      join(repoRoot, ".devgod", "work", "tasks", "task-task-authoritative.md"),
      [
        "# Task Packet",
        "",
        "## Allowed write scope",
        "",
        "- `src/runtime`",
        "- `tests`",
        ""
      ].join("\n"),
      "utf8"
    );

    const context = await readActiveTaskContext({ repoRoot });

    assert.equal(context.activeTaskId, "task-authoritative");
    assert.equal(context.queueCurrentTaskId, "task-authoritative");
    assert.deepEqual(context.allowedWriteScope, ["src/runtime", "tests"]);
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
  }
});
