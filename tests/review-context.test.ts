import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import {
  createReviewPrincipalAdapter,
  createReviewActionContextResolver,
  loadReviewIdentityBindings,
  loadReviewIdentityFixtures,
  validateReviewIdentityFixtures,
  verifyReviewIdentityAdapter,
  validateReviewIdentityBindings,
  type ReviewIdentityBindings,
  type ReviewIdentityFixtureDocument
} from "../src/core/review-context.ts";

test("validateReviewIdentityBindings rejects duplicate actors and invalid waiver authorities", () => {
  const errors = validateReviewIdentityBindings({
    bindings: [
      {
        principal: {
          provider: "github",
          subject: "alice"
        },
        actors: [
          {
            actor: "alice-reviewer",
            roles: ["reviewer", "reviewer"]
          }
        ]
      },
      {
        principal: {
          provider: "github",
          subject: "bob"
        },
        actors: [
          {
            actor: "alice-reviewer",
            roles: ["qa_engineer"],
            waiverAuthorities: ["none" as never]
          }
        ]
      }
    ]
  });

  assert.match(errors.join(" | "), /duplicate actor alice-reviewer/);
  assert.match(errors.join(" | "), /roles must not contain empty or duplicate values/);
  assert.match(errors.join(" | "), /invalid waiver authority none/);
});

test("createReviewActionContextResolver rejects unverified principals and unauthorized review roles", async () => {
  const resolver = createReviewActionContextResolver({
    bindings: {
      bindings: [
        {
          principal: {
            provider: "github",
            subject: "alice"
          },
          actors: [
            {
              actor: "alice-reviewer",
              roles: ["reviewer"]
            }
          ]
        }
      ]
    },
    resolveAuthenticatedPrincipal(input) {
      return {
        provider: "github",
        subject: input.actor === "alice-reviewer" ? "alice" : "mallory",
        verified: input.actor === "alice-reviewer"
      };
    }
  });

  await assert.rejects(
    async () =>
      resolver({
        runId: "run-1",
        taskId: "task-1",
        actor: "mallory-reviewer",
        reviewerRole: "reviewer",
        reviewState: "passed"
      }),
    /not verified/
  );

  await assert.rejects(
    async () =>
      resolver({
        runId: "run-1",
        taskId: "task-1",
        actor: "alice-reviewer",
        reviewerRole: "qa_engineer",
        reviewState: "passed"
      }),
    /not allowed to record qa_engineer/
  );
});

test("createReviewActionContextResolver derives waiver authority from reviewed bindings", async () => {
  const resolver = createReviewActionContextResolver({
    bindings: {
      bindings: [
        {
          principal: {
            provider: "github",
            subject: "manager-1"
          },
          actors: [
            {
              actor: "release-manager",
              roles: ["planner"],
              waiverAuthorities: ["manager"]
            }
          ]
        }
      ]
    },
    resolveAuthenticatedPrincipal() {
      return {
        provider: "github",
        subject: "manager-1",
        verified: true
      };
    }
  });

  const context = await resolver({
    runId: "run-1",
    taskId: "task-1",
    actor: "release-manager",
    reviewerRole: "qa_engineer",
    reviewState: "waived"
  });

  assert.deepEqual(context, {
    actor: "release-manager",
    actorRole: "planner",
    waiverAuthority: "manager"
  });
});

test("createReviewActionContextResolver rejects waived reviews from unverified principals before waiver resolution", async () => {
  const resolver = createReviewActionContextResolver({
    bindings: {
      bindings: [
        {
          principal: {
            provider: "github",
            subject: "manager-1"
          },
          actors: [
            {
              actor: "release-manager",
              roles: ["planner"],
              waiverAuthorities: ["manager"]
            }
          ]
        }
      ]
    },
    resolveAuthenticatedPrincipal() {
      return {
        provider: "github",
        subject: "manager-1",
        verified: false
      };
    }
  });

  await assert.rejects(
    async () =>
      resolver({
        runId: "run-1",
        taskId: "task-1",
        actor: "release-manager",
        reviewerRole: "qa_engineer",
        reviewState: "waived"
      }),
    /not verified/
  );
});

