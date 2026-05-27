import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

export const grafanaEnvKeys = [
  "DEVGOD_GRAFANA_URL",
  "DEVGOD_GRAFANA_TOKEN",
  "DEVGOD_GRAFANA_USERNAME",
  "DEVGOD_GRAFANA_PASSWORD",
  "DEVGOD_GRAFANA_ORG_ID",
  "DEVGOD_GRAFANA_LOGS_DATASOURCE_UID",
  "DEVGOD_GRAFANA_LOKI_TENANT_ID",
  "DEVGOD_GRAFANA_TIMEOUT_MS"
] as const;

export interface GrafanaConfig {
  baseUrl: string;
  authMode: "basic" | "token";
  authHeaderValue: string;
  orgId?: string | undefined;
  logsDatasourceUid?: string | undefined;
  lokiTenantId?: string | undefined;
  timeoutMs: number;
}

export interface GrafanaConfigResolution {
  configured: boolean;
  config?: GrafanaConfig | undefined;
  issues: string[];
}

function isSafeDevgodEnvKey(candidate: string): boolean {
  return /^DEVGOD_[A-Z0-9_]+$/.test(candidate);
}

function parseDevgodEnvContent(content: string): NodeJS.ProcessEnv {
  const parsed: NodeJS.ProcessEnv = {};

  for (const rawLine of content.split(/\r?\n/)) {
    if (!rawLine.trim() || rawLine.trimStart().startsWith("#")) {
      continue;
    }

    const match = rawLine.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=(.*)$/);
    if (!match) {
      continue;
    }

    const key = match[1] ?? "";
    if (!isSafeDevgodEnvKey(key)) {
      continue;
    }

    const rawValue = (match[2] ?? "").trim();
    if (rawValue.startsWith('"')) {
      const quotedMatch = rawValue.match(/^"((?:\\.|[^"])*)"(?:\s+#.*)?$/);
      if (quotedMatch) {
        parsed[key] = quotedMatch[1]
          ?.replace(/\\\\/g, "\\")
          .replace(/\\"/g, '"')
          .replace(/\\n/g, "\n")
          .replace(/\\r/g, "\r")
          .replace(/\\t/g, "\t")
          .replace(/\\\$/g, "$");
        continue;
      }
    }

    if (rawValue.startsWith("'")) {
      const quotedMatch = rawValue.match(/^'([^']*)'(?:\s+#.*)?$/);
      if (quotedMatch) {
        parsed[key] = quotedMatch[1] ?? "";
        continue;
      }
    }

    parsed[key] = rawValue.replace(/\s+#.*$/, "").trimEnd();
  }

  return parsed;
}

export async function loadDevgodEnvFile(cwd = process.cwd()): Promise<void> {
  const envPath = path.join(cwd, ".env.devgod");

  try {
    const content = await readFile(envPath, "utf8");
    const parsed = parseDevgodEnvContent(content);

    for (const key of grafanaEnvKeys) {
      const value = parsed[key];
      if (typeof value === "string" && process.env[key] === undefined) {
        process.env[key] = value;
      }
    }
  } catch (error: unknown) {
    const code = error instanceof Error && "code" in error ? String(error.code) : "";
    if (code !== "ENOENT") {
      throw error;
    }
  }
}

function trimEnv(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function parseTimeout(candidate: string | undefined): number {
  const trimmed = trimEnv(candidate);
  if (!trimmed) {
    return 15_000;
  }

  const parsed = Number.parseInt(trimmed, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 15_000;
  }

  return parsed;
}

export function resolveGrafanaConfig(env: NodeJS.ProcessEnv = process.env): GrafanaConfigResolution {
  const issues: string[] = [];
  const baseUrlValue = trimEnv(env.DEVGOD_GRAFANA_URL);

  if (!baseUrlValue) {
    return {
      configured: false,
      issues: ["missing DEVGOD_GRAFANA_URL"]
    };
  }

  let baseUrl: URL;
  try {
    baseUrl = new URL(baseUrlValue);
  } catch {
    return {
      configured: false,
      issues: [`invalid DEVGOD_GRAFANA_URL: ${baseUrlValue}`]
    };
  }

  const token = trimEnv(env.DEVGOD_GRAFANA_TOKEN);
  const username = trimEnv(env.DEVGOD_GRAFANA_USERNAME);
  const password = trimEnv(env.DEVGOD_GRAFANA_PASSWORD);

  let authMode: GrafanaConfig["authMode"] | undefined;
  let authHeaderValue: string | undefined;
  if (token) {
    authMode = "token";
    authHeaderValue = `Bearer ${token}`;
  } else if (username && password) {
    authMode = "basic";
    authHeaderValue = `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`;
  } else {
    issues.push(
      "set DEVGOD_GRAFANA_TOKEN or both DEVGOD_GRAFANA_USERNAME and DEVGOD_GRAFANA_PASSWORD"
    );
  }

  if (!authMode || !authHeaderValue) {
    return {
      configured: false,
      issues
    };
  }

  return {
    configured: true,
    config: {
      baseUrl: baseUrl.toString().replace(/\/+$/, ""),
      authMode,
      authHeaderValue,
      orgId: trimEnv(env.DEVGOD_GRAFANA_ORG_ID),
      logsDatasourceUid: trimEnv(env.DEVGOD_GRAFANA_LOGS_DATASOURCE_UID),
      lokiTenantId: trimEnv(env.DEVGOD_GRAFANA_LOKI_TENANT_ID),
      timeoutMs: parseTimeout(env.DEVGOD_GRAFANA_TIMEOUT_MS)
    },
    issues: []
  };
}

export function requireGrafanaConfig(env: NodeJS.ProcessEnv = process.env): GrafanaConfig {
  const resolution = resolveGrafanaConfig(env);
  if (!resolution.configured || !resolution.config) {
    throw new Error(`Grafana integration is not configured: ${resolution.issues.join("; ")}`);
  }

  return resolution.config;
}
