import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./tests/setup.ts"],
    // Vitest owns component and hook tests only. The `bun:test` suites in
    // `tests/*.test.ts(x)` stay on Bun because their assertions depend on
    // runtime-native globals (for example `Bun.spawnSync` and Bun's DOMException).
    include: ["tests/ui/**/*.test.{ts,tsx}", "tests/lib/**/*.test.{ts,tsx}"],
    coverage: {
      provider: "v8",
      reportsDirectory: "./coverage",
      include: ["src/**"],
    },
  },
});
