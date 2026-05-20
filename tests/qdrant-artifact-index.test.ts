import test from "node:test";
import assert from "node:assert/strict";
import { QdrantArtifactIndex } from "../src/store/qdrant-artifact-index.ts";

function must<T>(value: T | undefined): T {
  assert.notEqual(value, undefined);
  return value as T;
}

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
  const request = requests[0];
  assert.ok(request);
  assert.equal(request.method, "POST");
  assert.match(request.url, /\/collections\/devgod-memory\/points\/query$/);
  assert.deepEqual(results, [
    { id: "artifact-1", score: 0.9 },
    { id: "2", score: 0.5 }
  ]);
});

test("QdrantArtifactIndex.queryArtifactMatches accepts legacy array payloads and filters empty ids", async () => {
  const index = new QdrantArtifactIndex(async () =>
    new Response(
      JSON.stringify({
        result: [
          { id: "artifact-2", score: 0.7 },
          { id: "", score: 0.4 },
          { id: 3, score: null }
        ]
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" }
      }
    )
  );

  const results = await index.queryArtifactMatches({
    baseUrl: "http://127.0.0.1:6333",
    runtimeProfile: "local-native",
    collection: "devgod-memory",
    projectId: "project:default:gii",
    vector: [0.1, 0.2, 0.3],
    limit: 3
  });

  assert.deepEqual(results, [
    { id: "artifact-2", score: 0.7 },
    { id: "3", score: 0 }
  ]);
});

test("QdrantArtifactIndex.queryArtifactMatches treats missing collections as empty matches", async () => {
  const index = new QdrantArtifactIndex(async () => new Response("", { status: 404, statusText: "Not Found" }));

  const results = await index.queryArtifactMatches({
    baseUrl: "http://127.0.0.1:6333",
    runtimeProfile: "local-native",
    collection: "devgod-memory",
    projectId: "project:default:gii",
    vector: [0.1, 0.2, 0.3],
    limit: 3
  });

  assert.deepEqual(results, []);
});

test("QdrantArtifactIndex.queryArtifactMatches tolerates empty successful response bodies", async () => {
  const index = new QdrantArtifactIndex(async () => new Response("   ", { status: 200 }));

  const results = await index.queryArtifactMatches({
    baseUrl: "http://127.0.0.1:6333",
    runtimeProfile: "local-native",
    collection: "devgod-memory",
    projectId: "project:default:gii",
    vector: [0.1, 0.2, 0.3],
    limit: 3
  });

  assert.deepEqual(results, []);
});

test("QdrantArtifactIndex.upsertArtifactPoint creates a missing collection once and reuses the cached size", async () => {
  const requests: Array<{ url: string; method?: string; body?: string }> = [];
  let collectionLookupCount = 0;
  const index = new QdrantArtifactIndex(async (url, init) => {
    requests.push({
      url: String(url),
      ...(init?.method ? { method: init.method } : {}),
      ...(typeof init?.body === "string" ? { body: init.body } : {})
    });

    if (init?.method === "GET") {
      collectionLookupCount += 1;
      return new Response("", { status: 404, statusText: "Not Found" });
    }

    return new Response(JSON.stringify({ status: "ok" }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  });

  const point = {
    id: "artifact-1",
    vector: [0.1, 0.2],
    projectId: "project:default:gii",
    sourcePath: "docs/runbook.md",
    sourceAnchor: "runbook",
    retrievalRoles: ["planner"],
    tags: ["repo_markdown"]
  } as const;

  await index.upsertArtifactPoint({
    baseUrl: "http://127.0.0.1:6333",
    runtimeProfile: "local-native",
    collection: "devgod-memory",
    point
  });
  await index.upsertArtifactPoint({
    baseUrl: "http://127.0.0.1:6333",
    runtimeProfile: "local-native",
    collection: "devgod-memory",
    point
  });

  assert.equal(collectionLookupCount, 1);
  assert.equal(requests.length, 4);
  assert.match(must(requests[0]).url, /\/collections\/devgod-memory$/);
  assert.match(must(requests[1]).url, /\/collections\/devgod-memory\?wait=true$/);
  assert.match(must(requests[2]).url, /\/collections\/devgod-memory\/points\?wait=true$/);
  assert.match(must(requests[3]).url, /\/collections\/devgod-memory\/points\?wait=true$/);
});

test("QdrantArtifactIndex.upsertArtifactPoint reuses an existing collection and preserves custom headers", async () => {
  const requests: Array<{ url: string; method?: string; body?: string; headers?: HeadersInit }> = [];
  const index = new QdrantArtifactIndex(async (url, init) => {
    requests.push({
      url: String(url),
      ...(init?.method ? { method: init.method } : {}),
      ...(typeof init?.body === "string" ? { body: init.body } : {}),
      ...(init?.headers ? { headers: init.headers } : {})
    });

    if (init?.method === "GET") {
      return new Response(
        JSON.stringify({
          result: {
            config: {
              params: {
                vectors: {
                  size: 2
                }
              }
            }
          }
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" }
        }
      );
    }

    return new Response(JSON.stringify({ status: "ok" }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  });

  await index.upsertArtifactPoint({
    baseUrl: "http://127.0.0.1:6333/runtime",
    runtimeProfile: "local-native",
    collection: "devgod-memory",
    point: {
      id: "artifact-2",
      vector: [0.1, 0.2],
      projectId: "project:default:gii",
      retrievalRoles: [],
      tags: []
    }
  });

  assert.equal(requests.length, 2);
  assert.match(must(requests[0]).url, /\/runtime\/collections\/devgod-memory$/);
  assert.match(must(requests[1]).url, /\/runtime\/collections\/devgod-memory\/points\?wait=true$/);
  assert.match(must(must(requests[1]).body), /"sourcePath":null/);
  assert.match(must(must(requests[1]).body), /"sourceAnchor":null/);
});

test("QdrantArtifactIndex.upsertArtifactPoint accepts named-vector collections with matching size", async () => {
  const requests: Array<{ url: string; method?: string }> = [];
  const index = new QdrantArtifactIndex(async (url, init) => {
    requests.push({
      url: String(url),
      ...(init?.method ? { method: init.method } : {})
    });

    if (init?.method === "GET") {
      return new Response(
        JSON.stringify({
          result: {
            config: {
              params: {
                vectors: {
                  text: { size: 2 }
                }
              }
            }
          }
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" }
        }
      );
    }

    return new Response(null, { status: 204 });
  });

  await index.upsertArtifactPoint({
    baseUrl: "http://127.0.0.1:6333",
    runtimeProfile: "local-native",
    collection: "devgod-memory",
    point: {
      id: "artifact-3",
      vector: [0.1, 0.2],
      projectId: "project:default:gii",
      retrievalRoles: [],
      tags: []
    }
  });

  assert.equal(requests.length, 2);
  assert.equal(must(requests[0]).method, "GET");
  assert.equal(must(requests[1]).method, "PUT");
});

test("QdrantArtifactIndex.deleteProjectArtifacts tolerates missing collections", async () => {
  const requests: Array<{ url: string; method?: string }> = [];
  const index = new QdrantArtifactIndex(async (url, init) => {
    requests.push({ url: String(url), ...(init?.method ? { method: init.method } : {}) });
    return new Response("", { status: 404, statusText: "Not Found" });
  });

  await index.deleteProjectArtifacts({
    baseUrl: "http://127.0.0.1:6333",
    runtimeProfile: "local-native",
    collection: "devgod-memory",
    projectId: "project:default:gii"
  });

  assert.equal(requests.length, 1);
  const request = requests[0];
  assert.ok(request);
  assert.equal(request.method, "POST");
  assert.match(request.url, /\/collections\/devgod-memory\/points\/delete\?wait=true$/);
});

test("QdrantArtifactIndex.deleteProjectArtifacts surfaces non-404 failures", async () => {
  const index = new QdrantArtifactIndex(async () => new Response("boom", { status: 500, statusText: "Server Error" }));

  await assert.rejects(
    index.deleteProjectArtifacts({
      baseUrl: "http://127.0.0.1:6333",
      runtimeProfile: "local-native",
      collection: "devgod-memory",
      projectId: "project:default:gii"
    }),
    /Qdrant request failed \(500 Server Error\)/
  );
});

test("QdrantArtifactIndex.upsertArtifactPoint rejects mismatched collection vector sizes", async () => {
  const index = new QdrantArtifactIndex(async () =>
    new Response(
      JSON.stringify({
        result: {
          config: {
            params: {
              vectors: {
                text: { size: 3 }
              }
            }
          }
        }
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" }
      }
    )
  );

  await assert.rejects(
    index.upsertArtifactPoint({
      baseUrl: "http://127.0.0.1:6333",
      runtimeProfile: "local-native",
      collection: "devgod-memory",
      point: {
        id: "artifact-1",
        vector: [0.1, 0.2],
        projectId: "project:default:gii",
        retrievalRoles: [],
        tags: []
      }
    }),
    /vector size mismatch: expected 2, received 3/
  );
});
