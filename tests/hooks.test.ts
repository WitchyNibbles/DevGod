import test from "node:test";
import assert from "node:assert/strict";
// @ts-expect-error internal hook policy module is a runtime .mjs helper without TypeScript declarations
import { evaluatePreToolUse, evaluateStop } from "../plugins/devgod/scripts/hook-policy.mjs";

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
