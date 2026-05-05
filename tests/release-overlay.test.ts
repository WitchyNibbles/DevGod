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
  assert.match(ciWorkflow, /jobs:\n  test:/);
  assert.match(ciWorkflow, /- run: npm run check:coverage/);
  assert.match(ciWorkflow, /- run: npm run verify:release-overlay/);
  assert.match(ciWorkflow, /- run: npm run verify:migrations:live/);
  assert.match(ciWorkflow, /tests\/setup-powershell-smoke\.test\.ts/);

  assert.match(releaseOverlayScript, /npm test/);
  assert.match(releaseOverlayScript, /npm run check:quality/);
  assert.match(releaseOverlayScript, /npm run verify:review-identity/);
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
