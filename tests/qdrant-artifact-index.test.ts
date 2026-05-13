import test from "node:test";
import assert from "node:assert/strict";
import { QdrantArtifactIndex } from "../src/store/qdrant-artifact-index.ts";

test("QdrantArtifactIndex.queryArtifactMatches parses Qdrant 1.17 points payloads", async () => {
  const requests: Array<{ url: string; method?: string }> = [];
  const index = new QdrantArtifactIndex(async (url, init) => {
    requests.push({
      url: String(url),
      ...(init?.method ? { method: init.method } : {})
    });
    return new Response(
      JSON.stringify({
        result: {
          points: [
            { id: "artifact-1", score: 0.9 },
            { id: 2, score: 0.5 }
          ]
        },
        status: "ok"
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json"
        }
      }
    );
  });

  const results = await index.queryArtifactMatches({
    baseUrl: "http://127.0.0.1:6333",
    runtimeProfile: "local-native",
    collection: "devgod-memory",
    projectId: "project:default:gii",
    vector: [0.1, 0.2, 0.3],
    limit: 2
  });

  assert.equal(requests.length, 1);
  assert.equal(requests[0]?.method, "POST");
  assert.match(requests[0]?.url ?? "", /\/collections\/devgod-memory\/points\/query$/);
  assert.deepEqual(results, [
    { id: "artifact-1", score: 0.9 },
    { id: "2", score: 0.5 }
  ]);
});
