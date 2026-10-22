import { defineConfig } from "vitest/config";

// The node (SSR) environment needs its own conditions to load @gamepad/shared
// from TypeScript sources instead of a possibly stale dist.
export default defineConfig({
  resolve: { conditions: ["source"] },
  ssr: { resolve: { conditions: ["source"], externalConditions: ["source"] } },
  test: { include: ["test/**/*.test.ts"] },
});
