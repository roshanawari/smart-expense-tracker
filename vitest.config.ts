import { defineConfig } from "vitest/config";
import path from "node:path";
import "dotenv/config";

export default defineConfig({
  test: {
    environment: "node",
    fileParallelism: false,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./"),
    },
  },
});
