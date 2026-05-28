import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { loadDevgodEnvFile, requireGrafanaConfig, resolveGrafanaConfig } from "../src/grafana/config.ts";

test("resolveGrafanaConfig accepts bearer-token auth and defaults timeout", () => {
  const result = resolveGrafanaConfig({
    DEVGOD_GRAFANA_URL: "https://grafana.example.com/",
    DEVGOD_GRAFANA_TOKEN: "secret-token",
    DEVGOD_GRAFANA_LOGS_DATASOURCE_UID: "loki-main"
  });

  assert.equal(result.configured, true);
  assert.equal(result.config?.baseUrl, "https://grafana.example.com");
  assert.equal(result.config?.authMode, "token");
  assert.equal(result.config?.authHeaderValue, "Bearer secret-token");
  assert.equal(result.config?.logsDatasourceUid, "loki-main");
  assert.equal(result.config?.timeoutMs, 15_000);
});

test("resolveGrafanaConfig accepts basic auth when token is absent", () => {
  const config = requireGrafanaConfig({
    DEVGOD_GRAFANA_URL: "https://grafana.example.com",
    DEVGOD_GRAFANA_USERNAME: "agent",
    DEVGOD_GRAFANA_PASSWORD: "hunter2",
    DEVGOD_GRAFANA_TIMEOUT_MS: "21000"
  });

  assert.equal(config.authMode, "basic");
  assert.match(config.authHeaderValue, /^Basic /);
  assert.equal(config.timeoutMs, 21_000);
});

test("resolveGrafanaConfig reports missing auth clearly", () => {
  const result = resolveGrafanaConfig({
    DEVGOD_GRAFANA_URL: "https://grafana.example.com"
  });

  assert.equal(result.configured, false);
  assert.match(result.issues.join(" "), /DEVGOD_GRAFANA_TOKEN/);
});

test("loadDevgodEnvFile loads grafana settings from .env.devgod without overwriting explicit process env", async () => {
  const cwd = await mkdtemp(path.join(tmpdir(), "devgod-grafana-env-"));
  const originalUrl = process.env.DEVGOD_GRAFANA_URL;
  const originalToken = process.env.DEVGOD_GRAFANA_TOKEN;

  try {
    await writeFile(
      path.join(cwd, ".env.devgod"),
      [
        "DEVGOD_GRAFANA_URL=https://grafana.example.com",
        "DEVGOD_GRAFANA_TOKEN=env-file-token",
        "DEVGOD_GRAFANA_LOGS_DATASOURCE_UID=loki-main",
        ""
      ].join("\n"),
      "utf8"
    );

    process.env.DEVGOD_GRAFANA_URL = "https://already-set.example.com";
    delete process.env.DEVGOD_GRAFANA_TOKEN;

    await loadDevgodEnvFile(cwd);

    assert.equal(process.env.DEVGOD_GRAFANA_URL, "https://already-set.example.com");
    assert.equal(process.env.DEVGOD_GRAFANA_TOKEN, "env-file-token");
    const envFile = await readFile(path.join(cwd, ".env.devgod"), "utf8");
    assert.match(envFile, /DEVGOD_GRAFANA_LOGS_DATASOURCE_UID=loki-main/);
  } finally {
    if (originalUrl === undefined) {
      delete process.env.DEVGOD_GRAFANA_URL;
    } else {
      process.env.DEVGOD_GRAFANA_URL = originalUrl;
    }
    if (originalToken === undefined) {
      delete process.env.DEVGOD_GRAFANA_TOKEN;
    } else {
      process.env.DEVGOD_GRAFANA_TOKEN = originalToken;
    }
    await rm(cwd, { recursive: true, force: true });
  }
});
