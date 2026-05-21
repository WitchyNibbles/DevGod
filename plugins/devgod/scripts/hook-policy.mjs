import {
  buildAdditionalContext,
  buildPermissionDeny,
  buildPostToolBlock,
  buildPreToolDeny,
  extractBashReferencedManagedPaths,
  extractToolCommand,
  getBashExitCode,
  isAllowedPath,
  isDestructiveCommand,
  isManagedPath,
  isTaskPacketPath,
  isVerificationCommand,
  parseApplyPatchTargets,
  shouldHoldStop
} from "./hook-utils.mjs";

function isAllowedTaskTarget(target, context) {
  if (isAllowedPath(target, context.allowedWriteScope)) {
    return true;
  }

  return (
    isTaskPacketPath(target) &&
    Array.isArray(context.allowedTaskHandoffScope) &&
    context.allowedTaskHandoffScope.some((scope) => target === scope)
  );
}

export function evaluatePreToolUse(payload, context) {
  const toolName = payload?.tool_name;
  const command = extractToolCommand(payload);

  if (toolName === "apply_patch") {
    const targets = parseApplyPatchTargets(command);
    const outOfScope = targets.find((target) => !isAllowedTaskTarget(target, context));
    if (outOfScope && context.allowedWriteScope.length > 0) {
      const detail = isTaskPacketPath(outOfScope)
        ? `successor task packet ${outOfScope} is not listed in the active devgod task handoff scope`
        : `apply_patch target ${outOfScope} is outside the active devgod task write scope`;
      return buildPreToolDeny(detail);
    }

    const managedTarget = targets.find(
      (target) => isManagedPath(target) && !isAllowedTaskTarget(target, context)
    );
    if (managedTarget) {
      return buildPreToolDeny(
        `managed control-layer file ${managedTarget} is blocked outside explicit task scope`
      );
    }
  }

  if (toolName === "Bash") {
    if (isDestructiveCommand(command)) {
      return buildPreToolDeny("destructive shell command blocked by devgod policy");
    }

    const managedTarget = extractBashReferencedManagedPaths(command).find(
      (target) => !isAllowedPath(target, context.allowedWriteScope)
    );
    if (managedTarget) {
      return buildPreToolDeny(
        `managed control-layer path ${managedTarget} is blocked outside explicit task scope`
      );
    }
  }

  if (context.activeTaskId && context.allowedWriteScope.length > 0) {
    return buildAdditionalContext(
      "PreToolUse",
      `active devgod task ${context.activeTaskId} remains scoped to ${context.allowedWriteScope.join(", ")}`
    );
  }

  return undefined;
}

export function evaluatePermissionRequest(payload, context) {
  const command = extractToolCommand(payload);

  if (isDestructiveCommand(command)) {
    return buildPermissionDeny("destructive approval request blocked by devgod policy");
  }

  const managedTarget = extractBashReferencedManagedPaths(command).find(
    (target) => !isAllowedPath(target, context.allowedWriteScope)
  );
  if (managedTarget) {
    return buildPermissionDeny(
      `approval request for managed control-layer path ${managedTarget} is blocked outside explicit task scope`
    );
  }

  return undefined;
}

export function evaluatePostToolUse(payload, context) {
  if (payload?.tool_name !== "Bash") {
    return undefined;
  }

  const command = extractToolCommand(payload);
  const exitCode = getBashExitCode(payload?.tool_response);
  if (typeof exitCode !== "number" || exitCode === 0 || !isVerificationCommand(command)) {
    return undefined;
  }

  const taskLabel = context.activeTaskId ? ` for active task ${context.activeTaskId}` : "";
  return buildPostToolBlock(
    `verification command failed${taskLabel}; enter the devgod repair loop before claiming completion`,
    `verification failure${taskLabel}; do not treat this task as complete until the failing check is repaired or the blocker is explicitly recorded`
  );
}

export function evaluateSessionStart(payload, context) {
  const lines = [];
  if (context.activeTaskId) {
    lines.push(`devgod active task: ${context.activeTaskId}`);
  }
  if (context.queueCurrentTaskId && context.queueCurrentTaskId !== context.activeTaskId) {
    lines.push(`devgod queue current task: ${context.queueCurrentTaskId}`);
  }
  if (context.allowedWriteScope.length > 0) {
    lines.push(`allowed write scope: ${context.allowedWriteScope.join(", ")}`);
  }
  if (Array.isArray(context.allowedTaskHandoffScope) && context.allowedTaskHandoffScope.length > 0) {
    lines.push(`allowed successor task scope: ${context.allowedTaskHandoffScope.join(", ")}`);
  }
  if (Array.isArray(context.authorityMismatches) && context.authorityMismatches.length > 0) {
    lines.push(`authority mismatch: ${context.authorityMismatches.map((entry) => entry.kind).join(", ")}`);
  }
  if (payload?.source === "resume" && lines.length > 0) {
    lines.push("this is a resumed session; prefer continuing from the active devgod task and queue state");
  }

  if (lines.length === 0) {
    return undefined;
  }

  return buildAdditionalContext("SessionStart", lines.join("; "));
}

export function evaluateUserPromptSubmit(payload, context) {
  const lines = [];
  if (context.activeTaskId) {
    lines.push(`active devgod task: ${context.activeTaskId}`);
  }
  if (context.allowedWriteScope.length > 0) {
    lines.push(`keep edits within: ${context.allowedWriteScope.join(", ")}`);
  }
  if (Array.isArray(context.authorityMismatches) && context.authorityMismatches.length > 0) {
    lines.push(`authority mismatch present: ${context.authorityMismatches.map((entry) => entry.kind).join(", ")}`);
  }

  if (lines.length === 0) {
    return undefined;
  }

  return buildAdditionalContext("UserPromptSubmit", lines.join("; "));
}

export function evaluateStop(payload, context) {
  const lastAssistantMessage =
    typeof payload?.last_assistant_message === "string" ? payload.last_assistant_message : "";

  if (Array.isArray(context.authorityMismatches) && context.authorityMismatches.length > 0) {
    return undefined;
  }

  if ((context.activeTaskId || context.queueCurrentTaskId) && shouldHoldStop(lastAssistantMessage)) {
    const taskId = context.activeTaskId ?? context.queueCurrentTaskId;
    return {
      decision: "block",
      reason: `active devgod task ${taskId} remains in progress; continue execution or state the real blocker explicitly`
    };
  }

  return undefined;
}
