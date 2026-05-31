import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
// @ts-ignore internal hook policy module is a runtime .mjs helper without TypeScript declarations
import {
  evaluatePostToolUse,
  evaluatePreToolUse,
  evaluateSessionStart,
  evaluateStop,
  evaluateUserPromptSubmit
} from "../plugins/devgod/scripts/hook-policy.mjs";
// @ts-ignore internal hook utility module is a runtime .mjs helper without TypeScript declarations
import { readActiveTaskContext } from "../plugins/devgod/scripts/hook-utils.mjs";

const execFileAsync = promisify(execFile);

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

test("pre-tool-use hook allows read-only Bash inspection of managed control-layer paths", () => {
  const parsed = evaluatePreToolUse(
    {
      tool_name: "Bash",
      tool_input: {
        command: "sed -n '1,40p' .agents/skills/devgod-intake/SKILL.md"
      }
    },
    {
      repoRoot: "/tmp/devgod-hook-test",
      activeTaskId: "task-hook-read-only",
      allowedWriteScope: ["src/core"],
      queueCurrentTaskId: undefined
    }
  );

  if (parsed) {
    assert.notEqual(parsed.hookSpecificOutput.permissionDecision, "deny");
  }
});

test("pre-tool-use hook still denies write-like Bash commands for managed control-layer paths", () => {
  const parsed = evaluatePreToolUse(
    {
      tool_name: "Bash",
      tool_input: {
        command: "touch .codex/tmp.txt"
      }
    },
    {
      repoRoot: "/tmp/devgod-hook-test",
      activeTaskId: "task-hook-write-like",
      allowedWriteScope: ["src/core"],
      queueCurrentTaskId: undefined
    }
  );

  assert.ok(parsed);
  assert.equal(parsed.hookSpecificOutput.hookEventName, "PreToolUse");
  assert.equal(parsed.hookSpecificOutput.permissionDecision, "deny");
  assert.match(parsed.hookSpecificOutput.permissionDecisionReason, /\.codex|managed control-layer/i);
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

test("stop hook allows explicit external elapsed-time blockers to end the loop", () => {
  const parsed = evaluateStop(
    {
      last_assistant_message: [
        "The real blocker is external elapsed time, not code or setup.",
        "",
        "build-hexchange-mvp cannot be completed yet because the live-readiness rule for Kraken crypto requires 24 observed paper-trading hours.",
        "The remaining blocker is approximately 17.5 more observed hours of Kraken paper validation.",
        "The session is already running and gathering evidence; no further local code change can satisfy that gate until time passes."
      ].join("\n")
    },
    {
      repoRoot: "/tmp/devgod-hook-test",
      activeTaskId: "task-hook-external-wait",
      allowedWriteScope: ["src/core"],
      queueCurrentTaskId: undefined
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

test("stop hook allows stop when structured continuation intent defers same-thread follow-up", () => {
  const parsed = evaluateStop(
    {
      last_assistant_message: "The current turn is complete."
    },
    {
      repoRoot: "/tmp/devgod-hook-test",
      activeTaskId: "task-hook-defer-same-thread",
      allowedWriteScope: ["src/core"],
      continuationIntent: "defer_same_thread",
      queueCurrentTaskId: undefined
    }
  );

  assert.equal(parsed, undefined);
});

test("stop hook allows stop when structured continuation intent defers a fresh run", () => {
  const parsed = evaluateStop(
    {
      last_assistant_message: "The current turn is complete."
    },
    {
      repoRoot: "/tmp/devgod-hook-test",
      activeTaskId: "task-hook-defer-fresh-run",
      allowedWriteScope: ["src/core"],
      continuationIntent: "defer_fresh_run",
      queueCurrentTaskId: undefined
    }
  );

  assert.equal(parsed, undefined);
});

test("stop hook still blocks when structured continuation intent says continue now", () => {
  const parsed = evaluateStop(
    {
      last_assistant_message: "The current turn is complete."
    },
    {
      repoRoot: "/tmp/devgod-hook-test",
      activeTaskId: "task-hook-continue-now",
      allowedWriteScope: ["src/core"],
      continuationIntent: "continue_now",
      queueCurrentTaskId: undefined
    }
  );

  assert.ok(parsed);
  assert.equal(parsed.decision, "block");
  assert.match(parsed.reason, /task-hook-continue-now remains in progress/i);
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

test("post-tool-use persists structured blocker state for non-zero Bash failures", async () => {
  const repoRoot = await mkdtemp(join(tmpdir(), "devgod-hook-blocker-state-"));

  try {
    await mkdir(join(repoRoot, ".devgod", "work", "daemon"), { recursive: true });

    const parsed = evaluatePostToolUse(
      {
        tool_name: "Bash",
        turn_id: "turn-hook-blocker-1",
        tool_input: {
          command: "docker compose up devgod"
        },
        tool_response: {
          exitCode: 127,
          stdout: "",
          stderr: "bash: docker: command not found"
        }
      },
      {
        repoRoot,
        activeTaskId: "task-hook-blocker-state",
        allowedWriteScope: ["src/core"],
        queueCurrentTaskId: "task-hook-blocker-state"
      }
    );

    assert.equal(parsed, undefined);

    const recorded = JSON.parse(
      await readFile(join(repoRoot, ".devgod", "work", "daemon", "hook-blocker-state.json"), "utf8")
    );

    assert.equal(recorded.activeTaskId, "task-hook-blocker-state");
    assert.equal(recorded.turnId, "turn-hook-blocker-1");
    assert.equal(recorded.exitCode, 127);
    assert.equal(recorded.blockerKind, "command_not_found");
    assert.match(recorded.summary, /docker|command not found/i);
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
  }
});

test("stop hook blocks once from trusted structured blocker state before transcript heuristics", () => {
  const parsed = evaluateStop(
    {
      stop_hook_active: false,
      last_assistant_message: "The current turn is complete."
    },
    {
      repoRoot: "/tmp/devgod-hook-test",
      activeTaskId: "task-hook-structured-blocker",
      allowedWriteScope: ["src/core"],
      queueCurrentTaskId: "task-hook-structured-blocker",
      hookBlockerState: {
        activeTaskId: "task-hook-structured-blocker",
        turnId: "turn-structured-1",
        blockerKind: "command_not_found",
        summary: "docker command not found",
        exitCode: 127
      }
    }
  );

  assert.ok(parsed);
  assert.equal(parsed.decision, "block");
  assert.match(parsed.reason, /docker command not found/i);
});

test("stop hook suppresses repeated continuation when the same structured blocker is already active", () => {
  const parsed = evaluateStop(
    {
      stop_hook_active: true,
      last_assistant_message: "The current turn is complete."
    },
    {
      repoRoot: "/tmp/devgod-hook-test",
      activeTaskId: "task-hook-structured-blocker-repeat",
      allowedWriteScope: ["src/core"],
      queueCurrentTaskId: "task-hook-structured-blocker-repeat",
      hookBlockerState: {
        activeTaskId: "task-hook-structured-blocker-repeat",
        turnId: "turn-structured-2",
        blockerKind: "command_not_found",
        summary: "docker command not found",
        exitCode: 127
      }
    }
  );

  assert.equal(parsed, undefined);
});

test("session-start hook stays silent when it would only repeat generic devgod policy", () => {
  const parsed = evaluateSessionStart(
    { source: "startup" },
    {
      repoRoot: "/tmp/devgod-hook-test",
      activeTaskId: undefined,
      allowedWriteScope: [],
      queueCurrentTaskId: undefined
    }
  );

  assert.equal(parsed, undefined);
});

test("session-start entrypoint exits cleanly when no additional context is available", async () => {
  const repoRoot = await mkdtemp(join(tmpdir(), "devgod-session-start-empty-"));
  const { stdout, stderr } = await execFileAsync(
    "bash",
    ["-lc", `${JSON.stringify(process.execPath)} plugins/devgod/scripts/session-start.mjs < /dev/null`],
    {
      cwd: process.cwd(),
      env: {
        ...process.env,
        PLUGIN_ROOT: join(repoRoot, "plugins", "devgod")
      }
    }
  );

  assert.equal(stdout, "");
  assert.equal(stderr, "");
  await rm(repoRoot, { recursive: true, force: true });
});

test("session-start hook emits compact context when an active task is present", () => {
  const parsed = evaluateSessionStart(
    { source: "resume" },
    {
      repoRoot: "/tmp/devgod-hook-test",
      activeTaskId: "task-hook-session",
      allowedWriteScope: ["src/runtime", "tests"],
      queueCurrentTaskId: "task-hook-session"
    }
  );

  assert.ok(parsed);
  assert.equal(parsed.hookSpecificOutput.hookEventName, "SessionStart");
  assert.match(parsed.hookSpecificOutput.additionalContext, /task-hook-session/);
  assert.match(parsed.hookSpecificOutput.additionalContext, /src\/runtime, tests/);
  assert.doesNotMatch(
    parsed.hookSpecificOutput.additionalContext,
    /use devgod as the default workflow controller/i
  );
});

test("user-prompt-submit hook stays silent for non-substantive prompts without active task context", () => {
  const parsed = evaluateUserPromptSubmit(
    {
      prompt: "What's the current devgod status?"
    },
    {
      repoRoot: "/tmp/devgod-hook-test",
      activeTaskId: undefined,
      allowedWriteScope: [],
      queueCurrentTaskId: undefined
    }
  );

  assert.equal(parsed, undefined);
});

test("user-prompt-submit hook steers initial substantive prompts into clarification-first intake", () => {
  const parsed = evaluateUserPromptSubmit(
    {
      prompt: "Build a new onboarding workflow for repository setup and team handoff."
    },
    {
      repoRoot: "/tmp/devgod-hook-test",
      activeTaskId: undefined,
      allowedWriteScope: [],
      queueCurrentTaskId: undefined
    }
  );

  assert.ok(parsed);
  assert.equal(parsed.hookSpecificOutput.hookEventName, "UserPromptSubmit");
  assert.match(parsed.hookSpecificOutput.additionalContext, /new substantive devgod request/i);
  assert.match(parsed.hookSpecificOutput.additionalContext, /ask up to 4 targeted clarifying questions/i);
  assert.match(parsed.hookSpecificOutput.additionalContext, /intended outcome/i);
  assert.match(parsed.hookSpecificOutput.additionalContext, /constraints or non-goals/i);
  assert.match(parsed.hookSpecificOutput.additionalContext, /explicit operating assumptions/i);
});

test("user-prompt-submit hook emits compact scope context when active task state exists", () => {
  const parsed = evaluateUserPromptSubmit(
    {
      prompt: "Refactor the runtime layer."
    },
    {
      repoRoot: "/tmp/devgod-hook-test",
      activeTaskId: "task-hook-submit",
      allowedWriteScope: ["src/runtime"],
      queueCurrentTaskId: undefined
    }
  );

  assert.ok(parsed);
  assert.equal(parsed.hookSpecificOutput.hookEventName, "UserPromptSubmit");
  assert.match(parsed.hookSpecificOutput.additionalContext, /task-hook-submit/);
  assert.match(parsed.hookSpecificOutput.additionalContext, /keep edits within: src\/runtime/);
  assert.doesNotMatch(
    parsed.hookSpecificOutput.additionalContext,
    /treat substantive product or engineering requests as devgod work/i
  );
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

test("hook context reports authority mismatch when queue and ACTIVE disagree", async () => {
  const repoRoot = await mkdtemp(join(tmpdir(), "devgod-hook-authority-mismatch-"));

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
        ""
      ].join("\n"),
      "utf8"
    );

    const context = await readActiveTaskContext({ repoRoot });

    assert.equal(context.activeTaskId, "task-authoritative");
    assert.equal(context.queueCurrentTaskId, "task-authoritative");
    assert.deepEqual(context.authorityMismatches, [
      {
        kind: "active_file_conflicts_with_queue",
        activeFileTaskId: "task-stale",
        queueCurrentTaskId: "task-authoritative"
      }
    ]);
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
  }
});

test("stop hook allows exit when hook context already proves an authority mismatch blocker", () => {
  const parsed = evaluateStop(
    {
      last_assistant_message: "I cannot continue until the control layer is repaired."
    },
    {
      repoRoot: "/tmp/devgod-hook-test",
      activeTaskId: "task-hook-mismatch",
      allowedWriteScope: ["src/core"],
      allowedTaskHandoffScope: [],
      queueCurrentTaskId: "task-authoritative",
      authorityMismatches: [
        {
          kind: "active_file_conflicts_with_queue",
          activeFileTaskId: "task-hook-mismatch",
          queueCurrentTaskId: "task-authoritative"
        }
      ]
    }
  );

  assert.equal(parsed, undefined);
});

test("pre-tool-use hook allows explicitly listed successor task packet handoff writes", () => {
  const parsed = evaluatePreToolUse(
    {
      tool_name: "apply_patch",
      tool_input: {
        command: [
          "*** Begin Patch",
          "*** Update File: .devgod/work/task-queue.json",
          "+updated",
          "*** Add File: .devgod/work/tasks/task-next-slice.md",
          "+# Task Packet",
          "*** End Patch"
        ].join("\n")
      }
    },
    {
      repoRoot: "/tmp/devgod-hook-test",
      activeTaskId: "task-hook-handoff",
      allowedWriteScope: [".devgod/work/task-queue.json"],
      allowedTaskHandoffScope: [".devgod/work/tasks/task-next-slice.md"],
      authorityMismatches: [],
      queueCurrentTaskId: "task-hook-handoff"
    }
  );

  if (parsed) {
    assert.equal(parsed.hookSpecificOutput.hookEventName, "PreToolUse");
    assert.notEqual(parsed.hookSpecificOutput.permissionDecision, "deny");
  }
});

test("pre-tool-use hook denies successor task packet writes that are not explicitly listed", () => {
  const parsed = evaluatePreToolUse(
    {
      tool_name: "apply_patch",
      tool_input: {
        command: [
          "*** Begin Patch",
          "*** Update File: .devgod/work/task-queue.json",
          "+updated",
          "*** Add File: .devgod/work/tasks/task-next-slice.md",
          "+# Task Packet",
          "*** End Patch"
        ].join("\n")
      }
    },
    {
      repoRoot: "/tmp/devgod-hook-test",
      activeTaskId: "task-hook-handoff-deny",
      allowedWriteScope: [".devgod/work/task-queue.json"],
      allowedTaskHandoffScope: [],
      authorityMismatches: [],
      queueCurrentTaskId: "task-hook-handoff-deny"
    }
  );

  assert.ok(parsed);
  assert.equal(parsed.hookSpecificOutput.hookEventName, "PreToolUse");
  assert.equal(parsed.hookSpecificOutput.permissionDecision, "deny");
  assert.match(parsed.hookSpecificOutput.permissionDecisionReason, /task-next-slice\.md|successor task/i);
});

test("hook context parses explicitly listed successor task-packet handoff scope", async () => {
  const repoRoot = await mkdtemp(join(tmpdir(), "devgod-hook-handoff-scope-"));

  try {
    await mkdir(join(repoRoot, ".devgod", "work", "tasks"), { recursive: true });
    await writeFile(
      join(repoRoot, ".devgod", "ACTIVE"),
      "task_id=task-handoff\nworkflow=devgod\nstate=active\n",
      "utf8"
    );
    await writeFile(
      join(repoRoot, ".devgod", "work", "tasks", "task-task-handoff.md"),
      [
        "# Task Packet",
        "",
        "## Allowed write scope",
        "",
        "- `.devgod/work/task-queue.json`",
        "",
        "## Allowed successor task scope",
        "",
        "- `.devgod/work/tasks/task-next-slice.md`",
        ""
      ].join("\n"),
      "utf8"
    );

    const context = await readActiveTaskContext({ repoRoot });

    assert.equal(context.activeTaskId, "task-handoff");
    assert.deepEqual(context.allowedTaskHandoffScope, [".devgod/work/tasks/task-next-slice.md"]);
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
  }
});

test("hook context splits combined allowed write scope bullets into individual entries", async () => {
  const repoRoot = await mkdtemp(join(tmpdir(), "devgod-hook-scope-combined-"));

  try {
    await mkdir(join(repoRoot, ".devgod", "work", "tasks"), { recursive: true });
    await writeFile(
      join(repoRoot, ".devgod", "ACTIVE"),
      "task_id=task-combined\nworkflow=devgod\nstate=active\n",
      "utf8"
    );
    await writeFile(
      join(repoRoot, ".devgod", "work", "tasks", "task-task-combined.md"),
      [
        "# Task Packet",
        "",
        "## Allowed write scope",
        "",
        "- `src/runtime`, `tests`, and `src/admin.ts`.",
        ""
      ].join("\n"),
      "utf8"
    );

    const context = await readActiveTaskContext({ repoRoot });

    assert.equal(context.activeTaskId, "task-combined");
    assert.deepEqual(context.allowedWriteScope, ["src/runtime", "tests", "src/admin.ts"]);
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
  }
});

test("hook context parses structured continuation intent from the active task packet", async () => {
  const repoRoot = await mkdtemp(join(tmpdir(), "devgod-hook-continuation-intent-"));

  try {
    await mkdir(join(repoRoot, ".devgod", "work", "tasks"), { recursive: true });
    await writeFile(
      join(repoRoot, ".devgod", "ACTIVE"),
      "task_id=task-intent\nworkflow=devgod\nstate=active\n",
      "utf8"
    );
    await writeFile(
      join(repoRoot, ".devgod", "work", "tasks", "task-task-intent.md"),
      [
        "# Task Packet",
        "",
        "## Allowed write scope",
        "",
        "- `src/runtime`",
        "",
        "## Continuation intent",
        "",
        "- `defer_same_thread`",
        ""
      ].join("\n"),
      "utf8"
    );

    const context = await readActiveTaskContext({ repoRoot });

    assert.equal(context.activeTaskId, "task-intent");
    assert.equal(context.continuationIntent, "defer_same_thread");
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
  }
});

test("hook context infers deferred continuation intent from the daemon automation envelope", async () => {
  const repoRoot = await mkdtemp(join(tmpdir(), "devgod-hook-daemon-intent-"));

  try {
    await mkdir(join(repoRoot, ".devgod", "work", "tasks"), { recursive: true });
    await mkdir(join(repoRoot, ".devgod", "work", "daemon"), { recursive: true });
    await writeFile(
      join(repoRoot, ".devgod", "ACTIVE"),
      "task_id=task-daemon-intent\nworkflow=devgod\nstate=active\n",
      "utf8"
    );
    await writeFile(
      join(repoRoot, ".devgod", "work", "tasks", "task-task-daemon-intent.md"),
      [
        "# Task Packet",
        "",
        "## Allowed write scope",
        "",
        "- `src/runtime`",
        ""
      ].join("\n"),
      "utf8"
    );
    await writeFile(
      join(repoRoot, ".devgod", "work", "daemon", "automation-envelope.json"),
      `${JSON.stringify(
        {
          provider: "codex_app_thread_automation",
          wakeOwner: "operator",
          continuationIntent: "defer_same_thread",
          targetMode: "same_thread",
          scheduleKind: "rrule",
          schedule: "FREQ=MINUTELY;INTERVAL=30",
          targetId: "checkpoint-123",
          source: "checkpoint",
          summary: "Resume the active task after the waiting interval.",
          nextActions: ["resume from the checkpoint"],
          workspaceSlug: "workspace",
          projectSlug: "project",
          activeRunId: "run-123",
          activeTaskId: "task-daemon-intent",
          updatedAt: "2026-05-26T10:00:00.000Z"
        },
        null,
        2
      )}\n`,
      "utf8"
    );

    const context = await readActiveTaskContext({ repoRoot });
    const parsed = evaluateStop(
      {
        last_assistant_message: "The current turn is complete."
      },
      context
    );

    assert.equal(context.activeTaskId, "task-daemon-intent");
    assert.equal(context.continuationIntent, "defer_same_thread");
    assert.equal(parsed, undefined);
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
  }
});

test("hook context infers deferred continuation intent from the materialized app automation request", async () => {
  const repoRoot = await mkdtemp(join(tmpdir(), "devgod-hook-app-request-intent-"));

  try {
    await mkdir(join(repoRoot, ".devgod", "work", "tasks"), { recursive: true });
    await mkdir(join(repoRoot, ".devgod", "work", "daemon"), { recursive: true });
    await writeFile(
      join(repoRoot, ".devgod", "ACTIVE"),
      "task_id=task-app-request-intent\nworkflow=devgod\nstate=active\n",
      "utf8"
    );
    await writeFile(
      join(repoRoot, ".devgod", "work", "tasks", "task-task-app-request-intent.md"),
      [
        "# Task Packet",
        "",
        "## Allowed write scope",
        "",
        "- `src/runtime`",
        ""
      ].join("\n"),
      "utf8"
    );
    await writeFile(
      join(repoRoot, ".devgod", "work", "daemon", "app-automation-request.json"),
      `${JSON.stringify(
        {
          tool: "automation_update",
          request: {
            mode: "suggested_create",
            kind: "heartbeat",
            destination: "thread",
            name: "Devgod same-thread follow-up: task-app-request-intent",
            prompt: "Resume deferred devgod work.\nContinuation intent: defer_same_thread\n",
            rrule: "FREQ=MINUTELY;INTERVAL=30",
            status: "ACTIVE"
          },
          context: {
            provider: "codex_app_thread_automation",
            workspaceSlug: "workspace",
            projectSlug: "project",
            activeRunId: "run-123",
            activeTaskId: "task-app-request-intent",
            targetId: "artifact:resume",
            targetMode: "same_thread",
            generatedAt: "2026-05-26T10:00:00.000Z"
          }
        },
        null,
        2
      )}\n`,
      "utf8"
    );

    const context = await readActiveTaskContext({ repoRoot });
    const parsed = evaluateStop(
      {
        last_assistant_message: "The current turn is complete."
      },
      context
    );

    assert.equal(context.activeTaskId, "task-app-request-intent");
    assert.equal(context.continuationIntent, "defer_same_thread");
    assert.equal(parsed, undefined);
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
  }
});

test("hook context infers deferred continuation intent from the materialized CLI scheduler request", async () => {
  const repoRoot = await mkdtemp(join(tmpdir(), "devgod-hook-cli-request-intent-"));

  try {
    await mkdir(join(repoRoot, ".devgod", "work", "tasks"), { recursive: true });
    await mkdir(join(repoRoot, ".devgod", "work", "daemon"), { recursive: true });
    await writeFile(
      join(repoRoot, ".devgod", "ACTIVE"),
      "task_id=task-cli-request-intent\nworkflow=devgod\nstate=active\n",
      "utf8"
    );
    await writeFile(
      join(repoRoot, ".devgod", "work", "tasks", "task-task-cli-request-intent.md"),
      [
        "# Task Packet",
        "",
        "## Allowed write scope",
        "",
        "- `src/runtime`",
        ""
      ].join("\n"),
      "utf8"
    );
    await writeFile(
      join(repoRoot, ".devgod", "work", "daemon", "cli-scheduler-request.json"),
      `${JSON.stringify(
        {
          tool: "codex",
          request: {
            subcommand: "exec",
            promptPath: ".devgod/work/daemon/cli-scheduler-prompt.txt",
            outputSchemaPath: ".devgod/work/daemon/cli-scheduler-output-schema.json",
            json: true,
            cwd: repoRoot,
            runnable: true
          },
          scheduler: {
            scheduleKind: "cron",
            schedule: "0 * * * *",
            launcherHints: [],
            manualReviewRequired: false
          },
          context: {
            provider: "codex_cli_exec_scheduler",
            workspaceSlug: "workspace",
            projectSlug: "project",
            activeRunId: "run-456",
            activeTaskId: "task-cli-request-intent",
            targetId: "artifact:fresh-run",
            targetMode: "fresh_run",
            continuationIntent: "defer_fresh_run",
            generatedAt: "2026-05-26T10:00:00.000Z"
          }
        },
        null,
        2
      )}\n`,
      "utf8"
    );

    const context = await readActiveTaskContext({ repoRoot });
    const parsed = evaluateStop(
      {
        last_assistant_message: "The current turn is complete."
      },
      context
    );

    assert.equal(context.activeTaskId, "task-cli-request-intent");
    assert.equal(context.continuationIntent, "defer_fresh_run");
    assert.equal(parsed, undefined);
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
  }
});

test("task packet template exposes successor handoff and scope expansion guidance", async () => {
  const template = await readFile(join(process.cwd(), ".devgod", "templates", "task-packet.md"), "utf8");

  assert.match(template, /## Allowed successor task scope/);
  assert.match(template, /## Scope expansion protocol/);
  assert.match(template, /blocked_paths/);
  assert.match(template, /requested_write_scope/);
});
