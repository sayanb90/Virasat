// Loaded with `node --require` before every unit test file: TypeScript
// through ts-node (the same compiler options Cucumber uses) and the `@/`
// path alias from tsconfig.json.
process.env.TS_NODE_COMPILER_OPTIONS = JSON.stringify({
  module: "commonjs",
  target: "es2020",
  esModuleInterop: true,
  moduleResolution: "node",
  skipLibCheck: true,
  jsx: "react-jsx",
  baseUrl: ".",
  paths: { "@/*": ["./*"] },
});
// Types are checked by `tsc --noEmit` in CI; here, only run the code.
process.env.TS_NODE_TRANSPILE_ONLY = "true";
/* eslint-disable @typescript-eslint/no-require-imports -- a CommonJS preload */
require("ts-node/register");
require("tsconfig-paths/register");
