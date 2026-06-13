import test from "node:test";
import assert from "node:assert/strict";
import { assessFreshness, runWithFreshnessGate } from "../src/runtime/freshness-gate.ts";

test("assessFreshness returns fresh for recent timestamps", () => {
  const result = assessFreshness(
    {
      createdAt: "2026-05-03T00:00:00.000Z",
      maxAgeDays: 3
    },
    "2026-05-04T00:00:00.000Z"
  );

  assert.equal(result.status, "fresh");
  assert.equal(result.ageDays, 1);
});

test("assessFreshness returns stale for old timestamps", () => {
  const result = assessFreshness(
    {
      createdAt: "2026-05-01T00:00:00.000Z",
      maxAgeDays: 1
    },
    "2026-05-04T00:00:00.000Z"
  );

  assert.equal(result.status, "stale");
  assert.equal(result.ageDays, 3);
});

test("assessFreshness returns explicit result for missing timestamps", () => {
  const result = assessFreshness(
    {
      maxAgeDays: 3
    },
    "2026-05-04T00:00:00.000Z"
  );

  assert.equal(result.status, "missing_timestamp");
  assert.equal(result.ageDays, undefined);
});

test("assessFreshness returns explicit result for invalid timestamps", () => {
  const result = assessFreshness(
    {
      createdAt: "not-a-date",
      maxAgeDays: 3
    },
    "2026-05-04T00:00:00.000Z"
  );

  assert.equal(result.status, "invalid_timestamp");
  assert.equal(result.createdAt, "not-a-date");
});

test("assessFreshness returns fresh when age equals the max age boundary", () => {
  const result = assessFreshness(
    {
      createdAt: "2026-05-01T00:00:00.000Z",
      maxAgeDays: 3
    },
    "2026-05-04T00:00:00.000Z"
  );

  assert.equal(result.status, "fresh");
  assert.equal(result.ageDays, 3);
});

test("assessFreshness returns explicit result for future timestamps", () => {
  const result = assessFreshness(
    {
      createdAt: "2026-05-05T00:00:00.000Z",
      maxAgeDays: 3
    },
    "2026-05-04T00:00:00.000Z"
  );

  assert.equal(result.status, "future_timestamp");
  assert.equal(result.createdAt, "2026-05-05T00:00:00.000Z");
});

test("assessFreshness returns explicit result for invalid max age", () => {
  const result = assessFreshness(
    {
      createdAt: "2026-05-03T00:00:00.000Z",
      maxAgeDays: Number.POSITIVE_INFINITY
    },
    "2026-05-04T00:00:00.000Z"
  );

  assert.equal(result.status, "invalid_max_age");
  assert.equal(result.maxAgeDays, Number.POSITIVE_INFINITY);
});

test("assessFreshness returns explicit result for invalid current time", () => {
  const result = assessFreshness(
    {
      createdAt: "2026-05-03T00:00:00.000Z",
      maxAgeDays: 3
    },
    "not-a-date"
  );

  assert.equal(result.status, "invalid_timestamp");
  assert.equal(result.createdAt, "2026-05-03T00:00:00.000Z");
});

test("runWithFreshnessGate blocks stale inputs before downstream execution", async () => {
  let invoked = false;

  const result = await runWithFreshnessGate(
    {
      createdAt: "2026-05-01T00:00:00.000Z",
      maxAgeDays: 1
    },
    async () => {
      invoked = true;
      return "should-not-run";
    },
    "2026-05-04T00:00:00.000Z"
  );

  assert.equal(invoked, false);
  assert.equal(result.invoked, false);
  assert.equal(result.gate.status, "stale");
});

test("runWithFreshnessGate blocks missing timestamps before downstream execution", async () => {
  let invoked = false;

  const result = await runWithFreshnessGate(
    {
      maxAgeDays: 1
    },
    async () => {
      invoked = true;
      return "should-not-run";
    },
    "2026-05-04T00:00:00.000Z"
  );

  assert.equal(invoked, false);
  assert.equal(result.invoked, false);
  assert.equal(result.gate.status, "missing_timestamp");
});

test("runWithFreshnessGate blocks invalid timestamps before downstream execution", async () => {
  let invoked = false;

  const result = await runWithFreshnessGate(
    {
      createdAt: "not-a-date",
      maxAgeDays: 1
    },
    async () => {
      invoked = true;
      return "should-not-run";
    },
    "2026-05-04T00:00:00.000Z"
  );

  assert.equal(invoked, false);
  assert.equal(result.invoked, false);
  assert.equal(result.gate.status, "invalid_timestamp");
});

test("runWithFreshnessGate blocks future timestamps before downstream execution", async () => {
  let invoked = false;

  const result = await runWithFreshnessGate(
    {
      createdAt: "2026-05-05T00:00:00.000Z",
      maxAgeDays: 1
    },
    async () => {
      invoked = true;
      return "should-not-run";
    },
    "2026-05-04T00:00:00.000Z"
  );

  assert.equal(invoked, false);
  assert.equal(result.invoked, false);
  assert.equal(result.gate.status, "future_timestamp");
});

test("runWithFreshnessGate blocks invalid max age before downstream execution", async () => {
  let invoked = false;

  const result = await runWithFreshnessGate(
    {
      createdAt: "2026-05-03T00:00:00.000Z",
      maxAgeDays: Number.NaN
    },
    async () => {
      invoked = true;
      return "should-not-run";
    },
    "2026-05-04T00:00:00.000Z"
  );

  assert.equal(invoked, false);
  assert.equal(result.invoked, false);
  assert.equal(result.gate.status, "invalid_max_age");
});

test("runWithFreshnessGate allows fresh inputs through", async () => {
  const result = await runWithFreshnessGate(
    {
      createdAt: "2026-05-03T00:00:00.000Z",
      maxAgeDays: 3
    },
    async () => "ok",
    "2026-05-04T00:00:00.000Z"
  );

  assert.equal(result.invoked, true);
  if (result.invoked) {
    assert.equal(result.value, "ok");
  }
  assert.equal(result.gate.status, "fresh");
});
