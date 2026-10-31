process.env.TS_NODE_COMPILER_OPTIONS = JSON.stringify({
  module: "commonjs",
  target: "es2020",
  esModuleInterop: true,
  moduleResolution: "node",
  skipLibCheck: true,
  baseUrl: ".",
  paths: {
    "@/*": ["./*"]
  }
});

module.exports = {
  default: {
    paths: ["features/**/*.feature"],
    require: ["features/step_definitions/**/*.ts"],
    // tsconfig-paths: route handlers import with the "@/" alias.
    requireModule: ["ts-node/register", "tsconfig-paths/register"],
    format: ["progress", "summary"],
    publishQuiet: true,
  },
};
