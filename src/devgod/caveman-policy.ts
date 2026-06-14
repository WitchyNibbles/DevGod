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

const rootCavemanRequiredPatterns = [
  /root manager intermediate progress updates, .* (?:use|stay on|also use) `?caveman`? `?ultra`?/i,
  /(?:root manager may use normal prose only|only final reports, direct questions, or ordinary user conversation (?:may )?use normal prose)/i
] as const;

const rootCavemanForbiddenPatterns = [
  /only the root thread that talks directly to the user (?:is allowed outside that contract|may answer outside caveman)/i,
  /root thread that talks directly to the user may answer outside caveman/i,
  /use `caveman` for terse internal handoffs/i
] as const;

export interface CavemanContractVerificationResult {
  ok: boolean;
  missingMarkers: string[];
  contradictionPhrases: string[];
}

export interface RootCavemanPolicyVerificationResult {
  ok: boolean;
  missingPatterns: string[];
  forbiddenPatterns: string[];
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

export function verifyRootCavemanPolicyContract(
  policyText: string | undefined
): RootCavemanPolicyVerificationResult {
  const text = policyText ?? "";
  const missingPatterns = rootCavemanRequiredPatterns
    .filter((pattern) => !pattern.test(text))
    .map((pattern) => pattern.source);
  const forbiddenPatterns = rootCavemanForbiddenPatterns
    .filter((pattern) => pattern.test(text))
    .map((pattern) => pattern.source);

  return {
    ok: missingPatterns.length === 0 && forbiddenPatterns.length === 0,
    missingPatterns: [...missingPatterns],
    forbiddenPatterns: [...forbiddenPatterns]
  };
}
