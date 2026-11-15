// SPDX-License-Identifier: MIT
import assert from "node:assert/strict";
import childProcess from "node:child_process";
import { constants, existsSync, readFileSync, writeFileSync } from "node:fs";
import fs, {
  lstat,
  mkdir,
  mkdtemp,
  open,
  readFile,
  readdir,
  realpath,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { syncBuiltinESMExports } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";
import {
  createPackedConsumer,
  expectedArtifacts,
  extractArtifact,
  readArtifactSet,
} from "./lib/artifacts.mjs";

const names = Object.keys(expectedArtifacts);
const notice = `MIT License

Copyright (c) Synthetic fixture

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
`;

// Generate tar bytes directly: no tar executable, npm, registry or real stores.
function entry(path, bytes = "", options = {}) {
  return { path, bytes: Buffer.from(bytes), ...options };
}
function checksum(header) {
  header.fill(32, 148, 156);
  const sum = header.reduce((a, b) => a + b, 0);
  header.write(`${sum.toString(8).padStart(6, "0")}\0 `, 148, "ascii");
}
function tar(entries, { end = true } = {}) {
  const chunks = [];
  for (const item of entries) {
    const header = Buffer.alloc(512);
    header.write(item.path, 0, 100, "utf8");
    for (const [offset, length, value] of [
      [100, 8, 0o644],
      [108, 8, 0],
      [116, 8, 0],
      [124, 12, item.bytes.length],
      [136, 12, 0],
    ]) {
      header.write(`${value.toString(8).padStart(length - 1, "0")}\0`, offset, "ascii");
    }
    header[156] = (item.type ?? "0").charCodeAt(0);
    header.write(item.link ?? "", 157, 100);
    header.write("ustar\0", 257);
    header.write("00", 263);
    header.write(item.prefix ?? "", 345, 155);
    checksum(header);
    item.mutateHeader?.(header);
    chunks.push(header, item.bytes, Buffer.alloc((512 - (item.bytes.length % 512)) % 512));
  }
  if (end) chunks.push(Buffer.alloc(1024));
  return Buffer.concat(chunks);
}
function manifest(name, changes = {}) {
  return {
    name,
    version: expectedArtifacts[name],
    type: "module",
    license: "MIT",
    exports: { ".": { types: "./dist/index.d.ts", import: "./dist/index.js" } },
    ...changes,
  };
}
function members(name, changes = {}) {
  return [
    entry("package/package.json", JSON.stringify(manifest(name, changes))),
    entry("package/LICENSE", notice),
    entry("package/dist/index.js", "export const synthetic = true;\n"),
    entry("package/dist/index.d.ts", "export declare const synthetic: true;\n"),
  ];
}
async function workspace(t) {
  const root = await realpath(await mkdtemp(join(tmpdir(), "chatworks-artifact-test-")));
  t.after(() => rm(root, { recursive: true, force: true }));
  const directory = join(root, "archives");
  await mkdir(directory);
  for (let index = 0; index < names.length; index++)
    await writeFile(join(directory, `${index}.tgz`), gzipSync(tar(members(names[index]))));
  return { root, directory, archive: join(directory, "0.tgz") };
}
async function replace(directory, entries, options) {
  await writeFile(join(directory, "0.tgz"), gzipSync(tar(entries, options)));
}

test("contract pins all six release identities and has no source-location fallback", async () => {
  assert(Object.isFrozen(expectedArtifacts));
  assert.equal(names.length, 6);
  assert.equal(expectedArtifacts["@jpahd/source-annotations"], "0.1.0");
  assert(
    names
      .filter((name) => name !== "@jpahd/source-annotations")
      .every((name) => expectedArtifacts[name] === "0.0.0"),
  );
  await assert.rejects(readArtifactSet(), /Explicit artifact directory/);
  await assert.rejects(createPackedConsumer("unused"), /Explicit fixture root/);
  await assert.rejects(
    createPackedConsumer("unused", "unused", { fixtures: [names[0]] }),
    /Only third-party/,
  );
  await assert.rejects(
    createPackedConsumer("unused", "unused", { fixtures: ["@jpahd/chatworks"] }),
    /Only third-party/,
  );
});

test("valid six-package set extracts regular files, not symlinks; public mutation cannot change extraction", async (t) => {
  const { root, directory } = await workspace(t);
  const entries = members(names[0], { dependencies: { [names[1]]: "^0.0.0" } });
  entries.unshift(entry("package/", "", { type: "5" }));
  entries.push(
    entry("package/docs/", "", { type: "5" }),
    entry("package/docs/usage.md", "Synthetic docs"),
  );
  await replace(directory, entries);
  const artifacts = await readArtifactSet(directory);
  assert.equal(artifacts.length, 6);
  const artifact = artifacts[0];
  assert.equal(artifact.archivePath, join(directory, "0.tgz"));
  assert.match(artifact.sha256, /^[a-f0-9]{64}$/);
  assert.equal(artifact.manifest.name, names[0]);
  assert(artifact.members.some((member) => member.path === "dist/index.js"));
  artifact.members.find((member) => member.path === "dist/index.js").bytes.fill(0);
  artifact.members.push(entry("../escaped", "bad"));
  artifact.manifest.name = "../bad";
  const target = join(root, "consumer", "node_modules", names[0]);
  await extractArtifact(artifact, target);
  assert.equal(
    await readFile(join(target, "dist/index.js"), "utf8"),
    "export const synthetic = true;\n",
  );
  assert.equal(await readFile(join(target, "docs/usage.md"), "utf8"), "Synthetic docs");
  async function noLinks(path) {
    const info = await lstat(path);
    assert(!info.isSymbolicLink());
    if (info.isDirectory()) for (const name of await readdir(path)) await noLinks(join(path, name));
    else assert(info.isFile());
  }
  await noLinks(target);
  await assert.rejects(extractArtifact(artifact, target), /must be empty/);
  await assert.rejects(
    extractArtifact({ members: [] }, join(root, "unvalidated")),
    /not validated/,
  );
});

test("extraction refuses target symlinks and symlink ancestors before writing", async (t) => {
  const { root, directory } = await workspace(t);
  const [artifact] = await readArtifactSet(directory);
  const outside = join(root, "outside");
  await mkdir(outside);
  await symlink(outside, join(root, "linked"), "dir");
  await assert.rejects(extractArtifact(artifact, join(root, "linked")), /Symlink\/non-directory/);
  await assert.rejects(
    extractArtifact(artifact, join(root, "linked", "child")),
    /Symlink\/non-directory/,
  );
  assert.deepEqual(await readdir(outside), []);
});

test("set must be complete with exact unique maintained package identities", async (t) => {
  const { directory } = await workspace(t);
  await replace(directory, members(names[1]));
  await assert.rejects(readArtifactSet(directory), /Duplicate package identity/);
  await replace(directory, members("unexpected", { name: "@other/package", version: "0.0.0" }));
  await assert.rejects(readArtifactSet(directory), /Unexpected package identity/);
  await replace(directory, members(names[0], { version: "9.0.0" }));
  await assert.rejects(readArtifactSet(directory), /Wrong artifact version/);
  await rm(join(directory, "0.tgz"));
  await assert.rejects(readArtifactSet(directory), /complete six-package set/);
  await writeFile(join(directory, "0.tgz"), gzipSync(tar(members(names[0]))));
  await writeFile(join(directory, "extra.tgz"), gzipSync(tar(members(names[0]))));
  await assert.rejects(readArtifactSet(directory), /Unexpected extra package/);
});

test("archive inputs must be regular files, never symlinks or directories", async (t) => {
  const { directory, archive } = await workspace(t);
  await rm(archive);
  await symlink(join(directory, "1.tgz"), archive);
  await assert.rejects(readArtifactSet(directory), /regular non-symlink/);
  await rm(archive);
  await mkdir(archive);
  await assert.rejects(readArtifactSet(directory), /regular non-symlink/);
});

for (const [label, path] of [
  ["traversal", "package/dist/../../escape"],
  ["absolute", "/package/dist/a.js"],
  ["dot segment", "package/dist/./a.js"],
  ["empty segment", "package/dist//a.js"],
  ["backslash", "package/dist/evil\\path"],
  ["drive path", "C:/package/dist/a.js"],
  ["control", "package/dist/a\nb.js"],
  ["wrong root", "other/dist/a.js"],
  ["Windows device", "package/dist/CON.js"],
  ["trailing dot", "package/dist/file."],
  ["wildcard", "package/dist/*.js"],
  ["source leak", "package/src/private.js"],
  ["nested source leak", "package/dist/src/private.js"],
  ["tests leak", "package/dist/file.test.js"],
  ["dependency leak", "package/dist/node_modules/a.js"],
]) {
  test(`rejects ${label} archive paths`, async (t) => {
    const { directory } = await workspace(t);
    await replace(directory, [...members(names[0]), entry(path, "bad")]);
    await assert.rejects(
      readArtifactSet(directory),
      /Unsafe packed path|escapes package|Unexpected packed file|leaked/,
    );
  });
}
for (const [label, type] of [
  ["hard link", "1"],
  ["symlink", "2"],
  ["character device", "3"],
  ["block device", "4"],
  ["FIFO", "6"],
  ["PAX", "x"],
  ["global PAX", "g"],
  ["GNU long name", "L"],
  ["GNU long link", "K"],
  ["sparse", "S"],
]) {
  test(`rejects ${label} members`, async (t) => {
    const { directory } = await workspace(t);
    await replace(directory, [
      ...members(names[0]),
      entry("package/dist/bad", "", { type, link: "../../outside" }),
    ]);
    await assert.rejects(readArtifactSet(directory), /Links\/special files\/tar extensions/);
  });
}

test("refuses private configuration members even beneath otherwise permitted directories", async (t) => {
  const { directory } = await workspace(t);
  for (const path of [
    "package/docs/.env",
    "package/dist/.env.local",
    "package/docs/.npmrc",
    "package/dist/credentials",
  ]) {
    await replace(directory, [...members(names[0]), entry(path, "synthetic private config")]);
    await assert.rejects(readArtifactSet(directory), /Private configuration/);
  }
});

test("rejects hidden link targets, directory payloads and prefix traversal", async (t) => {
  const { directory } = await workspace(t);
  for (const extra of [
    entry("package/dist/file", "", { link: "elsewhere" }),
    entry("package/dist/dir/", "payload", { type: "5" }),
    entry("bad", "", { prefix: "package/../outside" }),
  ]) {
    await replace(directory, [...members(names[0]), extra]);
    await assert.rejects(
      readArtifactSet(directory),
      /link target|Directory has data|Unsafe packed path/,
    );
  }
});

test("rejects duplicate paths, file/directory collisions and portable aliases", async (t) => {
  const { directory } = await workspace(t);
  const invalid = [
    [entry("package/dist/index.js", "duplicate")],
    [entry("package/dist/index.js/child", "collision")],
    [entry("package/dist/tree/child", "child"), entry("package/dist/tree", "parent")],
    [entry("package/dist/index.js/", "", { type: "5" })],
    [entry("package/dist/INDEX.js", "case alias")],
    [entry("package/dist/Foo/one", ""), entry("package/dist/foo/two", "")],
  ];
  for (const extra of invalid) {
    await replace(directory, [...members(names[0]), ...extra]);
    await assert.rejects(
      readArtifactSet(directory),
      /Duplicate packed path|File\/directory collision|Portable path collision/,
    );
  }
});

test("rejects checksum corruption, invalid numbers/UTF-8 and hidden path bytes", async (t) => {
  const { directory } = await workspace(t);
  for (const mutateHeader of [
    (header) => {
      header[10] ^= 1;
    },
    (header) => {
      header.fill(0xff, 124, 136);
      checksum(header);
    },
    (header) => {
      header[0] = 0xff;
      checksum(header);
    },
    (header) => {
      header[20] = 0;
      header[22] = 65;
      checksum(header);
    },
    (header) => {
      header.write("badfmt", 257);
      checksum(header);
    },
  ]) {
    const entries = members(names[0]);
    entries[0].mutateHeader = mutateHeader;
    await replace(directory, entries);
    await assert.rejects(readArtifactSet(directory));
  }
});

test("rejects truncated gzip/tar, absent or dirty end markers, data padding and trailing bytes", async (t) => {
  const { directory, archive } = await workspace(t);
  const valid = tar(members(names[0]));
  const dirtyEnd = Buffer.from(valid);
  dirtyEnd[dirtyEnd.length - 1] = 1;
  const dirtyPadding = Buffer.from(valid);
  dirtyPadding[512 + members(names[0])[0].bytes.length] = 1;
  for (const bytes of [
    valid.subarray(0, 100),
    valid.subarray(0, 512),
    valid.subarray(0, 1024),
    valid.subarray(0, valid.length - 512),
    tar(members(names[0]), { end: false }),
    dirtyEnd,
    dirtyPadding,
    Buffer.concat([valid, Buffer.from([1])]),
  ]) {
    await writeFile(archive, gzipSync(bytes));
    await assert.rejects(readArtifactSet(directory));
  }
  await writeFile(archive, gzipSync(valid).subarray(0, 32));
  await assert.rejects(readArtifactSet(directory));
});

for (const field of [
  "dependencies",
  "peerDependencies",
  "optionalDependencies",
  "devDependencies",
]) {
  test(`metadata portability checks ${field}, including local protocols and paths`, async (t) => {
    const { directory } = await workspace(t);
    for (const value of [
      "file:../local",
      "workspace:*",
      "link:../../local",
      "portal:local",
      "../local",
      "/absolute/local",
      "C:\\local",
      "git+file:///local",
    ]) {
      await replace(directory, members(names[0], { [field]: { "third-party": value } }));
      await assert.rejects(readArtifactSet(directory), /Nonportable dependency/);
    }
  });
}

test("nested overrides/resolutions must also be portable", async (t) => {
  const { directory } = await workspace(t);
  for (const changes of [
    { overrides: { a: { b: "file:../local" } } },
    { resolutions: { a: "workspace:*" } },
  ]) {
    await replace(directory, members(names[0], changes));
    await assert.rejects(readArtifactSet(directory), /Nonportable dependency/);
  }
});

test("maintained dependency and peer closure uses actual artifact versions, including optional peers", async (t) => {
  const { directory } = await workspace(t);
  for (const field of [
    "dependencies",
    "peerDependencies",
    "optionalDependencies",
    "devDependencies",
  ]) {
    for (const version of ["1.0.0", "^0.0.1", ">0.0.0", "<0.0.0", "latest", "0.x.1", "00.0.0"]) {
      await replace(
        directory,
        members(names[0], {
          [field]: { [names[1]]: version },
          peerDependenciesMeta: { [names[1]]: { optional: true } },
        }),
      );
      await assert.rejects(readArtifactSet(directory), /Unsatisfied maintained dependency/);
    }
  }
  for (const version of [
    "0.0.0",
    "^0.0.0",
    "~0.0.0",
    ">=0.0.0 <1.0.0",
    "0.0.x",
    "*",
    "1.0.0 || 0.0.0",
  ]) {
    await replace(directory, members(names[0], { dependencies: { [names[1]]: version } }));
    assert.equal((await readArtifactSet(directory)).length, 6);
  }
  await replace(directory, members(names[0], { dependencies: { "@jpahd/chatworks": "0.3.0" } }));
  await assert.rejects(readArtifactSet(directory), /Unsatisfied maintained dependency/);
});

test("manifest, MIT notice and every dist export must exist and be valid", async (t) => {
  const { directory } = await workspace(t);
  for (const changes of [
    { type: "commonjs" },
    { license: "UNLICENSED" },
    { exports: undefined },
    { exports: {} },
    { exports: { ".": "./dist/missing.js" } },
    { exports: "../outside.js" },
    { exports: "./docs/usage.md" },
    { exports: { ".": { import: "./dist/index.js", types: "./dist/missing.d.ts" } } },
    { exports: "./dist/../package.json" },
    { exports: { ".": null } },
    { exports: { "./../escape": "./dist/index.js" } },
    { exports: { ".": "./dist/index.js", import: "./dist/index.js" } },
    { exports: { ".": { "./nested": "./dist/index.js" } } },
    { exports: { 0: "./dist/index.js" } },
    { dependencies: [] },
    { name: "../unsafe" },
    { version: "garbage" },
  ]) {
    await replace(directory, members(names[0], changes));
    await assert.rejects(readArtifactSet(directory));
  }
  for (const removed of [
    "package/package.json",
    "package/LICENSE",
    "package/dist/index.js",
    "package/dist/index.d.ts",
  ]) {
    await replace(
      directory,
      members(names[0]).filter((member) => member.path !== removed),
    );
    await assert.rejects(readArtifactSet(directory), /Missing/);
  }
  const entries = members(names[0]);
  entries[1].bytes = Buffer.from("MIT");
  await replace(directory, entries);
  await assert.rejects(readArtifactSet(directory), /MIT license terms/);
  entries[1].bytes = Buffer.from(notice);
  entries[0].bytes = Buffer.from("not json");
  await replace(directory, entries);
  await assert.rejects(readArtifactSet(directory), SyntaxError);
});

test("bounds compressed inputs, expanded data, individual files, member counts and directory entries", async (t) => {
  const { directory, archive } = await workspace(t);
  const file = await open(archive, constants.O_WRONLY);
  await file.truncate(64 * 1024 * 1024 + 1);
  await file.close();
  await assert.rejects(readArtifactSet(directory), /Oversized compressed/);
  await writeFile(archive, gzipSync(Buffer.alloc(64 * 1024 * 1024 + 1)));
  await assert.rejects(readArtifactSet(directory));
  await replace(directory, [
    ...members(names[0]),
    entry("package/dist/large", Buffer.alloc(16 * 1024 * 1024 + 1)),
  ]);
  await assert.rejects(readArtifactSet(directory), /Oversized packed file/);
  await replace(directory, [
    ...members(names[0]),
    ...Array.from({ length: 10_000 }, (_, index) => entry(`package/dist/file-${index}`)),
  ]);
  await assert.rejects(readArtifactSet(directory), /Too many archive members/);
  await replace(directory, members(names[0]));
  for (let index = 0; index < 129; index++)
    await writeFile(join(directory, `ignored-${index}.txt`), "");
  await assert.rejects(readArtifactSet(directory), /Too many artifact directory entries/);
});

// Replace only the local packaging surface and npm subprocess with synthetic
// fixtures. All artifact validation, extraction and consumer filesystem IO is real.
// Builtin bindings are restored before the next (sequential) top-level test.
function syntheticPackaging(t) {
  const root = fileURLToPath(new URL("../", import.meta.url));
  const localManifest = manifest("@jpahd/chatworks", {
    version: "0.3.0",
    peerDependencies: { "third-party": "^1.0.0", [names[0]]: "0.0.0" },
    scripts: { prepack: "exit 99", prepare: "exit 99", postpack: "exit 99" },
  });
  const virtual = new Map([
    [join(root, "package.json"), Buffer.from(JSON.stringify(localManifest))],
    [join(root, "LICENSE"), Buffer.from(notice)],
    [join(root, "README.md"), Buffer.from("Synthetic package")],
    [join(root, "dist"), null],
    [join(root, "docs"), null],
    [join(root, "dist/index.js"), Buffer.from("export const synthetic = true;\n")],
    [join(root, "dist/index.d.ts"), Buffer.from("export declare const synthetic: true;\n")],
  ]);
  const original = {
    lstat: fs.lstat,
    readdir: fs.readdir,
    open: fs.open,
    mkdtemp: fs.mkdtemp,
    spawnSync: childProcess.spawnSync,
  };
  const state = { mode: "success", owned: [], calls: [] };
  t.after(() => {
    t.mock.restoreAll();
    syncBuiltinESMExports();
  });
  t.mock.method(fs, "lstat", (path, ...args) =>
    virtual.has(path)
      ? Promise.resolve({
          size: virtual.get(path)?.length ?? 0,
          isSymbolicLink: () => state.mode === "stage-symlink" && path === join(root, "docs"),
          isDirectory: () => virtual.get(path) === null,
          isFile: () => virtual.get(path) !== null,
        })
      : original.lstat(path, ...args),
  );
  t.mock.method(fs, "readdir", (path, ...args) =>
    virtual.get(path) === null
      ? Promise.resolve(
          [...virtual.keys()]
            .filter((key) => dirname(key) === path)
            .map((key) => key.slice(path.length + 1)),
        )
      : original.readdir(path, ...args),
  );
  t.mock.method(fs, "open", (path, ...args) =>
    virtual.has(path)
      ? Promise.resolve({
          readFile: async () => virtual.get(path),
          close: async () => {},
        })
      : original.open(path, ...args),
  );
  t.mock.method(fs, "mkdtemp", async (prefix, ...args) => {
    const path = await original.mkdtemp(prefix, ...args);
    if (prefix.includes("chatworks-artifacts-")) state.owned.push(await realpath(path));
    return path;
  });
  t.mock.method(childProcess, "spawnSync", (executable, args, options) => {
    if (executable !== "npm") return original.spawnSync(executable, args, options);
    state.calls.push({ args, ...options });
    assert.deepEqual(args.slice(0, 5), [
      "pack",
      "--json",
      "--ignore-scripts",
      "--offline",
      "--pack-destination",
    ]);
    assert.equal(options.env.NPM_CONFIG_IGNORE_SCRIPTS, "true");
    assert.equal(options.env.NPM_CONFIG_OFFLINE, "true");
    const owned = state.owned.at(-1);
    for (const key of [
      "HOME",
      "TMPDIR",
      "NPM_CONFIG_CACHE",
      "NPM_CONFIG_USERCONFIG",
      "NPM_CONFIG_GLOBALCONFIG",
    ])
      assert(options.env[key].startsWith(`${owned}/`));
    assert.equal(readFileSync(options.env.NPM_CONFIG_USERCONFIG, "utf8"), "");
    assert.equal(readFileSync(options.env.NPM_CONFIG_GLOBALCONFIG, "utf8"), "");
    assert.equal(options.env.NODE_OPTIONS, undefined);
    assert.equal(options.env.NPM_TOKEN, undefined);
    assert.equal(options.env.AWS_ACCESS_KEY_ID, undefined);
    assert(!existsSync(join(options.cwd, ".npmrc")));
    assert(!existsSync(join(options.cwd, ".env")));
    assert.equal(options.cwd, join(owned, "package"));
    const staged = JSON.parse(readFileSync(join(options.cwd, "package.json"), "utf8"));
    assert.equal(staged.name, "@jpahd/chatworks");
    assert.equal(
      staged.scripts,
      undefined,
      "Lifecycle hooks must be absent even if npm ignores --ignore-scripts",
    );
    if (state.mode === "real-npm") return original.spawnSync(executable, args, options);
    if (state.mode === "npm-failure") return { status: 1, stderr: "Synthetic packing failure" };
    if (state.mode === "escape-filename")
      return { status: 0, stdout: JSON.stringify([{ filename: "../escape.tgz" }]) };
    if (state.mode === "nonportable") staged.devDependencies = { local: "file:../local" };
    let packed = members(staged.name, staged);
    if (state.mode === "missing-export")
      packed = packed.filter((member) => member.path !== "package/dist/index.js");
    writeFileSync(join(args[5], "chatworks.tgz"), gzipSync(tar(packed)));
    return { status: 0, stdout: JSON.stringify([{ filename: "chatworks.tgz" }]) };
  });
  syncBuiltinESMExports();
  return state;
}

test("consumer extracts seven maintained packages, links only third parties, and isolates subprocesses", async (t) => {
  const { root, directory } = await workspace(t);
  const fixtures = join(root, "fixtures");
  for (const name of ["third-party", "extra-fixture", "@types/node"]) {
    const target = join(fixtures, "node_modules", name);
    await mkdir(target, { recursive: true });
    await writeFile(join(target, "package.json"), JSON.stringify({ name, version: "1.0.0" }));
  }
  const state = syntheticPackaging(t);
  const consumer = await createPackedConsumer(directory, fixtures, { fixtures: ["extra-fixture"] });
  t.after(() => consumer.dispose());
  assert.equal(consumer.manifests.length, 7);
  assert.equal(state.calls.length, 1);
  for (const name of [...names, "@jpahd/chatworks"]) {
    const info = await lstat(join(consumer.directory, "node_modules", name));
    assert(info.isDirectory() && !info.isSymbolicLink(), name);
  }
  for (const name of ["third-party", "extra-fixture", "@types/node"])
    assert((await lstat(join(consumer.directory, "node_modules", name))).isSymbolicLink());
  assert.equal(consumer.run(process.execPath, ["-p", "process.cwd()"]).trim(), consumer.directory);
  assert.equal(
    consumer.run(process.execPath, ["-p", "process.env.HOME"]).trim(),
    consumer.env.HOME,
  );
  await consumer.dispose();
  await consumer.dispose();
  await assert.rejects(lstat(consumer.owned), { code: "ENOENT" });
});

test("real offline npm pack accepts the synthetic package without executing lifecycle scripts", async (t) => {
  const { root, directory } = await workspace(t);
  const fixtures = join(root, "fixtures");
  for (const name of ["third-party", "@types/node"]) {
    const target = join(fixtures, "node_modules", name);
    await mkdir(target, { recursive: true });
    await writeFile(join(target, "package.json"), JSON.stringify({ name, version: "1.0.0" }));
  }
  const state = syntheticPackaging(t);
  state.mode = "real-npm";
  const consumer = await createPackedConsumer(directory, fixtures);
  t.after(() => consumer.dispose());
  assert.equal(state.calls.length, 1);
  assert.equal(consumer.manifests.at(-1).name, "@jpahd/chatworks");
  assert.equal(
    await readFile(join(consumer.directory, "node_modules/@jpahd/chatworks/dist/index.js"), "utf8"),
    "export const synthetic = true;\n",
  );
  await consumer.dispose();
  await assert.rejects(lstat(consumer.owned), { code: "ENOENT" });
});

test("consumer removes owned temporary state after staging, npm, validation or fixture failure", async (t) => {
  const { root, directory } = await workspace(t);
  const state = syntheticPackaging(t);
  for (const [mode, error] of [
    ["stage-symlink", /Symlink in Chatworks/],
    ["npm-failure", /Synthetic packing failure/],
    ["escape-filename", /escapes owned directory/],
    ["nonportable", /Nonportable dependency/],
    ["missing-export", /Missing export/],
    ["success", /ENOENT/],
  ]) {
    state.mode = mode;
    await assert.rejects(createPackedConsumer(directory, join(root, "missing-fixtures")), error);
    await assert.rejects(lstat(state.owned.at(-1)), { code: "ENOENT" });
  }
  assert.equal(state.owned.length, 6);
});

test("invalid sets cannot create consumer state or touch fixtures", async (t) => {
  const { root, directory } = await workspace(t);
  const missingFixtures = join(root, "does-not-exist");
  await replace(directory, members(names[0], { version: "99.0.0" }));
  await assert.rejects(createPackedConsumer(directory, missingFixtures), /Wrong artifact version/);
  assert.deepEqual((await readdir(root)).sort(), ["archives"]);
});
