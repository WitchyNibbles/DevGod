import type {
  HandoffInput,
  IntakeRequestInput,
  MemoryPromotionInput,
  PlanInput,
  ReviewInput,
  SearchMemoryInput,
  TaskPacketInput
} from "../domain/types.ts";
import { DevgodCoreService } from "./service.ts";

export interface DevgodActionHandlers {
  intake_request(input: IntakeRequestInput): ReturnType<DevgodCoreService["intakeRequest"]>;
  create_plan(input: PlanInput): ReturnType<DevgodCoreService["createPlan"]>;
  create_task_graph(input: {
    runId: string;
    taskPackets: TaskPacketInput[];
  }): ReturnType<DevgodCoreService["createTaskGraph"]>;
  claim_task(input: { runId: string; taskId: string; actor: string }): ReturnType<
    DevgodCoreService["claimTask"]
  >;
  submit_handoff(input: { runId: string; taskId: string; handoff: HandoffInput }): ReturnType<
    DevgodCoreService["submitHandoff"]
  >;
  record_review(input: { runId: string; taskId: string; review: ReviewInput }): ReturnType<
    DevgodCoreService["recordReview"]
  >;
  promote_memory(input: { runId: string; memory: MemoryPromotionInput }): ReturnType<
    DevgodCoreService["promoteMemory"]
  >;
  search_memory(input: SearchMemoryInput): ReturnType<DevgodCoreService["searchMemory"]>;
  get_status(input: { runId: string }): ReturnType<DevgodCoreService["getStatus"]>;
  resume_run(input: { runId: string }): ReturnType<DevgodCoreService["resumeRun"]>;
}

export function createActionHandlers(service: DevgodCoreService): DevgodActionHandlers {
  return {
    intake_request(input) {
      return service.intakeRequest(input);
    },
    create_plan(input) {
      return service.createPlan(input);
    },
    create_task_graph(input) {
      return service.createTaskGraph(input.runId, input.taskPackets);
    },
    claim_task(input) {
      return service.claimTask(input.runId, input.taskId, input.actor);
    },
    submit_handoff(input) {
      return service.submitHandoff(input.runId, input.taskId, input.handoff);
    },
    record_review(input) {
      return service.recordReview(input.runId, input.taskId, input.review);
    },
    promote_memory(input) {
      return service.promoteMemory(input.runId, input.memory);
    },
    search_memory(input) {
      return service.searchMemory(input);
    },
    get_status(input) {
      return service.getStatus(input.runId);
    },
    resume_run(input) {
      return service.resumeRun(input.runId);
    }
  };
}
