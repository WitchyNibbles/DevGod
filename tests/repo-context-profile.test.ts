import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { executeRefreshRepoContextCommandFromArgs } from "../src/admin.ts";
import { probeRepoContextProfile } from "../src/runtime/repo-context-profile.ts";
import { MemoryStore } from "../src/store/memory-store.ts";

test("probeRepoContextProfile captures virtualenv path, manage.py path, Django DB selector, and common commands", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "devgod-repo-context-"));
  await mkdir(path.join(directory, ".venv"), { recursive: true });
  await writeFile(path.join(directory, ".venv", "pyvenv.cfg"), "home = /usr/bin/python3\n", "utf8");
  await writeFile(path.join(directory, "manage.py"), "print('manage')\n", "utf8");
  await writeFile(
    path.join(directory, "settings.py"),
    [
      "import os",
      "DB_TARGET = os.getenv('DJANGO_DB_ENV', 'dev')",
      "DATABASES = {'default': {}}"
    ].join("\n"),
    "utf8"
  );
  await writeFile(
    path.join(directory, "package.json"),
    JSON.stringify(
      {
        scripts: {
          test: "pytest",
          lint: "ruff check ."
        }
      },
      null,
      2
    ),
    "utf8"
  );

  const profile = await probeRepoContextProfile({
    repoRoot: directory,
    now: "2026-05-28T00:00:00.000Z"
  });

  assert.equal(profile.status, "ready");
  assert.equal(profile.slots["python.virtualenvPath"]?.value, ".venv");
  assert.equal(profile.slots["django.managePyPath"]?.value, "manage.py");
  assert.equal(profile.slots["django.dbEnvSelectorVariable"]?.value, "DJANGO_DB_ENV");
  assert.equal(profile.slots["commands.test"]?.value, "pytest");
  assert.equal(profile.slots["commands.lint"]?.value, "ruff check .");
});

test("executeRefreshRepoContextCommandFromArgs stores the repo context profile in runtime registration metadata", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "devgod-refresh-repo-context-"));
  const store = new MemoryStore();

  await mkdir(path.join(directory, ".venv"), { recursive: true });
  await writeFile(path.join(directory, ".venv", "pyvenv.cfg"), "home = /usr/bin/python3\n", "utf8");
  await writeFile(path.join(directory, "manage.py"), "print('manage')\n", "utf8");

  const context = await store.ensureProjectContext({
    workspaceSlug: "team",
    projectSlug: "devgod",
    repoPath: directory
  });
  await store.saveProjectRuntimeRegistration({
    projectId: context.project.id,
    workspaceId: context.workspace.id,
    repoPath: directory,
    runtimeProfile: "local-docker",
    dataRoot: path.join(directory, "runtime-root"),
    installManifestPath: ".devgod/install-manifest.json",
    manifest: {},
    provenance: { authority: "runtime_authoritative" },
    createdAt: "2026-05-15T00:00:00.000Z",
    updatedAt: "2026-05-15T00:00:00.000Z"
  });

  const result = await executeRefreshRepoContextCommandFromArgs({
    cwd: directory,
    env: {
      DEVGOD_WORKSPACE_SLUG: "team",
      DEVGOD_PROJECT_SLUG: "devgod",
      DEVGOD_PROJECT_NAME: "Devgod"
    },
    withClient: async (callback) => callback({ kind: "client" } as never),
    createStore() {
      return store as never;
    },
    now() {
      return new Date("2026-05-28T12:00:00.000Z");
    }
  });

  assert.equal(result.slotCount > 0, true);
  const registration = await store.getProjectRuntimeRegistration(context.project.id);
  const profile = registration?.manifest.repoContextProfile as
    | { slots?: Record<string, { value?: unknown }> }
    | undefined;
  assert.equal(profile?.slots?.["python.virtualenvPath"]?.value, ".venv");
  assert.equal(profile?.slots?.["django.managePyPath"]?.value, "manage.py");
});