test("createReviewActionContextResolver resolves actor binding before waived review authority checks", async () => {
  const resolver = createReviewActionContextResolver({
    bindings: {
      bindings: [
        {
          principal: {
            provider: "github",
            subject: "manager-1"
          },
          actors: [
            {
              actor: "release-manager",
              roles: ["planner"],
              waiverAuthorities: ["manager"]
            }
          ]
        }
      ]
    },
    resolveAuthenticatedPrincipal() {
      return {
        provider: "github",
        subject: "manager-1",
        verified: true
      };
    }
  });

  await assert.rejects(
    async () =>
      resolver({
        runId: "run-1",
        taskId: "task-1",
        actor: "missing-manager",
        reviewerRole: "qa_engineer",
        reviewState: "waived"
      }),
    /Actor missing-manager is not bound to github:manager-1/
  );
});

test("loadReviewIdentityBindings reads reviewed binding files", async () => {
  const directory = await mkdtemp(join(tmpdir(), "devgod-review-bindings-"));
  const filePath = join(directory, "review-identity-bindings.json");
  const bindings: ReviewIdentityBindings = {
    bindings: [
      {
        principal: {
          provider: "github",
          subject: "alice"
        },
        actors: [
          {
            actor: "alice-reviewer",
            roles: ["reviewer"]
          }
        ]
      }
    ]
  };

  try {
    await writeFile(filePath, `${JSON.stringify(bindings, null, 2)}\n`, "utf8");
    const loaded = await loadReviewIdentityBindings(filePath);
    const raw = await readFile(filePath, "utf8");

    assert.deepEqual(loaded, bindings);
    assert.match(raw, /alice-reviewer/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("validateReviewIdentityFixtures rejects empty names and missing deny expectations", () => {
  const errors = validateReviewIdentityFixtures({
    fixtures: [
      {
        name: " ",
        authContext: {},
        review: {
          actor: "alice-reviewer",
          reviewerRole: "reviewer",
          reviewState: "passed"
        },
        expect: {
          outcome: "deny",
          errorIncludes: []
        }
      }
    ]
  });

  assert.match(errors.join(" | "), /name is required/);
  assert.match(errors.join(" | "), /expect\.errorIncludes requires at least one value/);
});

test("verifyReviewIdentityAdapter validates allow and deny fixtures", async () => {
  const fixtures: ReviewIdentityFixtureDocument<{
    provider: string;
    subject: string;
    verified: boolean;
  }> = {
    fixtures: [
      {
        name: "allow reviewer principal",
        authContext: {
          provider: "github",
          subject: "alice",
          verified: true
        },
        review: {
          actor: "alice-reviewer",
          reviewerRole: "reviewer",
          reviewState: "passed"
        },
        expect: {
          outcome: "allow",
          principal: {
            provider: "github",
            subject: "alice",
            verified: true
          },
          context: {
            actor: "alice-reviewer",
            actorRole: "reviewer",
            waiverAuthority: "none"
          }
        }
      },
      {
        name: "deny unverified principal",
        authContext: {
          provider: "github",
          subject: "alice",
          verified: false
        },
        review: {
          actor: "alice-reviewer",
          reviewerRole: "reviewer",
          reviewState: "passed"
        },
        expect: {
          outcome: "deny",
          errorIncludes: ["not verified"]
        }
      }
    ]
  };

  const result = await verifyReviewIdentityAdapter({
    bindings: {
      bindings: [
        {
          principal: {
            provider: "github",
            subject: "alice"
          },
          actors: [
            {
              actor: "alice-reviewer",
              roles: ["reviewer"]
            }
          ]
        }
      ]
    },
    adapter: createReviewPrincipalAdapter(async ({ authContext }) => ({
      provider: authContext.provider,
      subject: authContext.subject,
      verified: authContext.verified
    })),
    fixtures
  });

  assert.deepEqual(result, {
    passed: 2,
    failed: 0,
    failures: []
  });
});

test("loadReviewIdentityFixtures reads reviewed fixture files", async () => {
  const directory = await mkdtemp(join(tmpdir(), "devgod-review-fixtures-"));
  const filePath = join(directory, "review-identity-adapter.fixture.json");
  const fixtures: ReviewIdentityFixtureDocument = {
    fixtures: [
      {
        name: "deny unverified principal",
        authContext: {
          provider: "github",
          subject: "alice",
          verified: false
        },
        review: {
          actor: "alice-reviewer",
          reviewerRole: "reviewer",
          reviewState: "passed"
        },
        expect: {
          outcome: "deny",
          errorIncludes: ["not verified"]
        }
      }
    ]
  };

  try {
    await writeFile(filePath, `${JSON.stringify(fixtures, null, 2)}\n`, "utf8");
    const loaded = await loadReviewIdentityFixtures(filePath);
    const raw = await readFile(filePath, "utf8");

    assert.deepEqual(loaded, fixtures);
    assert.match(raw, /deny unverified principal/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
