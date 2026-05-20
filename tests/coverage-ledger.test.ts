import assert from "node:assert/strict";
import test from "node:test";
import {
  validateCoverageItemRecord,
  validateCoverageManifestRecord
} from "../src/runtime/autonomous-execution.ts";

test("validateCoverageManifestRecord rejects empty categories and incomplete thresholds", () => {
  const errors = validateCoverageManifestRecord({
    runId: "run-1",
    profile: "legacy_rewrite",
    requiredCategories: [],
    thresholds: {
      criticalItemCoverage: 0.8
    }
  });

  assert.match(errors.join(" "), /requiredCategories/i);
  assert.match(errors.join(" "), /criticalItemValidation/i);
  assert.match(errors.join(" "), /callsiteCoverage/i);
  assert.match(errors.join(" "), /runtimeTraceCoverage/i);
});

test("validateCoverageItemRecord rejects validated items without verification refs or impossible callsite counts", () => {
  const errors = validateCoverageItemRecord({
    id: "service:proof",
    category: "services",
    state: "validated",
    criticality: "critical",
    sources: ["src/core/service.ts:1"],
    callsiteCount: 2,
    callsitesAnalyzed: 3,
    evidenceRefs: ["src/core/service.ts:1"],
    lastUpdatedAt: "2026-05-20T10:00:00.000Z"
  });

  assert.match(errors.join(" "), /verificationRefs/i);
  assert.match(errors.join(" "), /callsitesAnalyzed/i);
});
