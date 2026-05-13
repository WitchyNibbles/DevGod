import test from "node:test";
import assert from "node:assert/strict";
import { getPlanContextSurface } from "../src/admin/runtime-surface.ts";

test("getPlanContextSurface wires query embedding through the runtime surface", async () => {
  let capturedInput:
    | {
        workspaceSlug: string;
        projectSlug: string;
        query: string;
        limit: number;
        includeGlobal: boolean;
        queryEmbedding?: readonly number[] | undefined;
        embeddingModel?: string | undefined;
        requesterRole?: string | undefined;
      }
    | undefined;

  const result = await getPlanContextSurface(["--query", "qdrant retrieval", "--format", "json"], {
    env: {
      DEVGOD_WORKSPACE_SLUG: "team",
      DEVGOD_PROJECT_SLUG: "devgod",
      DEVGOD_EMBEDDING_MODEL: "devgod-local-hash-1536"
    },
    dependencies: {
      async loadDotEnv() {},
      async withClient(callback) {
        return callback({ kind: "client" } as never);
      },
      createStore() {
        return { kind: "store" } as never;
      },
      createService() {
        return {
          async getStatus() {
            assert.fail("getStatus should not be called by plan-context");
          },
          async recommendRouting() {
            assert.fail("recommendRouting should not be called by plan-context");
          },
          async inspectRecovery() {
            assert.fail("inspectRecovery should not be called by plan-context");
          },
          async searchMemory(input) {
            capturedInput = input;
            return [];
          }
        };
      },
      async createPlanContextEmbedQuery(env) {
        assert.ok(env);
        assert.equal(env.DEVGOD_EMBEDDING_MODEL, "devgod-local-hash-1536");
        return async ({ model, text }) => {
          assert.equal(model, "devgod-local-hash-1536");
          assert.equal(text, "qdrant retrieval");
          return [0.25, 0.75];
        };
      }
    }
  });

  assert.equal(result.format, "json");
  assert.deepEqual(capturedInput?.queryEmbedding, [0.25, 0.75]);
  assert.equal(capturedInput?.embeddingModel, "devgod-local-hash-1536");
  assert.equal(capturedInput?.workspaceSlug, "team");
  assert.equal(capturedInput?.projectSlug, "devgod");
});
