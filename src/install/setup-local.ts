import { access, copyFile, readFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  resolveRuntimeEnvironmentConfig,
  runtimeModeFromProfile,
  runtimeProfileForMode,
  type RuntimeMode
} from "../runtime/config.ts";

interface CommandOptions {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  quiet?: boolean;
}

interface CommandResult {
  code: number | null;
  stderr: string;
  stdout: string;
}

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

function commandCandidates(command: string, env: NodeJS.ProcessEnv): string[] {
  if (path.isAbsolute(command) || command.includes(path.sep)) {
    return [command];
  }

  const pathExtensions =
    process.platform === "win32"
      ? (env.PATHEXT ?? ".COM;.EXE;.BAT;.CMD")
          .split(";")
          .map((extension) => extension.trim())
          .filter((extension) => extension.length > 0)
      : [""];

  if (process.platform !== "win32" || /\.[^./\\]+$/.test(command)) {
    return [command];
  }

  return pathExtensions.map((extension) => `${command}${extension.toLowerCase()}`);
}

async function commandExists(command: string, env: NodeJS.ProcessEnv): Promise<boolean> {
  const pathEntries = (env.PATH ?? "").split(path.delimiter).filter((entry) => entry.length > 0);

  for (const candidate of commandCandidates(command, env)) {
    if (path.isAbsolute(candidate) || candidate.includes(path.sep)) {
      if (await fileExists(candidate)) {
        return true;
      }
      continue;
    }

    for (const entry of pathEntries) {
      if (await fileExists(path.join(entry, candidate))) {
        return true;
      }
    }
  }

  return false;
}

function runCommand(command: string, args: readonly string[], options: CommandOptions = {}): Promise<CommandResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, [...args], {
      cwd: options.cwd ?? process.cwd(),
      env: options.env ?? process.env,
      stdio: ["ignore", "pipe", "pipe"]
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk: Buffer | string) => {
      const text = chunk.toString();
      stdout += text;
      if (!options.quiet) {
        process.stdout.write(text);
      }
    });

    child.stderr.on("data", (chunk: Buffer | string) => {
      const text = chunk.toString();
      stderr += text;
      if (!options.quiet) {
        process.stderr.write(text);
      }
    });

    child.on("error", (error) => {
      reject(error);
    });

    child.on("close", (code) => {
      if (code === 0) {
        resolve({ code, stdout, stderr });
        return;
      }

      const error = new Error(`${command} exited with code ${code ?? "unknown"}`) as Error & CommandResult;
      error.code = code;
      error.stdout = stdout;
      error.stderr = stderr;
      reject(error);
    });
  });
}

function isSafeDevgodEnvKey(candidate: string): boolean {
  return /^DEVGOD_[A-Z0-9_]+$/.test(candidate);
}

function trimLeadingWhitespace(value: string): string {
  return value.replace(/^\s+/, "");
}

function stripUnquotedComment(value: string): string {
  let output = "";
  let previous = "";

  for (const character of value) {
    if (character === "#" && (output.length === 0 || /\s/.test(previous))) {
      break;
    }
    output += character;
    previous = character;
  }

  return output.trimEnd();
}

function parseDevgodEnvContent(content: string): NodeJS.ProcessEnv {
  const parsed: NodeJS.ProcessEnv = {};

  for (const rawLine of content.split(/\r?\n/)) {
    if (!rawLine.trim() || rawLine.trimStart().startsWith("#")) {
      continue;
    }

    const match = rawLine.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=(.*)$/);
    if (!match) {
      continue;
    }

    const key = match[1] ?? "";
    if (!isSafeDevgodEnvKey(key)) {
      continue;
    }

    const rawValue = trimLeadingWhitespace(match[2] ?? "");
    const doubleQuoted = rawValue.match(/^"((?:\\.|[^"])*)"(?:\s+#.*)?$/);
    if (doubleQuoted) {
      parsed[key] = (doubleQuoted[1] ?? "")
        .replace(/\\\\/g, "\\")
        .replace(/\\"/g, '"')
        .replace(/\\n/g, "\n")
        .replace(/\\r/g, "\r")
        .replace(/\\t/g, "\t")
        .replace(/\\\$/g, "$");
      continue;
    }

    const singleQuoted = rawValue.match(/^'([^']*)'(?:\s+#.*)?$/);
    if (singleQuoted) {
      parsed[key] = singleQuoted[1] ?? "";
      continue;
    }

    parsed[key] = stripUnquotedComment(rawValue);
  }

  return parsed;
}

