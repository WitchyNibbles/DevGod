import TOML from "@iarna/toml";

const AGENTS_BEGIN = "<!-- BEGIN DEVGOD MANAGED -->";
const AGENTS_END = "<!-- END DEVGOD MANAGED -->";

const managedAgentsBlock = `${AGENTS_BEGIN}
## devgod

- treat substantive requests as devgod work by default unless the user opts out
- use \`.devgod/work/\` for active briefs, plans, tasks, and reviews
- use \`.devgod/rules/\` and \`.devgod/memory/\` as the local policy and durable-memory layer
- use the repo-local devgod skills under \`.agents/skills/devgod-*/\`
- use the repo-local devgod agent profiles under \`.codex/agents/devgod-*.toml\`
- if devgod is not configured yet, run \`npm run devgod:setup:local\`

## Department Workflow

For this repository, the root Codex thread acts as the engineering manager on first contact.

- confirm the request, success criteria, constraints, and main risk before execution
- answer trivial or administrative asks directly without department fanout
- route every substantive build, debug, setup, or refactor ask through the department workflow

Default department chain:

1. manager intake in the root thread
2. \`solution_architect\` for system design, boundaries, and sequencing
3. \`planner\` for task slicing, ownership, dependencies, and worker routing
4. implementation specialists (\`backend_engineer\`, \`frontend_designer\`, \`infra_engineer\`) for scoped delivery
5. blocking \`qa_engineer\` and \`security_reviewer\` gates before the manager reports completion
6. \`memory_curator\` for durable capture after approved completion

Additional rules:

- prefer repo-local custom agents under \`.codex/agents/devgod-*.toml\` when available
- for substantive work, spawn the first coordinator agent (\`solution_architect\` or \`planner\`) after at most two local inspection commands unless a blocker makes delegation impossible
- use the local \`caveman\` plugin/skill for manager notes, agent handoffs, QA/security gates, and other internal coordination to reduce token cost
- default caveman target is 4-6 lines with short labels and no prose paragraphs
- keep direct user replies in standard concise English unless the user asks for caveman format
- require an intake brief for substantive work in \`.devgod/work/briefs/\`
- require a task packet or plan artifact in \`.devgod/work/plans/\` or \`.devgod/work/tasks/\` before worker execution
- do not claim substantive work is done without QA/security gate output in \`.devgod/work/reviews/\`

${AGENTS_END}`;

function sortObjectKeys<T>(value: T): T {
  if (Array.isArray(value) || value === null || typeof value !== "object") {
    return value;
  }

  const entries = Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, nestedValue]) => [key, sortObjectKeys(nestedValue)]);

  return Object.fromEntries(entries) as T;
}

export function mergeAgentsMd(existingContent: string | undefined): string {
  if (!existingContent || existingContent.trim().length === 0) {
    return managedAgentsBlock;
  }

  const blockPattern = new RegExp(`${AGENTS_BEGIN}[\\s\\S]*?${AGENTS_END}`, "m");
  if (blockPattern.test(existingContent)) {
    return existingContent.replace(blockPattern, managedAgentsBlock);
  }

  return `${existingContent.trimEnd()}\n\n${managedAgentsBlock}\n`;
}

function ensureStringArray(value: unknown, fallback: string[]): string[] {
  if (!Array.isArray(value)) {
    return [...fallback];
  }

  return value.filter((item): item is string => typeof item === "string");
}

function mergeTomlTable(
  target: Record<string, unknown>,
  source: Record<string, unknown>
): Record<string, unknown> {
  const merged = { ...target };

  for (const [key, value] of Object.entries(source)) {
    const targetValue = merged[key];

    if (targetValue === undefined) {
      merged[key] = value;
      continue;
    }

    if (
      value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      targetValue &&
      typeof targetValue === "object" &&
      !Array.isArray(targetValue)
    ) {
      merged[key] = mergeTomlTable(
        targetValue as Record<string, unknown>,
        value as Record<string, unknown>
      );
    }
  }

  return merged;
}

