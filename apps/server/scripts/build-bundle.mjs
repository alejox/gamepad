import { build } from "esbuild";

await build({
  entryPoints: ["src/main.ts"],
  outfile: "dist/bundle/server.mjs",
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  conditions: ["source"],
  banner: {
    js: 'import { createRequire as __gamepadCreateRequire } from "node:module"; const require = __gamepadCreateRequire(import.meta.url);',
  },
  sourcemap: true,
  external: ["@jitsi/robotjs", "koffi"],
});
