import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";
export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  envDir: false,
  cacheDir: fileURLToPath(
    new URL("../../tests/commits-reader/node_modules/.vite", import.meta.url),
  ),
  server: {
    host: "127.0.0.1",
    port: 5197,
    strictPort: true,
    fs: { allow: [fileURLToPath(new URL("../..", import.meta.url))] },
  },
  build: { outDir: "dist", emptyOutDir: true },
});
