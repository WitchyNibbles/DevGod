export type AgentRoleClass = "manager" | "delivery" | "quality" | "knowledge" | "domain_specialist";
export type AgentRoleAvailability = "core_required" | "core_optional" | "domain_optional";

export interface AgentCatalogEntry {
  label: string;
  description: string;
  class: AgentRoleClass;
  availability: AgentRoleAvailability;
  shipsAgentArtifact: boolean;
  artifactPath: string;
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
    canOwnTasks: true,
    canSatisfySpecialistRequirement: true,
    defaultSkillIds: ["devgod-planning", "superpowers-writing-plans"],
    retrievalGuidance: ["approved memory", "reviewed briefs", "reviewed plans", "repo rules"]
  },
  product_strategist: {
    label: "Product Strategist",
    description: "Turns broad asks into product framing, scope, and acceptance criteria.",
    class: "manager",
    availability: "core_required",
    shipsAgentArtifact: true,
    artifactPath: ".codex/agents/product-strategist.toml",
    canOwnTasks: true,
    canSatisfySpecialistRequirement: true,
    defaultSkillIds: ["devgod-product-framing", "devgod-intake", "market-research"],
    retrievalGuidance: ["approved briefs", "approved memory", "repo rules", "cited external research"]
  },
  solution_architect: {
    label: "Solution Architect",
    description: "Defines boundaries, sequencing, and architecture decisions.",
    class: "manager",
    availability: "core_required",
    shipsAgentArtifact: true,
    artifactPath: ".codex/agents/solution-architect.toml",
    canOwnTasks: true,
    canSatisfySpecialistRequirement: true,
    defaultSkillIds: ["devgod-architecture", "backend-patterns", "security-review"],
    retrievalGuidance: ["approved memory", "repo rules", "reviewed plans", "architecture notes"]
  },
  docs_researcher: {
    label: "Docs Researcher",
    description: "Verifies APIs, release notes, specs, and current documentation behavior.",
    class: "knowledge",
    availability: "core_required",
    shipsAgentArtifact: true,
    artifactPath: ".codex/agents/docs-researcher.toml",
    canOwnTasks: true,
    canSatisfySpecialistRequirement: true,
    defaultSkillIds: ["devgod-docs-research", "documentation-lookup"],
    retrievalGuidance: ["approved memory", "repo rules", "approved briefs", "local technical notes"]
  },
  backend_engineer: {
    label: "Backend Engineer",
    description: "Implements services, APIs, data flows, and server-side correctness.",
    class: "delivery",
    availability: "core_required",
    shipsAgentArtifact: true,
    artifactPath: ".codex/agents/backend-engineer.toml",
    canOwnTasks: true,
    canSatisfySpecialistRequirement: true,
    defaultSkillIds: ["devgod-execution", "backend-patterns", "api-design"],
    retrievalGuidance: ["approved memory", "repo rules", "runbooks", "reviewed retrieval notes"]
  },
  frontend_designer: {
    label: "Frontend Designer",
    description: "Owns UX, accessibility, interface quality, and frontend implementation.",
    class: "delivery",
    availability: "core_required",
    shipsAgentArtifact: true,
    artifactPath: ".codex/agents/frontend-designer.toml",
    canOwnTasks: true,
    canSatisfySpecialistRequirement: true,
    defaultSkillIds: [
      "devgod-frontend-taste",
      "devgod-design-system",
      "frontend-design",
      "frontend-patterns",
      "web-design-guidelines"
    ],
    retrievalGuidance: ["approved memory", "repo rules", "reviewed plans", "reviewed UI artifacts"]
  },
  git_operator: {
    label: "Git Operator",
    description: "Handles git hygiene, staging, commit slicing, and publish preparation.",
    class: "knowledge",
    availability: "core_required",
    shipsAgentArtifact: true,
    artifactPath: ".codex/agents/git-operator.toml",
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
    canOwnTasks: true,
    canSatisfySpecialistRequirement: true,
    defaultSkillIds: ["devgod-infra-ops", "devgod-setup", "devgod-release-readiness"],
    retrievalGuidance: ["approved memory", "repo rules", "setup notes", "runbooks", "incident learnings"]
  },
  reviewer: {
    label: "Reviewer",
    description: "Finds correctness bugs, regressions, and missing verification.",
    class: "quality",
    availability: "core_required",
    shipsAgentArtifact: true,
    artifactPath: ".codex/agents/reviewer.toml",
    canOwnTasks: true,
    canSatisfySpecialistRequirement: true,
    defaultSkillIds: ["devgod-review", "superpowers-verification-before-completion"],
    retrievalGuidance: ["approved memory", "repo rules", "reviewed plans", "task packets", "review artifacts"]
  },
  build_resolver: {
    label: "Build Resolver",
    description: "Diagnoses and fixes build, typecheck, test, and setup failures.",
    class: "delivery",
    availability: "core_required",
    shipsAgentArtifact: true,
    artifactPath: ".codex/agents/build-resolver.toml",
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
    canOwnTasks: true,
    canSatisfySpecialistRequirement: true,
    defaultSkillIds: ["security-review", "devgod-docs-research"],
    retrievalGuidance: ["approved memory", "repo rules", "incident notes", "review artifacts"]
  },
  qa_engineer: {
    label: "QA Engineer",
    description: "Owns verification rigor, regression detection, and falsifiable completion claims.",
    class: "quality",
    availability: "core_required",
    shipsAgentArtifact: true,
    artifactPath: ".codex/agents/qa-engineer.toml",
    canOwnTasks: true,
    canSatisfySpecialistRequirement: true,
    defaultSkillIds: [
      "devgod-qa-verification",
      "devgod-accessibility-gate",
      "anthropic-webapp-testing",
      "e2e-testing",
      "verification-loop"
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
    canOwnTasks: true,
    canSatisfySpecialistRequirement: true,
    defaultSkillIds: ["devgod-tdd", "superpowers-test-driven-development"],
    retrievalGuidance: ["approved memory", "repo rules", "reviewed plans", "task packets", "verification artifacts"]
  },
  "e2e-runner": {
    label: "E2E Runner",
    description: "Verifies critical end-to-end, install, setup, and replay flows.",
    class: "quality",
    availability: "core_required",
    shipsAgentArtifact: true,
    artifactPath: ".codex/agents/e2e-runner.toml",
    canOwnTasks: true,
    canSatisfySpecialistRequirement: true,
    defaultSkillIds: ["devgod-e2e", "anthropic-webapp-testing", "e2e-testing"],
    retrievalGuidance: ["approved memory", "repo rules", "reviewed plans", "setup notes", "test artifacts"]
  },
  "release-readiness": {
    label: "Release Readiness",
    description: "Blocks package, migration, installer, and rollout changes that are not ready to ship.",
    class: "quality",
    availability: "core_required",
    shipsAgentArtifact: true,
    artifactPath: ".codex/agents/release-readiness.toml",
    canOwnTasks: true,
    canSatisfySpecialistRequirement: true,
    defaultSkillIds: ["devgod-release-readiness", "verification-loop"],
    retrievalGuidance: ["approved memory", "repo rules", "reviewed plans", "setup notes", "release notes"]
  },
  memory_curator: {
    label: "Memory Curator",
    description: "Promotes reviewed durable project memory.",
    class: "knowledge",
    availability: "core_required",
    shipsAgentArtifact: true,
    artifactPath: ".codex/agents/memory-curator.toml",
    canOwnTasks: true,
    canSatisfySpecialistRequirement: true,
    defaultSkillIds: ["devgod-memory", "strategic-compact"],
    retrievalGuidance: ["all reviewed project artifacts"]
  },
  eval_engineer: {
    label: "Eval Engineer",
    description: "Owns benchmark datasets, graders, eval rigor, and regression evidence quality.",
    class: "quality",
    availability: "core_required",
    shipsAgentArtifact: true,
    artifactPath: ".codex/agents/eval-engineer.toml",
    canOwnTasks: true,
    canSatisfySpecialistRequirement: true,
    defaultSkillIds: ["devgod-eval-engineering", "devgod-skill-evals", "eval-harness"],
    retrievalGuidance: ["approved memory", "repo rules", "eval artifacts", "reviewed plans", "test artifacts"]
  },
  technical_writer: {
    label: "Technical Writer",
    description: "Owns clear operator docs, product docs, release notes, and onboarding artifacts.",
    class: "knowledge",
    availability: "core_required",
    shipsAgentArtifact: true,
    artifactPath: ".codex/agents/technical-writer.toml",
    canOwnTasks: true,
    canSatisfySpecialistRequirement: true,
    defaultSkillIds: ["devgod-technical-writing", "documentation-lookup", "article-writing"],
    retrievalGuidance: ["approved memory", "repo rules", "reviewed plans", "reviewed technical notes", "release notes"]
  },
  agent_runtime_engineer: {
    label: "Agent Runtime Engineer",
    description: "Owns prompt/runtime orchestration, tool contracts, and agent execution safety.",
    class: "delivery",
    availability: "core_required",
    shipsAgentArtifact: true,
    artifactPath: ".codex/agents/agent-runtime-engineer.toml",
    canOwnTasks: true,
    canSatisfySpecialistRequirement: true,
    defaultSkillIds: ["devgod-agent-runtime", "anthropic-mcp-builder", "mcp-server-patterns", "verification-loop"],
    retrievalGuidance: ["approved memory", "repo rules", "reviewed plans", "runtime traces", "tooling integration notes"]
  },
  mobile_engineer: {
    label: "Mobile Engineer",
    description: "Owns mobile-specific product surfaces, interaction quality, and platform constraints.",
    class: "domain_specialist",
    availability: "domain_optional",
    shipsAgentArtifact: true,
    artifactPath: ".codex/agents/mobile-engineer.toml",
    canOwnTasks: true,
    canSatisfySpecialistRequirement: true,
    defaultSkillIds: ["devgod-frontend-taste", "devgod-design-system", "frontend-patterns", "e2e-testing"],
    retrievalGuidance: ["approved memory", "repo rules", "reviewed plans", "reviewed UI artifacts", "test artifacts"]
  },
  ml_engineer: {
    label: "ML Engineer",
    description: "Owns model-facing product behavior, evaluation integrity, and ML integration risks.",
    class: "domain_specialist",
    availability: "domain_optional",
    shipsAgentArtifact: true,
    artifactPath: ".codex/agents/ml-engineer.toml",
    canOwnTasks: true,
    canSatisfySpecialistRequirement: true,
    defaultSkillIds: ["documentation-lookup", "verification-loop"],
    retrievalGuidance: ["approved memory", "repo rules", "reviewed plans", "model evaluations", "integration notes"]
  },
  data_engineer: {
    label: "Data Engineer",
    description: "Owns data pipelines, schema movement, and data-system reliability concerns.",
    class: "domain_specialist",
    availability: "domain_optional",
    shipsAgentArtifact: true,
    artifactPath: ".codex/agents/data-engineer.toml",
    canOwnTasks: true,
    canSatisfySpecialistRequirement: true,
    defaultSkillIds: ["backend-patterns", "verification-loop"],
    retrievalGuidance: ["approved memory", "repo rules", "reviewed plans", "schema notes", "runbooks"]
  },
  ux_researcher: {
    label: "UX Researcher",
    description: "Owns user-flow investigation, evidence gathering, and experience-quality feedback.",
    class: "domain_specialist",
    availability: "domain_optional",
    shipsAgentArtifact: true,
    artifactPath: ".codex/agents/ux-researcher.toml",
    canOwnTasks: true,
    canSatisfySpecialistRequirement: true,
    defaultSkillIds: ["devgod-ux-research", "devgod-frontend-taste", "market-research"],
    retrievalGuidance: ["approved briefs", "approved memory", "repo rules", "reviewed plans", "reviewed UI artifacts"]
  },
  product_analyst: {
    label: "Product Analyst",
    description: "Owns metrics framing, evidence interpretation, and product-signal analysis.",
    class: "domain_specialist",
    availability: "domain_optional",
    shipsAgentArtifact: true,
    artifactPath: ".codex/agents/product-analyst.toml",
    canOwnTasks: true,
    canSatisfySpecialistRequirement: true,
    defaultSkillIds: ["devgod-product-analysis", "market-research"],
    retrievalGuidance: ["approved briefs", "approved memory", "repo rules", "reviewed plans", "eval artifacts"]
  },
  compliance_reviewer: {
    label: "Compliance Reviewer",
    description: "Owns compliance-sensitive review of policy, controls, and regulated-surface risks.",
    class: "domain_specialist",
    availability: "domain_optional",
    shipsAgentArtifact: true,
    artifactPath: ".codex/agents/compliance-reviewer.toml",
    canOwnTasks: true,
    canSatisfySpecialistRequirement: true,
    defaultSkillIds: ["devgod-compliance-review", "security-review", "documentation-lookup"],
    retrievalGuidance: ["approved memory", "repo rules", "reviewed plans", "incident notes", "audit artifacts"]
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
