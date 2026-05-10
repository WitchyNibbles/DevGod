import { isIP } from "node:net";
import os from "node:os";
import path from "node:path";

export interface RuntimeEnvironmentConfig {
  runtimeProfile: string;
  dataRoot: string;
  qdrantUrl: string;
  qdrantCollection: string;
  installManifestPath: string;
}

function isLoopbackHostname(hostname: string): boolean {
  const normalized = hostname.trim().toLowerCase();
  if (normalized === "localhost" || normalized === "::1") {
    return true;
  }

  const ipVersion = isIP(normalized);
  return ipVersion === 4 ? normalized.startsWith("127.") : false;
}

function shouldRestrictQdrantToLoopback(runtimeProfile: string): boolean {
  return runtimeProfile.trim().toLowerCase().startsWith("local");
}

export function validateRuntimeQdrantUrl(candidate: string, runtimeProfile: string): string {
  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    throw new Error(`invalid Qdrant URL: ${candidate}`);
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error(`Qdrant URL must use http or https: ${candidate}`);
  }

  if (parsed.username || parsed.password) {
    throw new Error("Qdrant URL must not embed credentials");
  }

  if (shouldRestrictQdrantToLoopback(runtimeProfile) && !isLoopbackHostname(parsed.hostname)) {
    throw new Error(
      `local runtime profiles require a loopback Qdrant URL host; received ${parsed.hostname}`
    );
  }

  return parsed.toString();
}

export function resolveQdrantCollectionsUrl(baseUrl: string): URL {
  const parsed = new URL(baseUrl);
  const normalizedBase = new URL(parsed.toString());
  if (!normalizedBase.pathname.endsWith("/")) {
    normalizedBase.pathname = `${normalizedBase.pathname}/`;
  }
  return new URL("collections", normalizedBase);
}

function defaultRuntimeDataRoot(projectSlug: string): string {
  if (process.platform === "darwin") {
    return path.join(os.homedir(), "Library", "Application Support", "devgod", projectSlug);
  }

  if (process.platform === "win32") {
    const localAppData = process.env.LOCALAPPDATA ?? path.join(os.homedir(), "AppData", "Local");
    return path.join(localAppData, "devgod", projectSlug);
  }

  return path.join(os.homedir(), ".local", "share", "devgod", projectSlug);
}

export function resolveRuntimeEnvironmentConfig(
  env: NodeJS.ProcessEnv,
  options: {
    projectSlug: string;
    cwd?: string | undefined;
  }
): RuntimeEnvironmentConfig {
  const runtimeProfile = env.DEVGOD_RUNTIME_PROFILE?.trim() || "local-docker";
  const qdrantPort = env.DEVGOD_QDRANT_PORT?.trim() || "6333";
  const dataRoot = env.DEVGOD_RUNTIME_DATA_ROOT?.trim() || defaultRuntimeDataRoot(options.projectSlug);
  const qdrantUrl = validateRuntimeQdrantUrl(
    env.DEVGOD_QDRANT_URL?.trim() || `http://127.0.0.1:${qdrantPort}`,
    runtimeProfile
  );

  return {
    runtimeProfile,
    dataRoot: path.resolve(options.cwd ?? process.cwd(), dataRoot),
    qdrantUrl,
    qdrantCollection: env.DEVGOD_QDRANT_COLLECTION?.trim() || "devgod-memory",
    installManifestPath:
      env.DEVGOD_INSTALL_MANIFEST_PATH?.trim() ||
      path.join(options.cwd ?? process.cwd(), ".devgod", "install-manifest.json")
  };
}
