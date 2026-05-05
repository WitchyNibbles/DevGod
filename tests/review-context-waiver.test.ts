import test from "node:test";
import assert from "node:assert/strict";
import { deriveWaiverContext } from "../src/core/review-context-waiver.ts";

test("deriveWaiverContext returns a single matching waiver candidate", () => {
  const context = deriveWaiverContext(
    {
      actor: "planner-1",
      roles: ["planner"],
      waiverAuthorities: ["manager"]
    },
    "qa_engineer"
  );

  assert.deepEqual(context, {
    actor: "planner-1",
    actorRole: "planner",
    waiverAuthority: "manager"
  });
});

test("deriveWaiverContext rejects actors with no allowed waiver path", () => {
  assert.throws(
    () =>
      deriveWaiverContext(
        {
          actor: "reviewer-1",
          roles: ["reviewer"],
          waiverAuthorities: ["manager"]
        },
        "security_reviewer"
      ),
    /is not allowed to waive security_reviewer/
  );
});

test("deriveWaiverContext rejects ambiguous waiver candidates", () => {
  assert.throws(
    () =>
      deriveWaiverContext(
        {
          actor: "lead-1",
          roles: ["planner", "solution_architect"],
          waiverAuthorities: ["manager"]
        },
        "qa_engineer"
      ),
    /has ambiguous waiver authority for qa_engineer/
  );
});

test("deriveWaiverContext handles missing waiver authorities as no authority", () => {
  assert.throws(
    () =>
      deriveWaiverContext(
        {
          actor: "planner-1",
          roles: ["planner"]
        },
        "qa_engineer"
      ),
    /is not allowed to waive qa_engineer/
  );
});
