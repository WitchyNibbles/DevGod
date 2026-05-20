import test from "node:test";
import assert from "node:assert/strict";
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { withClientUsing } from "../src/admin/db.ts";

test("withClientUsing retries once after starting repo-local postgres for local connection refusals", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "devgod-admin-db-local-retry-"));
  const stateRoot = path.join(directory, ".devgod", "state", "local-postgres");
  const dataDir = path.join(stateRoot, "data");
  const socketDir = path.join(stateRoot, "socket");
  const cacheBinDir = path.join(directory, ".devgod", "cache", "local-pg-build", "runtime", "bin");
  const markerPath = path.join(directory, "pg-ctl-marker.log");
  let connectAttempts = 0;
  let endCalls = 0;

  try {
    await mkdir(dataDir, { recursive: true });
    await mkdir(socketDir, { recursive: true });
    await mkdir(cacheBinDir, { recursive: true });
    await writeFile(
      path.join(dataDir, "postmaster.opts"),
      `${path.join(directory, ".devgod", "cache", "local-pg-build", "runtime", "bin", "postgres")} "-D" "${dataDir}" "-p" "55432" "-k" "${socketDir}" "-h" "127.0.0.1"\n`,
      "utf8"
    );
    const pgCtlPath = path.join(cacheBinDir, "pg_ctl");
    await writeFile(
      pgCtlPath,
      "#!/usr/bin/env bash\nset -euo pipefail\nprintf '%s\\n' \"$*\" >> \"${PG_CTL_MARKER:?}\"\n",
      "utf8"
    );
    await chmod(pgCtlPath, 0o755);

    const result = await withClientUsing(
      async () => "connected",
      {
        cwd: directory,
        env: {
          ...process.env,
          DEVGOD_CORE_DATABASE_URL: "postgres://devgod:secret@127.0.0.1:55432/devgod",
          PG_CTL_MARKER: markerPath
        },
        async createClient() {
          return {
            async connect() {
              connectAttempts += 1;
              if (connectAttempts === 1) {
                const error = new Error("connect ECONNREFUSED 127.0.0.1:55432");
                Object.assign(error, { code: "ECONNREFUSED" });
                throw error;
              }
            },
            async end() {
              endCalls += 1;
            }
          };
        }
      }
    );

    assert.equal(result, "connected");
    assert.equal(connectAttempts, 2);
    assert.equal(endCalls, 2);
    const marker = await readFile(markerPath, "utf8");
    assert.match(marker, /-D .*\.devgod\/state\/local-postgres\/data/);
    assert.match(marker, /-p 55432/);
    assert.match(marker, /-k .*\.devgod\/state\/local-postgres\/socket/);
    assert.match(marker, /start/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("withClientUsing does not try to start repo-local postgres for non-loopback database targets", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "devgod-admin-db-remote-no-retry-"));
  const markerPath = path.join(directory, "pg-ctl-marker.log");
  let connectAttempts = 0;
  let endCalls = 0;

  try {
    await assert.rejects(
      withClientUsing(
        async () => "unreachable",
        {
          cwd: directory,
          env: {
            ...process.env,
            DEVGOD_CORE_DATABASE_URL: "postgres://devgod:secret@192.0.2.10:55432/devgod",
            PG_CTL_MARKER: markerPath
          },
          async createClient() {
            return {
              async connect() {
                connectAttempts += 1;
                const error = new Error("connect ECONNREFUSED 192.0.2.10:55432");
                Object.assign(error, { code: "ECONNREFUSED" });
                throw error;
              },
              async end() {
                endCalls += 1;
              }
            };
          }
        }
      ),
      /ECONNREFUSED/
    );

    assert.equal(connectAttempts, 1);
    assert.equal(endCalls, 1);
    await assert.rejects(readFile(markerPath, "utf8"));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
