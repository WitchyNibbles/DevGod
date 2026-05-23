import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test, { type TestContext } from "node:test";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);
const smokeTestName = "PowerShell setup script bootstraps a clean workspace with synthetic docker and npm";
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

type SmokeRunner = (context: TestContext) => Promise<void> | void;
type RegisterTest = typeof test;
type RegisterTestStub = (
  name: string,
  optionsOrFn: { skip: string } | SmokeRunner,
  maybeFn?: SmokeRunner
) => void;

function must<T>(value: T | undefined): T {
  assert.notEqual(value, undefined);
  return value as T;
}

async function detectPwsh(): Promise<void> {
  await execFileAsync("pwsh", ["-NoLogo", "-NoProfile", "-Command", "$PSVersionTable.PSVersion.ToString()"]);
}

async function resolvePwshAvailability(checker: () => Promise<void>): Promise<boolean> {
  try {
    await checker();
    return true;
  } catch {
    return false;
  }
}

async function registerPowerShellSetupSmoke(options: {
  importRunner?: () => Promise<{ runPowerShellSetupSmoke: SmokeRunner }>;
  platform?: NodeJS.Platform;
  pwshAvailable: boolean;
  registerTest?: RegisterTest;
}): Promise<void> {
  const { importRunner, platform = process.platform, pwshAvailable, registerTest = test } = options;

  if (platform === "win32" && pwshAvailable) {
    const loadRunner = importRunner ?? (() => import("./setup-powershell-smoke-runner.ts"));
    const { runPowerShellSetupSmoke } = await loadRunner();
    registerTest(smokeTestName, runPowerShellSetupSmoke);
    return;
  }

  registerTest(smokeTestName, { skip: "requires Windows with pwsh" }, () => {});
}

test("resolvePwshAvailability returns true when pwsh detection succeeds", async () => {
  assert.equal(await resolvePwshAvailability(async () => {}), true);
});

test("resolvePwshAvailability returns false when pwsh detection fails", async () => {
  assert.equal(
    await resolvePwshAvailability(async () => {
      throw new Error("pwsh missing");
    }),
    false
  );
});

test("registerPowerShellSetupSmoke registers the runnable smoke test when prerequisites are met", async () => {
  const calls: Array<{ fn: SmokeRunner; name: string; options?: { skip: string } }> = [];

  await registerPowerShellSetupSmoke({
    platform: "win32",
    pwshAvailable: true,
    importRunner: async () => ({ runPowerShellSetupSmoke: async () => {} }),
    registerTest: ((name: string, optionsOrFn: { skip: string } | SmokeRunner, maybeFn?: SmokeRunner) => {
      if (typeof optionsOrFn === "function") {
        calls.push({ name, fn: optionsOrFn });
        return;
      }

      calls.push({ name, options: optionsOrFn, fn: maybeFn ?? (() => {}) });
    }) as RegisterTestStub as RegisterTest
  });

  assert.equal(calls.length, 1);
  assert.equal(must(calls[0]).name, smokeTestName);
  assert.equal(must(calls[0]).options, undefined);
});

test("registerPowerShellSetupSmoke registers a skipped smoke test when prerequisites are missing", async () => {
  const calls: Array<{ fn: SmokeRunner; name: string; options?: { skip: string } }> = [];

  await registerPowerShellSetupSmoke({
    platform: "linux",
    pwshAvailable: false,
    registerTest: ((name: string, optionsOrFn: { skip: string } | SmokeRunner, maybeFn?: SmokeRunner) => {
      if (typeof optionsOrFn === "function") {
        calls.push({ name, fn: optionsOrFn });
        return;
      }

      calls.push({ name, options: optionsOrFn, fn: maybeFn ?? (() => {}) });
    }) as RegisterTestStub as RegisterTest
  });

  assert.equal(calls.length, 1);
  assert.equal(must(calls[0]).name, smokeTestName);
  assert.deepEqual(must(calls[0]).options, { skip: "requires Windows with pwsh" });
});

test("PowerShell setup script braces postgres user interpolation in the fallback database URL", async () => {
  const script = await readFile(path.join(repoRoot, "scripts", "setup-devgod.ps1"), "utf8");

  assert.doesNotMatch(script, /postgres:\/\/\$postgresUser:/);
  assert.match(script, /postgres:\/\/\$\{postgresUser\}:\$\(\$env:DEVGOD_POSTGRES_PASSWORD\)/);
});

const pwshAvailable = await resolvePwshAvailability(detectPwsh);
await registerPowerShellSetupSmoke({ pwshAvailable });