async function ensureEnvFile(repoRoot: string): Promise<void> {
  const envPath = path.join(repoRoot, ".env");
  const envExamplePath = path.join(repoRoot, ".env.example");

  if ((await fileExists(envPath)) || !(await fileExists(envExamplePath))) {
    return;
  }

  await copyFile(envExamplePath, envPath);
  console.log("created .env from .env.example");
}

async function loadRuntimeEnv(repoRoot: string): Promise<NodeJS.ProcessEnv> {
  const runtimeEnv: NodeJS.ProcessEnv = { ...process.env };
  const envPath = path.join(repoRoot, ".env");
  const envContent = await readFile(envPath, "utf8").catch(() => undefined);

  if (!envContent) {
    return runtimeEnv;
  }

  const parsed = parseDevgodEnvContent(envContent);
  for (const [key, value] of Object.entries(parsed)) {
    if (value === undefined || runtimeEnv[key] !== undefined) {
      continue;
    }
    runtimeEnv[key] = value;
  }

  return runtimeEnv;
}

async function readPackageScripts(repoRoot: string): Promise<Record<string, string>> {
  const packageJsonPath = path.join(repoRoot, "package.json");
  const packageJson = JSON.parse(await readFile(packageJsonPath, "utf8")) as {
    scripts?: Record<string, unknown>;
  };

  if (!packageJson.scripts || typeof packageJson.scripts !== "object") {
    return {};
  }

  return Object.fromEntries(
    Object.entries(packageJson.scripts).filter((entry): entry is [string, string] => typeof entry[1] === "string")
  );
}

function resolveNpmScriptName(scripts: Record<string, string>, preferred: string, fallback?: string): string {
  if (typeof scripts[preferred] === "string") {
    return preferred;
  }

  if (fallback && typeof scripts[fallback] === "string") {
    return fallback;
  }

  throw new Error(
    fallback ? `missing npm script aliases: ${preferred} or ${fallback}` : `missing npm script alias: ${preferred}`
  );
}

function hasNpmScript(scripts: Record<string, string>, preferred: string, fallback?: string): boolean {
  try {
    resolveNpmScriptName(scripts, preferred, fallback);
    return true;
  } catch {
    return false;
  }
}

async function runNpmScript(
  scripts: Record<string, string>,
  preferred: string,
  options: {
    env: NodeJS.ProcessEnv;
    cwd: string;
    fallback?: string;
  }
): Promise<void> {
  const scriptName = resolveNpmScriptName(scripts, preferred, options.fallback);
  const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
  await runCommand(npmCommand, ["run", scriptName], {
    cwd: options.cwd,
    env: options.env
  });
}

function normalizeRuntimeMode(candidate: string | undefined): RuntimeMode | "auto" {
  const normalized = (candidate ?? "auto").trim().toLowerCase();
  switch (normalized) {
    case "":
    case "auto":
      return "auto";
    case "docker":
    case "native":
    case "managed":
      return normalized;
    default:
      throw new Error(`invalid DEVGOD_RUNTIME_MODE: ${candidate ?? ""}`);
  }
}

async function dockerRuntimeAvailable(env: NodeJS.ProcessEnv, cwd: string): Promise<boolean> {
  try {
    await runCommand("docker", ["version"], { cwd, env, quiet: true });
    return true;
  } catch {
    return false;
  }
}

