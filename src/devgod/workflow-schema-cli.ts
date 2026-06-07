import {
  liveTaskReasoningPolicyHeadings,
  liveTaskRequiredHeadings,
  liveTaskRequiredNonEmptyHeadings,
  liveTaskRequiredNonEmptyReasoningHeadings,
  liveTaskRequiredReasoningHeadings,
  qualityGates,
  renderIntakeBriefTemplate,
  renderReviewGateTemplate,
  renderTaskPacketTemplate,
  strongerArtifactQualityGates,
  uiSurfaces,
  workflowPlaywrightRequirementStates,
  workflowStopGoStates,
  reasoningWorkflowModes,
  workflowArtifactRefKeys,
  workflowReviewActorRoles,
  workflowReviewExportPolicies,
  workflowReviewFilenameAliases,
  workflowReviewProvenanceStatuses,
  workflowTemplateReviewRoles
} from "./workflow-schema.ts";

function fail(message: string): never {
  throw new Error(message);
}

const [mode, key] = process.argv.slice(2);

if (!mode || !key) {
  fail("usage: workflow-schema-cli.ts <render-template|list> <key>");
}

if (mode === "render-template") {
  const output = key === "intake-brief"
    ? renderIntakeBriefTemplate()
    : key === "task-packet"
      ? renderTaskPacketTemplate()
      : key === "review-gate"
        ? renderReviewGateTemplate()
        : fail(`unknown template key: ${key}`);
  process.stdout.write(output);
  process.exit(0);
}

if (mode === "list") {
  const values = key === "live-task-required-headings"
    ? liveTaskRequiredHeadings
    : key === "live-task-required-reasoning-headings"
      ? liveTaskRequiredReasoningHeadings
      : key === "live-task-reasoning-policy-headings"
        ? liveTaskReasoningPolicyHeadings
        : key === "live-task-required-nonempty-headings"
          ? liveTaskRequiredNonEmptyHeadings
          : key === "live-task-required-nonempty-reasoning-headings"
            ? liveTaskRequiredNonEmptyReasoningHeadings
            : key === "quality-gates"
              ? qualityGates
              : key === "stronger-artifact-quality-gates"
                ? strongerArtifactQualityGates
                : key === "ui-surfaces"
                  ? uiSurfaces
                  : key === "workflow-template-review-roles"
                    ? workflowTemplateReviewRoles
                    : key === "workflow-review-filename-aliases"
                      ? workflowReviewFilenameAliases
                      : key === "workflow-review-actor-roles"
                        ? workflowReviewActorRoles
                        : key === "workflow-review-provenance-statuses"
                          ? workflowReviewProvenanceStatuses
                          : key === "workflow-review-export-policies"
                            ? workflowReviewExportPolicies
                            : key === "workflow-artifact-ref-keys"
                              ? workflowArtifactRefKeys
                    : key === "playwright-requirement-states"
                      ? workflowPlaywrightRequirementStates
                      : key === "reasoning-workflow-modes"
                      ? reasoningWorkflowModes
                      : key === "stop-go-states"
                        ? workflowStopGoStates
                        : fail(`unknown list key: ${key}`);
  process.stdout.write(`${values.join("\n")}\n`);
  process.exit(0);
}

fail(`unknown mode: ${mode}`);
