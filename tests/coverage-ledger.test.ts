import assert from "node:assert/strict";
import test from "node:test";
import {
  buildCoverageDependencyGraphArtifact,
  buildCoverageLedgerArtifacts,
  validateCoverageArchitectureDecisionsArtifact,
  validateCoverageDependencyGraphArtifact,
  validateCoverageDuplicateFamiliesArtifact,
  validateCoverageInvariantsArtifact,
  validateCoverageLedgerArtifacts,
  validateCoverageItemsArtifact,
  validateCoverageGapsArtifact,
  validateCoverageManifestArtifact,
  validateCoverageMigrationLedgerArtifact,
  validateCoverageParityMatrixArtifact,
  validateCoverageTracesArtifact,
  validateUnderstandingMapsArtifact
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
    understandingMaps: [
      {
        kind: "repo_map",
        itemCount: 2,
        analyzedCount: 2,
        sourceRefs: ["src/core/service.ts:1", "tests/coverage-ledger.test.ts:1"],
        evidenceRefs: ["tests/coverage-ledger.test.ts:1"],
        updatedAt: "2026-05-20T10:02:30.000Z"
      },
      {
        kind: "symbol_graph",
        itemCount: 2,
        analyzedCount: 2,
        sourceRefs: ["symbol:src/core/service.ts#workflowProof", "symbol:tests/coverage-ledger.test.ts#proofTest"],
        evidenceRefs: ["src/core/service.ts:1", "tests/coverage-ledger.test.ts:1"],
        updatedAt: "2026-05-20T10:02:30.000Z"
      }
    ],
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
  assert.equal(artifacts.understanding_maps.length, 2);
  assert.equal(artifacts.traces.length, 1);
  assert.ok(artifacts.understanding_maps.some((map) => map.kind === "symbol_graph"));
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

test("buildCoverageDependencyGraphArtifact adds referenced-only nodes and deduplicates mirrored edges", () => {
  const graph = buildCoverageDependencyGraphArtifact(
    [
      {
        id: "service:proof",
        category: "services",
        state: "validated",
        criticality: "critical",
        sources: ["src/core/service.ts:1"],
        dependencies: ["shared:dep"],
        dependents: ["test:proof"],
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
        dependencies: ["service:proof"],
        evidenceRefs: ["tests/coverage-ledger.test.ts:1"],
        lastUpdatedAt: "2026-05-20T10:01:00.000Z"
      }
    ],
    "2026-05-20T10:02:00.000Z"
  );

  assert.equal(graph.generated_at, "2026-05-20T10:02:00.000Z");
  assert.ok(graph.nodes.some((node) => node.id === "shared:dep" && node.source === "referenced_only"));
  assert.deepEqual(
    graph.edges.map((edge) => `${edge.from}->${edge.to}`),
    ["service:proof->shared:dep", "test:proof->service:proof"]
  );
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

test("buildCoverageLedgerArtifacts emits modernization artifact categories", () => {
  const artifacts = buildCoverageLedgerArtifacts({
    enabled: true,
    profile: "modernization_program",
    phase: "validation",
    manifest: {
      runId: "run-modernization",
      profile: "modernization_program",
      requiredCategories: ["services"],
      thresholds: {
        criticalItemCoverage: 0.9,
        criticalItemValidation: 0.9,
        callsiteCoverage: 0.8,
        runtimeTraceCoverage: 0.8,
        inventoryCompleteness: 0.75,
        businessRuleCoverage: 0.7,
        maxContradictionGapCount: 0,
        maxOpenBlockers: 0
      }
    },
    coverageItems: [
      {
        id: "service:modernization",
        category: "services",
        state: "validated",
        criticality: "critical",
        ownerAgent: "architect",
        sources: ["src/core/service.ts:1"],
        entryPoints: ["src/index.ts"],
        dependencies: ["domain:legacy"],
        dependents: ["test:modernization"],
        callsiteCount: 2,
        callsitesAnalyzed: 2,
        runtimeTraced: true,
        behaviorSummary: "modernization proof",
        invariants: ["runtime authority wins"],
        businessRules: ["approved local exports require runtime proof"],
        sideEffects: ["writes progress proof"],
        openQuestions: ["none"],
        evidenceRefs: ["tests/coverage-ledger.test.ts:1"],
        verificationRefs: ["tests/coverage-ledger.test.ts"],
        confidence: 0.9,
        gapScore: 0,
        lastUpdatedAt: "2026-05-20T10:00:00.000Z"
      }
    ],
    gaps: [],
    checkpoints: [],
    progressProofs: [],
    understandingMaps: [],
    duplicateFamilies: [
      {
        familyId: "family:runtime-status",
        capability: "status-reporting",
        members: [{ itemId: "service:modernization", kind: "shared_core", role: "runtime" }],
        sharedAbstraction: "runtime proof service",
        intentionalVariants: ["cli", "mcp"],
        accidentalDivergences: [],
        centralizationCandidate: "src/core/service.ts",
        parityRequirements: ["parity:status"],
        evidenceRefs: ["tests/coverage-ledger.test.ts:1"],
        verificationRefs: ["tests/coverage-ledger.test.ts"],
        lastUpdatedAt: "2026-05-20T10:01:00.000Z"
      }
    ],
    architectureDecisions: [
      {
        decisionId: "adr:runtime-authority",
        title: "Runtime is authoritative",
        status: "accepted",
        options: ["local markdown", "runtime state"],
        chosenOption: "runtime state",
        boundedContexts: ["workflow"],
        consistencyNeeds: ["status exports match runtime"],
        rationale: ["prevents stale local approval"],
        evidenceRefs: ["tests/coverage-ledger.test.ts:1"],
        verificationRefs: ["tests/coverage-ledger.test.ts"],
        lastUpdatedAt: "2026-05-20T10:02:00.000Z"
      }
    ],
    migrationLedger: [
      {
        entryId: "migration:runtime-status",
        boundedContext: "workflow",
        sourceModels: ["local exports"],
        targetModels: ["runtime state"],
        strategy: "expand_contract",
        consistencyClass: "strong",
        ownership: "architect",
        rolloutSteps: ["seed runtime", "sync exports"],
        rollbackPlan: ["restore previous export"],
        evidenceRefs: ["tests/coverage-ledger.test.ts:1"],
        verificationRefs: ["tests/coverage-ledger.test.ts"],
        lastUpdatedAt: "2026-05-20T10:03:00.000Z"
      }
    ],
    parityMatrix: [
      {
        requirementId: "parity:status",
        capability: "status-reporting",
        status: "verified",
        legacyRefs: ["src/admin/status.ts"],
        targetRefs: ["src/core/service.ts"],
        acceptanceChecks: ["status report has no contradictions"],
        evidenceRefs: ["tests/coverage-ledger.test.ts:1"],
        verificationRefs: ["tests/coverage-ledger.test.ts"],
        lastUpdatedAt: "2026-05-20T10:04:00.000Z"
      }
    ],
    runtimeTraces: [],
    pendingInvestigations: [],
    executionEpoch: 1,
    updatedAt: "2026-05-20T10:05:00.000Z"
  });

  assert.equal(artifacts.invariants[0]?.target_id, "service:modernization");
  assert.equal(artifacts.duplicate_families[0]?.family_id, "family:runtime-status");
  assert.equal(artifacts.architecture_decisions[0]?.decision_id, "adr:runtime-authority");
  assert.equal(artifacts.migration_ledger[0]?.entry_id, "migration:runtime-status");
  assert.equal(artifacts.parity_matrix[0]?.requirement_id, "parity:status");
  assert.deepEqual(validateCoverageLedgerArtifacts(artifacts), []);
});

test("coverage ledger modernization validators reject malformed artifacts", () => {
  assert.deepEqual(validateCoverageInvariantsArtifact("bad" as never), [
    "coverage invariants artifact must be an array"
  ]);
  assert.match(
    validateCoverageInvariantsArtifact([
      {
        target_id: "service:empty",
        invariants: [],
        business_rules: [],
        evidence_refs: [],
        last_updated_at: "2026-05-20T10:00:00.000Z"
      }
    ]).join(" "),
    /at least one invariant|evidence_refs/
  );
  assert.deepEqual(validateCoverageDuplicateFamiliesArtifact("bad" as never), [
    "coverage duplicate families artifact must be an array"
  ]);
  assert.match(
    validateCoverageDuplicateFamiliesArtifact([
      {
        family_id: "",
        capability: "",
        members: [],
        intentional_variants: [],
        accidental_divergences: [],
        parity_requirements: [],
        evidence_refs: [],
        last_updated_at: "2026-05-20T10:00:00.000Z"
      }
    ]).join(" "),
    /family_id/
  );
  assert.deepEqual(validateCoverageArchitectureDecisionsArtifact("bad" as never), [
    "coverage architecture decisions artifact must be an array"
  ]);
  assert.match(
    validateCoverageArchitectureDecisionsArtifact([
      {
        decision_id: "",
        title: "",
        status: "accepted",
        options: [],
        chosen_option: "",
        bounded_contexts: [],
        consistency_needs: [],
        rationale: [],
        evidence_refs: [],
        last_updated_at: "2026-05-20T10:00:00.000Z"
      }
    ]).join(" "),
    /decision_id/
  );
  assert.deepEqual(validateCoverageMigrationLedgerArtifact("bad" as never), [
    "coverage migration ledger artifact must be an array"
  ]);
  assert.match(
    validateCoverageMigrationLedgerArtifact([
      {
        entry_id: "",
        bounded_context: "",
        source_models: [],
        target_models: [],
        strategy: "dual_write",
        consistency_class: "mixed",
        ownership: "",
        rollout_steps: [],
        rollback_plan: [],
        evidence_refs: [],
        last_updated_at: "2026-05-20T10:00:00.000Z"
      }
    ]).join(" "),
    /entry_id/
  );
  assert.deepEqual(validateCoverageParityMatrixArtifact("bad" as never), [
    "coverage parity matrix artifact must be an array"
  ]);
  assert.match(
    validateCoverageParityMatrixArtifact([
      {
        requirement_id: "",
        capability: "",
        status: "planned",
        legacy_refs: [],
        target_refs: [],
        acceptance_checks: [],
        evidence_refs: [],
        last_updated_at: "2026-05-20T10:00:00.000Z"
      }
    ]).join(" "),
    /requirement_id/
  );
});

test("coverage ledger validators reject missing invariant targets and non-array invariant payloads", () => {
  const missingTargetErrors = validateCoverageInvariantsArtifact([
    {
      target_id: "",
      invariants: ["must hold"],
      business_rules: [],
      evidence_refs: ["tests/coverage-ledger.test.ts:1"],
      last_updated_at: "2026-05-20T10:00:00.000Z"
    }
  ]);
  assert.match(missingTargetErrors.join(" "), /target_id/);

  const invalidArrayErrors = validateCoverageInvariantsArtifact([
    {
      target_id: "service:proof",
      invariants: undefined as never,
      business_rules: [] as string[],
      evidence_refs: ["tests/coverage-ledger.test.ts:1"],
      last_updated_at: "2026-05-20T10:00:00.000Z"
    },
    {
      target_id: "service:proof-2",
      invariants: ["protect invariant"],
      business_rules: undefined as never,
      evidence_refs: ["tests/coverage-ledger.test.ts:1"],
      last_updated_at: "2026-05-20T10:00:00.000Z"
    }
  ]);
  assert.match(invalidArrayErrors.join(" "), /must include invariants and business_rules arrays/);
});

test("coverage ledger validators reject duplicate ids, non-array payloads, and incomplete graphs", () => {
  assert.deepEqual(validateCoverageItemsArtifact("bad" as never), [
    "coverage items artifact must be an array"
  ]);
  assert.match(
    validateCoverageItemsArtifact([
      {
        id: "service:proof",
        category: "services",
        state: "validated",
        criticality: "critical",
        sources: ["src/core/service.ts:1"],
        evidence_refs: ["src/core/service.ts:1"],
        verification_refs: ["tests/coverage-ledger.test.ts"],
        last_updated_at: "2026-05-20T10:00:00.000Z"
      },
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
    ]).join(" "),
    /duplicate coverage item id service:proof/
  );

  assert.deepEqual(validateCoverageGapsArtifact("bad" as never), [
    "coverage gaps artifact must be an array"
  ]);
  assert.deepEqual(validateCoverageTracesArtifact("bad" as never), [
    "coverage traces artifact must be an array"
  ]);
  assert.deepEqual(validateUnderstandingMapsArtifact("bad" as never), [
    "understanding maps artifact must be an array"
  ]);

  const graphErrors = validateCoverageDependencyGraphArtifact(
    {
      generated_at: "2026-05-20T10:00:00.000Z",
      nodes: [{ id: "service:proof", source: "coverage_item" }],
      edges: [
        { from: "service:proof", to: "missing:dep", kind: "depends_on" },
        { from: "missing:from", to: "service:proof", kind: "other" as "depends_on" }
      ]
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

  assert.match(graphErrors.join(" "), /unknown to node missing:dep/);
  assert.match(graphErrors.join(" "), /unsupported kind other/);
  assert.match(graphErrors.join(" "), /unknown from node missing:from/);
});

test("coverage ledger modernization validators reject duplicate artifact ids and non-object dependency graphs", () => {
  assert.match(
    validateCoverageDuplicateFamiliesArtifact([
      {
        family_id: "family:status",
        capability: "status",
        members: [{ item_id: "service:status", kind: "shared_core" }],
        intentional_variants: [],
        accidental_divergences: [],
        parity_requirements: [],
        evidence_refs: ["tests/coverage-ledger.test.ts:1"],
        last_updated_at: "2026-05-20T10:00:00.000Z"
      },
      {
        family_id: "family:status",
        capability: "status",
        members: [{ item_id: "service:status-2", kind: "shared_core" }],
        intentional_variants: [],
        accidental_divergences: [],
        parity_requirements: [],
        evidence_refs: ["tests/coverage-ledger.test.ts:1"],
        last_updated_at: "2026-05-20T10:00:00.000Z"
      }
    ]).join(" "),
    /duplicate coverage duplicate family id family:status/
  );

  assert.match(
    validateCoverageArchitectureDecisionsArtifact([
      {
        decision_id: "adr:status",
        title: "Keep runtime status authoritative",
        status: "accepted",
        options: ["runtime state"],
        chosen_option: "runtime state",
        bounded_contexts: ["runtime"],
        consistency_needs: ["single status source"],
        rationale: ["remove stale file mirrors"],
        evidence_refs: ["tests/coverage-ledger.test.ts:1"],
        last_updated_at: "2026-05-20T10:00:00.000Z"
      },
      {
        decision_id: "adr:status",
        title: "Duplicate decision id",
        status: "accepted",
        options: ["runtime state"],
        chosen_option: "runtime state",
        bounded_contexts: ["runtime"],
        consistency_needs: ["single status source"],
        rationale: ["duplicate id should fail"],
        evidence_refs: ["tests/coverage-ledger.test.ts:1"],
        last_updated_at: "2026-05-20T10:00:00.000Z"
      }
    ]).join(" "),
    /duplicate coverage architecture decision id adr:status/
  );

  assert.match(
    validateCoverageMigrationLedgerArtifact([
      {
        entry_id: "migration:status",
        bounded_context: "runtime",
        source_models: ["legacy_status"],
        target_models: ["runtime_status"],
        strategy: "dual_write",
        consistency_class: "mixed",
        ownership: "backend_engineer",
        rollout_steps: ["dual write"],
        rollback_plan: ["disable dual write"],
        evidence_refs: ["tests/coverage-ledger.test.ts:1"],
        last_updated_at: "2026-05-20T10:00:00.000Z"
      },
      {
        entry_id: "migration:status",
        bounded_context: "runtime",
        source_models: ["legacy_status"],
        target_models: ["runtime_status"],
        strategy: "dual_write",
        consistency_class: "mixed",
        ownership: "backend_engineer",
        rollout_steps: ["dual write"],
        rollback_plan: ["disable dual write"],
        evidence_refs: ["tests/coverage-ledger.test.ts:1"],
        last_updated_at: "2026-05-20T10:00:00.000Z"
      }
    ]).join(" "),
    /duplicate coverage migration ledger id migration:status/
  );

  assert.match(
    validateCoverageParityMatrixArtifact([
      {
        requirement_id: "parity:status",
        capability: "status reporting",
        status: "planned",
        legacy_refs: ["legacy_status"],
        target_refs: ["runtime_status"],
        acceptance_checks: ["status outputs match"],
        evidence_refs: ["tests/coverage-ledger.test.ts:1"],
        last_updated_at: "2026-05-20T10:00:00.000Z"
      },
      {
        requirement_id: "parity:status",
        capability: "status reporting",
        status: "planned",
        legacy_refs: ["legacy_status"],
        target_refs: ["runtime_status"],
        acceptance_checks: ["status outputs match"],
        evidence_refs: ["tests/coverage-ledger.test.ts:1"],
        last_updated_at: "2026-05-20T10:00:00.000Z"
      }
    ]).join(" "),
    /duplicate coverage parity requirement id parity:status/
  );

  assert.deepEqual(validateCoverageDependencyGraphArtifact(null as never, []), [
    "coverage dependency graph artifact must be an object"
  ]);
});

test("validateCoverageLedgerArtifacts enforces required manifest categories", () => {
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
        criticalItemValidation: 0.8,
        callsiteCoverage: 0.8,
        runtimeTraceCoverage: 0.8
      }
    },
    coverageItems: [
      {
        id: "service:proof",
        category: "services",
        state: "validated",
        criticality: "critical",
        sources: ["src/core/service.ts:1"],
        evidenceRefs: ["src/core/service.ts:1"],
        verificationRefs: ["tests/coverage-ledger.test.ts"],
        lastUpdatedAt: "2026-05-20T10:00:00.000Z"
      }
    ],
    gaps: [],
    checkpoints: [],
    progressProofs: [],
    understandingMaps: [],
    runtimeTraces: [],
    pendingInvestigations: [],
    executionEpoch: 1,
    updatedAt: "2026-05-20T10:00:00.000Z"
  });

  assert.match(
    validateCoverageLedgerArtifacts(artifacts).join(" "),
    /missing required category tests/
  );
});

test("coverage ledger validators reject malformed runtime traces and understanding maps", () => {
  const traceErrors = validateCoverageTracesArtifact([
    {
      trace_id: "",
      target_id: "",
      kind: "side_effect",
      risky: true,
      side_effects: [],
      evidence_refs: [],
      created_at: "2026-05-20T10:00:00.000Z"
    }
  ]);

  assert.match(traceErrors.join(" "), /traceId/);
  assert.match(traceErrors.join(" "), /targetId/);
  assert.match(traceErrors.join(" "), /evidenceRefs/);
  assert.match(traceErrors.join(" "), /sideEffects/);

  const mapErrors = validateUnderstandingMapsArtifact([
    {
      kind: "unknown-map" as never,
      item_count: 1,
      analyzed_count: 2,
      source_refs: [],
      evidence_refs: [],
      updated_at: "2026-05-20T10:00:00.000Z"
    }
  ]);

  assert.match(mapErrors.join(" "), /unsupported kind/);
  assert.match(mapErrors.join(" "), /analyzedCount cannot exceed itemCount/);
  assert.match(mapErrors.join(" "), /sourceRefs/);
  assert.match(mapErrors.join(" "), /evidenceRefs/);
});

test("validateCoverageDependencyGraphArtifact rejects incomplete scaffolds and malformed nodes", () => {
  const scaffoldErrors = validateCoverageDependencyGraphArtifact(
    {
      generated_at: "",
      nodes: undefined as never,
      edges: undefined as never
    },
    []
  );

  assert.match(scaffoldErrors.join(" "), /generated_at/);
  assert.match(scaffoldErrors.join(" "), /include nodes/);
  assert.match(scaffoldErrors.join(" "), /include edges/);

  const graphErrors = validateCoverageDependencyGraphArtifact(
    {
      generated_at: "2026-05-20T10:00:00.000Z",
      nodes: [
        { id: "service:proof", source: "coverage_item" },
        { id: "service:proof", source: "referenced_only" },
        { id: "", source: "referenced_only" }
      ],
      edges: [
        { from: "", to: "service:proof", kind: "depends_on" },
        { from: "service:proof", to: "", kind: "depends_on" }
      ]
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

  assert.match(graphErrors.join(" "), /duplicate coverage dependency graph node service:proof/);
  assert.match(graphErrors.join(" "), /coverage dependency graph node must include id/);
  assert.match(graphErrors.join(" "), /edge must include from/);
  assert.match(graphErrors.join(" "), /edge must include to/);
});
