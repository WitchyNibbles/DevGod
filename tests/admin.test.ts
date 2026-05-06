import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  executeRecordReviewCommand,
  executeRecordReviewCommandFromArgs
} from "../src/admin.ts";
import type { TrustedReviewActionContext } from "../src/domain/types.ts";

const execFileAsync = promisify(execFile);

test("verify-review-identity command validates adapter, bindings, and fixtures", async () => {
  const sourceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const directory = await mkdtemp(path.join(tmpdir(), "devgod-admin-review-identity-"));
  const adminPath = path.join(sourceRoot, "src/admin.ts");
  const adapterImportUrl = pathToFileURL(path.join(sourceRoot, "src/index.ts")).href;

  const adapterModule = `import { createReviewPrincipalAdapter } from ${JSON.stringify(adapterImportUrl)};

export default createReviewPrincipalAdapter(async ({ authContext }) => ({
  provider: String(authContext.provider),
  subject: String(authContext.subject),
  verified: authContext.verified === true
}));
`;

  const bindings = {
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

  const fixtures = {
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

  try {
    await writeFile(path.join(directory, "review-identity-adapter.ts"), adapterModule, "utf8");
    await writeFile(
      path.join(directory, "review-identity-bindings.json"),
      `${JSON.stringify(bindings, null, 2)}\n`,
      "utf8"
    );
    await writeFile(
      path.join(directory, "review-identity-adapter.fixture.json"),
      `${JSON.stringify(fixtures, null, 2)}\n`,
      "utf8"
    );

    const { stdout } = await execFileAsync(
      "node",
      ["--experimental-strip-types", adminPath, "verify-review-identity"],
      {
        cwd: directory,
        env: {
          ...process.env,
          DEVGOD_REVIEW_IDENTITY_ADAPTER_MODULE: "./review-identity-adapter.ts",
          DEVGOD_REVIEW_IDENTITY_BINDINGS: "./review-identity-bindings.json",
          DEVGOD_REVIEW_IDENTITY_FIXTURES: "./review-identity-adapter.fixture.json"
        }
      }
    );

    const result = JSON.parse(stdout) as {
      passed: number;
      failed: number;
    };

    assert.equal(result.passed, 2);
    assert.equal(result.failed, 0);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("verify-review-identity command uses repo template defaults when no env adapter is configured", async () => {
  const sourceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const adminPath = path.join(sourceRoot, "src/admin.ts");
  const env = { ...process.env };

  delete env.DEVGOD_REVIEW_IDENTITY_ADAPTER_MODULE;
  delete env.DEVGOD_REVIEW_IDENTITY_BINDINGS;
  delete env.DEVGOD_REVIEW_IDENTITY_FIXTURES;

  const { stdout } = await execFileAsync(
    "node",
    ["--experimental-strip-types", adminPath, "verify-review-identity"],
    {
      cwd: sourceRoot,
      env
    }
  );

  const result = JSON.parse(stdout) as {
    passed: number;
    failed: number;
  };

  assert.equal(result.passed, 2);
  assert.equal(result.failed, 0);
});

test("executeRecordReviewCommand accepts a live authenticated principal and resolves bound review authority", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "devgod-admin-record-review-"));
  const bindingsPath = path.join(directory, ".devgod/review-identity-bindings.json");

  const bindings = {
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
    await mkdir(path.dirname(bindingsPath), { recursive: true });
    await writeFile(bindingsPath, `${JSON.stringify(bindings, null, 2)}\n`, "utf8");

    let resolvedContext: TrustedReviewActionContext | undefined;

    const result = await executeRecordReviewCommand(
      {
        runId: "run-123",
        taskId: "task-123",
        actor: "alice-reviewer",
        review: {
          reviewerRole: "reviewer",
          state: "passed",
          severity: "low",
          findings: []
        },
        authContext: {
          provider: "github",
          subject: "alice",
          verified: true,
          displayName: "Alice"
        }
      },
      {
        adapterModulePath: path.join(directory, "devgod/review-identity-adapter.ts"),
        bindingsPath,
        adapter: async ({ authContext }) => ({
          provider: String((authContext as { provider: string }).provider),
          subject: String((authContext as { subject: string }).subject),
          verified: (authContext as { verified: boolean }).verified === true,
          displayName: String((authContext as { displayName: string }).displayName)
        }),
        async recordReview({ command, resolver }) {
          resolvedContext = await resolver({
            runId: command.runId,
            taskId: command.taskId,
            actor: command.actor,
            reviewerRole: command.review.reviewerRole,
            reviewState: command.review.state
          });

          return {
            review: {
              id: "rev-123",
              runId: command.runId,
              taskId: command.taskId,
              reviewerRole: command.review.reviewerRole,
              actor: resolvedContext.actor,
              actorRole: resolvedContext.actorRole,
              identityAssurance: "authenticated",
              state: command.review.state,
              severity: command.review.severity,
              findings: [...command.review.findings],
              waiverAuthority: resolvedContext.waiverAuthority ?? "none",
              createdAt: "2026-05-06T00:00:00.000Z"
            },
            blockers: ["qa pending"],
            task: {
              status: "review_blocked"
            }
          };
        }
      }
    );

    assert.equal(resolvedContext?.actor, "alice-reviewer");
    assert.equal(resolvedContext?.actorRole, "reviewer");
    assert.equal(resolvedContext?.waiverAuthority, "none");
    assert.equal(resolvedContext?.identityAssurance, "authenticated");
    assert.equal(result.mode, "live");
    assert.equal(result.bindingsPath, bindingsPath);
    assert.equal(result.principal.provider, "github");
    assert.equal(result.principal.subject, "alice");
    assert.equal(result.review.actorRole, "reviewer");
    assert.deepEqual(result.blockers, ["qa pending"]);
    assert.equal(result.taskStatus, "review_blocked");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("executeRecordReviewCommand rejects shipped template bindings for live review actions", async () => {
  const sourceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

  await assert.rejects(
    executeRecordReviewCommand(
      {
        runId: "run-123",
        taskId: "task-123",
        actor: "alice-reviewer",
        review: {
          reviewerRole: "reviewer",
          state: "passed",
          severity: "low",
          findings: []
        },
        authContext: {
          provider: "github",
          subject: "alice",
          verified: true
        }
      },
      {
        adapterModulePath: path.join(sourceRoot, "devgod/review-identity-adapter.ts"),
        bindingsPath: path.join(sourceRoot, ".devgod/templates/review-identity-bindings.json"),
        adapter: async () => ({
          provider: "github",
          subject: "alice",
          verified: true
        }),
        async recordReview() {
          assert.fail("recordReview should not be called when template bindings are rejected");
        }
      }
    ),
    /live reviewed bindings file/
  );
});

test("executeRecordReviewCommandFromArgs loads --input relative to cwd and resolves a live binding file", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "devgod-admin-record-review-args-"));
  const bindingsPath = path.join(directory, ".devgod/review-identity-bindings.json");
  const inputPath = path.join(directory, ".devgod/review-action.json");

  try {
    await mkdir(path.dirname(bindingsPath), { recursive: true });
    await writeFile(
      bindingsPath,
      `${JSON.stringify(
        {
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
        null,
        2
      )}\n`,
      "utf8"
    );
    await writeFile(
      inputPath,
      `${JSON.stringify(
        {
          runId: "run-123",
          taskId: "task-123",
          actor: "alice-reviewer",
          review: {
            reviewerRole: "reviewer",
            state: "passed",
            severity: "low",
            findings: []
          },
          authContext: {
            provider: "github",
            subject: "alice",
            verified: true
          }
        },
        null,
        2
      )}\n`,
      "utf8"
    );

    const result = await executeRecordReviewCommandFromArgs(["--input", ".devgod/review-action.json"], {
      cwd: directory,
      env: {
        ...process.env,
        DEVGOD_REVIEW_IDENTITY_BINDINGS: ".devgod/review-identity-bindings.json"
      },
      async createLiveAdapter() {
        return {
          modulePath: path.join(directory, "devgod/review-identity-adapter.ts"),
          adapter: async () => ({
            provider: "github",
            subject: "alice",
            verified: true
          })
        };
      },
      async recordReview({ command, resolver }) {
        const context = await resolver({
          runId: command.runId,
          taskId: command.taskId,
          actor: command.actor,
          reviewerRole: command.review.reviewerRole,
          reviewState: command.review.state
        });

        return {
          review: {
            id: "rev-args",
            runId: command.runId,
            taskId: command.taskId,
            reviewerRole: command.review.reviewerRole,
            actor: context.actor,
            actorRole: context.actorRole,
            identityAssurance: "authenticated",
            state: command.review.state,
            severity: command.review.severity,
            findings: [...command.review.findings],
            waiverAuthority: context.waiverAuthority ?? "none",
            createdAt: "2026-05-06T00:00:00.000Z"
          },
          blockers: [],
          task: {
            status: "approved"
          }
        };
      }
    });

    assert.equal(result.review.id, "rev-args");
    assert.equal(result.bindingsPath, bindingsPath);
    assert.equal(result.taskStatus, "approved");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("executeRecordReviewCommandFromArgs rejects placeholder bindings copied into a live repo", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "devgod-admin-record-review-placeholders-"));
  const sourceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

  try {
    await mkdir(path.join(directory, ".devgod"), { recursive: true });
    await writeFile(
      path.join(directory, ".devgod/review-identity-bindings.json"),
      await readFile(path.join(sourceRoot, ".devgod/templates/review-identity-bindings.json"), "utf8"),
      "utf8"
    );
    await writeFile(
      path.join(directory, ".devgod/review-action.json"),
      `${JSON.stringify(
        {
          runId: "run-123",
          taskId: "task-123",
          actor: "replace-with-review-actor",
          review: {
            reviewerRole: "reviewer",
            state: "passed",
            severity: "low",
            findings: []
          },
          authContext: {
            provider: "github",
            subject: "replace-with-authenticated-user-id",
            verified: true
          }
        },
        null,
        2
      )}\n`,
      "utf8"
    );

    await assert.rejects(
      executeRecordReviewCommandFromArgs(["--input", ".devgod/review-action.json"], {
        cwd: directory,
        env: {
          ...process.env,
          DEVGOD_REVIEW_IDENTITY_BINDINGS: ".devgod/review-identity-bindings.json"
        },
        async createLiveAdapter() {
          return {
            modulePath: path.join(directory, "devgod/review-identity-adapter.ts"),
            adapter: async () => ({
              provider: "github",
              subject: "replace-with-authenticated-user-id",
              verified: true
            })
          };
        },
        async recordReview() {
          assert.fail("recordReview should not run when placeholder bindings are rejected");
        }
      }),
      /without shipped placeholder values/
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("executeRecordReviewCommandFromArgs rejects missing input and invalid review payload shapes", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "devgod-admin-record-review-invalid-"));

  try {
    await mkdir(path.join(directory, ".devgod"), { recursive: true });

    await assert.rejects(
      executeRecordReviewCommandFromArgs([], {
        cwd: directory,
        env: process.env,
        async recordReview() {
          assert.fail("recordReview should not run without --input");
        }
      }),
      /record-review requires --input/
    );

    await writeFile(
      path.join(directory, ".devgod/review-action.json"),
      `${JSON.stringify(
        {
          runId: "run-123",
          taskId: "task-123",
          actor: "alice-reviewer",
          review: {
            reviewerRole: "not-a-role",
            state: "not-a-state",
            severity: "not-a-severity",
            findings: "not-an-array"
          }
        },
        null,
        2
      )}\n`,
      "utf8"
    );

    await assert.rejects(
      executeRecordReviewCommandFromArgs(["--input", ".devgod/review-action.json"], {
        cwd: directory,
        env: process.env,
        async recordReview() {
          assert.fail("recordReview should not run for invalid review payloads");
        }
      }),
      /review\.reviewerRole to be a required gate role/
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("executeRecordReviewCommandFromArgs rejects missing live bindings before attempting review recording", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "devgod-admin-record-review-missing-bindings-"));

  try {
    await mkdir(path.join(directory, ".devgod"), { recursive: true });
    await writeFile(
      path.join(directory, ".devgod/review-action.json"),
      `${JSON.stringify(
        {
          runId: "run-123",
          taskId: "task-123",
          actor: "alice-reviewer",
          review: {
            reviewerRole: "reviewer",
            state: "passed",
            severity: "low",
            findings: []
          }
        },
        null,
        2
      )}\n`,
      "utf8"
    );

    await assert.rejects(
      executeRecordReviewCommandFromArgs(["--input", ".devgod/review-action.json"], {
        cwd: directory,
        env: process.env,
        async recordReview() {
          assert.fail("recordReview should not run when live bindings are missing");
        }
      }),
      /DEVGOD_REVIEW_IDENTITY_BINDINGS or \.devgod\/review-identity-bindings\.json is required/
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
