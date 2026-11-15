// SPDX-License-Identifier: MIT
// Artifact-only development tooling. No checkout discovery, installs or lifecycle scripts.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { constants } from "node:fs";
import {
  lstat,
  mkdir,
  mkdtemp,
  open,
  opendir,
  readFile,
  readdir,
  realpath,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { gunzipSync } from "node:zlib";
import { createHash } from "node:crypto";

/** Exact artifact contract, deliberately independent of any source checkout. */
export const expectedArtifacts = Object.freeze({
  "@jpahd/repository-core": "0.0.0",
  "@jpahd/commits-core": "0.0.0",
  "@jpahd/commits-adapters": "0.0.0",
  "@jpahd/context-records": "0.0.0",
  "@jpahd/source-annotations": "0.1.0",
  "@jpahd/git-chat-protocol": "0.0.0",
});

/** Consumer guides only; contributor/process notes never enter packaging staging. */
export const consumerDocumentation = Object.freeze([
  "commits-reader.md",
  "host-contract.md",
  "repository-ui.md",
  "source-annotations.md",
  "styling.md",
  "workbench.md",
]);

const MiB = 1024 * 1024;
const MAX_ARCHIVE = 64 * MiB,
  MAX_SET = 128 * MiB,
  MAX_FILE = 16 * MiB,
  MAX_MEMBERS = 10_000;
const chatworks = "@jpahd/chatworks";
const validated = new WeakMap();
const utf8 = new TextDecoder("utf-8", { fatal: true });
const own = (object, key) => Object.hasOwn(object, key);
const packageName = (name) =>
  typeof name === "string" && /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/.test(name);
const object = (value) => value !== null && typeof value === "object" && !Array.isArray(value);

function inside(parent, child) {
  const path = relative(parent, child);
  return path === "" || (!isAbsolute(path) && path !== ".." && !path.startsWith(`..${sep}`));
}
function safePath(path) {
  assert(
    typeof path === "string" &&
      path.length > 0 &&
      !/[\\:<>"|?*]/.test(path) &&
      !Array.from(path).some((char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127),
    "Unsafe packed path",
  );
  assert(
    !path.split("/").some((part) => /^(?:\.env(?:\..*)?|\.npmrc|\.netrc|credentials)$/i.test(part)),
    "Private configuration is not a package artifact",
  );
  assert(
    path
      .split("/")
      .every(
        (part) =>
          part &&
          part !== "." &&
          part !== ".." &&
          !/[. ]$/.test(part) &&
          !/^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part),
      ),
    "Unsafe packed path",
  );
}

// Inspect the entire bounded tar, including padding/end markers, before extraction.
function archiveMembers(gzip) {
  assert(gzip.length <= MAX_ARCHIVE, "Oversized compressed package archive");
  const tar = gunzipSync(gzip, { maxOutputLength: MAX_ARCHIVE });
  assert(tar.length % 512 === 0, "Truncated tar block");
  const members = [],
    seen = new Set(),
    portableSeen = new Set();
  const string = (header, start, length) => {
    const field = header.subarray(start, start + length);
    const end = field.indexOf(0);
    if (end !== -1)
      assert(
        field.subarray(end).every((byte) => byte === 0),
        "Invalid tar string padding",
      );
    return utf8.decode(end === -1 ? field : field.subarray(0, end));
  };
  const octal = (header, start, length) => {
    const field = header
      .subarray(start, start + length)
      .toString("utf8")
      .replaceAll("\0", " ")
      .trim();
    assert(/^[0-7]+$/.test(field), "Invalid tar number");
    const value = Number.parseInt(field, 8);
    assert(Number.isSafeInteger(value), "Unsafe tar number");
    return value;
  };
  let offset = 0,
    ended = false;
  while (offset + 512 <= tar.length) {
    const header = tar.subarray(offset, offset + 512);
    if (header.every((byte) => byte === 0)) {
      assert(
        tar.length >= offset + 1024 && tar.subarray(offset).every((byte) => byte === 0),
        "Invalid tar ending",
      );
      ended = true;
      break;
    }
    assert(members.length < MAX_MEMBERS, "Too many archive members");
    const checksum = header.reduce(
      (sum, byte, index) => sum + (index >= 148 && index < 156 ? 32 : byte),
      0,
    );
    assert.equal(checksum, octal(header, 148, 8), "Invalid tar checksum");
    assert(
      string(header, 257, 6) === "ustar" && header.subarray(263, 265).toString() === "00",
      "Unsupported tar format",
    );
    const prefix = string(header, 345, 155);
    const raw = `${prefix ? `${prefix}/` : ""}${string(header, 0, 100)}`;
    const type = header[156];
    assert(
      type === 0 || type === 48 || type === 53,
      "Links/special files/tar extensions are not package artifacts",
    );
    assert(string(header, 157, 100) === "", "Unexpected tar link target");
    const directory = type === 53;
    const name = directory && raw.endsWith("/") ? raw.slice(0, -1) : raw;
    safePath(name);
    assert(
      (name === "package" && directory) || name.startsWith("package/"),
      "Archive escapes package",
    );
    assert(!seen.has(name), "Duplicate packed path");
    const portableName = name.normalize("NFC").toLowerCase();
    assert(!portableSeen.has(portableName), "Portable path collision");
    seen.add(name);
    portableSeen.add(portableName);
    const path = name === "package" ? "" : name.slice(8);
    assert(
      !path ||
        ((path === "dist" || path === "docs") && directory) ||
        path.startsWith("dist/") ||
        path.startsWith("docs/") ||
        (!directory && /^(?:package.json|README(?:\.md)?|LICENSE(?:\.md)?)$/.test(path)),
      `Unexpected packed file: ${path}`,
    );
    assert(
      !/(?:^|\/)(?:src|test|tests|node_modules)(?:\/|$)|\.(?:test|spec)\./i.test(path),
      "Source/test/dependency leaked into tarball",
    );
    const size = octal(header, 124, 12);
    assert(size <= MAX_FILE, "Oversized packed file");
    assert(!directory || size === 0, "Directory has data");
    offset += 512;
    const paddedEnd = offset + Math.ceil(size / 512) * 512;
    assert(paddedEnd <= tar.length, "Truncated packed file");
    assert(
      tar.subarray(offset + size, paddedEnd).every((byte) => byte === 0),
      "Invalid tar file padding",
    );
    members.push({ path, directory, bytes: tar.subarray(offset, offset + size) });
    offset = paddedEnd;
  }
  assert(ended, "Missing tar end markers");
  const files = new Set(
    members
      .filter((entry) => !entry.directory)
      .map((entry) => entry.path.normalize("NFC").toLowerCase()),
  );
  // Check implicit parents too (e.g. dist/Foo/a and dist/foo/b).
  const spellings = new Map();
  for (const entry of members) {
    const parts = entry.path.split("/");
    for (let index = 1; index <= parts.length; index++) {
      const path = parts.slice(0, index).join("/");
      const key = path.normalize("NFC").toLowerCase();
      assert(!spellings.has(key) || spellings.get(key) === path, "Portable path collision");
      spellings.set(key, path);
      if (index < parts.length) assert(!files.has(key), "File/directory collision");
    }
  }
  return { members, tarBytes: tar.length };
}

function portableVersion(value) {
  assert(
    typeof value === "string" &&
      value.trim() &&
      !/(?:^|[\s@])(?:workspace:|file:|link:|portal:|patch:)|^(?:[./\\]|~[\\/]|[a-z]:)|git\+file:/i.test(
        value.trim(),
      ),
    `Nonportable dependency: ${value}`,
  );
}
function validateManifest(members) {
  const files = new Map(
    members.filter((member) => !member.directory).map((member) => [member.path, member.bytes]),
  );
  assert(files.has("package.json"), "Missing packed manifest");
  const manifest = JSON.parse(utf8.decode(files.get("package.json")));
  assert(object(manifest) && packageName(manifest.name), "Unsafe package name");
  assert(/^\d+\.\d+\.\d+$/.test(manifest.version), "Invalid package version");
  assert.equal(manifest.type, "module", "Expected ESM package");
  assert.equal(manifest.license, "MIT", "Expected MIT license");
  const notice = files.get("LICENSE") ?? files.get("LICENSE.md");
  assert(notice, "Missing MIT notice");
  const license = utf8.decode(notice).replace(/\s+/g, " ");
  assert(
    /Copyright/i.test(license) &&
      /Permission is hereby granted, free of charge/.test(license) &&
      /to use, copy, modify, merge, publish, distribute, sublicense, and\/or sell/.test(license) &&
      /copyright notice and this permission notice shall be included in all copies or substantial portions of the Software\./i.test(
        license,
      ) &&
      /THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND/.test(license) &&
      /MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT\./.test(license) &&
      /IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY/.test(
        license,
      ) &&
      /OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE\./.test(
        license,
      ),
    "Missing MIT license terms",
  );
  for (const field of [
    "dependencies",
    "peerDependencies",
    "optionalDependencies",
    "devDependencies",
  ]) {
    if (manifest[field] === undefined) continue;
    assert(object(manifest[field]), `Invalid ${field}`);
    for (const [name, version] of Object.entries(manifest[field])) {
      assert(packageName(name), "Unsafe dependency name");
      portableVersion(version);
    }
  }
  function portableOverrides(value) {
    if (typeof value === "string") portableVersion(value);
    else {
      assert(object(value), "Invalid dependency override");
      for (const entry of Object.values(value)) portableOverrides(entry);
    }
  }
  for (const field of ["overrides", "resolutions"])
    if (manifest[field] !== undefined) portableOverrides(manifest[field]);
  let exportCount = 0;
  function exports(value, subpathsAllowed = false) {
    if (value === null) return;
    if (typeof value === "string") {
      assert(value.startsWith("./dist/"), `Export must target dist: ${value}`);
      safePath(value.slice(2));
      assert(files.has(value.slice(2)), `Missing export ${value}`);
      exportCount++;
    } else {
      assert(
        (object(value) || Array.isArray(value)) && Object.keys(value).length,
        "Invalid exports",
      );
      if (object(value)) {
        const keys = Object.keys(value);
        const subpaths = keys.some((key) => key.startsWith("."));
        if (subpaths) {
          assert(
            subpathsAllowed && keys.every((key) => key === "." || key.startsWith("./")),
            "Invalid export subpaths",
          );
          for (const key of keys) if (key !== ".") safePath(key.slice(2));
        } else {
          for (const key of keys) {
            safePath(key);
            assert(!/^\d+$/.test(key) && !key.includes("/"), "Invalid export condition");
          }
        }
      }
      for (const entry of Object.values(value)) exports(entry);
    }
  }
  exports(manifest.exports, true);
  assert(exportCount > 0, "Missing dist exports");
  return manifest;
}

// Fail closed on unsupported ranges; these release artifacts use ordinary npm ranges.
function satisfies(version, range) {
  const actual = version.split(".").map(Number);
  const compare = (a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2];
  function token(test) {
    const match = /^(\^|~|>=|<=|>|<|=)?(\d+|[xX*])(?:\.(\d+|[xX*]))?(?:\.(\d+|[xX*]))?$/.exec(test);
    if (!match) return false;
    const [, op = "", ...parts] = match;
    const count = parts.findIndex((part) => part === undefined || /^[xX*]$/.test(part));
    const precision = count === -1 ? 3 : count;
    if (
      parts.some(
        (part, index) =>
          part !== undefined &&
          /^\d+$/.test(part) &&
          (index >= precision ||
            !/^(?:0|[1-9]\d*)$/.test(part) ||
            !Number.isSafeInteger(Number(part))),
      )
    )
      return false;
    const lower = parts.map((part) => (/^\d+$/.test(part) ? Number(part) : 0));
    const cmp = compare(actual, lower);
    if ([">", ">=", "<", "<=", "="].includes(op)) {
      if (precision !== 3) return false;
      return op === ">"
        ? cmp > 0
        : op === ">="
          ? cmp >= 0
          : op === "<"
            ? cmp < 0
            : op === "<="
              ? cmp <= 0
              : cmp === 0;
    }
    if (!precision) return !op;
    if (!op && precision === 3) return cmp === 0;
    const upper = [...lower];
    const bump =
      op === "^"
        ? lower[0] > 0 || precision === 1
          ? 0
          : lower[1] > 0 || precision === 2
            ? 1
            : 2
        : op === "~"
          ? Math.min(precision - 1, 1)
          : precision - 1;
    upper[bump]++;
    for (let index = bump + 1; index < 3; index++) upper[index] = 0;
    return cmp >= 0 && compare(actual, upper) < 0;
  }
  return range.split("||").some((part) => {
    const tokens = part
      .trim()
      .replace(/(>=|<=|>|<|=|\^|~)\s+/g, "$1")
      .split(/\s+/);
    return tokens.length > 0 && tokens.every(token);
  });
}
function validateClosure(manifests) {
  const versions = new Map(manifests.map((manifest) => [manifest.name, manifest.version]));
  for (const manifest of manifests) {
    for (const field of [
      "dependencies",
      "peerDependencies",
      "optionalDependencies",
      "devDependencies",
    ]) {
      for (const [name, range] of Object.entries(manifest[field] ?? {})) {
        if (own(expectedArtifacts, name) || name === chatworks) {
          assert(
            versions.has(name) && satisfies(versions.get(name), range),
            `Unsatisfied maintained dependency: ${manifest.name} -> ${name}@${range}`,
          );
        }
      }
    }
  }
}
function artifactFromBytes(archivePath, gzip) {
  const { members, tarBytes } = archiveMembers(gzip);
  const manifest = validateManifest(members);
  const artifact = {
    archivePath,
    manifest,
    members,
    sha256: createHash("sha256").update(gzip).digest("hex"),
  };
  // Public buffers/metadata may be inspected or mutated by callers; extraction uses
  // only the private compressed snapshot, never caller-controlled member objects.
  validated.set(artifact, { gzip, tarBytes });
  return artifact;
}
async function readArchive(path) {
  const info = await lstat(path);
  assert(info.isFile() && !info.isSymbolicLink(), "Archive must be a regular non-symlink file");
  assert(info.size <= MAX_ARCHIVE, "Oversized compressed package archive");
  const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const stat = await file.stat();
    assert(
      stat.isFile() && stat.size <= MAX_ARCHIVE && stat.ino === info.ino && stat.dev === info.dev,
      "Archive changed while opening",
    );
    // Read at most the limit + 1 even if a concurrently written file grows.
    const chunks = [];
    let size = 0;
    while (true) {
      const buffer = Buffer.alloc(Math.min(64 * 1024, MAX_ARCHIVE + 1 - size));
      const { bytesRead } = await file.read(buffer, 0, buffer.length, null);
      if (!bytesRead) break;
      chunks.push(buffer.subarray(0, bytesRead));
      size += bytesRead;
      assert(size <= MAX_ARCHIVE, "Oversized compressed package archive");
    }
    return artifactFromBytes(resolve(path), Buffer.concat(chunks, size));
  } finally {
    await file.close();
  }
}

/** Read exactly six user-selected real .tgz artifacts; nothing is extracted. */
export async function readArtifactSet(directory) {
  assert(typeof directory === "string" && directory.length, "Explicit artifact directory required");
  assert((await lstat(directory)).isDirectory(), "Artifact directory must be a real directory");
  const paths = [];
  let entries = 0;
  const dir = await opendir(directory);
  for await (const entry of dir) {
    assert(++entries <= 128, "Too many artifact directory entries");
    if (entry.name.endsWith(".tgz")) paths.push(join(directory, entry.name));
    assert(
      paths.length <= 6,
      "Unexpected extra package archives (duplicate identities are not allowed)",
    );
  }
  assert.equal(paths.length, 6, "Missing artifacts: expected complete six-package set");
  const artifacts = [],
    names = new Set();
  let compressed = 0,
    uncompressed = 0;
  for (const path of paths.sort()) {
    const artifact = await readArchive(path);
    const { name, version } = artifact.manifest;
    assert(own(expectedArtifacts, name), `Unexpected package identity: ${name}`);
    assert(!names.has(name), `Duplicate package identity: ${name}`);
    assert.equal(version, expectedArtifacts[name], `Wrong artifact version: ${name}`);
    names.add(name);
    const record = validated.get(artifact);
    compressed += record.gzip.length;
    uncompressed += record.tarBytes;
    assert(compressed <= MAX_SET && uncompressed <= MAX_SET, "Oversized artifact set");
    artifacts.push(artifact);
  }
  assert(
    Object.keys(expectedArtifacts).every((name) => names.has(name)),
    "Missing maintained package",
  );
  validateClosure(artifacts.map((artifact) => artifact.manifest));
  return artifacts;
}

async function safeDirectory(path) {
  const absolute = resolve(path);
  const parent = dirname(absolute);
  if (parent !== absolute) await safeDirectory(parent);
  let info;
  try {
    info = await lstat(absolute);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    try {
      await mkdir(absolute);
    } catch (creationError) {
      if (creationError.code !== "EEXIST") throw creationError;
    }
    info = await lstat(absolute);
  }
  assert(
    info.isDirectory() && !info.isSymbolicLink(),
    `Symlink/non-directory extraction parent: ${absolute}`,
  );
}

/** Extract only an artifact returned by this module, into a new/empty target. */
export async function extractArtifact(artifact, target) {
  const record = validated.get(artifact);
  assert(record, "Artifact was not validated by this module");
  assert(typeof target === "string" && target.length, "Explicit extraction target required");
  const { members } = archiveMembers(record.gzip);
  const root = resolve(target);
  await safeDirectory(root);
  assert.equal((await readdir(root)).length, 0, "Extraction target must be empty");
  for (const entry of members) {
    if (!entry.path) continue;
    const path = join(root, entry.path);
    assert(inside(root, path), "Extraction escapes target");
    if (entry.directory) await safeDirectory(path);
    else {
      await safeDirectory(dirname(path));
      const file = await open(
        path,
        constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW,
        0o644,
      );
      try {
        await file.writeFile(entry.bytes);
      } finally {
        await file.close();
      }
    }
  }
}

function execute(executable, args, cwd, env) {
  const result = spawnSync(executable, args, {
    cwd,
    env,
    encoding: "utf8",
    maxBuffer: 8 * MiB,
    timeout: 120_000,
  });
  if (result.error) throw result.error;
  assert.equal(result.status, 0, `${executable} failed: ${result.stderr || result.stdout}`);
  return result.stdout;
}

// Copy only the public packaging surface, not npmrc, env, source or private stores.
async function stageChatworks(destination) {
  const root = fileURLToPath(new URL("../../", import.meta.url));
  let bytes = 0,
    files = 0;
  async function copy(source, target, includedNames) {
    assert(++files <= MAX_MEMBERS, "Too many Chatworks packaging files");
    const info = await lstat(source);
    assert(!info.isSymbolicLink(), "Symlink in Chatworks packaging surface");
    if (includedNames) assert(info.isDirectory(), "Expected Chatworks packaging directory");
    if (info.isDirectory()) {
      await mkdir(target);
      for (const name of includedNames ?? (await readdir(source))) {
        safePath(name);
        await copy(join(source, name), join(target, name));
      }
    } else {
      assert(info.isFile() && info.size <= MAX_FILE, "Invalid Chatworks packaging file");
      bytes += info.size;
      assert(bytes <= MAX_ARCHIVE, "Oversized Chatworks packaging surface");
      const file = await open(source, constants.O_RDONLY | constants.O_NOFOLLOW);
      try {
        let contents = await file.readFile();
        if (source === join(root, "package.json")) {
          const manifest = JSON.parse(utf8.decode(contents));
          // Some npm releases still run prepare with --ignore-scripts. Remove
          // executable hooks from the owned staging copy as defense in depth.
          delete manifest.scripts;
          assert(
            manifest.workspaces === undefined,
            "Chatworks packaging must not discover workspaces",
          );
          contents = Buffer.from(JSON.stringify(manifest));
        }
        await writeFile(target, contents, { flag: "wx" });
      } finally {
        await file.close();
      }
    }
  }
  for (const name of ["package.json", "dist", "docs", "README.md", "LICENSE"])
    await copy(
      join(root, name),
      join(destination, name),
      name === "docs" ? consumerDocumentation : undefined,
    );
}

/** Pack only Chatworks locally; all six headless packages come from real tarballs. */
export async function createPackedConsumer(artifactDirectory, fixtureRoot, { fixtures = [] } = {}) {
  assert(typeof fixtureRoot === "string" && fixtureRoot.length, "Explicit fixture root required");
  assert(
    Array.isArray(fixtures) &&
      fixtures.every(
        (name) => packageName(name) && !own(expectedArtifacts, name) && name !== chatworks,
      ),
    "Only third-party fixtures may be linked",
  );
  const artifacts = await readArtifactSet(artifactDirectory);
  // realpath handles platforms where the system temporary directory has symlink ancestors.
  let owned = await mkdtemp(join(tmpdir(), "chatworks-artifacts-"));
  try {
    owned = await realpath(owned);
    const env = Object.fromEntries(
      ["PATH", "SystemRoot"]
        .filter((key) => process.env[key])
        .map((key) => [key, process.env[key]]),
    );
    Object.assign(env, {
      HOME: join(owned, "home"),
      TMPDIR: join(owned, "tmp"),
      TEMP: join(owned, "tmp"),
      TMP: join(owned, "tmp"),
      NPM_CONFIG_USERCONFIG: join(owned, "npmrc"),
      NPM_CONFIG_GLOBALCONFIG: join(owned, "global-npmrc"),
      NPM_CONFIG_CACHE: join(owned, "cache"),
      NPM_CONFIG_IGNORE_SCRIPTS: "true",
      NPM_CONFIG_OFFLINE: "true",
      NPM_CONFIG_AUDIT: "false",
      NPM_CONFIG_FUND: "false",
      NPM_CONFIG_UPDATE_NOTIFIER: "false",
      NODE_PATH: "",
    });
    await mkdir(env.HOME);
    await mkdir(env.TMPDIR);
    await writeFile(env.NPM_CONFIG_USERCONFIG, "");
    await writeFile(env.NPM_CONFIG_GLOBALCONFIG, "");
    const directory = join(owned, "consumer"),
      archives = join(owned, "archives"),
      stage = join(owned, "package");
    await mkdir(directory);
    await mkdir(archives);
    await mkdir(stage);
    await writeFile(
      join(directory, "package.json"),
      JSON.stringify({ private: true, type: "module" }),
    );
    await stageChatworks(stage);
    const results = JSON.parse(
      execute(
        "npm",
        ["pack", "--json", "--ignore-scripts", "--offline", "--pack-destination", archives],
        stage,
        env,
      ),
    );
    assert(
      Array.isArray(results) && results.length === 1 && typeof results[0].filename === "string",
      "Invalid npm pack result",
    );
    const archive = join(archives, results[0].filename);
    assert(inside(archives, archive), "Archive filename escapes owned directory");
    const local = await readArchive(archive);
    assert.equal(local.manifest.name, chatworks, "Unexpected Chatworks identity");
    artifacts.push(local);
    const manifests = artifacts.map((artifact) => artifact.manifest);
    validateClosure(manifests);
    for (const artifact of artifacts)
      await extractArtifact(artifact, join(directory, "node_modules", artifact.manifest.name));
    const internal = new Set(manifests.map((manifest) => manifest.name));
    const peers = new Set(
      manifests.flatMap((manifest) =>
        Object.keys({
          ...manifest.dependencies,
          ...manifest.peerDependencies,
          ...manifest.optionalDependencies,
        }),
      ),
    );
    peers.add("@types/node");
    for (const name of fixtures) peers.add(name);
    for (const name of peers) {
      if (internal.has(name)) continue;
      assert(packageName(name), "Unsafe fixture name");
      const source = await realpath(join(fixtureRoot, "node_modules", name));
      const fixture = JSON.parse(await readFile(join(source, "package.json"), "utf8"));
      assert.equal(fixture.name, name, "Fixture package identity mismatch");
      const target = join(directory, "node_modules", name);
      await safeDirectory(dirname(target));
      await symlink(source, target, "dir");
    }
    return {
      directory,
      manifests,
      owned,
      env,
      run: (executable, args) => execute(executable, args, directory, env),
      dispose: () => rm(owned, { recursive: true, force: true }),
    };
  } catch (error) {
    await rm(owned, { recursive: true, force: true });
    throw error;
  }
}
