import assert from "node:assert/strict";
import test from "node:test";
import {
  buildCoverageLedgerArtifacts,
  validateCoverageDependencyGraphArtifact,
  validateCoverageLedgerArtifacts,
  validateCoverageManifestArtifact
} from "../src/runtime/coverage-ledger.ts";
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

test("buildCoverageLedgerArtifacts emits manifest, items, dependency graph, gaps, and traces", () => {
  const artifacts = buildCoverageLedgerArtifacts({
    enabled: true,
    profile: "legacy_rewrite",
    phase: "validation",
    manifest: {
      runId: "run-1",
      profile: "legacy_rewrite",
      requiredCategories: ["services", "tests"],
      thresholds: {
        criticalItemCoverage: 0.8,
        criticalItemValidation: 0.6,
        callsiteCoverage: 0.85,
        runtimeTraceCoverage: 0.75
      }
    },
    coverageItems: [
      {
        id: "service:proof",
        category: "services",
        state: "validated",
        criticality: "critical",
        sources: ["src/core/service.ts:1"],
        dependencies: ["test:proof"],
        callsiteCount: 2,
        callsitesAnalyzed: 2,
        runtimeTraced: true,
        evidenceRefs: ["src/core/service.ts:1"],
        verificationRefs: ["tests/coverage-ledger.test.ts"],
        lastUpdatedAt: "2026-05-20T10:00:00.000Z"
      },
      {
        id: "test:proof",
        category: "tests",
        state: "fully_analyzed",
        criticality: "medium",
        sources: ["tests/coverage-ledger.test.ts:1"],
        dependents: ["service:proof"],
        evidenceRefs: ["tests/coverage-ledger.test.ts:1"],
        lastUpdatedAt: "2026-05-20T10:01:00.000Z"
      }
    ],
    gaps: [
      {
        id: "gap:proof",
        targetId: "service:proof",
        kind: "missing_validation",
        severity: "high",
        description: "proof still needs live validation",
        blocking: true,
        evidenceRefs: ["tests/coverage-ledger.test.ts:1"],
        createdBy: "qa_engineer",
        suggestedNextActions: ["run workflow proof"],
        status: "open"
      }
    ],
    checkpoints: [],
    progressProofs: [],
    runtimeTraces: [
      {
        traceId: "trace:proof",
        targetId: "service:proof",
        kind: "side_effect",
        risky: true,
        sideEffects: ["records workflow proof completion"],
        evidenceRefs: ["tests/coverage-ledger.test.ts:1"],
        createdAt: "2026-05-20T10:02:00.000Z"
      }
    ],
    pendingInvestigations: [],
    executionEpoch: 1,
    updatedAt: "2026-05-20T10:03:00.000Z"
  });

  assert.equal(artifacts.manifest.run_id, "run-1");
  assert.equal(artifacts.items.length, 2);
  assert.equal(artifacts.gaps.length, 1);
  assert.equal(artifacts.traces.length, 1);
  assert.ok(artifacts.dependency_graph.nodes.some((node) => node.id === "service:proof"));
  assert.ok(
    artifacts.dependency_graph.edges.some(
      (edge) => edge.from === "service:proof" && edge.to === "test:proof"
    )
  );
  assert.deepEqual(validateCoverageLedgerArtifacts(artifacts), []);
});

test("validateCoverageDependencyGraphArtifact rejects missing item nodes", () => {
  const errors = validateCoverageDependencyGraphArtifact(
    {
      generated_at: "2026-05-20T10:00:00.000Z",
      nodes: [],
      edges: []
    },
    [
      {
        id: "service:proof",
        category: "services",
        state: "validated",
        criticality: "critical",
        sources: ["src/core/service.ts:1"],
        evidence_refs: ["src/core/service.ts:1"],
        verification_refs: ["tests/coverage-ledger.test.ts"],
        last_updated_at: "2026-05-20T10:00:00.000Z"
      }
    ]
  );

  assert.match(errors.join(" "), /missing node for coverage item service:proof/);
});

test("validateCoverageManifestArtifact preserves the existing manifest threshold contract", () => {
  const errors = validateCoverageManifestArtifact({
    run_id: "run-1",
    profile: "legacy_rewrite",
    required_categories: [],
    thresholds: {
      critical_item_coverage: 0.8
    }
  });

  assert.match(errors.join(" "), /requiredCategories/i);
  assert.match(errors.join(" "), /criticalItemValidation/i);
});
