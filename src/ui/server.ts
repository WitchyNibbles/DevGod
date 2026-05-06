import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import process from "node:process";
import { URL } from "node:url";
import { getOpsSurface, getReportSurface, getStatusSurface } from "../admin/runtime-surface.ts";

export interface UiRuntimeSurface {
  status(args: readonly string[]): Promise<unknown>;
  ops(args: readonly string[]): Promise<unknown>;
  report(args: readonly string[]): Promise<unknown>;
}

export interface HostedUiServerOptions {
  host?: string | undefined;
  port?: number | undefined;
  runtime?: UiRuntimeSurface | undefined;
}

function writeJson(response: ServerResponse, statusCode: number, body: unknown): void {
  response.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store"
  });
  response.end(JSON.stringify(body));
}

function writeHtml(response: ServerResponse, html: string): void {
  response.writeHead(200, {
    "content-type": "text/html; charset=utf-8",
    "cache-control": "no-store"
  });
  response.end(html);
}

function buildRunSelectorArgs(url: URL): string[] {
  const args: string[] = ["--run-id", url.searchParams.get("runId")?.trim() || "latest"];
  const workspaceSlug = url.searchParams.get("workspaceSlug")?.trim();
  const projectSlug = url.searchParams.get("projectSlug")?.trim();
  if (workspaceSlug) {
    args.push("--workspace-slug", workspaceSlug);
  }
  if (projectSlug) {
    args.push("--project-slug", projectSlug);
  }
  return args;
}

