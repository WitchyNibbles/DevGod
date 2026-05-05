import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath, pathToFileURL } from "node:url";

const execFileAsync = promisify(execFile);

test("verify-review-identity command validates adapter, bindings, and fixtures", async () => {
  const sourceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const directory = await mkdtemp(path.join(tmpdir(), "devgod-admin-review-identity-"));
  const adminPath = path.join(sourceRoot, "src/admin.ts");
  const adapterImportUrl = pathToFileURL(path.join(sourceRoot, "src/index.ts")).href;

  const adapterModule = `import { createReviewPrincipalAdapter } from ${JSON.stringify(adapterImportUrl)};

export default createReviewPrincipalAdapter(async ({ authContext }) => ({
  provider: String(authContext.provider),
  subject: String(authContext.subject),
  verified: authContext.verified === true
}));
`;

  const bindings = {
    bindings: [
      {
        principal: {
          provider: "github",
          subject: "alice"
        },
        actors: [
          {
            actor: "alice-reviewer",
            roles: ["reviewer"]
          }
        ]
      }
    ]
  };

  const fixtures = {
    fixtures: [
      {
        name: "allow reviewer principal",
        authContext: {
          provider: "github",
          subject: "alice",
          verified: true
        },
        review: {
          actor: "alice-reviewer",
          reviewerRole: "reviewer",
          reviewState: "passed"
        },
        expect: {
          outcome: "allow",
          principal: {
            provider: "github",
            subject: "alice",
            verified: true
          },
          context: {
            actor: "alice-reviewer",
            actorRole: "reviewer",
            waiverAuthority: "none"
          }
        }
      },
      {
        name: "deny unverified principal",
        authContext: {
          provider: "github",
          subject: "alice",
          verified: false
        },
        review: {
          actor: "alice-reviewer",
          reviewerRole: "reviewer",
          reviewState: "passed"
        },
        expect: {
          outcome: "deny",
          errorIncludes: ["not verified"]
        }
      }
    ]
  };

  try {
    await writeFile(path.join(directory, "review-identity-adapter.ts"), adapterModule, "utf8");
    await writeFile(
      path.join(directory, "review-identity-bindings.json"),
      `${JSON.stringify(bindings, null, 2)}\n`,
      "utf8"
    );
    await writeFile(
      path.join(directory, "review-identity-adapter.fixture.json"),
      `${JSON.stringify(fixtures, null, 2)}\n`,
      "utf8"
    );

    const { stdout } = await execFileAsync(
      "node",
      ["--experimental-strip-types", adminPath, "verify-review-identity"],
      {
        cwd: directory,
        env: {
          ...process.env,
          DEVGOD_REVIEW_IDENTITY_ADAPTER_MODULE: "./review-identity-adapter.ts",
          DEVGOD_REVIEW_IDENTITY_BINDINGS: "./review-identity-bindings.json",
          DEVGOD_REVIEW_IDENTITY_FIXTURES: "./review-identity-adapter.fixture.json"
        }
      }
    );

    const result = JSON.parse(stdout) as {
      passed: number;
      failed: number;
    };

    assert.equal(result.passed, 2);
    assert.equal(result.failed, 0);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("verify-review-identity command uses repo template defaults when no env adapter is configured", async () => {
  const sourceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const adminPath = path.join(sourceRoot, "src/admin.ts");
  const env = { ...process.env };

  delete env.DEVGOD_REVIEW_IDENTITY_ADAPTER_MODULE;
  delete env.DEVGOD_REVIEW_IDENTITY_BINDINGS;
  delete env.DEVGOD_REVIEW_IDENTITY_FIXTURES;

  const { stdout } = await execFileAsync(
    "node",
    ["--experimental-strip-types", adminPath, "verify-review-identity"],
    {
      cwd: sourceRoot,
      env
    }
  );

  const result = JSON.parse(stdout) as {
    passed: number;
    failed: number;
  };

  assert.equal(result.passed, 2);
  assert.equal(result.failed, 0);
});
