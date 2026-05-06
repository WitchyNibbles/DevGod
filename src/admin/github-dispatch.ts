import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { WorkflowScaffoldSummary } from "../install/types.ts";
import { scaffoldWorkflowArtifacts } from "../install/cli.ts";

export interface GithubDispatchResult {
  mode: "dry_run" | "applied";
  taskId: string;
  trigger: string;
  repository: string;
  actor: string;
  title: string;
  url?: string | undefined;
  briefPath?: string | undefined;
  nextSteps: string[];
  scaffoldSummary?: WorkflowScaffoldSummary | undefined;
}

export interface GithubDispatchOptions {
  sourceRoot: string;
  targetRoot: string;
  inputPath: string;
  taskId?: string | undefined;
  dryRun?: boolean | undefined;
  force?: boolean | undefined;
  forceActive?: boolean | undefined;
}

interface GithubWorkItem {
  trigger: string;
  repository: string;
  actor: string;
  title: string;
  body: string;
  url?: string | undefined;
  number?: number | undefined;
}

export async function dispatchGithubWorkItem(
  options: GithubDispatchOptions
): Promise<GithubDispatchResult> {
  const payload = JSON.parse(await readFile(options.inputPath, "utf8")) as Record<string, unknown>;
  const item = extractGithubWorkItem(payload);
  const taskId = options.taskId ?? defaultTaskId(item);

  if (options.dryRun) {
    return {
      mode: "dry_run",
      taskId,
      trigger: item.trigger,
      repository: item.repository,
      actor: item.actor,
      title: item.title,
      url: item.url,
      nextSteps: [
        `Run devgod github-dispatch --target ${options.targetRoot} --input ${options.inputPath}`,
        "Review the generated intake brief and task packet before implementation.",
        "Keep GitHub-originated state advisory; canonical workflow state remains in .devgod/work."
      ]
    };
  }

  const scaffoldSummary = await scaffoldWorkflowArtifacts({
    sourceRoot: options.sourceRoot,
    targetRoot: options.targetRoot,
    taskId,
    ...(options.force === undefined ? {} : { force: options.force }),
    ...(options.forceActive === undefined ? {} : { forceActive: options.forceActive })
  });

  const briefPath = path.join(options.targetRoot, `.devgod/work/briefs/brief-${taskId}.md`);
  await writeFile(briefPath, buildGithubDispatchBrief(taskId, item), "utf8");

  return {
    mode: "applied",
    taskId,
    trigger: item.trigger,
    repository: item.repository,
    actor: item.actor,
    title: item.title,
    url: item.url,
    briefPath,
    scaffoldSummary,
    nextSteps: [
      `Review ${briefPath} and confirm scope.`,
      `Fill or refine .devgod/work/tasks/task-${taskId}.md before specialist execution.`,
      "Treat GitHub payload data as intake context only; keep runtime authority in devgod artifacts."
    ]
  };
}

function extractGithubWorkItem(payload: Record<string, unknown>): GithubWorkItem {
  const repository = readNestedString(payload, ["repository", "full_name"]) ?? "unknown/unknown";
  const sender = readNestedString(payload, ["sender", "login"]);
  const issueTitle = readNestedString(payload, ["issue", "title"]);
  const issueBody = readNestedString(payload, ["issue", "body"]) ?? "";
  const issueUrl = readNestedString(payload, ["issue", "html_url"]);
  const issueNumber = readNestedNumber(payload, ["issue", "number"]);
  const prTitle = readNestedString(payload, ["pull_request", "title"]);
  const prBody = readNestedString(payload, ["pull_request", "body"]) ?? "";
  const prUrl = readNestedString(payload, ["pull_request", "html_url"]);
  const prNumber = readNestedNumber(payload, ["pull_request", "number"]);
  const commentBody = readNestedString(payload, ["comment", "body"]) ?? "";
  const commentUrl = readNestedString(payload, ["comment", "html_url"]);
  const commentActor = readNestedString(payload, ["comment", "user", "login"]);
  const issueActor = readNestedString(payload, ["issue", "user", "login"]);
  const prActor = readNestedString(payload, ["pull_request", "user", "login"]);

  if (commentBody && issueTitle) {
    return {
      trigger: "issue_comment",
      repository,
      actor: commentActor ?? sender ?? issueActor ?? "unknown",
      title: issueTitle,
      body: [issueBody, "", "Comment context:", commentBody].filter(Boolean).join("\n"),
      url: commentUrl ?? issueUrl,
      number: issueNumber
    };
  }

  if (issueTitle) {
    return {
      trigger: "issue",
      repository,
      actor: issueActor ?? sender ?? "unknown",
      title: issueTitle,
      body: issueBody,
      url: issueUrl,
      number: issueNumber
    };
  }

  if (prTitle) {
    return {
      trigger: commentBody ? "pull_request_comment" : "pull_request",
      repository,
      actor: commentActor ?? prActor ?? sender ?? "unknown",
      title: prTitle,
      body: [prBody, commentBody ? `\nComment context:\n${commentBody}` : ""].join("").trim(),
      url: commentUrl ?? prUrl,
      number: prNumber
    };
  }

  throw new Error("github-dispatch could not extract a supported GitHub issue, pull request, or comment payload");
}

