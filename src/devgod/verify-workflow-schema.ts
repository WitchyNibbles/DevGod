import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  renderWorkflowSchemaArtifactJson,
  renderIntakeBriefTemplate,
  renderReviewGatePolicyDocument,
  renderReviewGateTemplate,
  renderTaskPacketTemplate
} from "./workflow-schema.ts";

const expectedTemplates = [
  {
    relativePath: ".devgod/templates/intake-brief.md",
    render: renderIntakeBriefTemplate
  },
  {
    relativePath: ".devgod/templates/task-packet.md",
    render: renderTaskPacketTemplate
  },
  {
    relativePath: ".devgod/templates/review-gate.md",
    render: renderReviewGateTemplate
  },
  {
    relativePath: ".devgod/rules/review-gate-policy.md",
    render: renderReviewGatePolicyDocument
  },
  {
    relativePath: ".devgod/templates/workflow-schema.json",
    render: renderWorkflowSchemaArtifactJson
  }
] as const;

async function main(): Promise<void> {
  const failures: string[] = [];

  for (const template of expectedTemplates) {
    const absolutePath = path.join(process.cwd(), template.relativePath);
    const actual = await readFile(absolutePath, "utf8");
    const expected = template.render();
    if (actual !== expected) {
      failures.push(template.relativePath);
    }
  }

  if (failures.length > 0) {
    throw new Error(`workflow schema drift: ${failures.join(", ")}`);
  }

  console.log("workflow schema verified");
}

await main();
