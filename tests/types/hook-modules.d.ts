declare module "../plugins/devgod/scripts/hook-policy.mjs" {
  export function evaluatePreToolUse(payload: unknown, context: unknown): any;
  export function evaluatePermissionRequest(payload: unknown, context: unknown): any;
  export function evaluatePostToolUse(payload: unknown, context: unknown): any;
  export function evaluateSessionStart(payload: unknown, context: unknown): any;
  export function evaluateUserPromptSubmit(payload: unknown, context: unknown): any;
  export function evaluateStop(payload: unknown, context: unknown): any;
}

declare module "../plugins/devgod/scripts/hook-utils.mjs" {
  export function readActiveTaskContext(repoRoot: string): Promise<any>;
}
