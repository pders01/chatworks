// SPDX-License-Identifier: MIT
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { expectedArtifacts } from "./lib/artifacts.mjs";

const root = new URL("../", import.meta.url);

test("package metadata has versioned peers, not filesystem dependencies or layout overrides", async () => {
  const manifest = JSON.parse(await readFile(new URL("package.json", root), "utf8"));
  assert.equal(manifest.overrides, undefined);
  for (const field of [
    "dependencies",
    "devDependencies",
    "peerDependencies",
    "optionalDependencies",
  ]) {
    for (const [name, version] of Object.entries(manifest[field] ?? {})) {
      assert.equal(typeof version, "string");
      assert.doesNotMatch(version, /(?:file|link|workspace|portal|patch):|^(?:[./\\]|[a-z]:)/i);
      if (Object.hasOwn(expectedArtifacts, name)) {
        assert.equal(
          field,
          "peerDependencies",
          "Unpublished packages must not become registry-resolved development dependencies",
        );
        assert.equal(version, expectedArtifacts[name]);
        assert.equal(
          manifest.peerDependenciesMeta[name]?.optional,
          true,
          "Install unrelated entries without attempting unpublished peers",
        );
      }
    }
  }
  for (const name of [
    "@jpahd/git-chat-protocol",
    "@jpahd/commits-core",
    "@jpahd/source-annotations",
  ]) {
    assert.equal(manifest.peerDependencies[name], expectedArtifacts[name]);
  }
});

test("third-party lockfile contains no private artifact resolutions or filesystem locators", async () => {
  const bytes = await readFile(new URL("bun.lock", root), "utf8");
  // This project's text lockfile is JSON with trailing commas, not arbitrary JSON5.
  const lock = JSON.parse(bytes.replace(/,\s*([}\]])/g, "$1"));
  assert.doesNotMatch(bytes, /\b(?:file|link|workspace|portal|patch):/i);
  assert.equal(lock.workspaces[""].name, "@jpahd/chatworks");
  for (const name of Object.keys(expectedArtifacts)) {
    assert.equal(lock.packages[name], undefined);
    assert.equal(lock.workspaces[""].devDependencies[name], undefined);
  }
});
