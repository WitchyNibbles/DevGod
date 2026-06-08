import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";

function commandAvailable(command: string): boolean {
  const result = spawnSync(command, ["--version"], {
    stdio: "ignore",
    shell: false
  });
  return result.status === 0;
}

function statusLine(ok: boolean, label: string, detail: string): string {
  return `${ok ? "ok" : "warn"}  ${label}: ${detail}`;
}

const graphifyInstalled = commandAvailable("graphify");
const codexConfigPresent = existsSync(".codex/config.toml");
const packageJsonPresent = existsSync("package.json");
const graphArtifactPresent = existsSync("graphify-out/graph.json");

const lines = [
  "Devgod Graphify Codex full-mode helper",
  "",
  "Graphify is a mandatory DevGod prerequisite. This helper keeps the default zero-key code-only shell build, but adds the required mixed code-and-docs alternative path that uses the active Codex session instead of separate Graphify API-key env vars.",
  "",
  "Local checks:",
  statusLine(graphifyInstalled, "graphify", graphifyInstalled ? "installed" : "not found on PATH"),
  statusLine(codexConfigPresent, ".codex/config.toml", codexConfigPresent ? "present" : "missing in current directory"),
  statusLine(packageJsonPresent, "package.json", packageJsonPresent ? "present" : "missing in current directory"),
  statusLine(graphArtifactPresent, "graphify-out/graph.json", graphArtifactPresent ? "already present" : "not built yet"),
  "",
  "Required flow:",
  "1. Install Graphify if needed: `uv tool install graphifyy` or `pipx install graphifyy`.",
  "2. Register Graphify with Codex once at the user level: `graphify install --platform codex`.",
  "3. Start a Codex session in this repo.",
  "4. Inside Codex, run `/graphify .` to build or refresh the mixed-corpus graph with Codex-backed model access.",
  "5. After `graphify-out/graph.json` exists, keep using the shipped Graphify MCP and `npm run devgod:status` as usual.",
  "",
  "Important:",
  "- Prefer the user-level Graphify Codex install above. Avoid `graphify install --project --platform codex` unless you intentionally want Graphify to modify repo-local `AGENTS.md` or `.codex/hooks.json` outside DevGod-managed installation paths.",
  "- DevGod's default `npm run devgod:graphify:build` remains the zero-key code-only path when a full mixed-corpus graph is unnecessary, but one of the Graphify build paths must be completed before DevGod is considered operational."
];

const output = `${lines.join("\n")}\n`;

if (!graphifyInstalled) {
  process.stderr.write(output);
  process.exitCode = 1;
} else {
  process.stdout.write(output);
}
