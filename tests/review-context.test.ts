import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import {
  createReviewPrincipalAdapter,
  createReviewActionContextResolver,
  isTrustedReviewActionContext,
  loadReviewIdentityBindings,
  loadReviewIdentityFixtures,
  toReviewActionContextSnapshot,
  validateReviewIdentityFixtures,
  verifyReviewIdentityAdapter,
  validateReviewIdentityBindings,
  type ReviewIdentityBindings,
  type ReviewIdentityFixtureDocument
} from "../src/core/review-context.ts";
import { validateReviewAction } from "../src/domain/contracts.ts";

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

test("validateReviewIdentityBindings rejects missing principal fields and empty role bindings", () => {
  const errors = validateReviewIdentityBindings({
    bindings: [
      {
        principal: {
          provider: " ",
          subject: ""
        },
        actors: [
          {
            actor: " ",
            roles: []
          }
        ]
      }
    ]
  });

  assert.match(errors.join(" | "), /principal\.provider is required/);
  assert.match(errors.join(" | "), /principal\.subject is required/);
  assert.match(errors.join(" | "), /actor is required/);
  assert.match(errors.join(" | "), /at least one role is required/);
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

test("createReviewActionContextResolver accepts array bindings and rejects missing principal bindings", async () => {
  const resolver = createReviewActionContextResolver({
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
    ],
    resolveAuthenticatedPrincipal() {
      return {
        provider: "github",
        subject: "bob",
        verified: true
      };
    }
  });

  await assert.rejects(
    async () =>
      resolver({
        runId: "run-1",
        taskId: "task-1",
        actor: "alice-reviewer",
        reviewerRole: "reviewer",
        reviewState: "passed"
      }),
    /No review identity binding for github:bob/
  );
});

test("createReviewActionContextResolver rejects invalid binding documents up front", () => {
  assert.throws(
    () =>
      createReviewActionContextResolver({
        bindings: {
          bindings: [
            {
              principal: {
                provider: "github",
                subject: "alice"
              },
              actors: []
            }
          ]
        },
        resolveAuthenticatedPrincipal() {
          return {
            provider: "github",
            subject: "alice",
            verified: true
          };
        }
      }),
    /Invalid review identity bindings/
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

  assert.deepEqual(toReviewActionContextSnapshot(context), {
    actor: "release-manager",
    actorRole: "planner",
    waiverAuthority: "manager"
  });
});

test("createReviewActionContextResolver returns trusted runtime-backed context for valid waivers", async () => {
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

  assert.equal(isTrustedReviewActionContext(context), true);
  assert.equal(
    isTrustedReviewActionContext({
      ...toReviewActionContextSnapshot(context),
      identityAssurance: "authenticated"
    }),
    false
  );
  assert.deepEqual(
    validateReviewAction(context, {
      reviewerRole: "qa_engineer",
      state: "waived",
      severity: "low",
      findings: ["documented exception"],
      waiverReason: "managed exception"
    }),
    []
  );
  assert.deepEqual(
    validateReviewAction(
      {
        ...toReviewActionContextSnapshot(context),
        identityAssurance: "authenticated"
      } as never,
      {
        reviewerRole: "qa_engineer",
        state: "waived",
        severity: "low",
        findings: ["documented exception"],
        waiverReason: "managed exception"
      }
    ),
    ["review context must come from the trusted runtime review identity resolver"]
  );
  assert.deepEqual(
    validateReviewAction(
      toReviewActionContextSnapshot(context) as never,
      {
        reviewerRole: "qa_engineer",
        state: "waived",
        severity: "low",
        findings: ["documented exception"],
        waiverReason: "managed exception"
      }
    ),
    ["review context must come from the trusted runtime review identity resolver"]
  );
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

test("loadReviewIdentityBindings rejects invalid reviewed binding files", async () => {
  const directory = await mkdtemp(join(tmpdir(), "devgod-review-bindings-invalid-"));
  const filePath = join(directory, "review-identity-bindings.json");

  try {
    await writeFile(
      filePath,
      `${JSON.stringify({
        bindings: [
          {
            principal: {
              provider: "github",
              subject: "alice"
            },
            actors: [
              {
                actor: "alice-reviewer",
                roles: []
              }
            ]
          }
        ]
      })}\n`,
      "utf8"
    );

    await assert.rejects(() => loadReviewIdentityBindings(filePath), /Invalid review identity bindings/);
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

test("validateReviewIdentityFixtures rejects invalid allow expectations", () => {
  const errors = validateReviewIdentityFixtures({
    fixtures: [
      {
        name: "bad allow",
        authContext: {},
        review: {
          actor: "alice-reviewer",
          reviewerRole: "reviewer",
          reviewState: "passed"
        },
        expect: {
          outcome: "allow",
          principal: {
            provider: " ",
            subject: "alice",
            verified: true,
            groups: ["team-a", "team-a"]
          },
          context: {
            actor: " ",
            actorRole: "ceo" as never,
            waiverAuthority: "invalid" as never
          }
        }
      }
    ]
  });

  assert.match(errors.join(" | "), /expect\.principal Authenticated principal provider is required/);
  assert.match(errors.join(" | "), /expect\.context\.actor is required/);
  assert.match(errors.join(" | "), /invalid expect\.context\.actorRole ceo/);
  assert.match(errors.join(" | "), /invalid expect\.context\.waiverAuthority invalid/);
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

test("createReviewPrincipalAdapter normalizes principals and rejects invalid adapter output", async () => {
  const adapter = createReviewPrincipalAdapter(async () => ({
    provider: " github ",
    subject: " alice ",
    verified: true,
    displayName: " Alice ",
    email: " alice@example.com ",
    groups: ["team-a", "team-b"]
  }));

  const principal = await adapter({
    runId: "run-1",
    taskId: "task-1",
    actor: "alice-reviewer",
    reviewerRole: "reviewer",
    reviewState: "passed",
    authContext: {}
  });

  assert.deepEqual(principal, {
    provider: "github",
    subject: "alice",
    verified: true,
    displayName: "Alice",
    email: "alice@example.com",
    groups: ["team-a", "team-b"]
  });

  const invalidAdapter = createReviewPrincipalAdapter(async () => ({
    provider: "",
    subject: "alice",
    verified: true
  }));

  await assert.rejects(
    async () =>
      invalidAdapter({
        runId: "run-1",
        taskId: "task-1",
        actor: "alice-reviewer",
        reviewerRole: "reviewer",
        reviewState: "passed",
        authContext: {}
      }),
    /Authenticated principal provider is required/
  );

  const invalidSubjectAdapter = createReviewPrincipalAdapter(async () => ({
    provider: "github",
    subject: "",
    verified: true
  }));
  await assert.rejects(
    async () =>
      invalidSubjectAdapter({
        runId: "run-1",
        taskId: "task-1",
        actor: "alice-reviewer",
        reviewerRole: "reviewer",
        reviewState: "passed",
        authContext: {}
      }),
    /Authenticated principal subject is required/
  );

  const invalidVerifiedAdapter = createReviewPrincipalAdapter(async () => ({
    provider: "github",
    subject: "alice",
    verified: "yes" as never
  }));
  await assert.rejects(
    async () =>
      invalidVerifiedAdapter({
        runId: "run-1",
        taskId: "task-1",
        actor: "alice-reviewer",
        reviewerRole: "reviewer",
        reviewState: "passed",
        authContext: {}
      }),
    /verified must be a boolean/
  );
});

test("verifyReviewIdentityAdapter reports allow and deny mismatches", async () => {
  const result = await verifyReviewIdentityAdapter({
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
    ],
    adapter: async ({ authContext }) => ({
      provider: authContext.provider,
      subject: authContext.subject,
      verified: authContext.verified
    }),
    fixtures: [
      {
        name: "allow mismatch",
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
            subject: "different",
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
        name: "deny mismatch",
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
          outcome: "deny",
          errorIncludes: ["not verified"]
        }
      }
    ]
  });

  assert.equal(result.passed, 0);
  assert.equal(result.failed, 2);
  assert.match(result.failures[0]?.message ?? "", /principal mismatch/);
  assert.match(result.failures[1]?.message ?? "", /expected deny but resolver allowed/);
});

test("verifyReviewIdentityAdapter reports context mismatches and deny mismatch details", async () => {
  const result = await verifyReviewIdentityAdapter({
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
    ],
    adapter: async ({ authContext }) => ({
      provider: authContext.provider,
      subject: authContext.subject,
      verified: authContext.verified
    }),
    fixtures: [
      {
        name: "context mismatch",
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
            actor: "someone-else",
            actorRole: "reviewer",
            waiverAuthority: "none"
          }
        }
      },
      {
        name: "deny mismatch details",
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
          errorIncludes: ["not allowed"]
        }
      }
    ]
  });

  assert.equal(result.failed, 2);
  assert.match(result.failures[0]?.message ?? "", /context mismatch/);
  assert.match(result.failures[1]?.message ?? "", /deny mismatch/);
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

test("loadReviewIdentityFixtures rejects invalid reviewed fixture files", async () => {
  const directory = await mkdtemp(join(tmpdir(), "devgod-review-fixtures-invalid-"));
  const filePath = join(directory, "review-identity-adapter.fixture.json");

  try {
    await writeFile(
      filePath,
      `${JSON.stringify({
        fixtures: [
          {
            name: "bad fixture",
            authContext: {},
            review: {
              actor: "",
              reviewerRole: "reviewer",
              reviewState: "passed"
            },
            expect: {
              outcome: "deny",
              errorIncludes: []
            }
          }
        ]
      })}\n`,
      "utf8"
    );

    await assert.rejects(() => loadReviewIdentityFixtures(filePath), /Invalid review identity fixtures/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
