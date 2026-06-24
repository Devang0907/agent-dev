import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    testTimeout: 30_000,
    setupFiles: ["test/setup.ts"],
    include: ["test/**/*.test.ts"],
    pool: "forks",
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: ["src/**/*.tsx", "src/cli.ts"],
    },
  },
});
