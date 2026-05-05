import test from "node:test";
import assert from "node:assert/strict";

test("install types module loads as a shipped runtime module", async () => {
  const module = await import("../src/install/types.ts");

  assert.equal(typeof module, "object");
});

test("store types module loads as a shipped runtime module", async () => {
  const module = await import("../src/store/types.ts");

  assert.equal(typeof module, "object");
});
