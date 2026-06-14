import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  renderIntakeBriefTemplate,
  renderReviewGatePolicyDocument,
  renderReviewGateTemplate,
  renderTaskPacketTemplate
} from "../src/devgod/workflow-schema.ts";
import {
  renderManagedAgentsBlock,
  renderManagedDotAgentsBlock,
  renderWorkflowContractBlock
} from "../src/devgod/managed-policy-renderer.ts";

const sourceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function read(relativePath: string): Promise<string> {
  return readFile(path.join(sourceRoot, relativePath), "utf8");
}

function assertSemanticPolicyParity(
  sourceText: string,
  renderedText: string,
  checks: Array<{ source: RegExp; rendered?: RegExp }>
): void {
  for (const check of checks) {
    assert.match(sourceText, check.source);
    assert.match(renderedText, check.rendered ?? check.source);
  }
}

test("devgod intake guidance requires clarification and explicit assumptions", async () => {
  const skill = await read(".agents/skills/devgod-intake/SKILL.md");

  assert.match(skill, /Ask (1-4 )?concise clarifying questions before planning/i);
  assert.match(skill, /state the operating assumptions explicitly/i);
  assert.match(skill, /Treat refactors as behavior-preserving improvement work/i);
});

test("devgod autopilot guidance keeps iterating until verified completion", async () => {
  const skill = await read(".agents/skills/devgod-autopilot/SKILL.md");

  assert.match(skill, /Do not wait for the user to say "continue"/i);
  assert.match(skill, /including good-path and bad-path coverage/i);
  assert.match(skill, /never stop after a single passing command/i);
});