async function resolveRuntimeMode(env: NodeJS.ProcessEnv, cwd: string): Promise<RuntimeMode> {
  const requestedMode = normalizeRuntimeMode(env.DEVGOD_RUNTIME_MODE);
  if (requestedMode !== "auto") {
    return requestedMode;
  }

  const runtimeProfile = env.DEVGOD_RUNTIME_PROFILE?.trim();
  if (runtimeProfile) {
    const profileMode = runtimeModeFromProfile(runtimeProfile);
    if (profileMode === "managed" || profileMode === "native") {
      return profileMode;
    }
  }

  if (await dockerRuntimeAvailable(env, cwd)) {
    return "docker";
  }

  if (process.platform === "linux") {
    return "native";
  }

  throw new Error(
    "docker runtime is unavailable and native fallback is only supported on Linux; set DEVGOD_RUNTIME_MODE=managed or install Docker"
  );
}

async function waitForContainerHealth(containerName: string, label: string, env: NodeJS.ProcessEnv, cwd: string): Promise<void> {
  console.log(`waiting for ${label} to become healthy`);

  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const result = await runCommand("docker", ["inspect", "-f", "{{.State.Health.Status}}", containerName], {
        cwd,
        env,
        quiet: true
      });
      if (result.stdout.trim() === "healthy") {
        return;
      }
    } catch {
      // Retry until the health check becomes available.
    }

    await sleep(2_000);
  }

  console.error(`${label} did not become healthy`);
  try {
    await runCommand("docker", ["logs", containerName, "--tail", "100"], { cwd, env });
  } catch {
    // Preserve the original timeout failure.
  }
  throw new Error(`${label} did not become healthy`);
}

async function runPrivileged(command: string, args: readonly string[], env: NodeJS.ProcessEnv, cwd: string): Promise<void> {
  if (typeof process.getuid === "function" && process.getuid() === 0) {
    await runCommand(command, args, { cwd, env });
    return;
  }

  if (!(await commandExists("sudo", env))) {
    throw new Error("sudo is required for native runtime setup");
  }

  await runCommand("sudo", ["--non-interactive", command, ...args], { cwd, env });
}

async function runAsPostgres(command: string, args: readonly string[], env: NodeJS.ProcessEnv, cwd: string): Promise<CommandResult> {
  if (await commandExists("sudo", env)) {
    return runCommand("sudo", ["-u", "postgres", command, ...args], { cwd, env });
  }

  if (!(await commandExists("runuser", env))) {
    throw new Error("sudo or runuser is required for PostgreSQL administration");
  }

  return runCommand("runuser", ["-u", "postgres", "--", command, ...args], { cwd, env });
}

async function systemdAvailable(env: NodeJS.ProcessEnv, cwd: string): Promise<boolean> {
  if (!(await commandExists("systemctl", env))) {
    return false;
  }

  try {
    await runCommand("systemctl", ["is-system-running"], { cwd, env, quiet: true });
    return true;
  } catch {
    return false;
  }
}

async function aptAvailable(env: NodeJS.ProcessEnv): Promise<boolean> {
  return (await commandExists("apt-get", env)) && (await commandExists("apt-cache", env));
}

async function aptSearchFirstPackage(pattern: string, env: NodeJS.ProcessEnv, cwd: string): Promise<string> {
  const result = await runCommand("apt-cache", ["search", pattern], { cwd, env, quiet: true });
  const firstLine = result.stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line.length > 0);
  return firstLine?.split(/\s+/, 1)[0] ?? "";
}

function sqlEscapeLiteral(value: string): string {
  return value.replace(/'/g, "''");
}

async function waitForPostgresNative(env: NodeJS.ProcessEnv, cwd: string): Promise<void> {
  console.log("waiting for PostgreSQL to accept local connections");

  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      await runAsPostgres("pg_isready", ["-q"], env, cwd);
      return;
    } catch {
      await sleep(2_000);
    }
  }

  throw new Error("postgresql did not become ready");
}

