import { access, lstat, readFile, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import TOML from "@iarna/toml";

const execFileAsync = promisify(execFile);

type GraphifyConfigScope = "project" | "user";
export type GraphifyState =
  | "ready"
  | "stale"
  | "missing_graph"
  | "invalid_graph"
  | "head_unavailable"
  | "unconfigured";

export interface GraphifyStatusObservation {
  authorityLabel: "derived_only";
  state: GraphifyState;
  configured: boolean;
  configuredScopes: GraphifyConfigScope[];
  configPaths: string[];
  graphBuilt: boolean;
  graphRoot: string;
  graphPath: string;
  wikiPath: string;
  graphUpdatedAt?: string | undefined;
  headCommit?: string | undefined;
  recommendedSetupCommand?: string | undefined;
  recommendedBuildCommand?: string | undefined;
  recommendedUpdateCommand?: string | undefined;
  notes: string[];
}

function normalizeConfigPath(scope: GraphifyConfigScope, cwd: string, homeDirectory: string): string {
  if (scope === "project") {
    return path.resolve(cwd, ".codex/config.toml");
  }

  return path.join(homeDirectory, ".codex", "config.toml");
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function hasGraphifyMcpConfig(configPath: string): Promise<boolean> {
  if (!(await pathExists(configPath))) {
    return false;
  }

  const parsed = TOML.parse(await readFile(configPath, "utf8")) as Record<string, unknown>;
  const mcpServers =
    parsed.mcp_servers && typeof parsed.mcp_servers === "object" && !Array.isArray(parsed.mcp_servers)
      ? (parsed.mcp_servers as Record<string, unknown>)
      : undefined;

  return Boolean(mcpServers?.graphify);
}

async function inspectGraphifyConfig(cwd: string, homeDirectory: string): Promise<{
  configuredScopes: GraphifyConfigScope[];
  configPaths: string[];
  notes: string[];
}> {
  const configuredScopes: GraphifyConfigScope[] = [];
  const configPaths: string[] = [];
  const notes: string[] = [];

  for (const scope of ["project", "user"] as const) {
    const configPath = normalizeConfigPath(scope, cwd, homeDirectory);
    try {
      if (await hasGraphifyMcpConfig(configPath)) {
        configuredScopes.push(scope);
        configPaths.push(configPath);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      notes.push(`${scope} Codex config could not be parsed: ${message}`);
    }
  }

  return {
    configuredScopes,
    configPaths,
    notes
  };
}

async function resolveGitDirectory(repoRoot: string): Promise<string | undefined> {
  const dotGitPath = path.join(repoRoot, ".git");
  if (!(await pathExists(dotGitPath))) {
    return undefined;
  }

  const fileStat = await lstat(dotGitPath);
  if (fileStat.isDirectory()) {
    return dotGitPath;
  }

  if (!fileStat.isFile()) {
    return undefined;
  }

  const contents = (await readFile(dotGitPath, "utf8")).trim();
  const match = /^gitdir:\s*(.+)$/i.exec(contents);
  if (!match) {
    return undefined;
  }

  const gitDir = match[1]!.trim();
  return path.isAbsolute(gitDir) ? gitDir : path.resolve(repoRoot, gitDir);
}

async function readPackedRef(gitDir: string, refName: string): Promise<string | undefined> {
  const packedRefsPath = path.join(gitDir, "packed-refs");
  if (!(await pathExists(packedRefsPath))) {
    return undefined;
  }

  const lines = (await readFile(packedRefsPath, "utf8")).split(/\r?\n/);
  for (const line of lines) {
    if (!line || line.startsWith("#") || line.startsWith("^")) {
      continue;
    }

    const [commit, ref] = line.trim().split(/\s+/, 2);
    if (ref === refName && commit) {
      return commit.trim();
    }
  }

  return undefined;
}

async function readGitHeadCommit(repoRoot: string): Promise<string | undefined> {
  const gitDir = await resolveGitDirectory(repoRoot);
  if (!gitDir) {
    return undefined;
  }

  const headPath = path.join(gitDir, "HEAD");
  if (!(await pathExists(headPath))) {
    return undefined;
  }

  const headContents = (await readFile(headPath, "utf8")).trim();
  if (!headContents) {
    return undefined;
  }

  if (!headContents.startsWith("ref:")) {
    return headContents;
  }

  const refName = headContents.slice("ref:".length).trim();
  if (!refName) {
    return undefined;
  }

  const refPath = path.join(gitDir, ...refName.split("/"));
  if (await pathExists(refPath)) {
    return (await readFile(refPath, "utf8")).trim();
  }

  return readPackedRef(gitDir, refName);
}

async function resolveHeadCommitTimestamp(repoRoot: string): Promise<number | undefined> {
  try {
    const { stdout } = await execFileAsync("git", ["-C", repoRoot, "log", "-1", "--format=%ct"], {
      cwd: repoRoot
    });
    const parsed = Number.parseInt(stdout.trim(), 10);
    return Number.isFinite(parsed) ? parsed * 1000 : undefined;
  } catch {
    return undefined;
  }
}

async function resolveExistingAncestorMtimeMs(candidatePath: string): Promise<number | undefined> {
  let currentPath = path.dirname(candidatePath);

  while (currentPath !== path.dirname(currentPath)) {
    try {
      const fileStat = await stat(currentPath);
      return fileStat.mtimeMs;
    } catch {
      currentPath = path.dirname(currentPath);
    }
  }

  try {
    const rootStat = await stat(currentPath);
    return rootStat.mtimeMs;
  } catch {
    return undefined;
  }
}

async function hasDirtyFilesNewerThan(repoRoot: string, graphMtimeMs: number): Promise<boolean> {
  const ignoredDirtyPrefixes = ["graphify-out/", "src/graphify-out/"];
  const trackedScopePrefixes = ["src/"];

  try {
    const { stdout } = await execFileAsync(
      "git",
      ["-C", repoRoot, "status", "--porcelain", "--untracked-files=all"],
      { cwd: repoRoot }
    );
    const relativePaths = stdout
      .split(/\r?\n/)
      .map((line) => line.trimEnd())
      .filter((line) => line.length > 3)
      .map((line) => line.slice(3).trim())
      .map((entry) => entry.split(" -> ").at(-1) ?? entry)
      .map((entry) => entry.replace(/\\/g, "/"))
      .filter((entry) => entry.length > 0);

    for (const relativePath of relativePaths) {
      if (ignoredDirtyPrefixes.some((prefix) => relativePath === prefix.slice(0, -1) || relativePath.startsWith(prefix))) {
        continue;
      }

      if (!trackedScopePrefixes.some((prefix) => relativePath === prefix.slice(0, -1) || relativePath.startsWith(prefix))) {
        continue;
      }

      const absolutePath = path.join(repoRoot, relativePath);
      try {
        const fileStat = await stat(absolutePath);
        if (fileStat.mtimeMs > graphMtimeMs) {
          return true;
        }
      } catch {
        const ancestorMtimeMs = await resolveExistingAncestorMtimeMs(absolutePath);
        if (ancestorMtimeMs !== undefined && ancestorMtimeMs > graphMtimeMs) {
          return true;
        }
      }
    }
  } catch {
    return false;
  }

  return false;
}

export async function inspectGraphifyStatus(options: {
  cwd?: string | undefined;
  homeDirectory?: string | undefined;
} = {}): Promise<GraphifyStatusObservation> {
  const cwd = options.cwd ?? process.cwd();
  const homeDirectory = options.homeDirectory ?? os.homedir();
  const graphRoot = path.resolve(cwd, "graphify-out");
  const graphPath = path.join(graphRoot, "graph.json");
  const wikiPath = path.join(graphRoot, "index.md");
  const config = await inspectGraphifyConfig(cwd, homeDirectory);
  const configured = config.configuredScopes.length > 0;
  const notes = [...config.notes];
  const recommendedSetupCommand = "npm run devgod:graphify:codex-full";
  const recommendedBuildCommand = "npm run devgod:graphify:build";
  const recommendedUpdateCommand = "npm run devgod:graphify:update";

  if (!(await pathExists(graphPath))) {
    if (configured) {
      notes.push("graphify MCP is configured but this repo graph has not been built yet");
      notes.push(`run ${recommendedBuildCommand} from the repo root`);
      return {
        authorityLabel: "derived_only",
        state: "missing_graph",
        configured,
        configuredScopes: config.configuredScopes,
        configPaths: config.configPaths,
        graphBuilt: false,
        graphRoot,
        graphPath,
        wikiPath,
        recommendedSetupCommand,
        recommendedBuildCommand,
        recommendedUpdateCommand,
        notes
      };
    }

    notes.push("graphify MCP config was not detected in project or user Codex config");
    return {
      authorityLabel: "derived_only",
      state: "unconfigured",
      configured,
      configuredScopes: config.configuredScopes,
      configPaths: config.configPaths,
      graphBuilt: false,
      graphRoot,
      graphPath,
      wikiPath,
      recommendedSetupCommand,
      recommendedBuildCommand,
      recommendedUpdateCommand,
      notes
    };
  }

  let parsedGraph: unknown;
  let graphStat;
  try {
    parsedGraph = JSON.parse(await readFile(graphPath, "utf8"));
    graphStat = await stat(graphPath);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    notes.push(`graphify graph is invalid: ${message}`);
    return {
      authorityLabel: "derived_only",
      state: "invalid_graph",
      configured,
      configuredScopes: config.configuredScopes,
      configPaths: config.configPaths,
      graphBuilt: true,
      graphRoot,
      graphPath,
      wikiPath,
      recommendedSetupCommand,
      recommendedBuildCommand,
      recommendedUpdateCommand,
      notes
    };
  }

  if (!parsedGraph || typeof parsedGraph !== "object") {
    notes.push("graphify graph is invalid: graph.json must contain a JSON object");
    return {
      authorityLabel: "derived_only",
      state: "invalid_graph",
      configured,
      configuredScopes: config.configuredScopes,
      configPaths: config.configPaths,
      graphBuilt: true,
      graphRoot,
      graphPath,
      wikiPath,
      recommendedSetupCommand,
      recommendedBuildCommand,
      recommendedUpdateCommand,
      notes
    };
  }

  const headCommit = await readGitHeadCommit(cwd);
  if (!headCommit) {
    notes.push("current git HEAD could not be resolved; graphify freshness is advisory only");
    return {
      authorityLabel: "derived_only",
      state: "head_unavailable",
      configured,
      configuredScopes: config.configuredScopes,
      configPaths: config.configPaths,
      graphBuilt: true,
      graphRoot,
      graphPath,
      wikiPath,
      graphUpdatedAt: new Date(graphStat.mtimeMs).toISOString(),
      recommendedSetupCommand,
      recommendedBuildCommand,
      recommendedUpdateCommand,
      notes
    };
  }

  const headCommitTimestamp = await resolveHeadCommitTimestamp(cwd);
  const graphMtimeMs = graphStat.mtimeMs;
  const dirtyFilesNewerThanGraph = await hasDirtyFilesNewerThan(cwd, graphMtimeMs);

  if ((headCommitTimestamp !== undefined && graphMtimeMs < headCommitTimestamp) || dirtyFilesNewerThanGraph) {
    notes.push("graphify graph is behind the current repo snapshot");
    notes.push(`run ${recommendedUpdateCommand} to refresh graph-backed context`);
    return {
      authorityLabel: "derived_only",
      state: "stale",
      configured,
      configuredScopes: config.configuredScopes,
      configPaths: config.configPaths,
      graphBuilt: true,
      graphRoot,
      graphPath,
      wikiPath,
      graphUpdatedAt: new Date(graphMtimeMs).toISOString(),
      headCommit,
      recommendedSetupCommand,
      recommendedBuildCommand,
      recommendedUpdateCommand,
      notes
    };
  }

  if (!configured) {
    notes.push("graphify graph is current, but no Graphify MCP config was detected");
  } else {
    notes.push("graphify repo context is ready");
  }

  return {
    authorityLabel: "derived_only",
    state: "ready",
    configured,
    configuredScopes: config.configuredScopes,
    configPaths: config.configPaths,
    graphBuilt: true,
    graphRoot,
    graphPath,
    wikiPath,
    graphUpdatedAt: new Date(graphMtimeMs).toISOString(),
    headCommit,
    recommendedSetupCommand,
    recommendedBuildCommand,
    recommendedUpdateCommand,
    notes
  };
}
