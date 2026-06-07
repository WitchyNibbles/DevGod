import test from "node:test";
import assert from "node:assert/strict";
import { resolveRuntimeEnvironmentConfig } from "../src/runtime/config.ts";

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
});

test("resolveRuntimeEnvironmentConfig honors explicit runtime modes", () => {
  const nativeConfig = resolveRuntimeEnvironmentConfig(
    {
      DEVGOD_RUNTIME_MODE: "native"
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
      DEVGOD_RUNTIME_MODE: "managed"
    },
    {
      projectSlug: "devgod",
      cwd: "/repo/devgod"
    }
  );
  assert.equal(managedConfig.runtimeMode, "managed");
  assert.equal(managedConfig.runtimeProfile, "managed");
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
