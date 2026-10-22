import { defineConfig } from "vitest/config";

// Tests run in the node (SSR) environment, which needs its own conditions to
// load @gamepad/shared from TypeScript sources instead of a possibly stale dist.
export default defineConfig({
  resolve: { conditions: ["source"] },
  ssr: { resolve: { conditions: ["source"], externalConditions: ["source"] } },
  test: { include: ["test/**/*.test.ts"], environment: "node" },
});
