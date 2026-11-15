#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFile, readdir, rm, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { realpathSync } from "node:fs";

import { consumerDocumentation, createPackedConsumer, readArtifactSet } from "./lib/artifacts.mjs";

const args = process.argv.slice(2);
if (args.length !== 1 || args[0].startsWith("-")) {
  console.error(
    "Usage: npm run test:package -- /absolute/path/to/repokit-tarballs\nAll six matching npm tarballs are required. No source checkout or default location is consulted.",
  );
  process.exit(args.length === 1 && args[0] === "--help" ? 0 : 1);
}
const root = fileURLToPath(new URL("../", import.meta.url));
const artifactDirectory = resolve(args[0]);
// Refuse incomplete/invalid inputs before rebuilding. Only artifact bytes are
// consulted, never tooling or source from a different checkout.
await readArtifactSet(artifactDirectory);
await rm(join(root, "dist"), { recursive: true, force: true });
const compile = spawnSync(
  process.execPath,
  [join(root, "node_modules/typescript/bin/tsc"), "-p", "tsconfig.build.json"],
  {
    cwd: root,
    encoding: "utf8",
    timeout: 120_000,
    maxBuffer: 8 * 1024 * 1024,
  },
);
if (compile.error) throw compile.error;
assert.equal(compile.status, 0, compile.stderr || compile.stdout);
const consumer = await createPackedConsumer(artifactDirectory, root, {
  // Third-party installed declarations are fixtures, not maintained-package links.
  fixtures: ["@happy-dom/global-registrator", "lit-html"],
});
try {
  const library = join(consumer.directory, "node_modules/@jpahd/chatworks");
  assert.deepEqual((await readdir(join(library, "docs"))).sort(), [...consumerDocumentation]);
  // Compile complete API examples from the actual packed docs, never source aliases.
  let exampleCount = 0;
  for (const file of [
    "README.md",
    "docs/commits-reader.md",
    "docs/host-contract.md",
    "docs/source-annotations.md",
    "docs/repository-ui.md",
  ]) {
    const source = await readFile(join(library, file), "utf8");
    for (const [, code] of source.matchAll(/^```ts\n([\s\S]*?)^```/gm)) {
      await writeFile(join(consumer.directory, `docs-example-${exampleCount++}.ts`), code);
    }
  }
  assert.equal(exampleCount, 6, "Missing complete consumer API examples");
  const main = `
import { layoutGraph as barrelGraph, type GraphLayout } from '@jpahd/chatworks';
import { CwAttachment } from '@jpahd/chatworks/attachment';
import { CwChatTurn } from '@jpahd/chatworks/chat-turn';
import { CwThinkingDisclosure } from '@jpahd/chatworks/thinking-disclosure';
import { CwToolEvent } from '@jpahd/chatworks/tool-event';
import { WorkbenchRegistry } from '@jpahd/chatworks/workbench';
import { MessageRole, type Turn } from '@jpahd/chatworks/chat-types';
import { layoutGraph } from '@jpahd/chatworks/commit-graph';
import type { ChatHost, RepoHost } from '@jpahd/chatworks/host';
import { SourceAnnotationPanel } from '@jpahd/chatworks/source-annotations';
import { PortableCommitsReader } from '@jpahd/chatworks/commits-reader';
import * as repositoryUI from '@jpahd/chatworks/repository-ui';
import type { AnnotationClient } from '@jpahd/source-annotations/contracts';
import { RepoService as legacy } from '@jpahd/chatworks/proto/repo';
import { RepoService } from '@jpahd/git-chat-protocol/repo';
async function inspect(host: RepoHost) {
 const page = await host.listCommits({repoId:'packed',path:'source.ts',limit:25,offset:0});
 if (!host.getBlame) return page.hasMore;
 return (await host.getBlame({repoId:'packed',path:'source.ts'})).lines.every(line=>line.lineNumber>0 && !!line.shortSha);
}
const graph: GraphLayout=layoutGraph([{sha:'child',parentShas:['parent']},{sha:'parent'}]);
const turn: Turn={id:'packed',role:MessageRole.ASSISTANT,content:'Packed consumer'};
const chat=new CwChatTurn(); chat.turn=turn;
document.body.append(new CwAttachment(),chat,new CwThinkingDisclosure(),new CwToolEvent(),new SourceAnnotationPanel(),new PortableCommitsReader());
if(legacy!==RepoService) throw new Error('Wire compatibility reexport is not canonical');
void new WorkbenchRegistry(); void graph; void barrelGraph; void inspect; void repositoryUI;
void (undefined as ChatHost|undefined); void (undefined as AnnotationClient|undefined);
`;
  await writeFile(join(consumer.directory, "main.ts"), main);
  await writeFile(
    join(consumer.directory, "tsconfig.json"),
    JSON.stringify({
      compilerOptions: {
        target: "ES2022",
        module: "ESNext",
        moduleResolution: "bundler",
        lib: ["ES2022", "DOM", "DOM.Iterable"],
        strict: true,
        skipLibCheck: false,
        noEmit: true,
        types: [],
        experimentalDecorators: true,
        useDefineForClassFields: false,
      },
      include: ["main.ts", "docs-example-*.ts"],
    }),
  );
  consumer.run(process.execPath, [
    join(root, "node_modules/typescript/bin/tsc"),
    "-p",
    "tsconfig.json",
  ]);
  console.log("Packed consumer guide allowlist and six public API examples passed");
  const fixtureRequire = createRequire(join(consumer.directory, "package.json"));
  const libraryRequire = createRequire(
    join(consumer.directory, "node_modules/@jpahd/chatworks/package.json"),
  );
  assert.equal(
    realpathSync(fixtureRequire.resolve("lit")),
    realpathSync(libraryRequire.resolve("lit")),
    "Duplicate Lit dependency",
  );
  const litRequire = createRequire(fixtureRequire.resolve("lit"));
  const contextRequire = createRequire(fixtureRequire.resolve("@lit/context"));
  assert.equal(
    realpathSync(litRequire.resolve("@lit/reactive-element")),
    realpathSync(contextRequire.resolve("@lit/reactive-element")),
    "Duplicate reactive-element dependency",
  );
  await writeFile(
    join(consumer.directory, "runtime.mjs"),
    `
import assert from 'node:assert/strict';
import { GlobalRegistrator } from '@happy-dom/global-registrator';
GlobalRegistrator.register();
await import('@jpahd/chatworks');
const {SourceAnnotationPanel}=await import('@jpahd/chatworks/source-annotations');
const {PortableCommitsReader}=await import('@jpahd/chatworks/commits-reader');
const repositoryUI=await import('@jpahd/chatworks/repository-ui');
const legacy=await import('@jpahd/chatworks/proto/repo');
const canonical=await import('@jpahd/git-chat-protocol/repo');
assert.equal(legacy.RepoService,canonical.RepoService);
assert.equal(customElements.get('source-annotation-panel'),SourceAnnotationPanel);
assert.equal(customElements.get('portable-commits-reader'),PortableCommitsReader);
for(const tag of ['cw-attachment','cw-chat-turn','cw-thinking-disclosure','cw-tool-event','cw-message-list','cw-chat-view']) assert(customElements.get(tag),tag);
for(const tag of ['cw-file-tabs','cw-file-picker','cw-source-preview','cw-repository-tree']) assert(customElements.get(tag),tag);
assert(Object.keys(repositoryUI).length);
console.log('Packed registrations and legacy descriptor identity passed (DOM shim; not browser behavior proof)');
`,
  );
  console.log(consumer.run(process.execPath, ["runtime.mjs"]).trim());
  const { build } = await import("vite");
  const modules = new Set();
  await build({
    configFile: false,
    envDir: false,
    root: consumer.directory,
    logLevel: "error",
    build: {
      write: false,
      minify: false,
      rollupOptions: { input: join(consumer.directory, "main.ts") },
    },
    plugins: [
      {
        name: "packed-browser-boundaries",
        moduleParsed(info) {
          modules.add(info.id);
        },
      },
    ],
  });
  for (const feature of ["source-annotations", "commits-reader", "repository-ui"]) {
    assert(
      [...modules].some((id) =>
        id.startsWith(
          join(consumer.directory, "node_modules/@jpahd/chatworks/dist", feature) + sep,
        ),
      ),
      `Feature not bundled: ${feature}`,
    );
  }
  for (const id of modules) {
    assert(!id.includes("__vite-browser-external"), `Server API leaked into browser bundle: ${id}`);
    assert(
      !id.startsWith(join(root, "src") + sep) &&
        (!id.includes(`${sep}@jpahd${sep}`) ||
          id.startsWith(join(consumer.directory, "node_modules") + sep)),
      `Source alias leaked into packed consumer: ${id}`,
    );
    assert(
      !/node_modules\/@jpahd\/(?:source-annotations|repository-core)\/dist\//.test(id),
      `Node service leaked into browser bundle: ${id}`,
    );
  }
  console.log("Packed public exports/declarations/browser graph and Lit deduplication passed");
} finally {
  await consumer.dispose();
}
