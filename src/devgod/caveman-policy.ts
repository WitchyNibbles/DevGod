import type { AgentRoleId } from "./agent-catalog.ts";

export const cavemanDirectUserFacingExceptionRoleIds: readonly AgentRoleId[] = [];

export const cavemanRequiredMarkerLines = [
  "- caveman ultra mode for every response this role emits",
  "- enable with `/caveman ultra` semantics for maximum compression",
  "- no prose exception: this role does not talk directly to the user",
  "- keep caveman ultra shape: 4-6 lines, 2-8 words per value, no status essays"
] as const;

const cavemanContradictionPhrases = [
  "user-facing response: clear prose permitted",
  "plain English for final summaries",
  "normal clear English for final implementation summary",
  "polished, compact prose for user-facing docs"
] as const;

export interface CavemanContractVerificationResult {
  ok: boolean;
  missingMarkers: string[];
  contradictionPhrases: string[];
}

export function verifyNonUserFacingAgentCavemanContract(
  developerInstructions: string | undefined
): CavemanContractVerificationResult {
  const instructions = developerInstructions ?? "";
  const missingMarkers = cavemanRequiredMarkerLines.filter((line) => !instructions.includes(line));
  const contradictionPhrases = cavemanContradictionPhrases.filter((phrase) => instructions.includes(phrase));

  return {
    ok: missingMarkers.length === 0 && contradictionPhrases.length === 0,
    missingMarkers: [...missingMarkers],
    contradictionPhrases: [...contradictionPhrases]
  };
}
