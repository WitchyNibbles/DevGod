import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createServer } from "node:http";
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path, { delimiter, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { installDevgodIntoProject } from "../src/install/cli.ts";

const execFileAsync = promisify(execFile);
const sourceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function writeBatchFile(filePath: string, lines: string[]): Promise<void> {
  await writeFile(filePath, `${lines.join("\r\n")}\r\n`, "utf8");
}

async function startHealthServer(): Promise<{ close: () => Promise<void>; url: string }> {
  const server = createServer((request, response) => {
    if (request.url === "/collections") {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ status: "ok" }));
      return;
    }

    response.writeHead(404);
    response.end();
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("health server did not bind to an IPv4 port");
  }

  return {
    url: `http://127.0.0.1:${address.port}`,
    close: () =>
      new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve()))
      )
  };
}

export async function runPowerShellSetupSmoke(): Promise<void> {
  const targetRoot = await mkdtemp(join(tmpdir(), "devgod-pwsh-setup-"));
  const binDir = join(targetRoot, "bin");
  const dockerLog = join(targetRoot, "docker.log");
  const dockerComposeSentinel = join(targetRoot, "docker-compose-called");
  const npmLog = join(targetRoot, "npm.log");
  const npmEnvCapture = join(targetRoot, "npm-env.txt");
  const setupScript = join(targetRoot, "scripts", "devgod-setup.ps1");
  const healthServer = await startHealthServer();

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
        "DEVGOD_POSTGRES_PASSWORD=alpha-local-password",
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
      "    echo DEVGOD_QDRANT_URL=%DEVGOD_QDRANT_URL%",
      "  )",
      ")",
      'if "%~1"=="install" exit /b 0',
      'if "%~1"=="run" (',
      '  if /i "%~2"=="devgod:setup:git-guard" exit /b 0',
      '  if /i "%~2"=="devgod:migrate" exit /b 0',
      '  if /i "%~2"=="devgod:bootstrap" exit /b 0',
      '  if /i "%~2"=="devgod:refresh-retrieval" exit /b 0',
      '  if /i "%~2"=="devgod:verify:setup" exit /b 0',
      ")",
      "echo unexpected npm call: %* 1>&2",
      "exit /b 1"
    ]);

    await execFileAsync("pwsh", ["-NoLogo", "-NoProfile", "-File", setupScript], {
      cwd: targetRoot,
      env: {
        ...process.env,
        PATH: `${binDir}${delimiter}${process.env.PATH ?? ""}`,
        DEVGOD_QDRANT_URL: healthServer.url,
        DEVGOD_DOCKER_LOG_FILE: dockerLog,
        DEVGOD_DOCKER_COMPOSE_SENTINEL: dockerComposeSentinel,
        DEVGOD_NPM_LOG_FILE: npmLog,
        DEVGOD_NPM_ENV_CAPTURE_FILE: npmEnvCapture
      }
    });

    const npmCalls = (await readFile(npmLog, "utf8")).trim().split(/\r?\n/);
    assert.deepEqual(npmCalls, [
      "install",
      "run devgod:setup:git-guard",
      "run devgod:migrate",
      "run devgod:bootstrap",
      "run devgod:refresh-retrieval",
      "run devgod:verify:setup"
    ]);

    const dockerCalls = (await readFile(dockerLog, "utf8")).trim().split(/\r?\n/);
    assert.deepEqual(dockerCalls.slice(0, 3), [
      "version",
      "version",
      "compose up -d devgod-postgres devgod-qdrant"
    ]);

    const inspectCalls = dockerCalls.slice(3);
    assert.deepEqual(inspectCalls, [
      "inspect -f {{.State.Health.Status}} alpha-container",
      "inspect -f {{.State.Health.Status}} devgod-qdrant-alpha"
    ]);

    const capturedEnv = await readFile(npmEnvCapture, "utf8");
    const capturedProjectRepoPath =
      capturedEnv
        .split(/\r?\n/)
        .find((line) => line.startsWith("DEVGOD_PROJECT_REPO_PATH="))
        ?.slice("DEVGOD_PROJECT_REPO_PATH=".length) ?? "";

    assert.match(capturedEnv, /DEVGOD_WORKSPACE_SLUG=team/);
    assert.match(capturedEnv, /DEVGOD_WORKSPACE_NAME=Alpha Team/);
    assert.match(capturedEnv, /DEVGOD_PROJECT_SLUG=alpha/);
    assert.match(capturedEnv, /DEVGOD_PROJECT_NAME=Alpha Project/);
    assert.equal(await realpath(capturedProjectRepoPath), await realpath(targetRoot));
    assert.match(capturedEnv, /DEVGOD_DOCKER_CONTAINER_NAME=alpha-container/);
    const escapedHealthUrl = healthServer.url.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    assert.match(capturedEnv, new RegExp(`DEVGOD_QDRANT_URL=${escapedHealthUrl}`));

    const copiedEnv = await readFile(join(targetRoot, ".env"), "utf8");
    const exampleEnv = await readFile(join(targetRoot, ".env.example"), "utf8");
    assert.equal(copiedEnv, exampleEnv);
  } finally {
    await healthServer.close();
    await rm(targetRoot, { recursive: true, force: true });
  }
}
