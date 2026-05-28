import test from "node:test";
import assert from "node:assert/strict";

import { mergePackageJson } from "../src/install/merge.ts";
import {
  MAINTAINER_ONLY_DEV_DEPENDENCIES,
  MAINTAINER_ONLY_SCRIPTS,
  auditMaintainerOnlyPackageJson,
  auditMaintainerOnlyPublishedPaths
} from "../src/install/maintainer-boundary.ts";

test("maintainer-only script and dependency lists stay explicit", () => {
  assert.deepEqual(MAINTAINER_ONLY_SCRIPTS, [
    "test:properties",
    "eval:promptfoo:maintainer-boundary",
    "test:mutation:maintainer-boundary",
    "test:mutation:maintainer-boundary:dry-run"
  ]);
  assert.deepEqual(MAINTAINER_ONLY_DEV_DEPENDENCIES, [
    "fast-check",
    "promptfoo",
    "@stryker-mutator/core",
    "@stryker-mutator/tap-runner",
    "tsx"
  ]);
});

test("mergePackageJson keeps maintainer-only scripts and dependencies out of target repos", () => {
  const merged = JSON.parse(
    mergePackageJson(
      JSON.stringify({
        name: "target-project",
        scripts: {
          test: "node --test"
        },
        devDependencies: {
          typescript: "^5.8.3"
        }
      }),
      "../devgod"
    )
  ) as {
    scripts?: Record<string, string>;
    devDependencies?: Record<string, string>;
  };

  const audit = auditMaintainerOnlyPackageJson(merged);

  assert.deepEqual(audit.scriptLeaks, []);
  assert.deepEqual(audit.devDependencyLeaks, []);
});

test("package audit detects maintainer-only leakage and ignores malformed package shapes safely", () => {
  assert.deepEqual(auditMaintainerOnlyPackageJson(null), {
    scriptLeaks: [],
    devDependencyLeaks: []
  });
  assert.deepEqual(auditMaintainerOnlyPackageJson(["not", "an", "object"]), {
    scriptLeaks: [],
    devDependencyLeaks: []
  });

  const audit = auditMaintainerOnlyPackageJson({
    scripts: {
      "test:properties": "node --test",
      "eval:promptfoo:maintainer-boundary": "promptfoo eval"
    },
    devDependencies: {
      promptfoo: "0.120.19",
      tsx: "^4.22.3"
    }
  });

  assert.deepEqual(audit.scriptLeaks, [
    "test:properties",
    "eval:promptfoo:maintainer-boundary"
  ]);
  assert.deepEqual(audit.devDependencyLeaks, [
    "promptfoo",
    "tsx"
  ]);
});

test("published file audit flags maintainer-only tooling paths but allows shipped runtime paths", () => {
  const audit = auditMaintainerOnlyPublishedPaths([
    "src/admin.ts",
    "scripts/check-quality.sh",
    "evals/promptfoo/maintainer-boundary.promptfooconfig.yaml",
    "docs/maintainers/quality-tooling.md",
    "stryker-maintainer-boundary.config.json"
  ]);

  assert.deepEqual(audit, [
    "docs/maintainers/quality-tooling.md",
    "evals/promptfoo/maintainer-boundary.promptfooconfig.yaml",
    "stryker-maintainer-boundary.config.json"
  ]);
});

test("published file audit deduplicates repeated maintainer-only paths", () => {
  const audit = auditMaintainerOnlyPublishedPaths([
    "docs/maintainers/quality-tooling.md",
    "docs/maintainers/quality-tooling.md",
    "evals/promptfoo/maintainer-boundary.promptfooconfig.yaml"
  ]);

  assert.deepEqual(audit, [
    "docs/maintainers/quality-tooling.md",
    "evals/promptfoo/maintainer-boundary.promptfooconfig.yaml"
  ]);
});
