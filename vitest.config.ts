import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@": resolve(__dirname, "./src"),
      "@shared": resolve(__dirname, "./shared"),
    },
  },
  test: {
    exclude: ["**/node_modules", "tests/e2e/**", "backend/**"],
  },
});
