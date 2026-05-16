import { readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const pluginRoot = process.env.PLUGIN_ROOT
  ? path.resolve(process.env.PLUGIN_ROOT)
  : path.resolve(scriptDir, "..");
const repoRoot = path.resolve(pluginRoot, "..", "..");

const managedPathPrefixes = ["AGENTS.md", ".codex/", ".agents/", ".devgod/memory/"];
const destructiveCommandPatterns = [
  /\bgit\s+reset\s+--hard\b/,
  /\bgit\s+checkout\s+--\b/,
  /\brm\s+-rf\b/,
  /\bmkfs\b/,
  /\bdd\s+if=/
];
const verificationCommandPatterns = [
  /\bnpm\s+(run\s+)?(test|typecheck|check:[^\s]+)\b/,
  /\bpytest\b/,
  /\bpython\s+-m\s+pytest\b/,
  /\bgo\s+test\b/,
  /\bcargo\s+test\b/,
  /\btsc\b/,
  /\bnode\b.*\s--test\b/,
  /\bbash\s+scripts\/check-/,
  /\bdevgod:verify\b/
];
const blockerMessagePatterns = [
  /need user input/i,
  /requires user input/i,
  /waiting for user/i,
  /waiting for approval/i,
  /blocked on approval/i,
  /cannot continue without/i
];

export async function readHookPayload() {
  let content = "";
  try {
    content = readFileSync(0, "utf8");
  } catch {
    content = "";
  }

  if (content.trim().length === 0) {
    return {};
  }

  try {
    return JSON.parse(content);
  } catch {
    return {};
  }
}

async function readTextIfExists(filePath) {
  try {
    return await readFile(filePath, "utf8");
  } catch {
    return undefined;
  }
}

export async function readActiveTaskContext(options = {}) {
  const resolvedRepoRoot =
    options && typeof options.repoRoot === "string" && options.repoRoot.trim().length > 0
      ? path.resolve(options.repoRoot)
      : repoRoot;
  const activePath = path.join(resolvedRepoRoot, ".devgod", "ACTIVE");
  const activeContent = await readTextIfExists(activePath);
  const context = {
    repoRoot: resolvedRepoRoot,
    activeTaskId: undefined,
    allowedWriteScope: [],
    queueCurrentTaskId: undefined
  };
  let activeFileTaskId;
  let activeFileState;
  let queueHasAuthoritativePointer = false;

  if (activeContent) {
    for (const rawLine of activeContent.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (line.startsWith("task_id=")) {
        const taskId = line.slice("task_id=".length).trim();
        if (taskId) {
          activeFileTaskId = taskId;
        }
      }
      if (line.startsWith("state=")) {
        const state = line.slice("state=".length).trim();
        if (state) {
          activeFileState = state;
        }
      }
    }
  }

  const queueContent = await readTextIfExists(
    path.join(resolvedRepoRoot, ".devgod", "work", "task-queue.json")
  );
  if (queueContent) {
    try {
      const parsed = JSON.parse(queueContent);
      if (
        parsed &&
        typeof parsed === "object" &&
        !Array.isArray(parsed) &&
        Object.prototype.hasOwnProperty.call(parsed, "current_task_id")
      ) {
        queueHasAuthoritativePointer = true;
        const currentTaskId = parsed.current_task_id;
        if (typeof currentTaskId === "string" && currentTaskId.trim().length > 0) {
          context.queueCurrentTaskId = currentTaskId.trim();
        } else if (currentTaskId === null) {
          context.queueCurrentTaskId = null;
        }
      }
    } catch {
      // ignore invalid queue exports inside hook context
    }
  }

  if (queueHasAuthoritativePointer) {
    context.activeTaskId =
      typeof context.queueCurrentTaskId === "string" ? context.queueCurrentTaskId : undefined;
  } else if (activeFileTaskId && activeFileState !== "complete" && activeFileState !== "done") {
    context.activeTaskId = activeFileTaskId;
  }

  if (!context.activeTaskId) {
    return context;
  }

  const taskMarkdown = await readTextIfExists(
    path.join(resolvedRepoRoot, ".devgod", "work", "tasks", `task-${context.activeTaskId}.md`)
  );
  if (!taskMarkdown) {
    return context;
  }

  context.allowedWriteScope = parseMarkdownListSection(taskMarkdown, "## Allowed write scope");
  return context;
}

function parseMarkdownListSection(markdown, heading) {
  const lines = markdown.split(/\r?\n/);
  const startIndex = lines.findIndex((line) => line.trim() === heading);
  if (startIndex === -1) {
    return [];
  }

  const values = [];
  for (let index = startIndex + 1; index < lines.length; index += 1) {
    const line = lines[index]?.trim() ?? "";
    if (line.startsWith("## ")) {
      break;
    }
    if (line === "" || line.startsWith("### ")) {
      continue;
    }

    const normalized = line
      .replace(/`/g, "")
      .replace(/^[*-]\s*/, "")
      .trim();

    if (normalized) {
      values.push(normalized);
    }
  }

  return values;
}

function normalizePath(value) {
  return value.replace(/\\/g, "/").replace(/^\.\//, "");
}

export function isManagedPath(relativePath) {
  const normalized = normalizePath(relativePath);
  return managedPathPrefixes.some((prefix) =>
    normalized === prefix.replace(/\/$/, "") || normalized.startsWith(prefix)
  );
}

export function isAllowedPath(relativePath, allowedWriteScope) {
  if (!Array.isArray(allowedWriteScope) || allowedWriteScope.length === 0) {
    return true;
  }

  const normalized = normalizePath(relativePath);
  return allowedWriteScope.some((scope) => {
    const normalizedScope = normalizePath(scope);
    return (
      normalized === normalizedScope ||
      normalized.startsWith(`${normalizedScope}/`) ||
      normalizedScope === "."
    );
  });
}

export function parseApplyPatchTargets(command) {
  if (typeof command !== "string") {
    return [];
  }

  const targets = [];
  const pattern = /^\*\*\* (?:Update|Add|Delete) File: (.+)$|^\*\*\* Move to: (.+)$/gm;
  for (const match of command.matchAll(pattern)) {
    const target = (match[1] ?? match[2] ?? "").trim();
    if (target) {
      targets.push(normalizePath(target));
    }
  }
  return [...new Set(targets)];
}

export function extractToolCommand(payload) {
  const toolInput = payload?.tool_input;
  if (toolInput && typeof toolInput === "object" && !Array.isArray(toolInput)) {
    const command = toolInput.command;
    if (typeof command === "string") {
      return command;
    }
  }
  return "";
}

export function isDestructiveCommand(command) {
  return destructiveCommandPatterns.some((pattern) => pattern.test(command));
}

export function isVerificationCommand(command) {
  return verificationCommandPatterns.some((pattern) => pattern.test(command));
}

export function extractBashReferencedManagedPaths(command) {
  if (typeof command !== "string" || command.trim().length === 0) {
    return [];
  }

  const matches = [];
  for (const prefix of managedPathPrefixes) {
    const plainPrefix = prefix.replace(/\/$/, "");
    if (command.includes(prefix) || command.includes(plainPrefix)) {
      matches.push(plainPrefix);
    }
  }
  return [...new Set(matches)];
}

export function getBashExitCode(toolResponse) {
  if (!toolResponse || typeof toolResponse !== "object" || Array.isArray(toolResponse)) {
    return undefined;
  }

  for (const key of ["exitCode", "exit_code", "code", "status"]) {
    const value = toolResponse[key];
    if (typeof value === "number") {
      return value;
    }
  }

  return undefined;
}

export function shouldHoldStop(lastAssistantMessage) {
  if (typeof lastAssistantMessage !== "string" || lastAssistantMessage.trim().length === 0) {
    return true;
  }

  return !blockerMessagePatterns.some((pattern) => pattern.test(lastAssistantMessage));
}

export function buildAdditionalContext(eventName, additionalContext) {
  return {
    hookSpecificOutput: {
      hookEventName: eventName,
      additionalContext
    }
  };
}

export function buildPreToolDeny(reason) {
  return {
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason: reason
    }
  };
}

export function buildPermissionDeny(message) {
  return {
    hookSpecificOutput: {
      hookEventName: "PermissionRequest",
      decision: {
        behavior: "deny",
        message
      }
    }
  };
}

export function buildPostToolBlock(reason, additionalContext) {
  return {
    decision: "block",
    reason,
    hookSpecificOutput: {
      hookEventName: "PostToolUse",
      additionalContext
    }
  };
}