test("workflow templates encode clarification, regression, and risk-closure expectations", async () => {
  const agents = await read("AGENTS.md");
  const intakeBrief = await read(".devgod/templates/intake-brief.md");
  const taskPacket = await read(".devgod/templates/task-packet.md");
  const reviewGate = await read(".devgod/templates/review-gate.md");
  const reviewGatePolicy = await read(".devgod/rules/review-gate-policy.md");
  const policyPrecedence = await read(".devgod/rules/policy-precedence.md");
  const qualityMatrix = await read(".devgod/rules/task-quality-matrix.md");
  const reasoningQuality = await read(".devgod/rules/reasoning-quality.md");

  assert.equal(intakeBrief, renderIntakeBriefTemplate());
  assert.equal(taskPacket, renderTaskPacketTemplate());
  assert.equal(reviewGate, renderReviewGateTemplate());
  assert.equal(reviewGatePolicy, renderReviewGatePolicyDocument());

  assert.match(intakeBrief, /## Clarifying questions/);
  assert.match(intakeBrief, /## Assumptions/);
  assert.match(intakeBrief, /## Reasoning quality/);
  assert.match(intakeBrief, /## Bad-path or edge-case outcomes/);

  assert.match(taskPacket, /`regression_safety_required`/);
  assert.match(taskPacket, /`council_review_required`/);
  assert.match(taskPacket, /`coverage_ledger_required`/);
  assert.match(taskPacket, /`progress_proof_required`/);
  assert.match(taskPacket, /`checkpoint_resume_required`/);
  assert.match(taskPacket, /## Behavior to preserve/);
  assert.match(taskPacket, /## Reasoning quality/);
  assert.match(taskPacket, /## Reasoning policy/);
  assert.match(taskPacket, /## Reasoning attempts/);
  assert.match(taskPacket, /## Required runtime traces/);
  assert.match(taskPacket, /## Progress proof/);
  assert.match(taskPacket, /## Workflow artifact refs/);
  assert.match(taskPacket, /## Export artifact policy/);
  assert.match(taskPacket, /Task packet markdown is a required export artifact/i);
  assert.match(taskPacket, /Review markdown summaries are required when `review_exports=required`/i);
  assert.match(taskPacket, /Runtime-authenticated review authority may satisfy completion before markdown review summaries exist only when `review_exports=runtime_optional`/i);
  assert.match(taskPacket, /Required export artifacts must be present and validate under the workflow checker/i);
  assert.match(taskPacket, /`product-state\.md` and `task-queue\.json` are advisory export artifacts unless runtime writes or verifies them/i);
  assert.match(taskPacket, /Stale or malformed export artifacts can block release or workflow proof, but they cannot override authenticated runtime truth/i);
  assert.doesNotMatch(taskPacket, /Runtime may generate or verify required task and review markdown exports/i);
  assert.match(taskPacket, /## Council review/);
  assert.match(taskPacket, /### Dissent owner/);
  assert.match(taskPacket, /review_exports=runtime_optional/);
  assert.match(taskPacket, /Allowed values: `required \| runtime_optional`/);
  assert.match(taskPacket, /Set `review_exports=required` only when the allowed write scope can actually update the referenced review artifacts/);
  assert.match(taskPacket, /## Playwright requirement/);
  assert.match(taskPacket, /## Browser evidence expectations/);
  assert.match(taskPacket, /## Residual risk disposition/);
  assert.match(reviewGatePolicy, /`completion_audit_required`/);
  assert.match(reviewGatePolicy, /runtime task, review, approval, and council records are canonical truth/i);
  assert.match(reviewGatePolicy, /markdown task packets, markdown review summaries, `product-state\.md`, and `task-queue\.json` are export artifacts/i);
  assert.match(reviewGatePolicy, /`review_exports=required` means markdown review summaries are required export evidence/i);
  assert.match(reviewGatePolicy, /`review_exports=runtime_optional` means runtime-authenticated review records may satisfy completion before markdown review summaries exist/i);
  assert.match(reviewGatePolicy, /`review_exports=runtime_optional` waives only markdown review-summary exports/i);
  assert.match(reviewGatePolicy, /a task may declare `review_exports=required` only when its allowed write scope includes the referenced markdown review artifacts/i);
  assert.doesNotMatch(reviewGatePolicy, /Runtime may generate or verify required task and review markdown exports/i);
  assert.match(agents, /runtime_canonical_records=task,review,approval,council/);
  assert.match(agents, /task_packet_export=required_live_export_present_and_valid/);
  assert.match(agents, /review_export_optional_when=review_exports=runtime_optional/);
  assert.match(agents, /product_state_export=advisory_unless_runtime_written_or_verified/);
  assert.match(agents, /`review_exports=runtime_optional` under runtime authority.*waives only markdown review-summary exports/i);
  assert.match(policyPrecedence, /authenticated runtime task, review, approval, and council records/i);
  assert.match(policyPrecedence, /runtime-written or runtime-verified export artifacts/i);
  assert.match(policyPrecedence, /manager-authored or generated markdown exports/i);
  assert.match(policyPrecedence, /`product-state\.md` and `task-queue\.json` stay non-canonical unless runtime writes or verifies them/i);

  assert.match(qualityMatrix, /### `council_review_required`/);
  assert.match(qualityMatrix, /refactors and rewrites must preserve intended behavior/i);
  assert.match(qualityMatrix, /### `regression_safety_required`/);
  assert.match(qualityMatrix, /### `coverage_ledger_required`/);
  assert.match(qualityMatrix, /### `progress_proof_required`/);
  assert.match(qualityMatrix, /### `checkpoint_resume_required`/);
  assert.match(qualityMatrix, /### `reasoning_strict_required`/);
  assert.match(qualityMatrix, /discovered `CRITICAL` or `HIGH` defects in touched scope/i);
  assert.match(reasoningQuality, /facts, assumptions, and guesses/i);
  assert.match(reasoningQuality, /structured dissent pass/i);
  assert.match(reasoningQuality, /multiple plausible hypotheses/i);
  assert.match(reasoningQuality, /strict is the default reasoning mode/i);
  assert.match(reasoningQuality, /dual mode is the migration bridge/i);
  assert.match(reasoningQuality, /bounded research, debug, and review budgets/i);
});

test("managed policy renderer owns installed AGENTS policy blocks", async () => {
  const agents = renderManagedAgentsBlock();
  const dotAgents = renderManagedDotAgentsBlock();
  const workflowContract = renderWorkflowContractBlock();
  const repoAgents = await read("AGENTS.md");
  const repoDotAgents = await read(".agents.md");
  const graphifyPolicy = await read(".devgod/rules/graphify-advisory-policy.md");
  const debuggingSkill = await read(".agents/skills/devgod-debugging/SKILL.md");

  assert.match(agents, /<!-- BEGIN DEVGOD MANAGED -->/);
  assert.match(agents, /<!-- END DEVGOD MANAGED -->/);
  assert.match(dotAgents, /<!-- BEGIN DEVGOD KERNEL -->/);
  assert.match(dotAgents, /<!-- END DEVGOD KERNEL -->/);
  assert.match(agents, /Canonical runtime contract:/);
  assert.match(agents, /workflow_check=npm run devgod -- workflow-proof --run-id latest --task-id <task-id>/);
  assert.match(agents, /substantive work completes only after .* gates plus runtime workflow proof/i);
  assert.match(agents, /workflow_documents=workflow_documents/);
  assert.match(agents, /review_artifact_trust=runtime_records_only/);
  assert.match(agents, /caveman.*ultra/i);
  assert.match(
    agents,
    /root manager may use normal prose only for final reports, direct questions, or ordinary conversation/i
  );
  assert.match(agents, /root manager intermediate progress updates, .* stay on `caveman` `ultra`/i);
  assert.match(dotAgents, /markdown review files are evidence summaries, not reviewer authority/i);
  assert.match(dotAgents, /authenticated reviewer identity and waiver authority/i);
  assert.match(workflowContract, /<!-- devgod-workflow-contract:start -->/);
  assert.match(workflowContract, /<!-- devgod-workflow-contract:end -->/);
  assert.doesNotMatch(`${agents}\n${dotAgents}\n${workflowContract}`, /node_modules\/devgod\/src/);

  assertSemanticPolicyParity(repoAgents, agents, [
    {
      source: /treat substantive .* asks as `devgod` work unless the user opts out/i,
      rendered: /treat substantive requests as devgod work unless the user opts out/i
    },
    { source: /use `devgod-intake` as the default first skill for substantive work/i },
    {
      source: /require `Design and Architecture Council` review .* unless/i,
      rendered:
        /require Design and Architecture Council review .* unless the task is trivial or inherits an approved decision/i
    },
    {
      source: /require task packets to declare explicit workflow artifact refs/i,
      rendered: /inherited task packets must carry explicit workflow artifact refs/i
    },
    {
      source: /`review_exports=runtime_optional`.*waives only markdown review-summary exports/i,
      rendered: /use `review_exports=runtime_optional` only when runtime-authenticated review authority covers the gate/i
    },
    {
      source: /substantive work completes only after `reviewer`, `qa_engineer`, and `security_reviewer` gates plus the workflow check/i,
      rendered: /substantive work completes only after .* gates plus runtime workflow proof/i
    },
    {
      source: /the manager must not stop after intake, architecture, planning, or one implementation slice unless/i,
      rendered: /do not wait for the user to say continue/i
    },
    { source: /branch from updated `origin\/main` before task or plan work/i },
    { source: /do not use `codex` in branch names, commit subjects, PR titles, or PR bodies/i },
    {
      source: /use the\s+local `caveman` skill in `ultra` mode/i,
      rendered: /specialist\/subagent roles use `caveman` `ultra` mode/i
    },
    {
      source: /root manager may use normal prose only for final reports, direct questions, or ordinary conversation/i,
      rendered: /root manager may use normal prose only for final reports, direct questions, or ordinary conversation/i
    },
    {
      source: /root manager intermediate progress updates, .* use `caveman` `ultra`/i,
      rendered: /root manager intermediate progress updates, .* stay on `caveman` `ultra`/i
    }
  ]);

  assertSemanticPolicyParity(repoDotAgents, dotAgents, [
    {
      source: /root thread is the manager: confirm goal, criteria, constraints, and main risk/i
    },
    {
      source: /task packets need `task_id`, owner role, completion standard, required specialists, quality gates, write scope, acceptance criteria, verification steps, required reviews, security checks, and rollback notes/i
    },
    {
      source: /run `bash scripts\/check-devgod-workflow\.sh --task-id <task-id>` before declaring substantive work complete/i
    },
    {
      source: /current task id must match `.devgod\/ACTIVE`, the current brief, the current plan\/task, and required review files/i
    },
    {
      source: /root manager intermediate progress updates, .* use `caveman` `ultra`/i,
      rendered: /root manager intermediate progress updates, .* use `caveman` `ultra`/i
    },
    {
      source: /unresolved `CRITICAL` or `HIGH` security findings block completion/i
    },
    {
      source: /markdown review files are evidence summaries, not reviewer authority/i
    },
    {
      source:
        /authenticated reviewer identity and waiver authority must come from runtime policy or another authenticated principal-binding source/i
    },
    {
      source:
        /ask before deploys, auth changes, secret rotation, destructive data operations, global config changes outside this repo, or durable memory policy changes/i
    },
    {
      source: /use repo-local `devgod` skills and agents when they fit/i
    }
  ]);

  assertSemanticPolicyParity(graphifyPolicy, agents, [
    {
      source: /for code-file navigation in this repo and consuming repos, use Graphify first when the repo graph is ready/i,
      rendered: /use Graphify MCP first for code navigation when the repo-local graph is ready/i
    }
  ]);

  assertSemanticPolicyParity(graphifyPolicy, dotAgents, [
    {
      source: /treat Graphify output as advisory retrieval evidence only/i,
      rendered: /Graphify MCP first when the repo-local graph is ready .* but do not treat it as workflow authority/i
    }
  ]);

  assertSemanticPolicyParity(debuggingSkill, agents, [
    {
      source: /When repo-local Grafana configuration is present/i,
      rendered: /when repo-local Grafana configuration is present, use Grafana logs as broader debugging and research evidence/i
    },
    {
      source: /do not make strong negative claims from a narrow pass/i,
      rendered: /avoid strong negative claims from a narrow pass/i
    }
  ]);

  assertSemanticPolicyParity(debuggingSkill, dotAgents, [
    {
      source: /When repo-local Grafana configuration is present/i,
      rendered: /when repo-local Grafana configuration is present, treat Grafana as advisory evidence/i
    },
    {
      source: /do not make strong negative claims from a narrow pass/i,
      rendered: /avoid strong negative claims from a narrow pass/i
    }
  ]);
});

test("repo-local workflow contract matches the canonical source renderer", async () => {
  const agents = await read("AGENTS.md");
  const sourceContract = agents.match(/<!-- devgod-workflow-contract:start -->[\s\S]*?<!-- devgod-workflow-contract:end -->/)?.[0];

  assert.equal(sourceContract, renderWorkflowContractBlock({ target: "source" }));
});

test("reasoning-quality skills call for bounded skepticism and evidence discipline", async () => {
  const debugging = await read(".agents/skills/devgod-debugging/SKILL.md");
  const planning = await read(".agents/skills/devgod-planning/SKILL.md");
  const review = await read(".agents/skills/devgod-review/SKILL.md");
  const docsResearch = await read(".agents/skills/devgod-docs-research/SKILL.md");

  assert.match(debugging, /next most plausible hypothesis/i);
  assert.match(debugging, /debug budget/i);
  assert.match(debugging, /repo-local Grafana configuration/i);
  assert.match(debugging, /counter-evidence/i);
  assert.match(planning, /reasoning-quality section/i);
  assert.match(planning, /strict.*default/i);
  assert.match(review, /low-confidence conclusions/i);
  assert.match(review, /unsupported reasoning verdicts/i);
  assert.match(docsResearch, /unresolved drift/i);
  assert.match(docsResearch, /repo-local Grafana configuration/i);
  assert.match(docsResearch, /stop at the evidence boundary/i);
});

test("expanded role-local workflow skills encode the new behavior loops", async () => {
  const agentRuntime = await read(".agents/skills/devgod-agent-runtime/SKILL.md");
  const productFraming = await read(".agents/skills/devgod-product-framing/SKILL.md");
  const gitOperator = await read(".agents/skills/devgod-git-operator/SKILL.md");
  const evalEngineering = await read(".agents/skills/devgod-eval-engineering/SKILL.md");
  const skillEvals = await read(".agents/skills/devgod-skill-evals/SKILL.md");

  assert.match(agentRuntime, /continuation/i);
  assert.match(agentRuntime, /hook/i);
  assert.match(productFraming, /smallest useful milestone/i);
  assert.match(productFraming, /acceptance criteria/i);
  assert.match(gitOperator, /Stage only files that belong/i);
  assert.match(gitOperator, /do not use broad staging commands/i);
  assert.match(evalEngineering, /deterministic checks/i);
  assert.match(evalEngineering, /false-positive risk/i);
  assert.match(skillEvals, /did the right skill trigger/i);
  assert.match(skillEvals, /happy-path/i);
});

test("frontend quality controls reject generic AI UI and require browser-backed proof", async () => {
  const artDirection = await read(".agents/skills/devgod-ui-art-direction/SKILL.md");
  const frontendTaste = await read(".agents/skills/devgod-frontend-taste/SKILL.md");
  const frontendRubric = await read(".devgod/rules/frontend-quality-rubric.md");
  const inspirationSources = await read(".devgod/rules/frontend-inspiration-sources.md");
  const frontendDesigner = await read(".codex/agents/frontend-designer.toml");
  const planner = await read(".codex/agents/planner.toml");
  const taskPacket = await read(".devgod/templates/task-packet.md");

  assert.match(artDirection, /single entry point/i);
  assert.match(artDirection, /real UI surface/i);
  assert.match(artDirection, /pull those detail skills on demand/i);
  assert.match(artDirection, /ui surface/i);
  assert.match(artDirection, /at least 8 references/i);
  assert.match(artDirection, /3 materially different directions/i);
  assert.match(artDirection, /screenshot critique/i);
  assert.match(artDirection, /signature move/i);
  assert.match(artDirection, /impressiveness hypothesis/i);
  assert.match(artDirection, /design-family reset/i);
  assert.match(artDirection, /repeated primitive ban/i);
  assert.match(artDirection, /media-first concept decision/i);
  assert.match(artDirection, /generated asset decision/i);
  assert.match(artDirection, /externalized exploration/i);
  assert.match(artDirection, /opposite-direction artifact/i);
  assert.match(artDirection, /reference translation/i);
  assert.match(artDirection, /semantic charm/i);
  assert.match(artDirection, /control map/i);
  assert.match(artDirection, /inheritance cutoff/i);
  assert.match(artDirection, /legacy carryover ban/i);
  assert.match(artDirection, /blank-slate/i);
  assert.match(artDirection, /evolution of the prior concept family/i);
  assert.match(artDirection, /same family reordered/i);
  assert.match(artDirection, /text is blurred/i);
  assert.match(artDirection, /motion system/i);
  assert.match(artDirection, /media system/i);
  assert.match(artDirection, /reduced-motion/i);
  assert.match(artDirection, /technical-fit/i);
  assert.match(artDirection, /literal hero insert/i);
  assert.match(artDirection, /placeholder clutter/i);
  assert.match(artDirection, /generated imagery/i);
  assert.match(artDirection, /surface-language continuity/i);
  assert.match(artDirection, /illustration or poster plus overlay panels/i);
  assert.match(frontendTaste, /generic gradient hero/i);
  assert.match(frontendTaste, /mobile layout must feel composed/i);
  assert.match(frontendRubric, /generic AI-generated UI output/i);
  assert.match(frontendRubric, /ui surface/i);
  assert.match(frontendRubric, /frontend entrypoint/i);
  assert.match(frontendRubric, /no named public inspiration sources/i);
  assert.match(frontendRubric, /only one direction explored/i);
  assert.match(frontendRubric, /old shell silhouette/i);
  assert.match(frontendRubric, /layered leftovers/i);
  assert.match(frontendRubric, /default font stack/i);
  assert.match(frontendRubric, /amateur or placeholder art/i);
  assert.match(frontendRubric, /motion-heavy claims backed only by entrance fades/i);
  assert.match(frontendRubric, /barely noticeable ambient motion/i);
  assert.match(frontendRubric, /poster or illustration plus overlay product panels/i);
  assert.match(frontendRubric, /literal hero asset/i);
  assert.match(frontendRubric, /placeholder clutter/i);
  assert.match(frontendRubric, /repeated primitive/i);
  assert.match(frontendRubric, /externalized exploration artifact/i);
  assert.match(frontendRubric, /production code with no externalized exploration artifact/i);
  assert.match(frontendRubric, /generated imagery/i);
  assert.match(frontendRubric, /reduced-motion/i);
  assert.match(frontendRubric, /critical controls/i);
  assert.match(frontendRubric, /premium dark surfaces with large typography/i);
  assert.match(frontendRubric, /one desktop viewport/i);
  assert.match(frontendRubric, /one mobile viewport/i);
  assert.match(frontendRubric, /cited Playwright evidence refs/i);
  assert.match(inspirationSources, /Awwwards/i);
  assert.match(inspirationSources, /declare the `ui surface`/i);
  assert.match(inspirationSources, /frontend entrypoint/i);
  assert.match(inspirationSources, /Godly/i);
  assert.match(inspirationSources, /Siteinspire/i);
  assert.match(inspirationSources, /Lapa Ninja/i);
  assert.match(inspirationSources, /Land-book/i);
  assert.match(inspirationSources, /game UI/i);
  assert.match(inspirationSources, /motion\.dev\/docs\/react/i);
  assert.match(inspirationSources, /Rive/i);
  assert.match(inspirationSources, /GSAP/i);
  assert.match(inspirationSources, /three\.js/i);
  assert.match(inspirationSources, /media-first concept decision/i);
  assert.match(inspirationSources, /generated imagery/i);
  assert.match(inspirationSources, /externalized visual exploration artifact/i);
  assert.match(inspirationSources, /dashboard, admin, control-center, and game-like surfaces/i);
  assert.match(inspirationSources, /reference translation brief/i);
  assert.match(inspirationSources, /semantic charm map/i);
  assert.match(frontendDesigner, /devgod-ui-art-direction/i);
  assert.match(frontendDesigner, /frontend entrypoint/i);
  assert.match(frontendDesigner, /non-UI tasks/i);
  assert.match(frontendDesigner, /ui surface/i);
  assert.match(frontendDesigner, /3 materially different design directions/i);
  assert.match(frontendDesigner, /signature move/i);
  assert.match(frontendDesigner, /impressiveness hypothesis/i);
  assert.match(frontendDesigner, /new design family/i);
  assert.match(frontendDesigner, /generated imagery/i);
  assert.match(frontendDesigner, /externalized visual exploration artifact/i);
  assert.match(frontendDesigner, /opposite-direction artifact/i);
  assert.match(frontendDesigner, /surface-language continuity plan/i);
  assert.match(frontendDesigner, /reference-translation brief/i);
  assert.match(frontendDesigner, /semantic charm map/i);
  assert.match(frontendDesigner, /route-critical controls/i);
  assert.match(frontendDesigner, /legacy carryover ban/i);
  assert.match(frontendDesigner, /current UI as legacy/i);
  assert.match(frontendDesigner, /Rive/i);
  assert.match(frontendDesigner, /reduced-motion fallback/i);
  assert.match(frontendDesigner, /Motion/i);
  assert.match(frontendDesigner, /GSAP/i);
  assert.match(frontendDesigner, /vibe image/i);
  assert.match(frontendDesigner, /random cute placeholders/i);
  assert.match(frontendDesigner, /frontend quality rubric/i);
  assert.match(planner, /visual-direction package/i);
  assert.match(planner, /ui surface/i);
  assert.match(planner, /devgod-ui-art-direction/i);
  assert.match(planner, /multiple frontend skills/i);
  assert.match(planner, /visual exploration artifact refs/i);
  assert.match(planner, /reference-translation brief/i);
  assert.match(planner, /semantic charm map/i);
  assert.match(planner, /signature move/i);
  assert.match(planner, /design-family reset/i);
  assert.match(planner, /repeated primitive ban/i);
  assert.match(planner, /generated asset decision/i);
  assert.match(planner, /surface-language continuity plan/i);
  assert.match(planner, /critical-control inventory/i);
  assert.match(planner, /inheritance cutoff/i);
  assert.match(planner, /blank-slate direction/i);
  assert.match(planner, /impressiveness hypothesis/i);
  assert.match(planner, /technical-fit/i);
  assert.match(taskPacket, /## UI surface/);
  assert.match(taskPacket, /## Frontend workflow entrypoint/);
  assert.match(taskPacket, /## Visual direction package/);
  assert.match(taskPacket, /visual exploration artifact refs/i);
  assert.match(taskPacket, /named signature move/i);
  assert.match(taskPacket, /named impressiveness hypothesis/i);
  assert.match(taskPacket, /design-family reset/i);
  assert.match(taskPacket, /surface-language continuity plan/i);
  assert.match(taskPacket, /generated imagery or illustration rationale/i);
  assert.match(taskPacket, /3D or no-3D rationale/i);
  assert.match(taskPacket, /reference translation brief/i);
  assert.match(taskPacket, /semantic charm map/i);
  assert.match(taskPacket, /media strategy/i);
  assert.match(taskPacket, /idle\/background motion rationale/i);
  assert.match(taskPacket, /technical-fit rationale/i);
  assert.match(taskPacket, /critical control inventory/i);
  assert.match(taskPacket, /inheritance cutoff/i);
  assert.match(taskPacket, /legacy carryover ban/i);
});

test("AGENTS routes recurring control-layer work through repo-local workflow skills first", async () => {
  const agents = await read("AGENTS.md");

  assert.match(agents, /repo-local `devgod-\*` workflow skill/i);
  assert.match(agents, /agent runtime, hook, tool-contract, automation, or continuation changes/i);
  assert.match(agents, /benchmark, grader, or skill-regression work/i);
  assert.match(agents, /operator docs, migration notes, release notes, or workflow-document clarity/i);
});
