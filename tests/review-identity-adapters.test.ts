import test from "node:test";
import assert from "node:assert/strict";
import {
  composeReviewIdentityAdapters,
  createHeaderReviewIdentityAdapter,
  createStaticReviewIdentityAdapter
} from "../src/runtime/review-identity-adapters.ts";

test("createStaticReviewIdentityAdapter returns the configured authenticated principal", async () => {
  const adapter = createStaticReviewIdentityAdapter({
    provider: "github",
    subject: "alice",
    verified: true,
    email: "alice@example.com"
  });

  const principal = await adapter({
    runId: "run-1",
    taskId: "task-1",
    actor: "alice-reviewer",
    reviewerRole: "reviewer",
    reviewState: "passed",
    authContext: {}
  });

  assert.equal(principal.provider, "github");
  assert.equal(principal.subject, "alice");
  assert.equal(principal.email, "alice@example.com");
});

test("createHeaderReviewIdentityAdapter reads subject, verification, and groups from auth headers", async () => {
  const adapter = createHeaderReviewIdentityAdapter({
    provider: "headers",
    subjectHeader: "x-devgod-review-subject",
    verifiedHeader: "x-devgod-review-verified",
    verifiedValue: "yes",
    displayNameHeader: "x-devgod-review-name",
    emailHeader: "x-devgod-review-email",
    groupsHeader: "x-devgod-review-groups"
  });

  const principal = await adapter({
    runId: "run-1",
    taskId: "task-1",
    actor: "alice-reviewer",
    reviewerRole: "reviewer",
    reviewState: "passed",
    authContext: {
      "x-devgod-review-subject": "alice",
      "x-devgod-review-verified": "yes",
      "x-devgod-review-name": "Alice",
      "x-devgod-review-email": "alice@example.com",
      "x-devgod-review-groups": "qa,release"
    }
  });

  assert.equal(principal.verified, true);
  assert.deepEqual(principal.groups, ["qa", "release"]);
});

test("composeReviewIdentityAdapters falls through failing adapters and rejects when none verify", async () => {
  const adapter = composeReviewIdentityAdapters([
    async () => {
      throw new Error("first failed");
    },
    async () => ({
      provider: "headers",
      subject: "alice",
      verified: true
    })
  ]);

  const principal = await adapter({
    runId: "run-1",
    taskId: "task-1",
    actor: "alice-reviewer",
    reviewerRole: "reviewer",
    reviewState: "passed",
    authContext: {}
  });
  assert.equal(principal.subject, "alice");

  await assert.rejects(
    async () =>
      composeReviewIdentityAdapters([
        async () => ({
          provider: "headers",
          subject: "alice",
          verified: false
        })
      ])({
        runId: "run-1",
        taskId: "task-1",
        actor: "alice-reviewer",
        reviewerRole: "reviewer",
        reviewState: "passed",
        authContext: {}
      }),
    /No review identity adapter accepted/
  );
});
