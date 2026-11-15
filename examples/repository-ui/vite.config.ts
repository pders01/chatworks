import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";

export default defineConfig({
  root: fileURLToPath(new URL("../..", import.meta.url)),
  envDir: false,
  cacheDir: fileURLToPath(new URL("../../tests/repository-ui/.vite", import.meta.url)),
  optimizeDeps: { entries: ["examples/repository-ui/index.html"] },
  server: { host: "127.0.0.1", port: 5199, strictPort: true },
});
