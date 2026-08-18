import { createRequire } from "node:module";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dir, "..");
const fixture = mkdtempSync(join(tmpdir(), "chatworks-packed-consumer-"));
let succeeded = false;

function run(command: string[], cwd = root): void {
  const process = Bun.spawnSync(command, {
    cwd,
    env: { ...Bun.env, CI: "true" },
    stdout: "inherit",
    stderr: "inherit",
  });
  if (process.exitCode !== 0) {
    throw new Error(`${command.join(" ")} exited with ${process.exitCode}`);
  }
}

function resolvedRealPath(requireFrom: string, specifier: string): string {
  return realpathSync(createRequire(requireFrom).resolve(specifier));
}

function installedVersion(packageName: string): string {
  const packagePath = join(root, "node_modules", ...packageName.split("/"), "package.json");
  return (JSON.parse(readFileSync(packagePath, "utf8")) as { version: string }).version;
}

try {
  run(["npm", "pack", "--ignore-scripts", "--pack-destination", fixture, "--silent"]);
  const packageJson = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as {
    name: string;
  };
  const tarball = readdirSync(fixture).find((entry) => entry.endsWith(".tgz"));
  if (!tarball) throw new Error("npm pack did not produce a tarball");

  writeFileSync(
    join(fixture, "package.json"),
    `${JSON.stringify(
      {
        name: "chatworks-packed-consumer",
        private: true,
        type: "module",
        dependencies: {
          [packageJson.name]: `file:./${tarball}`,
          "@bufbuild/protobuf": installedVersion("@bufbuild/protobuf"),
          "@connectrpc/connect": installedVersion("@connectrpc/connect"),
          "@connectrpc/connect-web": installedVersion("@connectrpc/connect-web"),
          "@lit/context": installedVersion("@lit/context"),
          lit: installedVersion("lit"),
        },
        devDependencies: {
          "@happy-dom/global-registrator": installedVersion("@happy-dom/global-registrator"),
          typescript: installedVersion("typescript"),
          vite: installedVersion("vite"),
        },
        scripts: {
          check: "tsc --noEmit",
          build: "vite build",
        },
      },
      null,
      2,
    )}\n`,
  );

  writeFileSync(
    join(fixture, "tsconfig.json"),
    `${JSON.stringify(
      {
        compilerOptions: {
          target: "ES2022",
          module: "ESNext",
          moduleResolution: "bundler",
          lib: ["ES2022", "DOM", "DOM.Iterable"],
          strict: true,
          noEmit: true,
        },
        include: ["main.ts"],
      },
      null,
      2,
    )}\n`,
  );

  writeFileSync(
    join(fixture, "index.html"),
    '<!doctype html><html><body><script type="module" src="/main.ts"></script></body></html>\n',
  );

  writeFileSync(
    join(fixture, "runtime.ts"),
    `import { GlobalRegistrator } from "@happy-dom/global-registrator";

GlobalRegistrator.register();
await import("@jpahd/chatworks");
for (const tag of [
  "cw-attachment",
  "cw-chat-turn",
  "cw-thinking-disclosure",
  "cw-tool-event",
  "cw-message-list",
  "cw-chat-view",
]) {
  if (!customElements.get(tag)) throw new Error(\`Packed package did not register \${tag}\`);
}
`,
  );

  writeFileSync(
    join(fixture, "main.ts"),
    `import "@jpahd/chatworks";
import { CwAttachment } from "@jpahd/chatworks/attachment";
import { CwChatTurn } from "@jpahd/chatworks/chat-turn";
import { CwThinkingDisclosure } from "@jpahd/chatworks/thinking-disclosure";
import { CwToolEvent } from "@jpahd/chatworks/tool-event";
import { WorkbenchRegistry } from "@jpahd/chatworks/workbench";
import { MessageRole, type Turn } from "@jpahd/chatworks/chat-types";
import type { ChatHost } from "@jpahd/chatworks/host";

const turn: Turn = {
  id: "packed-consumer",
  role: MessageRole.ASSISTANT,
  content: "Packed declarations and modules resolve.",
};
const elements = [
  new CwAttachment(),
  new CwChatTurn(),
  new CwThinkingDisclosure(),
  new CwToolEvent(),
];
(elements[1] as CwChatTurn).turn = turn;
document.body.append(...elements);
void new WorkbenchRegistry();
void (undefined as ChatHost | undefined);
`,
  );

  run(["bun", "install", "--no-progress"], fixture);

  const installedRoot = join(fixture, "node_modules", "@jpahd", "chatworks");
  const installedPackage = JSON.parse(
    readFileSync(join(installedRoot, "package.json"), "utf8"),
  ) as { exports: Record<string, { types: string; import: string }> };
  for (const unpublishedPath of ["src", "stories", ".storybook", "storybook-static"]) {
    if (existsSync(join(installedRoot, unpublishedPath))) {
      throw new Error(`Packed package unexpectedly contains ${unpublishedPath}`);
    }
  }
  for (const [subpath, targets] of Object.entries(installedPackage.exports)) {
    for (const [condition, target] of Object.entries(targets)) {
      const expectedExtension = condition === "types" ? ".d.ts" : ".js";
      if (!target.startsWith("./dist/") || !target.endsWith(expectedExtension)) {
        throw new Error(`${subpath} ${condition} points outside compiled dist: ${target}`);
      }
      readFileSync(join(installedRoot, target), "utf8");
    }
  }

  const fixtureRequire = join(fixture, "package.json");
  const packageRequire = join(installedRoot, "package.json");
  const fixtureLit = resolvedRealPath(fixtureRequire, "lit");
  const packageLit = resolvedRealPath(packageRequire, "lit");
  if (fixtureLit !== packageLit) {
    throw new Error(`Lit was not deduplicated:\n${fixtureLit}\n${packageLit}`);
  }

  const litRequire = resolvedRealPath(fixtureRequire, "lit");
  const contextRequire = resolvedRealPath(fixtureRequire, "@lit/context");
  const litReactive = resolvedRealPath(litRequire, "@lit/reactive-element");
  const contextReactive = resolvedRealPath(contextRequire, "@lit/reactive-element");
  if (litReactive !== contextReactive) {
    throw new Error(
      `@lit/reactive-element was not deduplicated:\n${litReactive}\n${contextReactive}`,
    );
  }

  run(["bun", "run", "check"], fixture);
  run(["bun", "runtime.ts"], fixture);
  run(["bun", "run", "build"], fixture);
  succeeded = true;
  console.log(
    "Packed-package consumer verified compiled exports, declarations, bundling, and Lit deduplication.",
  );
} finally {
  if (succeeded || Bun.env.KEEP_PACKED_FIXTURE !== "1") {
    rmSync(fixture, { recursive: true, force: true });
  } else {
    console.error(`Packed consumer fixture retained at ${fixture}`);
  }
}
