import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import test from "node:test";
import { generateRepoInventory } from "../src/runtime/repo-inventory.ts";

test("generateRepoInventory derives dependencies, signals, maps, and ambiguity gaps from repo fixtures", async () => {
  const fixtureRoot = await mkdtemp(resolve(tmpdir(), "devgod-repo-inventory-"));

  try {
    await mkdir(resolve(fixtureRoot, "src", "admin"), { recursive: true });
    await mkdir(resolve(fixtureRoot, "src", "config"), { recursive: true });
    await mkdir(resolve(fixtureRoot, "src", "core"), { recursive: true });
    await mkdir(resolve(fixtureRoot, "src", "runtime"), { recursive: true });
    await mkdir(resolve(fixtureRoot, "tests"), { recursive: true });
    await mkdir(resolve(fixtureRoot, "node_modules", "ignored"), { recursive: true });

    await writeFile(resolve(fixtureRoot, "package.json"), '{"name":"inventory-fixture","version":"1.0.0"}\n', "utf8");
    await writeFile(
      resolve(fixtureRoot, "tsconfig.json"),
      '{"compilerOptions":{"module":"nodenext"}}\n',
      "utf8"
    );
    await writeFile(
      resolve(fixtureRoot, "src", "core", "service.ts"),
      [
        'import runHelper, { persistState, Worker } from "../runtime/helper.ts";',
        "",
        "export async function workflowService() {",
        "  await persistState();",
        '  return `${runHelper()}:${new Worker().run()}`;',
        "}"
      ].join("\n"),
      "utf8"
    );
    await writeFile(
      resolve(fixtureRoot, "src", "runtime", "helper.ts"),
      [
        'import { writeFile } from "node:fs/promises";',
        "",
        'export default function runHelper() { return "ok"; }',
        "export async function persistState() {",
        '  await writeFile("proof.txt", "done");',
        "  saveProjectRuntimeState();",
        "}",
        "export class Worker {",
        "  run() {",
        "    return runHelper();",
        "  }",
        "}"
      ].join("\n"),
      "utf8"
    );
    await writeFile(
      resolve(fixtureRoot, "src", "admin", "router.ts"),
      [
        "export function route(command: string, app: Record<string, Function>, method: string) {",
        '  if (command === "status") {',
        '    return app[method]("/status", () => "ok");',
        "  }",
        '  return "missing";',
        "}"
      ].join("\n"),
      "utf8"
    );
    await writeFile(
      resolve(fixtureRoot, "src", "config", "runtime.ts"),
      [
        'const key = "API_URL";',
        'export const apiUrl = process.env[key] ?? "https://example.com";'
      ].join("\n"),
      "utf8"
    );
    await writeFile(
      resolve(fixtureRoot, "tests", "service.test.ts"),
      [
        'import { workflowService } from "../src/core/service.ts";',
        "",
        "export function verify(mode: string, handlers: Record<string, () => unknown>) {",
        "  const handler = handlers[mode];",
        "  return handler?.() ?? workflowService;",
        "}"
      ].join("\n"),
      "utf8"
    );
    await writeFile(
      resolve(fixtureRoot, "node_modules", "ignored", "skip.ts"),
      'export const ignored = "nope";\n',
      "utf8"
    );

    const result = await generateRepoInventory({
      repoRoot: fixtureRoot,
      include: ["src", "src/core/service.ts", "tests/service.test.ts", "package.json", "tsconfig.json", "missing"],
      now: "2026-05-20T12:34:56.000Z"
    });

    const serviceFile = result.coverageItems.find((item) => item.id === "file:src/core/service.ts");
    const helperSignal = result.coverageItems.find((item) => item.id === "runtime-side-effects:src/runtime/helper.ts");
    const routeSignal = result.coverageItems.find((item) => item.id === "route:src/admin/router.ts");
    const serviceSignal = result.coverageItems.find((item) => item.id === "service:src/core/service.ts");
    const configGap = result.gaps.find((gap) => gap.targetId === "file:src/config/runtime.ts");

    assert.equal(result.coverageItems.filter((item) => item.id === "file:src/core/service.ts").length, 1);
    assert.deepEqual(serviceFile?.dependencies, ["src/runtime/helper.ts"]);
    assert.ok(serviceFile?.dependents?.includes("tests/service.test.ts"));
    assert.equal(serviceFile?.criticality, "critical");
    assert.deepEqual(helperSignal?.sideEffects, ["writes files", "persists runtime state"]);
    assert.ok(helperSignal?.evidenceRefs.includes("signal://path:runtime-side-effects"));
    assert.equal(routeSignal?.state, "partially_analyzed");
    assert.ok(
      routeSignal?.openQuestions?.includes(
        "computed route method prevents deterministic route classification"
      )
    );
    assert.ok(serviceSignal?.evidenceRefs.includes("signal://path:core-runtime"));
    assert.equal(configGap?.severity, "medium");
    assert.ok(configGap?.evidenceRefs.includes("ambiguity://computed-env-key"));
    assert.equal(result.gaps.some((gap) => gap.targetId === "file:tests/service.test.ts"), false);
    assert.ok(
      result.understandingMaps.some(
        (map) =>
          map.kind === "call_graph" &&
          map.sourceRefs.includes("call:src/core/service.ts->src/runtime/helper.ts#persistState")
      )
    );
    assert.ok(
      result.understandingMaps.some(
        (map) =>
          map.kind === "dependency_graph" &&
          map.sourceRefs.includes("dependency:src/core/service.ts->src/runtime/helper.ts")
      )
    );
    assert.ok(
      result.understandingMaps.some(
        (map) => map.kind === "route_map" && map.sourceRefs.includes("src/admin/router.ts")
      )
    );
    assert.equal(
      result.coverageItems.some((item) => item.sources.includes("node_modules/ignored/skip.ts")),
      false
    );
  } finally {
    await rm(fixtureRoot, { recursive: true, force: true });
  }
});
