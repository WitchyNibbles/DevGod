import { existsSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const adminCommands = new Set([
  "migrate",
  "health",
  "doctor",
  "bootstrap-project",
  "verify-setup",
  "verify-live-migrations",
  "refresh-retrieval",
  "run-embedding-jobs",
  "verify-review-identity",
  "record-review",
  "status",
  "coverage",
  "gaps",
  "checkpoint",
  "resume",
  "workflow-proof",
  "seed-workflow-proof",
  "ops",
  "loop",
  "recover",
  "index-repo-markdown",
  "report",
  "plan-context",
  "export-docs",
  "/export-docs",
  "github-dispatch",
  "mcp",
  "serve-ui"
]);

const installCommands = new Set([
  "init",
  "upgrade",
  "verify",
  "scaffold-workflow",
  "upgrade-reasoning-workflow",
  "seed-happy-path-fixture"
]);

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(moduleDir, "../..");
const adminCliPath = path.join(repoRoot, "src/admin.ts");
const installCliPath = path.join(repoRoot, "src/install/cli.ts");
const mcpServerPath = path.join(repoRoot, "src/mcp/server.ts");
const uiServerPath = path.join(repoRoot, "src/ui/server.ts");

function printUsage(): void {
  process.stdout.write(
    [
      "devgod",
      "",
      "Implicit workflow controller by default. Use this command unless the user explicitly opts into another tool or mode.",
      "",
      "Usage:",
      "  devgod <runtime-command> [args]",
      "  devgod <install-command> [args]",
      "",
      "Runtime commands:",
      "  status | coverage | gaps | checkpoint | resume | workflow-proof | seed-workflow-proof | ops | loop | recover | report | plan-context | export-docs | github-dispatch",
      "  migrate | health | doctor | bootstrap-project | verify-setup | verify-live-migrations",
      "  verify-review-identity | record-review | index-repo-markdown | refresh-retrieval | run-embedding-jobs",
      "  mcp | serve-ui",
      "",
      "Install commands:",
      "  init | upgrade | verify | scaffold-workflow | upgrade-reasoning-workflow | seed-happy-path-fixture",
      ""
    ].join("\n")
  );
}

function main(argv: readonly string[]): void {
  const [command, ...rest] = argv;

  if (!command || command === "help" || command === "--help" || command === "-h") {
    printUsage();
    return;
  }

  const scriptPath = installCommands.has(command)
    ? installCliPath
    : command === "mcp"
      ? mcpServerPath
      : command === "serve-ui"
        ? uiServerPath
        : adminCommands.has(command)
          ? adminCliPath
          : undefined;

  if (!scriptPath) {
    throw new Error(`Unknown devgod command: ${command}`);
  }

  const nodeArgs: string[] = [];
  if (
    (scriptPath === adminCliPath || scriptPath === mcpServerPath || scriptPath === uiServerPath) &&
    existsSync(path.resolve(process.cwd(), ".env.devgod"))
  ) {
    nodeArgs.push("--env-file=.env.devgod");
  }
  if (scriptPath === mcpServerPath || scriptPath === uiServerPath) {
    nodeArgs.push("--experimental-strip-types", scriptPath, ...rest);
  } else {
    nodeArgs.push("--experimental-strip-types", scriptPath, command, ...rest);
  }

  const result = spawnSync(process.execPath, nodeArgs, {
    stdio: "inherit",
    env: process.env
  });

  if (typeof result.status === "number") {
    process.exitCode = result.status;
    return;
  }

  process.exitCode = 1;
}

const entryPath = process.argv[1] ? path.resolve(process.argv[1]) : "";
const modulePath = fileURLToPath(import.meta.url);

if (entryPath === modulePath) {
  try {
    main(process.argv.slice(2));
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(message);
    process.exitCode = 1;
  }
}
