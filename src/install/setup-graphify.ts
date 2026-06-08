import { access, copyFile, mkdir } from "node:fs/promises";
import { spawn } from "node:child_process";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { inspectGraphifyStatus } from "../admin/graphify.ts";

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

function run(command: string, args: string[], cwd: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      stdio: "inherit"
    });

    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`${command} exited with code ${code ?? "unknown"}`));
    });

    child.on("error", (error) => {
      reject(error);
    });
  });
}

async function commandAvailable(command: string, cwd: string): Promise<boolean> {
  try {
    await run(command, ["--version"], cwd);
    return true;
  } catch {
    return false;
  }
}

async function ensureGraphifyInstalled(repoRoot: string): Promise<void> {
  if (await commandAvailable("graphify", repoRoot)) {
    return;
  }

  if (await commandAvailable("uv", repoRoot)) {
    await run("uv", ["tool", "install", "graphifyy"], repoRoot);
  } else if (await commandAvailable("pipx", repoRoot)) {
    await run("pipx", ["install", "graphifyy"], repoRoot);
  } else {
    throw new Error("graphify is required but neither uv nor pipx is available to install graphifyy");
  }

  if (!(await commandAvailable("graphify", repoRoot))) {
    throw new Error("graphify was installed, but the graphify command is still unavailable on PATH");
  }
}

async function ensureGraphifyRegistered(repoRoot: string): Promise<void> {
  const status = await inspectGraphifyStatus({ cwd: repoRoot });
  if (!status.configured) {
    throw new Error("graphify is not registered in .codex/config.toml; rerun the devgod install or upgrade flow");
  }
}

async function refreshGraphArtifacts(repoRoot: string): Promise<void> {
  const graphPath = path.join(repoRoot, "graphify-out", "graph.json");
  const buildScript = (await pathExists(graphPath)) ? "devgod:graphify:update" : "devgod:graphify:build";
  await run("npm", ["run", buildScript], repoRoot);
}

async function buildCodeOnlyWiki(repoRoot: string): Promise<void> {
  await run("graphify", ["./src", "--wiki", "--no-viz"], repoRoot);

  const graphRoot = path.join(repoRoot, "graphify-out");
  const rootWikiPath = path.join(graphRoot, "index.md");
  const nestedWikiPath = path.join(graphRoot, "wiki", "index.md");

  if (!(await pathExists(rootWikiPath)) && (await pathExists(nestedWikiPath))) {
    await mkdir(path.dirname(rootWikiPath), { recursive: true });
    await copyFile(nestedWikiPath, rootWikiPath);
  }

  if (!(await pathExists(rootWikiPath)) && !(await pathExists(nestedWikiPath))) {
    throw new Error("graphify wiki generation did not produce graphify-out/index.md or graphify-out/wiki/index.md");
  }
}

async function main(): Promise<void> {
  const repoRoot = process.cwd();

  await ensureGraphifyInstalled(repoRoot);
  await ensureGraphifyRegistered(repoRoot);
  await refreshGraphArtifacts(repoRoot);
  await buildCodeOnlyWiki(repoRoot);
}

const entryUrl = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : "";

if (import.meta.url === entryUrl) {
  main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(message);
    process.exitCode = 1;
  });
}
