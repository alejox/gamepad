// vue-tsc needs the TypeScript JS API, which TypeScript 7 (native) no longer ships.
// Run it against the workspace-local TypeScript 6 instead of the hoisted root TS 7.
const { run } = require("vue-tsc");

run(require.resolve("typescript/lib/tsc", { paths: [__dirname] }));
