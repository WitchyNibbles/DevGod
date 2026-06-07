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

const sourceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function read(relativePath: string): Promise<string> {
  return readFile(path.join(sourceRoot, relativePath), "utf8");
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
  const intakeBrief = await read(".devgod/templates/intake-brief.md");
  const taskPacket = await read(".devgod/templates/task-packet.md");
  const reviewGate = await read(".devgod/templates/review-gate.md");
  const reviewGatePolicy = await read(".devgod/rules/review-gate-policy.md");
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
  assert.match(taskPacket, /## Council review/);
  assert.match(taskPacket, /### Dissent owner/);
  assert.match(taskPacket, /review_exports=required \| runtime_optional/);
  assert.match(taskPacket, /## Playwright requirement/);
  assert.match(taskPacket, /## Browser evidence expectations/);
  assert.match(taskPacket, /## Residual risk disposition/);

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