async function ensureNativeLinuxSupport(env: NodeJS.ProcessEnv, cwd: string): Promise<void> {
  if (process.platform !== "linux") {
    throw new Error("native runtime mode is only supported on Linux and WSL");
  }

  if (!(await systemdAvailable(env, cwd))) {
    throw new Error("native runtime mode requires systemd; on WSL enable systemd or use DEVGOD_RUNTIME_MODE=managed");
  }

  if (env.DEVGOD_POSTGRES_PORT !== "5432") {
    throw new Error("native runtime mode currently supports DEVGOD_POSTGRES_PORT=5432 only");
  }
}

async function ensureNativePostgresTools(env: NodeJS.ProcessEnv, cwd: string): Promise<void> {
  if ((await commandExists("psql", env)) && (await commandExists("pg_isready", env))) {
    return;
  }

  if (!(await aptAvailable(env))) {
    throw new Error("native runtime mode requires PostgreSQL client tools or apt-get support");
  }

  await runPrivileged("apt-get", ["update"], env, cwd);
  await runPrivileged("apt-get", ["install", "-y", "postgresql", "postgresql-contrib", "postgresql-client"], env, cwd);
}

async function ensureNativePgvectorAvailable(env: NodeJS.ProcessEnv, cwd: string): Promise<void> {
  const available = await runAsPostgres(
    "psql",
    ["-Atqc", "select 1 from pg_available_extensions where name = 'vector'", "postgres"],
    env,
    cwd
  )
    .then((result) => result.stdout.trim())
    .catch(() => "");

  if (available === "1") {
    return;
  }

  if (!(await aptAvailable(env))) {
    throw new Error("native runtime mode requires pgvector to be installed for PostgreSQL");
  }

  const packageName = await aptSearchFirstPackage("pgvector", env, cwd);
  if (!packageName) {
    throw new Error(
      "native runtime mode could not find a pgvector package; install pgvector locally before rerunning setup"
    );
  }

  await runPrivileged("apt-get", ["update"], env, cwd);
  await runPrivileged("apt-get", ["install", "-y", packageName], env, cwd);
}

async function ensureNativePostgresDatabase(env: NodeJS.ProcessEnv, cwd: string): Promise<void> {
  const postgresUser = env.DEVGOD_POSTGRES_USER ?? "devgod";
  const postgresDatabase = env.DEVGOD_POSTGRES_DB ?? "devgod";
  const postgresPassword = env.DEVGOD_POSTGRES_PASSWORD ?? "";
  const escapedUser = sqlEscapeLiteral(postgresUser);
  const escapedDatabase = sqlEscapeLiteral(postgresDatabase);
  const escapedPassword = sqlEscapeLiteral(postgresPassword);

  const roleExists = await runAsPostgres(
    "psql",
    ["-Atqc", `select 1 from pg_roles where rolname = '${escapedUser}'`, "postgres"],
    env,
    cwd
  )
    .then((result) => result.stdout.trim())
    .catch(() => "");

  if (roleExists !== "1") {
    await runAsPostgres(
      "psql",
      ["-v", "ON_ERROR_STOP=1", "-c", `create role "${postgresUser}" with login password '${escapedPassword}'`, "postgres"],
      env,
      cwd
    );
  } else {
    await runAsPostgres(
      "psql",
      ["-v", "ON_ERROR_STOP=1", "-c", `alter role "${postgresUser}" with login password '${escapedPassword}'`, "postgres"],
      env,
      cwd
    );
  }

  const databaseExists = await runAsPostgres(
    "psql",
    ["-Atqc", `select 1 from pg_database where datname = '${escapedDatabase}'`, "postgres"],
    env,
    cwd
  )
    .then((result) => result.stdout.trim())
    .catch(() => "");

  if (databaseExists !== "1") {
    await runAsPostgres(
      "psql",
      [
        "-v",
        "ON_ERROR_STOP=1",
        "-c",
        `create database "${postgresDatabase}" owner "${postgresUser}"`,
        "postgres"
      ],
      env,
      cwd
    );
  }

  await runAsPostgres(
    "psql",
    ["-v", "ON_ERROR_STOP=1", "-d", postgresDatabase, "-c", "create extension if not exists vector"],
    env,
    cwd
  );
}

