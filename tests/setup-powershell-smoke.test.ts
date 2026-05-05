import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path, { delimiter, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import test from "node:test";
import { installDevgodIntoProject } from "../src/install/cli.ts";

const execFileAsync = promisify(execFile);
const sourceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function hasPwsh(): Promise<boolean> {
  try {
    await execFileAsync("pwsh", ["-NoLogo", "-NoProfile", "-Command", "$PSVersionTable.PSVersion.ToString()"]);
    return true;
  } catch {
    return false;
  }
}

async function writeBatchFile(filePath: string, lines: string[]): Promise<void> {
  await writeFile(filePath, `${lines.join("\r\n")}\r\n`, "utf8");
}

const pwshAvailable = await hasPwsh();
const smoke = pwshAvailable ? test : test.skip;

smoke("PowerShell setup script bootstraps a clean workspace with synthetic docker and npm", async () => {
  const targetRoot = await mkdtemp(join(tmpdir(), "devgod-pwsh-setup-"));
  const binDir = join(targetRoot, "bin");
  const dockerLog = join(targetRoot, "docker.log");
  const dockerComposeSentinel = join(targetRoot, "docker-compose-called");
  const npmLog = join(targetRoot, "npm.log");
  const npmEnvCapture = join(targetRoot, "npm-env.txt");
  const setupScript = join(targetRoot, "scripts", "devgod-setup.ps1");

  try {
    await mkdir(binDir, { recursive: true });
    await writeFile(join(targetRoot, "package.json"), '{ "name": "fixture", "private": true }\n', "utf8");
    await writeFile(
      join(targetRoot, ".env.example"),
      [
        "DEVGOD_WORKSPACE_SLUG=team # trailing comment",
        'DEVGOD_WORKSPACE_NAME="Alpha Team" # trailing comment',
        "DEVGOD_PROJECT_SLUG=alpha",
        "DEVGOD_PROJECT_NAME='Alpha Project'",
        "DEVGOD_PROJECT_REPO_PATH=/absolute/path/to/repo",
        "DEVGOD_DOCKER_CONTAINER_NAME=alpha-container",
        ""
      ].join("\n"),
      "utf8"
    );
    await installDevgodIntoProject({ sourceRoot, targetRoot });

    await writeBatchFile(join(binDir, "docker.cmd"), [
      "@echo off",
      "setlocal EnableExtensions",
      'if "%~1"=="version" (',
      `  >>"%DEVGOD_DOCKER_LOG_FILE%" echo version`,
      "  exit /b 0",
      ")",
      'if "%~1"=="compose" (',
      `  >>"%DEVGOD_DOCKER_LOG_FILE%" echo %*`,
      `  type nul > "%DEVGOD_DOCKER_COMPOSE_SENTINEL%"`,
      "  exit /b 0",
      ")",
      'if "%~1"=="inspect" (',
      `  >>"%DEVGOD_DOCKER_LOG_FILE%" echo %*`,
      `  if exist "%DEVGOD_DOCKER_COMPOSE_SENTINEL%" (`,
      "    echo healthy",
      "    exit /b 0",
      "  )",
      "  exit /b 1",
      ")",
      'if "%~1"=="logs" (',
      `  >>"%DEVGOD_DOCKER_LOG_FILE%" echo %*`,
      "  exit /b 0",
      ")",
      "echo unexpected docker call: %* 1>&2",
      "exit /b 1"
    ]);

    await writeBatchFile(join(binDir, "npm.cmd"), [
      "@echo off",
      "setlocal EnableExtensions",
      `>>"%DEVGOD_NPM_LOG_FILE%" echo %*`,
      `if not exist "%DEVGOD_NPM_ENV_CAPTURE_FILE%" (`,
      `  >"%DEVGOD_NPM_ENV_CAPTURE_FILE%" (`,
      "    echo DEVGOD_WORKSPACE_SLUG=%DEVGOD_WORKSPACE_SLUG%",
      "    echo DEVGOD_WORKSPACE_NAME=%DEVGOD_WORKSPACE_NAME%",
      "    echo DEVGOD_PROJECT_SLUG=%DEVGOD_PROJECT_SLUG%",
      "    echo DEVGOD_PROJECT_NAME=%DEVGOD_PROJECT_NAME%",
      "    echo DEVGOD_PROJECT_REPO_PATH=%DEVGOD_PROJECT_REPO_PATH%",
      "    echo DEVGOD_DOCKER_CONTAINER_NAME=%DEVGOD_DOCKER_CONTAINER_NAME%",
      "  )",
      ")",
      'if "%~1"=="install" exit /b 0',
      'if "%~1"=="run" (',
      '  if /i "%~2"=="migrate" exit /b 0',
      '  if /i "%~2"=="bootstrap" exit /b 0',
      '  if /i "%~2"=="verify:setup" exit /b 0',
      ")",
      "echo unexpected npm call: %* 1>&2",
      "exit /b 1"
    ]);

    await execFileAsync("pwsh", ["-NoLogo", "-NoProfile", "-File", setupScript], {
      cwd: targetRoot,
      env: {
        ...process.env,
        PATH: `${binDir}${delimiter}${process.env.PATH ?? ""}`,
        DEVGOD_DOCKER_LOG_FILE: dockerLog,
        DEVGOD_DOCKER_COMPOSE_SENTINEL: dockerComposeSentinel,
        DEVGOD_NPM_LOG_FILE: npmLog,
        DEVGOD_NPM_ENV_CAPTURE_FILE: npmEnvCapture
      }
    });

    const npmCalls = (await readFile(npmLog, "utf8")).trim().split(/\r?\n/);
    assert.deepEqual(npmCalls, [
      "install",
      "run migrate",
      "run bootstrap",
      "run verify:setup"
    ]);

    const dockerCalls = (await readFile(dockerLog, "utf8")).trim().split(/\r?\n/);
    assert.deepEqual(dockerCalls, [
      "version",
      "compose up -d devgod-postgres",
      "inspect -f {{.State.Health.Status}} alpha-container",
      "inspect -f {{.State.Health.Status}} alpha-container"
    ]);

    const capturedEnv = await readFile(npmEnvCapture, "utf8");
    assert.match(capturedEnv, /DEVGOD_WORKSPACE_SLUG=team/);
    assert.match(capturedEnv, /DEVGOD_WORKSPACE_NAME=Alpha Team/);
    assert.match(capturedEnv, /DEVGOD_PROJECT_SLUG=alpha/);
    assert.match(capturedEnv, /DEVGOD_PROJECT_NAME=Alpha Project/);
    assert.match(capturedEnv, new RegExp(`DEVGOD_PROJECT_REPO_PATH=${targetRoot.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`));
    assert.match(capturedEnv, /DEVGOD_DOCKER_CONTAINER_NAME=alpha-container/);

    const copiedEnv = await readFile(join(targetRoot, ".env"), "utf8");
    const exampleEnv = await readFile(join(targetRoot, ".env.example"), "utf8");
    assert.equal(copiedEnv, exampleEnv);
  } finally {
    await rm(targetRoot, { recursive: true, force: true });
  }
});
