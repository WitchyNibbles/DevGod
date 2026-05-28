import test from "node:test";
import assert from "node:assert/strict";

import fc from "fast-check";

import { mergePackageJson } from "../../src/install/merge.ts";
import {
  MAINTAINER_ONLY_DEV_DEPENDENCIES,
  MAINTAINER_ONLY_SCRIPTS,
  auditMaintainerOnlyPackageJson
} from "../../src/install/maintainer-boundary.ts";

function safeKeyArbitrary(blocked: readonly string[]) {
  return fc
    .string({ minLength: 1, maxLength: 24 })
    .filter((value) => !blocked.includes(value) && !value.includes("\u0000"));
}

test("mergePackageJson never injects maintainer-only scripts or deps into clean target package shapes", () => {
  fc.assert(
    fc.property(
      fc.dictionary(safeKeyArbitrary(MAINTAINER_ONLY_SCRIPTS), fc.string({ maxLength: 40 })),
      fc.dictionary(safeKeyArbitrary(MAINTAINER_ONLY_DEV_DEPENDENCIES), fc.string({ maxLength: 20 })),
      (scripts, devDependencies) => {
        const merged = JSON.parse(
          mergePackageJson(
            JSON.stringify({
              name: "target-project",
              private: true,
              scripts,
              devDependencies
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
      }
    ),
    { numRuns: 50 }
  );
});