function defaultTaskId(item: GithubWorkItem): string {
  const normalized = item.title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || "github-work-item";
  const suffix = item.number ? `${item.trigger}-${item.number}` : item.trigger;
  return `${suffix}-${normalized}`.slice(0, 72);
}

function buildGithubDispatchBrief(taskId: string, item: GithubWorkItem): string {
  return [
    "# Intake Brief",
    "",
    "## Brief ID",
    "",
    `\`brief-${taskId}\``,
    "",
    "## Task ID",
    "",
    `\`${taskId}\``,
    "",
    "## Request",
    "",
    "Original user ask:",
    "",
    `GitHub ${item.trigger} from ${item.repository}`,
    item.url ? `Source URL: ${item.url}` : undefined,
    `Actor: ${item.actor}`,
    "",
    `Title: ${item.title}`,
    "",
    item.body || "No body supplied in the GitHub payload.",
    "",
    "## Goal",
    "",
    "Convert this GitHub-originated request into canonical devgod workflow artifacts before implementation.",
    "",
    "## User",
    "",
    `GitHub actor \`${item.actor}\` via \`${item.trigger}\`.`,
    "",
    "## Problem",
    "",
    "The work request originated outside the canonical devgod workflow and must be re-anchored safely.",
    "",
    "## Value",
    "",
    "Lets GitHub act as an intake adapter without making it workflow authority.",
    "",
    "## Audience",
    "",
    "- devgod maintainers",
    "- repo operators",
    "",
    "## Constraints",
    "",
    "- GitHub payload is advisory intake context only",
    "- canonical workflow state must remain in .devgod/work",
    "",
    "## Risks",
    "",
    "- payload may be underspecified",
    "- external trigger may suggest urgency that exceeds validated scope",
    "",
    "## Unknowns",
    "",
    "- whether the GitHub request is implementation-ready",
    "- whether additional planner/architect pass is required",
    "",
    "## Success Criteria",
    "",
    "- the request is grounded in canonical devgod artifacts",
    "- downstream implementation can proceed from repo-local workflow state",
    "",
    "## Non-goals",
    "",
    "- trusting GitHub as workflow authority",
    "",
    "## Out of scope",
    "",
    "- direct execution from unreviewed payload fields",
    "",
    "## Trust boundaries",
    "",
    "- GitHub event data is intake context",
    "- devgod artifacts remain canonical",
    "",
    "## Stop Go",
    "",
    "`go`",
    "",
    "## Next step",
    "",
    "Planner action required:",
    "Refine the scoped task packet and route the work through the normal devgod flow."
  ]
    .filter((line): line is string => line !== undefined)
    .join("\n");
}

function readNestedString(value: Record<string, unknown>, pathParts: readonly string[]): string | undefined {
  const candidate = readNestedValue(value, pathParts);
  return typeof candidate === "string" && candidate.trim().length > 0 ? candidate.trim() : undefined;
}

function readNestedNumber(value: Record<string, unknown>, pathParts: readonly string[]): number | undefined {
  const candidate = readNestedValue(value, pathParts);
  return typeof candidate === "number" && Number.isFinite(candidate) ? candidate : undefined;
}

function readNestedValue(value: Record<string, unknown>, pathParts: readonly string[]): unknown {
  let current: unknown = value;

  for (const pathPart of pathParts) {
    if (!current || typeof current !== "object" || Array.isArray(current)) {
      return undefined;
    }
    current = (current as Record<string, unknown>)[pathPart];
  }

  return current;
}