async function setupDockerRuntime(env: NodeJS.ProcessEnv, cwd: string): Promise<void> {
  if (!(await dockerRuntimeAvailable(env, cwd))) {
    throw new Error("docker runtime mode selected but Docker is not available; use DEVGOD_RUNTIME_MODE=native or managed instead");
  }

  await runCommand("docker", ["compose", "up", "-d", "devgod-postgres"], { cwd, env });
  await waitForContainerHealth(env.DEVGOD_DOCKER_CONTAINER_NAME ?? "devgod-postgres", "devgod-postgres", env, cwd);
}

async function setupNativeRuntime(env: NodeJS.ProcessEnv, cwd: string): Promise<void> {
  await ensureNativeLinuxSupport(env, cwd);
  await ensureNativePostgresTools(env, cwd);
  await runPrivileged("systemctl", ["enable", "--now", "postgresql"], env, cwd);
  await waitForPostgresNative(env, cwd);
  await ensureNativePgvectorAvailable(env, cwd);
  await ensureNativePostgresDatabase(env, cwd);
}

async function shouldRunGitGuard(repoRoot: string, env: NodeJS.ProcessEnv): Promise<boolean> {
  if (!(await fileExists(path.join(repoRoot, ".devgod", "install-manifest.json")))) {
    return false;
  }

  try {
    await runCommand("git", ["rev-parse", "--show-toplevel"], { cwd: repoRoot, env, quiet: true });
    return true;
  } catch {
    return false;
  }
}

function configureDefaultEnv(repoRoot: string, env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const configuredEnv: NodeJS.ProcessEnv = { ...env };

  if (!configuredEnv.DEVGOD_PROJECT_REPO_PATH || configuredEnv.DEVGOD_PROJECT_REPO_PATH === "/absolute/path/to/repo") {
    configuredEnv.DEVGOD_PROJECT_REPO_PATH = repoRoot;
  }

  if (!configuredEnv.DEVGOD_PROJECT_SLUG) {
    configuredEnv.DEVGOD_PROJECT_SLUG = path.basename(repoRoot).toLowerCase();
  }

  if (!configuredEnv.DEVGOD_PROJECT_NAME) {
    configuredEnv.DEVGOD_PROJECT_NAME = configuredEnv.DEVGOD_PROJECT_SLUG;
  }

  if (!configuredEnv.DEVGOD_WORKSPACE_SLUG) {
    configuredEnv.DEVGOD_WORKSPACE_SLUG = "default";
  }

  if (!configuredEnv.DEVGOD_WORKSPACE_NAME) {
    configuredEnv.DEVGOD_WORKSPACE_NAME = "Default Workspace";
  }

  if (!configuredEnv.DEVGOD_DOCKER_CONTAINER_NAME) {
    configuredEnv.DEVGOD_DOCKER_CONTAINER_NAME = `devgod-postgres-${configuredEnv.DEVGOD_PROJECT_SLUG}`;
  }

  const runtimeConfig = resolveRuntimeEnvironmentConfig(configuredEnv, {
    projectSlug: configuredEnv.DEVGOD_PROJECT_SLUG ?? path.basename(repoRoot).toLowerCase(),
    cwd: repoRoot
  });

  if (!configuredEnv.DEVGOD_RUNTIME_DATA_ROOT) {
    configuredEnv.DEVGOD_RUNTIME_DATA_ROOT = runtimeConfig.dataRoot;
  }

  if (!configuredEnv.DEVGOD_POSTGRES_PORT) {
    configuredEnv.DEVGOD_POSTGRES_PORT = "5432";
  }

  const postgresPassword = configuredEnv.DEVGOD_POSTGRES_PASSWORD ?? "";
  if (!postgresPassword || postgresPassword === "devgod") {
    throw new Error("DEVGOD_POSTGRES_PASSWORD must be set to a non-default local password before setup continues");
  }

  if (!configuredEnv.DEVGOD_CORE_DATABASE_URL) {
    const postgresUser = configuredEnv.DEVGOD_POSTGRES_USER ?? "devgod";
    const postgresDatabase = configuredEnv.DEVGOD_POSTGRES_DB ?? "devgod";
    const postgresPort = configuredEnv.DEVGOD_POSTGRES_PORT ?? "5432";
    configuredEnv.DEVGOD_CORE_DATABASE_URL =
      `postgres://${encodeURIComponent(postgresUser)}:${encodeURIComponent(postgresPassword)}` +
      `@127.0.0.1:${postgresPort}/${encodeURIComponent(postgresDatabase)}`;
  }

  return configuredEnv;
}

