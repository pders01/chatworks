// SPDX-License-Identifier: MIT
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs, {
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  readlink,
  realpath,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { syncBuiltinESMExports } from "node:module";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";
import { installDevelopmentArtifacts } from "./install-development-artifacts.mjs";
import { expectedArtifacts } from "./lib/artifacts.mjs";

const names = Object.keys(expectedArtifacts);
const lockName = ".chatworks-artifacts.lock";
const stagePrefix = ".chatworks-artifacts-";
const notice = `MIT License
Copyright (c) Synthetic test authors
Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:
The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.
THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
`;
const javascript = "export const synthetic = true;\n";
const declarations = "export declare const synthetic: true;\n";

// Minimal regular-file ustar archives: no npm, source checkout or external tool.
function archive(name) {
  const dependency = names[(names.indexOf(name) + 1) % names.length];
  const manifest = {
    name,
    version: expectedArtifacts[name],
    type: "module",
    license: "MIT",
    exports: { ".": { types: "./dist/index.d.ts", import: "./dist/index.js" } },
    dependencies: { [dependency]: expectedArtifacts[dependency] },
    peerDependencies: { "synthetic-third-party": "^1.2.3" },
  };
  const chunks = [];
  for (const [path, contents] of Object.entries({
    "package/package.json": JSON.stringify(manifest),
    "package/LICENSE": notice,
    "package/dist/index.js": javascript,
    "package/dist/index.d.ts": declarations,
  })) {
    const bytes = Buffer.from(contents);
    const header = Buffer.alloc(512);
    header.write(path, 0, 100, "utf8");
    for (const [offset, length, value] of [
      [100, 8, 0o644],
      [108, 8, 0],
      [116, 8, 0],
      [124, 12, bytes.length],
      [136, 12, 0],
    ]) {
      header.write(`${value.toString(8).padStart(length - 1, "0")}\0`, offset, "ascii");
    }
    header.write("0", 156);
    header.write("ustar\0", 257);
    header.write("00", 263);
    header.fill(32, 148, 156);
    const checksum = header.reduce((sum, byte) => sum + byte, 0);
    header.write(`${checksum.toString(8).padStart(6, "0")}\0 `, 148, "ascii");
    chunks.push(header, bytes, Buffer.alloc((512 - (bytes.length % 512)) % 512));
  }
  return gzipSync(Buffer.concat([...chunks, Buffer.alloc(1024)]));
}

async function snapshot(path) {
  const info = await lstat(path);
  if (info.isSymbolicLink()) return { link: await readlink(path) };
  if (info.isFile()) return { bytes: (await readFile(path)).toString("hex") };
  assert(info.isDirectory());
  const children = {};
  for (const name of (await readdir(path)).sort())
    children[name] = await snapshot(join(path, name));
  return { children };
}

async function workspace(t) {
  // Resolve temporary-directory aliases before extraction's no-symlink-parent checks.
  const temporary = await realpath(await mkdtemp(join(tmpdir(), "chatworks-install-test-")));
  t.after(() => rm(temporary, { recursive: true, force: true }));
  const root = join(temporary, "checkout");
  const bundle = join(temporary, "explicit-bundle");
  const modules = join(root, "node_modules");
  const scope = join(modules, "@jpahd");
  await mkdir(scope, { recursive: true });
  await mkdir(bundle);
  for (const [index, name] of names.entries())
    await writeFile(join(bundle, `${index}.tgz`), archive(name));
  // Deliberately unusual bytes ensure preservation is byte-for-byte, not reserialization.
  await writeFile(join(root, "package.json"), '{ "private": true, "type": "module" }\n');
  for (const path of ["bun.lock", "package-lock.json", "node_modules/.package-lock.json"])
    await writeFile(join(root, path), `synthetic lock: ${path}\r\n\0`);
  for (const name of ["synthetic-third-party", "@jpahd/unrelated"])
    await mkdir(join(modules, name), { recursive: true });
  await writeFile(join(modules, "synthetic-third-party", "keep.txt"), "unrelated dependency\n");
  await writeFile(join(scope, "unrelated", "keep.txt"), "unrelated scoped dependency\n");
  return { temporary, root, bundle, modules, scope };
}

async function seedInstalled({ modules }) {
  for (const name of names) {
    const target = join(modules, name);
    await mkdir(target, { recursive: true });
    await writeFile(join(target, "package.json"), JSON.stringify({ name, version: "0.0.0" }));
    await writeFile(join(target, "stale.txt"), `previous ${name}\n`);
  }
}

async function preservedPaths(root) {
  const paths = [
    "package.json",
    "bun.lock",
    "package-lock.json",
    "node_modules/.package-lock.json",
    "node_modules/synthetic-third-party",
    "node_modules/@jpahd/unrelated",
  ];
  return Promise.all(paths.map((path) => snapshot(join(root, path))));
}

async function noTransactionDebris(modules) {
  const entries = await readdir(modules);
  assert(!entries.includes(lockName), "installer lock was not removed");
  assert(
    !entries.some((name) => name.startsWith(stagePrefix)),
    "staging directory was not removed",
  );
}

async function withRenameMock(t, replacement, run) {
  const rename = fs.rename;
  const mock = t.mock.method(fs, "rename", (...args) => replacement(rename, ...args));
  syncBuiltinESMExports();
  try {
    await run();
  } finally {
    mock.mock.restore();
    syncBuiltinESMExports();
  }
}

test("installs six real package directories and restages without changing unrelated dependencies or metadata", async (t) => {
  const fixture = await workspace(t);
  const { root, bundle, modules } = fixture;
  assert.equal(names.length, 6);
  const preserved = await preservedPaths(root);
  const expected = names.map((name) => `${name}@${expectedArtifacts[name]}`).sort();
  assert.deepEqual((await installDevelopmentArtifacts(bundle, root)).sort(), expected);
  for (const name of names) {
    const target = join(modules, name);
    const info = await lstat(target);
    assert(info.isDirectory() && !info.isSymbolicLink(), name);
    assert.deepEqual((await readdir(target)).sort(), ["LICENSE", "dist", "package.json"]);
    for (const path of ["package.json", "LICENSE", "dist/index.js", "dist/index.d.ts"])
      assert((await lstat(join(target, path))).isFile(), `${name}/${path} must be a real file`);
    assert.equal(await readFile(join(target, "LICENSE"), "utf8"), notice);
    assert.equal(await readFile(join(target, "dist/index.js"), "utf8"), javascript);
    assert.equal(await readFile(join(target, "dist/index.d.ts"), "utf8"), declarations);
    const manifest = JSON.parse(await readFile(join(target, "package.json"), "utf8"));
    assert.equal(manifest.name, name);
    assert.equal(manifest.version, expectedArtifacts[name]);
    assert.equal(manifest.type, "module");
  }
  await noTransactionDebris(modules);
  const installed = await snapshot(root);
  for (const name of names) {
    await writeFile(join(modules, name, "stale.txt"), "must disappear");
    await writeFile(join(modules, name, "dist/index.js"), "stale compiled output");
  }
  assert.deepEqual((await installDevelopmentArtifacts(bundle, root)).sort(), expected);
  assert.deepEqual(await snapshot(root), installed);
  assert.deepEqual(await preservedPaths(root), preserved);
});

test("missing or invalid explicit bundles are rejected before any target changes", async (t) => {
  for (const kind of ["omitted", "missing directory", "incomplete", "corrupt final archive"]) {
    await t.test(kind, async (t) => {
      const fixture = await workspace(t);
      const { root, bundle } = fixture;
      await seedInstalled(fixture);
      const before = await snapshot(root);
      let input = bundle;
      let diagnostic;
      if (kind === "omitted") {
        input = undefined;
        diagnostic = /Explicit artifact directory/;
      } else if (kind === "missing directory") {
        input = join(fixture.temporary, "absent");
        diagnostic = { code: "ENOENT" };
      } else if (kind === "incomplete") {
        await rm(join(bundle, "5.tgz"));
        diagnostic = /Missing artifacts/;
      } else {
        await writeFile(join(bundle, "5.tgz"), "not a gzip archive");
        diagnostic = /header|gzip|compression/i;
      }
      await assert.rejects(installDevelopmentArtifacts(input, root), diagnostic);
      assert.deepEqual(await snapshot(root), before);
    });
  }
});

test("linked node_modules or @jpahd namespaces are refused without following them", async (t) => {
  for (const namespace of ["node_modules", "@jpahd"]) {
    await t.test(namespace, async (t) => {
      const fixture = await workspace(t);
      const { temporary, root, bundle, modules, scope } = fixture;
      const outside = join(temporary, "synthetic-link-destination");
      await mkdir(outside);
      await writeFile(join(outside, "sentinel"), "do not touch");
      const target = namespace === "node_modules" ? modules : scope;
      await rm(target, { recursive: true });
      await symlink(outside, target, "dir");
      const before = await snapshot(root);
      const outsideBefore = await snapshot(outside);
      await assert.rejects(
        installDevelopmentArtifacts(bundle, root),
        namespace === "node_modules" ? /node_modules must be a real directory/ : /@jpahd namespace/,
      );
      assert.deepEqual(await snapshot(root), before);
      assert.deepEqual(await snapshot(outside), outsideBefore);
    });
  }
});

test("all maintained targets are preflighted before any replacement", async (t) => {
  for (const kind of ["symlink", "file", "unrelated manifest", "linked manifest"]) {
    await t.test(kind, async (t) => {
      const fixture = await workspace(t);
      const { temporary, root, bundle, modules } = fixture;
      await seedInstalled(fixture);
      // The final archive is checked after five valid existing targets.
      const target = join(modules, names.at(-1));
      await rm(target, { recursive: true });
      const outside = join(temporary, "synthetic-unrelated-target");
      await mkdir(outside);
      await writeFile(join(outside, "sentinel"), "untouched");
      if (kind === "symlink") await symlink(outside, target, "dir");
      else if (kind === "file") await writeFile(target, "not a package directory");
      else {
        await mkdir(target);
        if (kind === "linked manifest") {
          const manifest = join(outside, "synthetic-manifest.json");
          await writeFile(manifest, JSON.stringify({ name: names.at(-1) }));
          await symlink(manifest, join(target, "package.json"));
        } else {
          await writeFile(join(target, "package.json"), JSON.stringify({ name: "@other/package" }));
        }
      }
      const before = await snapshot(root);
      const outsideBefore = await snapshot(outside);
      await assert.rejects(
        installDevelopmentArtifacts(bundle, root),
        kind === "unrelated manifest"
          ? /Refusing unrelated/
          : kind === "linked manifest"
            ? /Refusing linked\/non-file dependency manifest/
            : /Refusing linked\/non-directory dependency/,
      );
      assert.deepEqual(await snapshot(root), before);
      assert.deepEqual(await snapshot(outside), outsideBefore);
    });
  }
});

test("an existing exclusive lock refuses staging and is not deleted", async (t) => {
  const fixture = await workspace(t);
  const { root, bundle, modules } = fixture;
  await seedInstalled(fixture);
  await writeFile(join(modules, lockName), "synthetic other invocation\n");
  const before = await snapshot(root);
  await assert.rejects(installDevelopmentArtifacts(bundle, root), { code: "EEXIST" });
  assert.deepEqual(await snapshot(root), before);
});

test("ordinary replacement errors restore previous packages and remove newly installed targets", async (t) => {
  for (const firstAbsent of [false, true]) {
    await t.test(
      firstAbsent ? "mixed new and existing targets" : "all targets existed",
      async (t) => {
        const fixture = await workspace(t);
        const { root, bundle, modules } = fixture;
        await seedInstalled(fixture);
        if (firstAbsent) await rm(join(modules, names[0]), { recursive: true });
        const before = await snapshot(root);
        const failure = Object.assign(new Error("synthetic replacement failure"), { code: "EIO" });
        const replacements = [];
        await withRenameMock(
          t,
          async (rename, source, destination) => {
            if (basename(dirname(source)) === "new") {
              replacements.push(destination);
              if (destination === join(modules, names[2])) throw failure;
            }
            return rename(source, destination);
          },
          async () => {
            await assert.rejects(
              installDevelopmentArtifacts(bundle, root),
              (error) => error === failure,
            );
          },
        );
        assert.deepEqual(
          replacements,
          names.slice(0, 3).map((name) => join(modules, name)),
        );
        assert.deepEqual(await snapshot(root), before);
        await noTransactionDebris(modules);
      },
    );
  }
});

test("rollback failures retain recovery backups and report both errors", async (t) => {
  const fixture = await workspace(t);
  const { root, bundle, modules } = fixture;
  await seedInstalled(fixture);
  const preserved = await preservedPaths(root);
  const previous = await snapshot(join(modules, names[0]));
  const replacementError = new Error("synthetic replacement error");
  const rollbackError = new Error("synthetic rollback error");
  let reported;
  await withRenameMock(
    t,
    async (rename, source, destination) => {
      if (basename(dirname(source)) === "new" && destination === join(modules, names[1]))
        throw replacementError;
      if (basename(source) === `previous-${basename(names[0])}`) throw rollbackError;
      return rename(source, destination);
    },
    async () => {
      await assert.rejects(installDevelopmentArtifacts(bundle, root), (error) => {
        reported = error;
        return error instanceof AggregateError;
      });
    },
  );
  assert.deepEqual(reported.errors, [replacementError, rollbackError]);
  const entries = await readdir(modules);
  assert(!entries.includes(lockName));
  const stages = entries.filter((name) => name.startsWith(stagePrefix));
  assert.equal(stages.length, 1);
  const recovery = join(modules, stages[0]);
  assert(
    reported.message.includes(recovery),
    "diagnostic must identify the retained recovery directory",
  );
  assert.deepEqual(await snapshot(join(recovery, `previous-${basename(names[0])}`)), previous);
  await assert.rejects(lstat(join(modules, names[0])), { code: "ENOENT" });
  for (const name of names.slice(1))
    assert.equal(await readFile(join(modules, name, "stale.txt"), "utf8"), `previous ${name}\n`);
  assert.deepEqual(await preservedPaths(root), preserved);
});

test("installer and packed-test CLIs require an explicit bundle and provide help without artifact/source discovery", async (t) => {
  const { temporary } = await workspace(t);
  const guard = join(temporary, "refuse-side-effects.mjs");
  // Allow Node's synchronous ESM module loading, but refuse async filesystem
  // discovery/mutations and subprocesses used by the artifact tooling. Missing/help
  // paths must stop at argument validation, without a default or source lookup.
  await writeFile(
    guard,
    `import promises from 'node:fs/promises';
import childProcess from 'node:child_process';
import { syncBuiltinESMExports } from 'node:module';
const refuse = () => { throw new Error('UNEXPECTED_FILESYSTEM_OR_SOURCE_LOOKUP'); };
for (const key of Object.keys(promises)) if (typeof promises[key] === 'function') promises[key] = refuse;
for (const key of ['spawn', 'spawnSync', 'exec', 'execSync', 'execFile', 'execFileSync', 'fork']) childProcess[key] = refuse;
syncBuiltinESMExports();
`,
  );
  for (const script of ["install-development-artifacts.mjs", "test-repository-package.mjs"]) {
    for (const args of [[], ["--help"]]) {
      const result = spawnSync(
        process.execPath,
        ["--import", guard, fileURLToPath(new URL(script, import.meta.url)), ...args],
        {
          cwd: temporary,
          env: { HOME: temporary, TMPDIR: temporary, NODE_PATH: "" },
          encoding: "utf8",
          timeout: 10_000,
        },
      );
      assert.ifError(result.error);
      assert.equal(result.signal, null);
      assert.equal(result.status, args.length ? 0 : 1, `${script}: ${result.stderr}`);
      assert.equal(result.stdout, "");
      const command =
        script === "install-development-artifacts.mjs" ? "dev:artifacts" : "test:package";
      assert(result.stderr.startsWith(`Usage: npm run ${command} -- /absolute/path/`));
      assert.match(result.stderr, /six matching npm tarballs/i);
      assert.match(result.stderr, /no source checkout/i);
      assert.doesNotMatch(result.stderr, /UNEXPECTED_FILESYSTEM_OR_SOURCE_LOOKUP/);
    }
  }
});
