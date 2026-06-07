export type AgentRoleClass = "manager" | "delivery" | "quality" | "knowledge" | "domain_specialist";
export type AgentRoleAvailability = "core_required" | "core_optional" | "domain_optional";

export interface AgentCatalogEntry {
  label: string;
  description: string;
  class: AgentRoleClass;
  availability: AgentRoleAvailability;
  shipsAgentArtifact: boolean;
  artifactPath: string;
  model: "gpt-5.5" | "gpt-5.4" | "gpt-4.5";
  effort: "high" | "medium" | "low";
  canOwnTasks: boolean;
  canSatisfySpecialistRequirement: boolean;
  defaultSkillIds: readonly string[];
  retrievalGuidance: readonly string[];
}

export const agentCatalog = {
  planner: {
    label: "Planner",
    description: "Owns intake synthesis, decomposition, staffing, checkpoints, and gate enforcement.",
    class: "manager",
    availability: "core_required",
    shipsAgentArtifact: true,
    artifactPath: ".codex/agents/planner.toml",
    model: "gpt-5.5",
    effort: "high",
    canOwnTasks: true,
    canSatisfySpecialistRequirement: true,
    defaultSkillIds: ["devgod-planning", "devgod-intake", "superpowers-writing-plans"],
    retrievalGuidance: ["approved memory", "reviewed briefs", "reviewed plans", "repo rules"]
  },
  product_strategist: {
    label: "Product Strategist",
    description: "Turns broad asks into product framing, scope, and acceptance criteria.",
    class: "manager",
    availability: "core_required",
    shipsAgentArtifact: true,
    artifactPath: ".codex/agents/product-strategist.toml",
    model: "gpt-5.5",
    effort: "high",
    canOwnTasks: true,
    canSatisfySpecialistRequirement: true,
    defaultSkillIds: ["devgod-product-framing", "devgod-intake", "devgod-market-research"],
    retrievalGuidance: ["approved briefs", "approved memory", "repo rules", "cited external research"]
  },
  solution_architect: {
    label: "Solution Architect",
    description: "Defines boundaries, sequencing, and architecture decisions.",
    class: "manager",
    availability: "core_required",
    shipsAgentArtifact: true,
    artifactPath: ".codex/agents/solution-architect.toml",
    model: "gpt-5.5",
    effort: "high",
    canOwnTasks: true,
    canSatisfySpecialistRequirement: true,
    defaultSkillIds: ["devgod-architecture", "devgod-backend-patterns", "devgod-security-review", "devgod-agentic-engineering"],
    retrievalGuidance: ["approved memory", "repo rules", "reviewed plans", "architecture notes"]
  },
  docs_researcher: {
    label: "Docs Researcher",
    description: "Verifies APIs, release notes, specs, and current documentation behavior.",
    class: "knowledge",
    availability: "core_required",
    shipsAgentArtifact: true,
    artifactPath: ".codex/agents/docs-researcher.toml",
    model: "gpt-4.5",
    effort: "medium",
    canOwnTasks: true,
    canSatisfySpecialistRequirement: true,
    defaultSkillIds: ["devgod-docs-research", "devgod-documentation-lookup", "devgod-search-first"],
    retrievalGuidance: ["approved memory", "repo rules", "approved briefs", "local technical notes"]
  },
  backend_engineer: {
    label: "Backend Engineer",
    description: "Implements services, APIs, data flows, and server-side correctness.",
    class: "delivery",
    availability: "core_required",
    shipsAgentArtifact: true,
    artifactPath: ".codex/agents/backend-engineer.toml",
    model: "gpt-5.4",
    effort: "high",
    canOwnTasks: true,
    canSatisfySpecialistRequirement: true,
    defaultSkillIds: ["devgod-execution", "devgod-backend-patterns", "devgod-api-design", "devgod-tdd-workflow"],
    retrievalGuidance: ["approved memory", "repo rules", "runbooks", "reviewed retrieval notes"]
  },
  frontend_designer: {
    label: "Frontend Designer",
    description: "Owns UX, accessibility, interface quality, and frontend implementation.",
    class: "delivery",
    availability: "core_required",
    shipsAgentArtifact: true,
    artifactPath: ".codex/agents/frontend-designer.toml",
    model: "gpt-5.4",
    effort: "high",
    canOwnTasks: true,
    canSatisfySpecialistRequirement: true,
    defaultSkillIds: ["devgod-ui-art-direction", "devgod-frontend-taste", "devgod-design-system", "devgod-visual-standards", "devgod-frontend-patterns", "devgod-web-design-guidelines"],
    retrievalGuidance: ["approved memory", "repo rules", "reviewed plans", "reviewed UI artifacts", "reviewed inspiration registry and cited references"]
  },
  git_operator: {
    label: "Git Operator",
    description: "Handles git hygiene, staging, commit slicing, and publish preparation.",
    class: "knowledge",
    availability: "core_required",
    shipsAgentArtifact: true,
    artifactPath: ".codex/agents/git-operator.toml",
    model: "gpt-4.5",
    effort: "medium",
    canOwnTasks: true,
    canSatisfySpecialistRequirement: true,
    defaultSkillIds: [
      "devgod-git-operator",
      "superpowers-using-git-worktrees",
      "superpowers-finishing-development-branch"
    ],
    retrievalGuidance: ["approved memory", "repo rules", "reviewed plans", "task packets", "git status and diff evidence"]
  },
  infra_engineer: {
    label: "Infrastructure Engineer",
    description: "Designs CI, environments, deploy safety, and operational controls.",
    class: "delivery",
    availability: "core_required",
    shipsAgentArtifact: true,
    artifactPath: ".codex/agents/infra-engineer.toml",
    model: "gpt-5.4",
    effort: "high",
    canOwnTasks: true,
    canSatisfySpecialistRequirement: true,
    defaultSkillIds: ["devgod-infra-ops", "devgod-setup", "devgod-release-readiness", "devgod-deployment-patterns", "devgod-docker-patterns"],
    retrievalGuidance: ["approved memory", "repo rules", "setup notes", "runbooks", "incident learnings"]
  },
  reviewer: {
    label: "Reviewer",
    description: "Finds correctness bugs, regressions, and missing verification.",
    class: "quality",
    availability: "core_required",
    shipsAgentArtifact: true,
    artifactPath: ".codex/agents/reviewer.toml",
    model: "gpt-5.4",
    effort: "high",
    canOwnTasks: true,
    canSatisfySpecialistRequirement: true,
    defaultSkillIds: ["devgod-review", "superpowers-verification-before-completion", "devgod-verification-loop"],
    retrievalGuidance: ["approved memory", "repo rules", "reviewed plans", "task packets", "review artifacts"]
  },
  build_resolver: {
    label: "Build Resolver",
    description: "Diagnoses and fixes build, typecheck, test, and setup failures.",
    class: "delivery",
    availability: "core_required",
    shipsAgentArtifact: true,
    artifactPath: ".codex/agents/build-resolver.toml",
    model: "gpt-5.4",
    effort: "medium",
    canOwnTasks: true,
    canSatisfySpecialistRequirement: true,
    defaultSkillIds: ["devgod-debugging", "superpowers-systematic-debugging"],
    retrievalGuidance: ["approved memory", "repo rules", "setup notes", "incident notes", "prior fixes"]
  },
  security_reviewer: {
    label: "Security Reviewer",
    description: "Reviews trust boundaries, abuse cases, and security regressions.",
    class: "quality",
    availability: "core_required",
    shipsAgentArtifact: true,
    artifactPath: ".codex/agents/security-reviewer.toml",
    model: "gpt-5.4",
    effort: "high",
    canOwnTasks: true,
    canSatisfySpecialistRequirement: true,
    defaultSkillIds: ["devgod-security-review", "devgod-security-scan", "devgod-docs-research"],
    retrievalGuidance: ["approved memory", "repo rules", "incident notes", "review artifacts"]
  },
  qa_engineer: {
    label: "QA Engineer",
    description: "Owns verification rigor, regression detection, and falsifiable completion claims.",
    class: "quality",
    availability: "core_required",
    shipsAgentArtifact: true,
    artifactPath: ".codex/agents/qa-engineer.toml",
    model: "gpt-5.4",
    effort: "high",
    canOwnTasks: true,
    canSatisfySpecialistRequirement: true,
    defaultSkillIds: [
      "devgod-qa-verification",
      "devgod-accessibility-gate",
      "anthropic-webapp-testing",
      "devgod-e2e-testing",
      "devgod-verification-loop"
    ],
    retrievalGuidance: ["approved memory", "repo rules", "review gates", "eval artifacts"]
  },
  "tdd-guide": {
    label: "TDD Guide",
    description: "Drives red-green-refactor sequencing and test-first discipline.",
    class: "quality",
    availability: "core_required",
    shipsAgentArtifact: true,
    artifactPath: ".codex/agents/tdd-guide.toml",
    model: "gpt-5.4",
    effort: "high",
    canOwnTasks: true,
    canSatisfySpecialistRequirement: true,
    defaultSkillIds: ["devgod-tdd", "superpowers-test-driven-development", "devgod-tdd-workflow"],
    retrievalGuidance: ["approved memory", "repo rules", "reviewed plans", "task packets", "verification artifacts"]
  },
  "e2e-runner": {
    label: "E2E Runner",
    description: "Verifies critical end-to-end, install, setup, and replay flows.",
    class: "quality",
    availability: "core_required",
    shipsAgentArtifact: true,
    artifactPath: ".codex/agents/e2e-runner.toml",
    model: "gpt-5.4",
    effort: "high",
    canOwnTasks: true,
    canSatisfySpecialistRequirement: true,
    defaultSkillIds: ["devgod-e2e", "anthropic-webapp-testing", "devgod-e2e-testing"],
    retrievalGuidance: ["approved memory", "repo rules", "reviewed plans", "setup notes", "test artifacts"]
  },
  "release-readiness": {
    label: "Release Readiness",
    description: "Blocks package, migration, installer, and rollout changes that are not ready to ship.",
    class: "quality",
    availability: "core_required",
    shipsAgentArtifact: true,
    artifactPath: ".codex/agents/release-readiness.toml",
    model: "gpt-5.4",
    effort: "high",
    canOwnTasks: true,
    canSatisfySpecialistRequirement: true,
    defaultSkillIds: ["devgod-release-readiness", "devgod-verification-loop"],
    retrievalGuidance: ["approved memory", "repo rules", "reviewed plans", "setup notes", "release notes"]
  },
  memory_curator: {
    label: "Memory Curator",
    description: "Promotes reviewed durable project memory.",
    class: "knowledge",
    availability: "core_required",
    shipsAgentArtifact: true,
    artifactPath: ".codex/agents/memory-curator.toml",
    model: "gpt-4.5",
    effort: "medium",
    canOwnTasks: true,
    canSatisfySpecialistRequirement: true,
    defaultSkillIds: ["devgod-memory", "devgod-strategic-compact"],
    retrievalGuidance: ["all reviewed project artifacts"]
  },
  eval_engineer: {
    label: "Eval Engineer",
    description: "Owns benchmark datasets, graders, eval rigor, and regression evidence quality.",
    class: "quality",
    availability: "core_required",
    shipsAgentArtifact: true,
    artifactPath: ".codex/agents/eval-engineer.toml",
    model: "gpt-5.4",
    effort: "high",
    canOwnTasks: true,
    canSatisfySpecialistRequirement: true,
    defaultSkillIds: ["devgod-eval-engineering", "devgod-skill-evals", "devgod-eval-harness"],
    retrievalGuidance: ["approved memory", "repo rules", "eval artifacts", "reviewed plans", "test artifacts"]
  },
  technical_writer: {
    label: "Technical Writer",
    description: "Owns clear operator docs, product docs, release notes, and onboarding artifacts.",
    class: "knowledge",
    availability: "core_required",
    shipsAgentArtifact: true,
    artifactPath: ".codex/agents/technical-writer.toml",
    model: "gpt-4.5",
    effort: "medium",
    canOwnTasks: true,
    canSatisfySpecialistRequirement: true,
    defaultSkillIds: ["devgod-technical-writing", "devgod-documentation-lookup", "devgod-article-writing"],
    retrievalGuidance: ["approved memory", "repo rules", "reviewed plans", "reviewed technical notes", "release notes"]
  },
  agent_runtime_engineer: {
    label: "Agent Runtime Engineer",
    description: "Owns prompt/runtime orchestration, tool contracts, and agent execution safety.",
    class: "delivery",
    availability: "core_required",
    shipsAgentArtifact: true,
    artifactPath: ".codex/agents/agent-runtime-engineer.toml",
    model: "gpt-5.4",
    effort: "high",
    canOwnTasks: true,
    canSatisfySpecialistRequirement: true,
    defaultSkillIds: ["devgod-agent-runtime", "anthropic-mcp-builder", "devgod-mcp-server-patterns", "devgod-verification-loop", "devgod-agentic-engineering"],
    retrievalGuidance: ["approved memory", "repo rules", "reviewed plans", "runtime traces", "tooling integration notes"]
  },
  mobile_engineer: {
    label: "Mobile Engineer",
    description: "Owns mobile-specific product surfaces, interaction quality, and platform constraints.",
    class: "domain_specialist",
    availability: "domain_optional",
    shipsAgentArtifact: true,
    artifactPath: ".codex/agents/mobile-engineer.toml",
    model: "gpt-5.4",
    effort: "high",
    canOwnTasks: true,
    canSatisfySpecialistRequirement: true,
    defaultSkillIds: ["devgod-frontend-taste", "devgod-design-system", "devgod-frontend-patterns", "devgod-e2e-testing"],
    retrievalGuidance: ["approved memory", "repo rules", "reviewed plans", "reviewed UI artifacts", "test artifacts"]
  },
  ml_engineer: {
    label: "ML Engineer",
    description: "Owns model-facing product behavior, evaluation integrity, and ML integration risks.",
    class: "domain_specialist",
    availability: "domain_optional",
    shipsAgentArtifact: true,
    artifactPath: ".codex/agents/ml-engineer.toml",
    model: "gpt-5.4",
    effort: "high",
    canOwnTasks: true,
    canSatisfySpecialistRequirement: true,
    defaultSkillIds: ["devgod-eval-engineering", "devgod-documentation-lookup", "devgod-verification-loop"],
    retrievalGuidance: ["approved memory", "repo rules", "reviewed plans", "model evaluations", "integration notes"]
  },
  data_engineer: {
    label: "Data Engineer",
    description: "Owns data pipelines, schema movement, and data-system reliability concerns.",
    class: "domain_specialist",
    availability: "domain_optional",
    shipsAgentArtifact: true,
    artifactPath: ".codex/agents/data-engineer.toml",
    model: "gpt-5.4",
    effort: "high",
    canOwnTasks: true,
    canSatisfySpecialistRequirement: true,
    defaultSkillIds: ["devgod-backend-patterns", "devgod-postgres-patterns", "devgod-database-migrations", "devgod-verification-loop"],
    retrievalGuidance: ["approved memory", "repo rules", "reviewed plans", "schema notes", "runbooks"]
  },
  ux_researcher: {
    label: "UX Researcher",
    description: "Owns user-flow investigation, evidence gathering, and experience-quality feedback.",
    class: "domain_specialist",
    availability: "domain_optional",
    shipsAgentArtifact: true,
    artifactPath: ".codex/agents/ux-researcher.toml",
    model: "gpt-5.4",
    effort: "high",
    canOwnTasks: true,
    canSatisfySpecialistRequirement: true,
    defaultSkillIds: ["devgod-ux-research", "devgod-frontend-taste", "devgod-market-research"],
    retrievalGuidance: ["approved briefs", "approved memory", "repo rules", "reviewed plans", "reviewed UI artifacts"]
  },
  product_analyst: {
    label: "Product Analyst",
    description: "Owns metrics framing, evidence interpretation, and product-signal analysis.",
    class: "domain_specialist",
    availability: "domain_optional",
    shipsAgentArtifact: true,
    artifactPath: ".codex/agents/product-analyst.toml",
    model: "gpt-5.4",
    effort: "high",
    canOwnTasks: true,
    canSatisfySpecialistRequirement: true,
    defaultSkillIds: ["devgod-product-analysis", "devgod-market-research"],
    retrievalGuidance: ["approved briefs", "approved memory", "repo rules", "reviewed plans", "eval artifacts"]
  },
  compliance_reviewer: {
    label: "Compliance Reviewer",
    description: "Owns compliance-sensitive review of policy, controls, and regulated-surface risks.",
    class: "domain_specialist",
    availability: "domain_optional",
    shipsAgentArtifact: true,
    artifactPath: ".codex/agents/compliance-reviewer.toml",
    model: "gpt-5.4",
    effort: "high",
    canOwnTasks: true,
    canSatisfySpecialistRequirement: true,
    defaultSkillIds: ["devgod-compliance-review", "devgod-security-review", "devgod-documentation-lookup"],
    retrievalGuidance: ["approved memory", "repo rules", "reviewed plans", "incident notes", "audit artifacts"]
  },
  accessibility_engineer: {
    label: "Accessibility Engineer",
    description: "Owns accessibility_acceptance gate: semantic HTML, keyboard navigation, ARIA discipline, contrast, and focus management.",
    class: "quality",
    availability: "core_required",
    shipsAgentArtifact: true,
    artifactPath: ".codex/agents/accessibility-engineer.toml",
    model: "gpt-5.4",
    effort: "high",
    canOwnTasks: true,
    canSatisfySpecialistRequirement: true,
    defaultSkillIds: ["devgod-accessibility-gate", "devgod-e2e-testing", "devgod-web-design-guidelines"],
    retrievalGuidance: ["approved memory", "repo rules", "reviewed plans", "test artifacts", "reviewed UI artifacts"]
  },
  database_specialist: {
    label: "Database Specialist",
    description: "Owns schema migrations, query optimization, index design, and data-system correctness for PostgreSQL-backed workflows.",
    class: "quality",
    availability: "core_required",
    shipsAgentArtifact: true,
    artifactPath: ".codex/agents/database-specialist.toml",
    model: "gpt-5.4",
    effort: "high",
    canOwnTasks: true,
    canSatisfySpecialistRequirement: true,
    defaultSkillIds: ["devgod-postgres-patterns", "devgod-database-migrations", "devgod-verification-loop"],
    retrievalGuidance: ["approved memory", "repo rules", "schema notes", "reviewed plans", "migration artifacts"]
  },
  performance_engineer: {
    label: "Performance Engineer",
    description: "Owns performance_check_required gate: profiling, latency analysis, query cost, throughput verification, and regression blocking.",
    class: "quality",
    availability: "core_required",
    shipsAgentArtifact: true,
    artifactPath: ".codex/agents/performance-engineer.toml",
    model: "gpt-5.4",
    effort: "high",
    canOwnTasks: true,
    canSatisfySpecialistRequirement: true,
    defaultSkillIds: ["devgod-performance", "devgod-verification-loop", "devgod-backend-patterns"],
    retrievalGuidance: ["approved memory", "repo rules", "reviewed plans", "benchmark artifacts", "profiling notes"]
  },
  context_manager: {
    label: "Context Manager",
    description: "Assembles retrieval context for agents from the correct authority layer: .devgod/memory/, Postgres runtime, and Qdrant semantic index.",
    class: "knowledge",
    availability: "core_required",
    shipsAgentArtifact: true,
    artifactPath: ".codex/agents/context-manager.toml",
    model: "gpt-4.5",
    effort: "medium",
    canOwnTasks: true,
    canSatisfySpecialistRequirement: true,
    defaultSkillIds: ["devgod-context-retrieval", "devgod-memory", "devgod-search-first"],
    retrievalGuidance: ["all retrieval layers", ".devgod/memory/", "Postgres runtime records", "Qdrant semantic index"]
  },
  observability_engineer: {
    label: "Observability Engineer",
    description: "Owns observability gate: Grafana dashboards, distributed tracing, SLI/SLO design, alerting, and log-signal quality.",
    class: "quality",
    availability: "core_optional",
    shipsAgentArtifact: true,
    artifactPath: ".codex/agents/observability-engineer.toml",
    model: "gpt-5.4",
    effort: "high",
    canOwnTasks: true,
    canSatisfySpecialistRequirement: true,
    defaultSkillIds: ["devgod-performance", "devgod-verification-loop", "devgod-backend-patterns"],
    retrievalGuidance: ["approved memory", "repo rules", "reviewed plans", "runbooks", "benchmark artifacts", "Grafana config at src/grafana/"]
  }
} as const satisfies Record<string, AgentCatalogEntry>;

export type AgentRoleId = keyof typeof agentCatalog;

export const agentRoleIds = Object.freeze(Object.keys(agentCatalog) as AgentRoleId[]);

export const agentCatalogEntries = Object.freeze(
  agentRoleIds.map((id) => ({
    id,
    ...agentCatalog[id]
  }))
);

export function getAgentCatalogEntry(role: AgentRoleId): (typeof agentCatalog)[AgentRoleId] {
  return agentCatalog[role];
}
