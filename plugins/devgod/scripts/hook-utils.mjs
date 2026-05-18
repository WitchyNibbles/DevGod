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
const explicitBlockerVerbPatterns = [
  /\bblocked\b/i,
  /cannot continue/i,
  /\bcan't continue\b/i,
  /unable to continue/i,
  /\bout of scope\b/i,
  /outside explicit task scope/i,
  /outside the active devgod task write scope/i
];
const explicitDevgodBlockerCausePatterns = [
  /\bwrite scope\b/i,
  /\bmanaged control-layer\b/i,
  /\bactive devgod task\b/i,
  /\bexplicit task scope\b/i,
  /\bqueue state\b/i,
  /\btask state\b/i,
  /\bstate mismatch\b/i,
  /\bcurrent_task_id\b/i,
  /\.devgod\/ACTIVE\b/i,
  /\bpermission denied\b/i,
  /\bwrite scope locked\b/i,
  /\bout of scope\b/i
];
const completionMessagePatterns = [
  /\bno blocker remains\b/i,
  /\bscoped task is complete\b/i,
  /\bnothing left to execute within the active task scope\b/i,
  /\bnothing left to execute within the task scope\b/i
];
const externalClosureCausePatterns = [
  /\bexternal workflow\/runtime closure\b/i,
  /\bexternal runtime\/workflow closure\b/i,
  /\bexternal workflow closure\b/i,
  /\bexternal runtime closure\b/i
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

function parseDotEnv(content) {
  const values = {};
  if (typeof content !== "string" || content.trim().length === 0) {
    return values;
  }

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }

    const separator = line.indexOf("=");
    if (separator === -1) {
      continue;
    }

    const key = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (key) {
      values[key] = value;
    }
  }

  return values;
}

async function readRuntimeAuthorityContext(resolvedRepoRoot) {
  const dotEnv = parseDotEnv(
    await readTextIfExists(path.join(resolvedRepoRoot, ".env.devgod"))
  );
  const connectionString =
    process.env.DEVGOD_CORE_DATABASE_URL || dotEnv.DEVGOD_CORE_DATABASE_URL;
  const workspaceSlug =
    process.env.DEVGOD_WORKSPACE_SLUG || dotEnv.DEVGOD_WORKSPACE_SLUG;
  const projectSlug =
    process.env.DEVGOD_PROJECT_SLUG || dotEnv.DEVGOD_PROJECT_SLUG;

  if (!connectionString || !workspaceSlug || !projectSlug) {
    return undefined;
  }

  let client;
  try {
    const pgModule = await import("pg");
    const Client = pgModule.Client ?? pgModule.default?.Client;
    if (!Client) {
      return undefined;
    }

    client = new Client({ connectionString });
    await client.connect();
    const projectId = `project:${workspaceSlug}:${projectSlug}`;
    const result = await client.query(
      `
        select
          active_task_id,
          task_queue->>'current_task_id' as current_task_id
        from project_runtime_state
        where project_id = $1
        limit 1
      `,
      [projectId]
    );

    const row = result.rows[0];
    if (!row) {
      return undefined;
    }

    const activeTaskId =
      typeof row.active_task_id === "string" && row.active_task_id.trim().length > 0
        ? row.active_task_id.trim()
        : undefined;
    const queueCurrentTaskId =
      row.current_task_id === null
        ? null
        : typeof row.current_task_id === "string" && row.current_task_id.trim().length > 0
          ? row.current_task_id.trim()
          : undefined;

    return {
      activeTaskId,
      queueCurrentTaskId
    };
  } catch {
    return undefined;
  } finally {
    if (client) {
      try {
        await client.end();
      } catch {
        // ignore runtime cleanup failures inside hook context
      }
    }
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
  const runtimeContext = await readRuntimeAuthorityContext(resolvedRepoRoot);
  let activeFileTaskId;
  let activeFileState;
  let queueHasAuthoritativePointer = false;

  if (runtimeContext) {
    context.queueCurrentTaskId = runtimeContext.queueCurrentTaskId;
    context.activeTaskId =
      runtimeContext.activeTaskId ??
      (typeof runtimeContext.queueCurrentTaskId === "string"
        ? runtimeContext.queueCurrentTaskId
        : undefined);
  }

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
    if (runtimeContext === undefined) {
      context.activeTaskId =
        typeof context.queueCurrentTaskId === "string" ? context.queueCurrentTaskId : undefined;
    }
  } else if (activeFileTaskId && activeFileState !== "complete" && activeFileState !== "done") {
    if (runtimeContext === undefined) {
      context.activeTaskId = activeFileTaskId;
    }
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

  context.allowedWriteScope = parseAllowedWriteScopeSection(taskMarkdown);
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

function parseAllowedWriteScopeSection(markdown) {
  return parseMarkdownListSection(markdown, "## Allowed write scope").flatMap((value) =>
    value
      .split(/\s*,\s*|\s*;\s*|\s+\band\b\s+/i)
      .map((entry) => entry.trim().replace(/^and\s+/i, "").replace(/[.:;]+$/g, ""))
      .filter(Boolean)
  );
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

  if (blockerMessagePatterns.some((pattern) => pattern.test(lastAssistantMessage))) {
    return false;
  }

  const hasExplicitCompletionMessage = completionMessagePatterns.some((pattern) =>
    pattern.test(lastAssistantMessage)
  );
  const hasExternalClosureCause = externalClosureCausePatterns.some((pattern) =>
    pattern.test(lastAssistantMessage)
  );
  if (hasExplicitCompletionMessage && hasExternalClosureCause) {
    return false;
  }

  const hasExplicitBlockerVerb = explicitBlockerVerbPatterns.some((pattern) =>
    pattern.test(lastAssistantMessage)
  );
  const hasExplicitDevgodBlockerCause = explicitDevgodBlockerCausePatterns.some((pattern) =>
    pattern.test(lastAssistantMessage)
  );

  return !(hasExplicitBlockerVerb && hasExplicitDevgodBlockerCause);
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