function buildDashboardHtml(): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>devgod operator</title>
  <style>
    :root {
      --bg: #f7f1e7;
      --panel: rgba(255, 255, 255, 0.86);
      --ink: #1f1d1a;
      --muted: #675f55;
      --accent: #0f766e;
      --line: rgba(31, 29, 26, 0.12);
      --shadow: 0 24px 60px rgba(73, 52, 20, 0.12);
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: "Iowan Old Style", "Palatino Linotype", "Book Antiqua", serif;
      color: var(--ink);
      background:
        radial-gradient(circle at top left, rgba(15, 118, 110, 0.14), transparent 28%),
        radial-gradient(circle at top right, rgba(180, 83, 9, 0.14), transparent 24%),
        linear-gradient(180deg, #fbf7ef 0%, var(--bg) 100%);
      min-height: 100vh;
    }
    main {
      max-width: 1160px;
      margin: 0 auto;
      padding: 32px 20px 48px;
    }
    header {
      display: grid;
      gap: 12px;
      margin-bottom: 24px;
    }
    .eyebrow {
      letter-spacing: 0.12em;
      text-transform: uppercase;
      color: var(--accent);
      font-size: 12px;
      font-weight: 700;
      font-family: "Avenir Next Condensed", "Franklin Gothic Medium", sans-serif;
    }
    h1 {
      margin: 0;
      font-size: clamp(2rem, 5vw, 4rem);
      line-height: 0.95;
      font-weight: 700;
    }
    .lede {
      max-width: 760px;
      color: var(--muted);
      font-size: 1.02rem;
      line-height: 1.5;
    }
    .controls, .grid {
      display: grid;
      gap: 16px;
    }
    .controls {
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      margin-bottom: 20px;
    }
    label {
      display: grid;
      gap: 6px;
      font-size: 0.9rem;
      color: var(--muted);
    }
    input, button {
      border: 1px solid var(--line);
      border-radius: 14px;
      padding: 12px 14px;
      font: inherit;
    }
    button {
      background: linear-gradient(135deg, var(--accent), #155e75);
      color: white;
      border: none;
      cursor: pointer;
      font-weight: 700;
      box-shadow: var(--shadow);
    }
    .grid {
      grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
    }
    .panel {
      background: var(--panel);
      border: 1px solid rgba(255, 255, 255, 0.8);
      border-radius: 22px;
      padding: 18px;
      box-shadow: var(--shadow);
      backdrop-filter: blur(12px);
    }
    .panel h2 {
      margin: 0 0 12px;
      font-size: 1.15rem;
    }
    pre {
      margin: 0;
      white-space: pre-wrap;
      word-break: break-word;
      font-size: 0.88rem;
      color: #1a202c;
    }
    .meta {
      color: var(--muted);
      font-size: 0.88rem;
      margin-bottom: 12px;
    }
  </style>
</head>
<body>
  <main>
    <header>
      <div class="eyebrow">Hosted Operator Surface</div>
      <h1>devgod operator deck</h1>
      <div class="lede">Local hosted UI over the same runtime authority used by the CLI and MCP surfaces. Runtime rows stay authoritative. Recommendations and recovery remain labeled as derived.</div>
    </header>
    <section class="controls">
      <label>Run ID
        <input id="runId" placeholder="latest" />
      </label>
      <label>Workspace Slug
        <input id="workspaceSlug" placeholder="from env if omitted" />
      </label>
      <label>Project Slug
        <input id="projectSlug" placeholder="from env if omitted" />
      </label>
      <button id="refresh" type="button">Refresh Surface</button>
    </section>
    <section class="grid">
      <article class="panel">
        <h2>Status</h2>
        <div class="meta" id="statusMeta">Loading...</div>
        <pre id="statusPanel"></pre>
      </article>
      <article class="panel">
        <h2>Ops</h2>
        <div class="meta" id="opsMeta">Loading...</div>
        <pre id="opsPanel"></pre>
      </article>
      <article class="panel">
        <h2>Report</h2>
        <div class="meta" id="reportMeta">Loading...</div>
        <pre id="reportPanel"></pre>
      </article>
    </section>
  </main>
  <script>
    const runIdInput = document.getElementById("runId");
    const workspaceInput = document.getElementById("workspaceSlug");
    const projectInput = document.getElementById("projectSlug");
    const refreshButton = document.getElementById("refresh");
    function query() {
      const params = new URLSearchParams();
      if (runIdInput.value.trim()) params.set("runId", runIdInput.value.trim());
      if (workspaceInput.value.trim()) params.set("workspaceSlug", workspaceInput.value.trim());
      if (projectInput.value.trim()) params.set("projectSlug", projectInput.value.trim());
      return params.toString();
    }
    async function loadPanel(path, panelId, metaId, metaText) {
      const response = await fetch(path + (query() ? "?" + query() : ""));
      const data = await response.json();
      document.getElementById(panelId).textContent = JSON.stringify(data, null, 2);
      document.getElementById(metaId).textContent = metaText;
    }
    async function refresh() {
      await Promise.all([
        loadPanel("/api/status", "statusPanel", "statusMeta", "Authority labels included in report."),
        loadPanel("/api/ops", "opsPanel", "opsMeta", "Routing and recovery stay derived."),
        loadPanel("/api/report", "reportPanel", "reportMeta", "Timeline and evidence across the run.")
      ]);
    }
    refreshButton.addEventListener("click", () => void refresh());
    void refresh();
  </script>
</body>
</html>`;
}

export function createHostedUiRequestHandler(
  runtime: UiRuntimeSurface = {
    status: getStatusSurface,
    ops: getOpsSurface,
    report: getReportSurface
  }
) {
  return async function handleRequest(request: IncomingMessage, response: ServerResponse): Promise<void> {
    const url = new URL(request.url ?? "/", "http://127.0.0.1");

    try {
      if (url.pathname === "/health") {
        writeJson(response, 200, { ok: true, service: "devgod-ui" });
        return;
      }

      if (url.pathname === "/api/status") {
        const args = buildRunSelectorArgs(url);
        const staleAfterDays = url.searchParams.get("staleAfterDays");
        if (staleAfterDays) {
          args.push("--stale-after-days", staleAfterDays);
        }
        writeJson(response, 200, await runtime.status(args));
        return;
      }

      if (url.pathname === "/api/ops") {
        const args = buildRunSelectorArgs(url);
        const staleAfterHours = url.searchParams.get("staleAfterHours");
        if (staleAfterHours) {
          args.push("--stale-after-hours", staleAfterHours);
        }
        writeJson(response, 200, await runtime.ops(args));
        return;
      }

      if (url.pathname === "/api/report") {
        const args = [...buildRunSelectorArgs(url), "--format", "json"];
        const staleAfterHours = url.searchParams.get("staleAfterHours");
        if (staleAfterHours) {
          args.push("--stale-after-hours", staleAfterHours);
        }
        writeJson(response, 200, await runtime.report(args));
        return;
      }

      if (url.pathname === "/") {
        writeHtml(response, buildDashboardHtml());
        return;
      }

      writeJson(response, 404, { error: "Not found" });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      writeJson(response, 500, { error: message });
    }
  };
}

export async function startHostedUiServer(options: HostedUiServerOptions = {}) {
  const host = options.host ?? process.env.DEVGOD_UI_HOST ?? "127.0.0.1";
  const portValue = options.port ?? Number.parseInt(process.env.DEVGOD_UI_PORT ?? "4318", 10);
  const port = Number.isInteger(portValue) && portValue > 0 ? portValue : 4318;
  const runtime = options.runtime ?? {
    status: getStatusSurface,
    ops: getOpsSurface,
    report: getReportSurface
  };
  const handler = createHostedUiRequestHandler(runtime);
  const server = createServer((request, response) => {
    void handler(request, response);
  });

  await new Promise<void>((resolve) => server.listen(port, host, () => resolve()));
  process.stdout.write(`devgod hosted UI listening on http://${host}:${port}\n`);
  return server;
}

if (process.argv[1] && process.argv[1].endsWith("src/ui/server.ts")) {
  startHostedUiServer().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(message);
    process.exitCode = 1;
  });
}