export function mergeCodexConfig(
  existingContent: string | undefined,
  sourceContent: string
): string {
  const source = TOML.parse(sourceContent) as Record<string, unknown>;

  if (!existingContent || existingContent.trim().length === 0) {
    return sourceContent.endsWith("\n") ? sourceContent : `${sourceContent}\n`;
  }

  const target = TOML.parse(existingContent) as Record<string, unknown>;
  const merged = mergeTomlTable(target, source);

  const mergedFallbacks = new Set(
    ensureStringArray(target.project_doc_fallback_filenames, []).concat(
      ensureStringArray(source.project_doc_fallback_filenames, [])
    )
  );
  if (mergedFallbacks.size > 0) {
    merged.project_doc_fallback_filenames = [...mergedFallbacks];
  }

  const normalizedTarget = sortObjectKeys(target);
  const normalizedMerged = sortObjectKeys(merged);
  if (JSON.stringify(normalizedTarget) === JSON.stringify(normalizedMerged)) {
    return existingContent.endsWith("\n") ? existingContent : `${existingContent}\n`;
  }

  return `${TOML.stringify(normalizedMerged as unknown as TOML.JsonMap)}`.trimEnd() + "\n";
}

export function mergeGitignore(existingContent: string | undefined): string {
  const requiredLines = [".env.devgod", ".env.devgod.*"];
  const existingLines = new Set(
    (existingContent ?? "")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
  );

  const missing = requiredLines.filter((line) => !existingLines.has(line));
  if (missing.length === 0) {
    return existingContent ?? "";
  }

  const prefix = existingContent && existingContent.trim().length > 0 ? `${existingContent.trimEnd()}\n` : "";
  return `${prefix}\n# devgod\n${missing.join("\n")}\n`;
}

function toPosixPath(value: string): string {
  return value.replace(/\\/g, "/");
}

function prefixedFileDependency(relativePath: string): string {
  const normalized = toPosixPath(relativePath);
  if (normalized.startsWith("/") || /^[A-Za-z]:\//.test(normalized)) {
    return `file:${normalized}`;
  }
  if (normalized.startsWith(".")) {
    return `file:${normalized}`;
  }
  return `file:./${normalized}`;
}

export function mergePackageJson(
  existingContent: string | undefined,
  dependencyPathFromTarget: string
): string {
  const packageJson = existingContent && existingContent.trim().length > 0
    ? (JSON.parse(existingContent) as Record<string, unknown>)
    : {
        name: "project-with-devgod",
        private: true
      };

  const scripts =
    packageJson.scripts && typeof packageJson.scripts === "object" && !Array.isArray(packageJson.scripts)
      ? { ...(packageJson.scripts as Record<string, string>) }
      : {};
  const devDependencies =
    packageJson.devDependencies &&
    typeof packageJson.devDependencies === "object" &&
    !Array.isArray(packageJson.devDependencies)
      ? { ...(packageJson.devDependencies as Record<string, string>) }
      : {};

  const runtimeEntry =
    "node --env-file=.env.devgod --experimental-strip-types ./node_modules/devgod/src/admin.ts";

  scripts["devgod:migrate"] = `${runtimeEntry} migrate`;
  scripts["devgod:health"] = `${runtimeEntry} health`;
  scripts["devgod:bootstrap"] = `${runtimeEntry} bootstrap-project`;
  scripts["devgod:verify:setup"] = `${runtimeEntry} verify-setup`;
  scripts["devgod:setup:local"] =
    "node --experimental-strip-types ./node_modules/devgod/src/install/setup-local.ts";

  devDependencies.devgod = prefixedFileDependency(dependencyPathFromTarget);

  packageJson.scripts = sortObjectKeys(scripts);
  packageJson.devDependencies = sortObjectKeys(devDependencies);

  return `${JSON.stringify(sortObjectKeys(packageJson), null, 2)}\n`;
}

export function agentsManagedBlock(): string {
  return managedAgentsBlock;
}
