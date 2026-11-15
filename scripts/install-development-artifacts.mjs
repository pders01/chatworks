#!/usr/bin/env node
import assert from "node:assert/strict";
import { lstat, mkdir, mkdtemp, open, readFile, rename, rm } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { extractArtifact, readArtifactSet } from "./lib/artifacts.mjs";

const checkout = fileURLToPath(new URL("../", import.meta.url));

async function info(path) {
  try {
    return await lstat(path);
  } catch (error) {
    if (error.code === "ENOENT") return undefined;
    throw error;
  }
}

/** Stage validated tarballs, not checkout links. No installer/lifecycle/network calls. */
export async function installDevelopmentArtifacts(artifactDirectory, root = checkout) {
  // Validate the entire set before touching installed dependencies.
  const artifacts = await readArtifactSet(artifactDirectory);
  const modules = join(root, "node_modules");
  const modulesInfo = await info(modules);
  assert(
    modulesInfo?.isDirectory() && !modulesInfo.isSymbolicLink(),
    "Install third-party dependencies first; node_modules must be a real directory",
  );
  const scope = join(modules, "@jpahd");
  const scopeInfo = await info(scope);
  assert(
    !scopeInfo || (scopeInfo.isDirectory() && !scopeInfo.isSymbolicLink()),
    "Refusing linked/non-directory @jpahd namespace",
  );

  const lock = join(modules, ".chatworks-artifacts.lock");
  const handle = await open(lock, "wx", 0o600);
  let stage;
  const changes = [];
  try {
    await mkdir(scope, { recursive: true });
    stage = await mkdtemp(join(modules, ".chatworks-artifacts-"));
    // Check every target before replacing any. Never follow a maintained-package link.
    for (const artifact of artifacts) {
      const target = join(modules, artifact.manifest.name);
      const existing = await info(target);
      assert(
        !existing || (existing.isDirectory() && !existing.isSymbolicLink()),
        `Refusing linked/non-directory dependency: ${artifact.manifest.name}`,
      );
      if (existing) {
        const manifestPath = join(target, "package.json");
        const manifestInfo = await info(manifestPath);
        assert(
          manifestInfo?.isFile() && !manifestInfo.isSymbolicLink(),
          "Refusing linked/non-file dependency manifest",
        );
        const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
        assert.equal(
          manifest.name,
          artifact.manifest.name,
          "Refusing unrelated dependency contents",
        );
      }
      const prepared = join(stage, "new", basename(artifact.manifest.name));
      await extractArtifact(artifact, prepared);
    }
    for (const artifact of artifacts) {
      const name = basename(artifact.manifest.name);
      const target = join(modules, artifact.manifest.name);
      const backup = join(stage, `previous-${name}`);
      const existed = Boolean(await info(target));
      if (existed) await rename(target, backup);
      const change = { target, backup, existed, installed: false };
      changes.push(change);
      await rename(join(stage, "new", name), target);
      change.installed = true;
    }
    return artifacts.map(({ manifest }) => `${manifest.name}@${manifest.version}`);
  } catch (error) {
    // Roll back ordinary filesystem errors; this is not a crash-safe transaction.
    const failures = [];
    for (const change of changes.reverse()) {
      try {
        if (change.installed) await rm(change.target, { recursive: true });
        if (change.existed) await rename(change.backup, change.target);
      } catch (rollbackError) {
        failures.push(rollbackError);
      }
    }
    if (failures.length) {
      // Keep backups for manual recovery rather than deleting the only copy.
      const recovery = stage;
      stage = undefined;
      throw new AggregateError(
        [error, ...failures],
        `Dependency rollback failed; recover backups from ${recovery}`,
      );
    }
    throw error;
  } finally {
    try {
      if (stage) await rm(stage, { recursive: true, force: true });
    } finally {
      await handle.close();
      await rm(lock);
    }
  }
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const args = process.argv.slice(2);
  if (args.length !== 1 || args[0].startsWith("-")) {
    console.error(
      "Usage: npm run dev:artifacts -- /absolute/path/to/repokit-tarballs\nInstall third-party dependencies first. Supply all six matching npm tarballs; no source checkout is consulted.",
    );
    process.exitCode = args.length === 1 && args[0] === "--help" ? 0 : 1;
  } else {
    try {
      const installed = await installDevelopmentArtifacts(resolve(args[0]));
      console.log(`Staged real package artifacts:\n${installed.join("\n")}`);
    } catch (error) {
      console.error(error.message);
      process.exitCode = 1;
    }
  }
}
