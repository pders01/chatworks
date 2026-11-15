import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";

export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  // No ambient environment or host settings in this synthetic browser fixture.
  envDir: false,
  cacheDir: fileURLToPath(new URL("../../tests/source-annotations/.vite", import.meta.url)),
  server: {
    host: "127.0.0.1",
    port: 5198,
    strictPort: true,
    fs: { allow: [fileURLToPath(new URL("../..", import.meta.url))] },
  },
  build: { outDir: "dist", emptyOutDir: true },
});
