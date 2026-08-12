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
    requireModule: ["ts-node/register"],
    format: ["progress", "summary"],
    publishQuiet: true,
  },
};
