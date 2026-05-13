import test from "node:test";
import assert from "node:assert/strict";
import { resolveRuntimeEnvironmentConfig, validateRuntimeQdrantUrl } from "../src/runtime/config.ts";

test("resolveRuntimeEnvironmentConfig defaults to docker mode for local runtime", () => {
  const config = resolveRuntimeEnvironmentConfig(
    {
      DEVGOD_PROJECT_SLUG: "devgod"
    },
    {
      projectSlug: "devgod",
      cwd: "/repo/devgod"
    }
  );

  assert.equal(config.runtimeMode, "docker");
  assert.equal(config.runtimeProfile, "local-docker");
  assert.equal(config.qdrantUrl, "http://127.0.0.1:6333/");
});

test("resolveRuntimeEnvironmentConfig honors explicit runtime modes", () => {
  const nativeConfig = resolveRuntimeEnvironmentConfig(
    {
      DEVGOD_RUNTIME_MODE: "native",
      DEVGOD_QDRANT_URL: "http://127.0.0.1:7333"
    },
    {
      projectSlug: "devgod",
      cwd: "/repo/devgod"
    }
  );
  assert.equal(nativeConfig.runtimeMode, "native");
  assert.equal(nativeConfig.runtimeProfile, "local-native");

  const managedConfig = resolveRuntimeEnvironmentConfig(
    {
      DEVGOD_RUNTIME_MODE: "managed",
      DEVGOD_QDRANT_URL: "https://qdrant.example.com"
    },
    {
      projectSlug: "devgod",
      cwd: "/repo/devgod"
    }
  );
  assert.equal(managedConfig.runtimeMode, "managed");
  assert.equal(managedConfig.runtimeProfile, "managed");
  assert.equal(managedConfig.qdrantUrl, "https://qdrant.example.com/");
});

test("resolveRuntimeEnvironmentConfig derives runtime mode from profile when mode is omitted", () => {
  const config = resolveRuntimeEnvironmentConfig(
    {
      DEVGOD_RUNTIME_PROFILE: "local-native"
    },
    {
      projectSlug: "devgod",
      cwd: "/repo/devgod"
    }
  );

  assert.equal(config.runtimeMode, "native");
  assert.equal(config.runtimeProfile, "local-native");
});

test("validateRuntimeQdrantUrl rejects remote hosts for local runtime profiles but allows managed runtimes", () => {
  assert.throws(
    () => validateRuntimeQdrantUrl("https://qdrant.example.com", "local-native"),
    /local runtime profiles require a loopback Qdrant URL host/
  );

  assert.equal(
    validateRuntimeQdrantUrl("https://qdrant.example.com", "managed"),
    "https://qdrant.example.com/"
  );
});
