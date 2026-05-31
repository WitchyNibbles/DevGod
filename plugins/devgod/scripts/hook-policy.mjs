import {
  classifyBashFailure,
  clearHookBlockerState,
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
  isReadOnlyBashCommand,
  isTaskPacketPath,
  isVerificationCommand,
  parseApplyPatchTargets,
  persistHookBlockerState,
  shouldHoldStop
} from "./hook-utils.mjs";

function isLikelySubstantiveInitialPrompt(prompt) {
  const normalized = typeof prompt === "string" ? prompt.trim() : "";
  if (normalized.length < 24) {
    return false;
  }

  if (
    /^(what|why|how|when|where|which|who|show|list)\b/i.test(normalized) &&
    !/\b(build|create|implement|design|fix|refactor|migrate|workflow|feature|system|api)\b/i.test(normalized)
  ) {
    return false;
  }

  if (
    /\b(build|create|implement|add|fix|refactor|rewrite|design|redesign|update|change|migrate|integrate|set up|setup|remove|replace|improve|optimize|ship|scaffold)\b/i.test(
      normalized
    )
  ) {
    return true;
  }

  return (
    /\b(i want|we need|need to|let'?s)\b/i.test(normalized) &&
    /\b(feature|workflow|system|app|page|dashboard|api|cli|integration|auth|repo|repository|installer|tool|agent|devgod)\b/i.test(
      normalized
    )
  );
}

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
    if (managedTarget && !isReadOnlyBashCommand(command)) {
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
  if (managedTarget && !isReadOnlyBashCommand(command)) {
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

  const exitCode = getBashExitCode(payload?.tool_response);
  if (typeof exitCode !== "number") {
    return undefined;
  }

  if (exitCode === 0) {
    clearHookBlockerState(context.repoRoot);
    return undefined;
  }

  const classification = classifyBashFailure(payload);
  if (classification && context.repoRoot && context.activeTaskId) {
    persistHookBlockerState(context.repoRoot, {
      activeTaskId: context.activeTaskId,
      queueCurrentTaskId: context.queueCurrentTaskId,
      turnId: typeof payload?.turn_id === "string" ? payload.turn_id : undefined,
      toolName: classification.toolName,
      command: classification.command,
      commandFingerprint: classification.commandFingerprint,
      exitCode: classification.exitCode,
      blockerKind: classification.blockerKind,
      summary: classification.summary,
      details: classification.details,
      recordedAt: new Date().toISOString()
    });
  }

  const command = extractToolCommand(payload);
  if (!isVerificationCommand(command)) {
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
  const prompt = typeof payload?.prompt === "string" ? payload.prompt : "";
  if (!context.activeTaskId && isLikelySubstantiveInitialPrompt(prompt)) {
    return buildAdditionalContext(
      "UserPromptSubmit",
      [
        "new substantive devgod request: run intake first",
        "ask up to 4 targeted clarifying questions before planning or implementation",
        "cover intended outcome, primary user or operator, constraints or non-goals, and acceptance criteria",
        "if clarification is not required, state explicit operating assumptions"
      ].join("; ")
    );
  }

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
  const stopHookActive = payload?.stop_hook_active === true;

  if (Array.isArray(context.authorityMismatches) && context.authorityMismatches.length > 0) {
    return undefined;
  }

  if (context.continuationIntent === "defer_same_thread" || context.continuationIntent === "defer_fresh_run") {
    return undefined;
  }

  if (context.continuationIntent === "blocked_external") {
    return undefined;
  }

  const hookBlockerState =
    context.hookBlockerState && typeof context.hookBlockerState === "object" ? context.hookBlockerState : undefined;
  const activeTaskId = context.activeTaskId ?? context.queueCurrentTaskId;
  if (hookBlockerState && activeTaskId && hookBlockerState.activeTaskId === activeTaskId) {
    if (stopHookActive) {
      return undefined;
    }

    return {
      decision: "block",
      reason: hookBlockerState.summary
    };
  }

  if ((context.activeTaskId || context.queueCurrentTaskId) && shouldHoldStop(lastAssistantMessage)) {
    const taskId = activeTaskId;
    return {
      decision: "block",
      reason: `active devgod task ${taskId} remains in progress; continue execution or state the real blocker explicitly`
    };
  }

  return undefined;
}
