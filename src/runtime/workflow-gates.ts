export type WorkflowGateTerminalOutcome = "partial" | "blocked" | "failed" | "done";

export interface WorkflowGateTerminalAssessmentInput {
  allTasksTerminal: boolean;
  hasSafeRecoveryActions: boolean;
  hasReasoningBlockers: boolean;
  hasAutonomousBlockers: boolean;
  hasAutonomousNextTarget: boolean;
  hasNativeAutonomousDirective: boolean;
}

export function classifyWorkflowGateTerminalOutcome(
  input: WorkflowGateTerminalAssessmentInput
): WorkflowGateTerminalOutcome {
  if (input.hasSafeRecoveryActions) {
    return "failed";
  }

  if (!input.allTasksTerminal) {
    return "partial";
  }

  if (input.hasReasoningBlockers || (input.hasAutonomousBlockers && !input.hasAutonomousNextTarget)) {
    return "blocked";
  }

  if (input.hasNativeAutonomousDirective || input.hasAutonomousNextTarget) {
    return "partial";
  }

  return "done";
}

export function terminalOutcomeRationaleLine(outcome: WorkflowGateTerminalOutcome): string {
  return `terminal-outcome: ${outcome}`;
}

export function appendTerminalOutcomeRationale(
  rationale: readonly string[],
  outcome: WorkflowGateTerminalOutcome
): string[] {
  return [terminalOutcomeRationaleLine(outcome), ...rationale];
}
