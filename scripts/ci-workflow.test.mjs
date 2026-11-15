import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const source = await readFile(new URL(".github/workflows/ci.yml", root), "utf8");
// Bun is already required by Chatworks' development/CI tooling. Its YAML parser
// validates the real workflow without adding a transitive parser dependency.
const parsed = spawnSync(
  "bun",
  [
    "--no-env-file",
    "-e",
    "process.stdout.write(JSON.stringify(Bun.YAML.parse(await Bun.stdin.text())))",
  ],
  { input: source, encoding: "utf8", timeout: 10_000 },
);
if (parsed.error) throw parsed.error;
assert.equal(parsed.status, 0, parsed.stderr);
const workflow = JSON.parse(parsed.stdout);
const producer = workflow.jobs.repokit;
const consumer = workflow.jobs.check;
const step = (job, id) => {
  const matches = job.steps.filter((entry) => entry.id === id);
  assert.equal(matches.length, 1, `Expected one ${id} step`);
  return matches[0];
};
const ordered = (job, ids) => {
  const positions = ids.map((id) => {
    step(job, id);
    return job.steps.findIndex((entry) => entry.id === id);
  });
  assert.deepEqual(
    positions,
    [...positions].sort((a, b) => a - b),
  );
};

test("CI selects an immutable public Repokit producer with read-only permissions", () => {
  assert.deepEqual(workflow.permissions, { contents: "read" });
  assert.equal(workflow.on.pull_request_target, undefined);
  assert(Object.hasOwn(workflow.on, "pull_request"));
  assert(Object.hasOwn(workflow.on, "workflow_dispatch"));
  assert.equal(workflow.env.REPOKIT_REPOSITORY, "pders01/repokit");
  assert.match(workflow.env.REPOKIT_REVISION, /^[a-f0-9]{40}$/);
  const checkout = step(producer, "checkout-repokit");
  assert.equal(checkout.uses, "actions/checkout@v4");
  assert.equal(checkout.with.repository, "${{ env.REPOKIT_REPOSITORY }}");
  assert.equal(checkout.with.ref, "${{ env.REPOKIT_REVISION }}");
  assert.equal(checkout.with["persist-credentials"], false);
  assert.equal(step(producer, "verify-repokit").run, "npm run verify");
  ordered(producer, ["checkout-repokit", "verify-repokit", "pack-repokit", "upload-repokit"]);
});

test("CI hands off all compiled tarballs within the current run, not source checkouts", () => {
  assert.equal(consumer.needs, "repokit");
  assert.match(
    step(producer, "pack-repokit").run,
    /npm pack --workspaces --ignore-scripts --offline --pack-destination "\$RUNNER_TEMP\/repokit-artifacts"/,
  );
  const upload = step(producer, "upload-repokit");
  const download = step(consumer, "download-repokit");
  assert.equal(upload.uses, "actions/upload-artifact@v4");
  assert.equal(download.uses, "actions/download-artifact@v4");
  assert.equal(upload.with.name, "repokit-${{ env.REPOKIT_REVISION }}");
  assert.equal(download.with.name, upload.with.name);
  assert.equal(upload.with.path, "${{ runner.temp }}/repokit-artifacts/*.tgz");
  assert.equal(upload.with["if-no-files-found"], "error");
  assert.equal(download.with.path, "${{ runner.temp }}/repokit-artifacts");
  assert.equal(download.with["run-id"], undefined, "Do not select another run's bundle");
  assert.equal(download.with.repository, undefined);
  assert.equal(
    step(consumer, "stage-repokit").run,
    'npm run dev:artifacts -- "$RUNNER_TEMP/repokit-artifacts"',
  );
  assert.equal(
    step(consumer, "packed").run,
    'npm run test:package -- "$RUNNER_TEMP/repokit-artifacts"',
  );
  assert.equal(
    consumer.steps.filter((entry) => entry.uses?.startsWith("actions/checkout@")).length,
    1,
  );
});

test("CI stages dependencies and builds public exports before checking stories", () => {
  assert.equal(
    step(consumer, "install").run,
    "bun install --frozen-lockfile --ignore-scripts --no-env-file",
  );
  assert.equal(step(consumer, "build").run, "npm run build");
  assert.equal(step(consumer, "typecheck").run, "npm run check");
  ordered(consumer, [
    "install",
    "download-repokit",
    "stage-repokit",
    "build",
    "typecheck",
    "packed",
  ]);
  for (const job of Object.values(workflow.jobs)) {
    const node = job.steps.find((entry) => entry.uses === "actions/setup-node@v4");
    assert.equal(node?.with["node-version"], "${{ env.NODE_VERSION }}");
    for (const entry of job.steps) assert(!entry["continue-on-error"]);
    for (const entry of job.steps.filter((entry) => entry.uses?.startsWith("actions/cache@"))) {
      assert.doesNotMatch(entry.with.path, /(?:^|\n)\s*(?:node_modules|dist)(?:\/|\s|$)/);
    }
  }
});

test("CI retains the full public-consumer, unit, browser, lint and formatting gates", async () => {
  const manifest = JSON.parse(await readFile(new URL("package.json", root), "utf8"));
  const commands = {
    tooling: "npm run test:tooling",
    unit: "npm test",
    lint: "npm run lint",
    format: "npm run fmt:check",
    "storybook-build": "npm run storybook:build",
    "annotations-test": "npm run test:source-annotations",
    "commits-test": "npm run test:commits-reader",
    "repository-ui-test": "npm run test:repository-ui",
    "storybook-test": "npm run test:storybook",
  };
  for (const [id, command] of Object.entries(commands))
    assert.equal(step(consumer, id).run, command);
  ordered(consumer, [
    "chromium",
    "annotations-test",
    "commits-test",
    "repository-ui-test",
    "storybook-test",
  ]);
  for (const entry of consumer.steps) {
    for (const [, script] of (entry.run ?? "").matchAll(/\bnpm run ([\w:.-]+)/g)) {
      assert(Object.hasOwn(manifest.scripts, script), `Unknown package script: ${script}`);
    }
  }
  assert.doesNotMatch(source, /test-packed-package\.ts|pull_request_target/);
});
