import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

test("release overlay verification script stays aligned with CI", async () => {
  const packageJson = JSON.parse(await readFile(join(repoRoot, "package.json"), "utf8")) as {
    scripts: Record<string, string>;
  };
  const ciWorkflow = await readFile(join(repoRoot, ".github", "workflows", "ci.yml"), "utf8");
  const releaseOverlayScript = await readFile(join(repoRoot, "scripts", "verify-release-overlay.sh"), "utf8");

  assert.equal(packageJson.scripts["verify:release-overlay"], "bash scripts/verify-release-overlay.sh");
  assert.match(ciWorkflow, /pull_request:\n\s+branches:\n\s+- main/);
  assert.match(ciWorkflow, /merge_group:/);
  assert.match(ciWorkflow, /concurrency:\n\s+group: \$\{\{ github\.workflow \}\}-\$\{\{ github\.event\.pull_request\.number \|\| github\.ref \}\}/);
  assert.match(ciWorkflow, /jobs:\n  release-overlay:/);
  assert.match(ciWorkflow, /- run: npm run verify:release-overlay/);
  assert.match(ciWorkflow, /jobs:[\s\S]*\n  live-migrations:/);
  assert.match(ciWorkflow, /jobs:[\s\S]*\n\s+qdrant:\n\s+image: qdrant\/qdrant:v1\.13\.4/);
  assert.match(ciWorkflow, /DEVGOD_QDRANT_URL: http:\/\/127\.0\.0\.1:6333/);
  assert.match(ciWorkflow, /jobs:[\s\S]*\n  required-checks:/);
  assert.match(ciWorkflow, /- run: npm run verify:migrations:live/);
  assert.match(ciWorkflow, /tests\/setup-powershell-smoke\.test\.ts/);
  assert.doesNotMatch(ciWorkflow, /- run: npm run check:coverage/);

  assert.match(releaseOverlayScript, /npm test/);
  assert.match(releaseOverlayScript, /npm run check:quality/);
  assert.match(releaseOverlayScript, /npm run verify:review-identity/);
  assert.match(releaseOverlayScript, /npm run check:coverage|npm run check:quality/);

  const qualityScript = await readFile(join(repoRoot, "scripts", "check-quality.sh"), "utf8");
  assert.match(qualityScript, /npm run check:coverage/);
});

test("README documents the opt-in overlay release posture honestly", async () => {
  const readme = await readFile(join(repoRoot, "README.md"), "utf8");

  assert.match(readme, /opt-in overlay/);
  assert.match(readme, /production-oriented package checks/);
  assert.match(readme, /repo-local release posture/);
  assert.match(readme, /npm run verify:release-overlay/);
  assert.match(readme, /npm run verify:migrations:live/);
  assert.match(readme, /any claim that a consuming repo is fit for production use/);
});
