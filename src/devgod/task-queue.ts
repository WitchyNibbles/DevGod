import { readFile } from "node:fs/promises";
import path from "node:path";

export const ALLOWED_TASK_STATUSES = ["pending", "in_progress", "blocked", "done"] as const;
export const ALLOWED_TASK_CLASSES = [
  "prototype_slice",
  "security_sensitive",
  "release_candidate",
  "docs_only"
] as const;

export type TaskStatus = (typeof ALLOWED_TASK_STATUSES)[number];
export type TaskClass = (typeof ALLOWED_TASK_CLASSES)[number];

export interface TaskQueueTask {
  id: string;
  title: string;
  status: TaskStatus;
  class: TaskClass;
  depends_on: string[];
  acceptance_criteria: string[];
  verification: string[];
  evidence: string[];
  blocker: string | null;
}

export interface TaskQueue {
  project_status: string;
  current_task_id: string | null;
  tasks: TaskQueueTask[];
}

export interface TaskQueueSummary {
  projectStatus: string;
  currentTask: TaskQueueTask | null;
  nextTask: TaskQueueTask | null;
  blockedTasks: TaskQueueTask[];
  doneCount: number;
  pendingCount: number;
  inProgressCount: number;
  totalCount: number;
}

function asRecord(value: unknown, context: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${context} must be an object`);
  }

  return value as Record<string, unknown>;
}

function asString(value: unknown, context: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${context} must be a non-empty string`);
  }

  return value;
}

function asNullableString(value: unknown, context: string): string | null {
  if (value === null) {
    return null;
  }

  return asString(value, context);
}

function asStringArray(value: unknown, context: string): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new Error(`${context} must be an array of strings`);
  }

  return value;
}

function asTaskStatus(value: unknown, context: string): TaskStatus {
  const status = asString(value, context);
  if (!ALLOWED_TASK_STATUSES.includes(status as TaskStatus)) {
    throw new Error(`${context} has invalid status "${status}"`);
  }

  return status as TaskStatus;
}

function asTaskClass(value: unknown, context: string): TaskClass {
  const taskClass = asString(value, context);
  if (!ALLOWED_TASK_CLASSES.includes(taskClass as TaskClass)) {
    throw new Error(`${context} has invalid class "${taskClass}"`);
  }

  return taskClass as TaskClass;
}

function parseTask(value: unknown, index: number): TaskQueueTask {
  const record = asRecord(value, `tasks[${index}]`);

  return {
    id: asString(record.id, `tasks[${index}].id`),
    title: asString(record.title, `tasks[${index}].title`),
    status: asTaskStatus(record.status, `tasks[${index}].status`),
    class: asTaskClass(record.class, `tasks[${index}].class`),
    depends_on: asStringArray(record.depends_on, `tasks[${index}].depends_on`),
    acceptance_criteria: asStringArray(
      record.acceptance_criteria,
      `tasks[${index}].acceptance_criteria`
    ),
    verification: asStringArray(record.verification, `tasks[${index}].verification`),
    evidence: asStringArray(record.evidence, `tasks[${index}].evidence`),
    blocker: asNullableString(record.blocker, `tasks[${index}].blocker`)
  };
}

export function isTaskBlocked(task: TaskQueueTask): boolean {
  return task.status === "blocked" || task.blocker !== null;
}

function validateTaskQueue(queue: TaskQueue): TaskQueue {
  const taskIds = new Set<string>();

  for (const task of queue.tasks) {
    if (taskIds.has(task.id)) {
      throw new Error(`task queue has duplicate task id "${task.id}"`);
    }

    taskIds.add(task.id);
  }

  if (queue.current_task_id !== null && !taskIds.has(queue.current_task_id)) {
    throw new Error(`current_task_id "${queue.current_task_id}" does not exist in tasks`);
  }

  for (const task of queue.tasks) {
    for (const dependencyId of task.depends_on) {
      if (!taskIds.has(dependencyId)) {
        throw new Error(`task "${task.id}" has missing dependency "${dependencyId}"`);
      }
    }
  }

  return queue;
}

function tasksById(queue: TaskQueue): Map<string, TaskQueueTask> {
  return new Map(queue.tasks.map((task) => [task.id, task]));
}

function dependenciesSatisfied(task: TaskQueueTask, index: Map<string, TaskQueueTask>): boolean {
  return task.depends_on.every((dependencyId) => index.get(dependencyId)?.status === "done");
}

export function parseTaskQueueContent(content: string): TaskQueue {
  const parsed = JSON.parse(content) as unknown;
  const record = asRecord(parsed, "task queue");

  const queue: TaskQueue = {
    project_status: asString(record.project_status, "project_status"),
    current_task_id:
      record.current_task_id === null ? null : asString(record.current_task_id, "current_task_id"),
    tasks: Array.isArray(record.tasks)
      ? record.tasks.map((task, index) => parseTask(task, index))
      : (() => {
          throw new Error("tasks must be an array");
        })()
  };

  return validateTaskQueue(queue);
}

export async function readTaskQueue(
  queuePath = path.join(process.cwd(), ".devgod", "work", "task-queue.json")
): Promise<TaskQueue> {
  const content = await readFile(queuePath, "utf8");
  return parseTaskQueueContent(content);
}

export function selectNextUnblockedTask(queue: TaskQueue): TaskQueueTask | null {
  const index = tasksById(queue);

  for (const task of queue.tasks) {
    if (task.status === "done") {
      continue;
    }

    if (isTaskBlocked(task)) {
      continue;
    }

    if (!dependenciesSatisfied(task, index)) {
      continue;
    }

    return task;
  }

  return null;
}

export function summarizeTaskQueue(queue: TaskQueue): TaskQueueSummary {
  const index = tasksById(queue);
  const currentTask = queue.current_task_id === null ? null : index.get(queue.current_task_id) ?? null;

  return {
    projectStatus: queue.project_status,
    currentTask,
    nextTask: selectNextUnblockedTask(queue),
    blockedTasks: queue.tasks.filter((task) => isTaskBlocked(task)),
    doneCount: queue.tasks.filter((task) => task.status === "done").length,
    pendingCount: queue.tasks.filter((task) => task.status === "pending").length,
    inProgressCount: queue.tasks.filter((task) => task.status === "in_progress").length,
    totalCount: queue.tasks.length
  };
}