async function main(): Promise<void> {
  const repoRoot = process.cwd();
  await ensureEnvFile(repoRoot);

  let env = configureDefaultEnv(repoRoot, await loadRuntimeEnv(repoRoot));
  const runtimeMode = await resolveRuntimeMode(env, repoRoot);
  env = {
    ...env,
    DEVGOD_RUNTIME_MODE: runtimeMode,
    DEVGOD_RUNTIME_PROFILE: runtimeProfileForMode(runtimeMode)
  };

  switch (runtimeMode) {
    case "docker":
      await setupDockerRuntime(env, repoRoot);
      break;
    case "native":
      await setupNativeRuntime(env, repoRoot);
      break;
    case "managed":
      break;
    default:
      throw new Error(`unsupported runtime mode: ${runtimeMode}`);
  }

  const scripts = await readPackageScripts(repoRoot);
  const nodeModulesPath = path.join(repoRoot, "node_modules");
  const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";

  if (!(await fileExists(nodeModulesPath))) {
    await runCommand(npmCommand, ["install"], { cwd: repoRoot, env });
  }

  if ((await shouldRunGitGuard(repoRoot, env)) && hasNpmScript(scripts, "devgod:setup:git-guard")) {
    await runNpmScript(scripts, "devgod:setup:git-guard", { cwd: repoRoot, env });
  }

  await runNpmScript(scripts, "devgod:migrate", { cwd: repoRoot, env, fallback: "migrate" });
  await runNpmScript(scripts, "devgod:bootstrap", { cwd: repoRoot, env, fallback: "bootstrap" });

  if (await fileExists(path.join(repoRoot, ".devgod", "work", "task-queue.json"))) {
    await runNpmScript(scripts, "devgod:repair-task-queue", { cwd: repoRoot, env });
  }

  await runNpmScript(scripts, "devgod:refresh-repo-context", { cwd: repoRoot, env });
  await runNpmScript(scripts, "devgod:refresh-retrieval:fast", { cwd: repoRoot, env });
  await runNpmScript(scripts, "devgod:verify:setup", { cwd: repoRoot, env, fallback: "verify:setup" });

  console.log("");
  console.log("devgod local setup complete");
  console.log(`runtime mode: ${env.DEVGOD_RUNTIME_MODE}`);
  console.log(`workspace: ${env.DEVGOD_WORKSPACE_SLUG ?? "default"}`);
  console.log(`project: ${env.DEVGOD_PROJECT_SLUG ?? "unknown"}`);
  console.log("database: configured");
  console.log("optional modules: skipped by default");
}

const entryUrl = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : "";
const moduleUrl = pathToFileURL(fileURLToPath(import.meta.url)).href;

if (import.meta.url === entryUrl || moduleUrl === entryUrl) {
  main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(message);
    process.exitCode = 1;
  });
}
